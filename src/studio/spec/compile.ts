import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { boundsOf, configFor, realize, sanitize } from '../layout/engine'
import { asScenario, layoutFeatures, layoutScore } from '../layout/score'
import { buildPanelPrompt, readJson, safeCorner, type Beat, type PanelMeta } from '../model'
import { pageModel, type PlannedBubble } from '../editor/placement'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { BUBBLE, CARD, CONTAINER, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { characterSheetSvg } from '../render/illustrator'

export interface ComicsSpec {
	version: 'comics-spec/1'
	title: string
	compiledAt: string
	bible: {
		story: string
		worldRules: string
		stylePreset: string
		characters: Array<{ tag: string; name: string; appearance: string; voice: string; locked: boolean; reference: string }>
	}
	style: { preset: string; ink: string; tone: string }
	chapters: Array<{
		id: string
		title: string
		index: number
		overrides: { mood: string; environment: string; lighting: string }
		context: string[]
		pages: Array<{
			id: string
			index: number
			scenario: string
			layoutPreset: string
			dialogueDensity: number
			targetPanels: number
			score: number
			seed: string
			layout: {
				width: number
				height: number
				inner: { x0: number; y0: number; x1: number; y1: number }
				panels: Array<{
					n: number
					pts: [number, number][]
					aspect: string
					shot: string
					angle: string
					focal: string
					beat: string
					prompt: string
					imageOffsetX: number
					imageOffsetY: number
					imageScale: number
					imageRotation: number
				}>
			}
			storyBoxes: Array<{ panel: number; beat: string; shot: string; angle: string; focal: string; lines: Array<{ type: string; text: string; prosody: string }> }>
		}>
	}>
}

export interface CompiledPage {
	id: string
	chapterTitle: string
	specTitle: string
	svg: string
	model: PageRenderModel
	width: number
	height: number
	panels: Array<{ n: number; minX: number; minY: number; maxX: number; maxY: number; shot: string; angle: string; focal: string; beat: string }>
}

export interface CompiledBook {
	spec: ComicsSpec
	pages: CompiledPage[]
	sheets: string[]
}

function isContainer(shape: TLShape | undefined): shape is MangaContainer {
	return shape?.type === CONTAINER
}

function inside(editor: Editor, id: TLShapeId): TLShape[] {
	const bounds = editor.getShapePageBounds(id)
	if (!bounds) return []
	const ids = editor.getShapeIdsInsideBounds(bounds)
	const found: TLShape[] = []
	for (const childId of ids) {
		if (childId === id) continue
		const shape = editor.getShape(childId)
		if (!shape || shape.type === 'arrow') continue
		const child = editor.getShapePageBounds(childId)
		if (!child) continue
		const cx = (child.minX + child.maxX) / 2
		const cy = (child.minY + child.maxY) / 2
		if (cx < bounds.minX || cx > bounds.maxX || cy < bounds.minY || cy > bounds.maxY) continue
		found.push(shape)
	}
	return found
}

function downstream(editor: Editor, id: TLShapeId): TLShape[] {
	const result: TLShape[] = []
	for (const binding of editor.getBindingsToShape(id, 'arrow')) {
		if (binding.props.terminal !== 'start') continue
		for (const other of editor.getBindingsFromShape(binding.fromId, 'arrow')) {
			if (other.toId === id || other.props.terminal !== 'end') continue
			const shape = editor.getShape(other.toId)
			if (shape) result.push(shape)
		}
	}
	return result
}

function contextLines(shapes: TLShape[]): string[] {
	return shapes
		.map((shape) => {
			if (shape.type === CARD) {
				const card = shape as MangaCard
				return `${card.props.tag || card.props.kind} ${card.props.title}: ${card.props.body}`.trim()
			}
			if (shape.type === 'text' || shape.type === 'note' || shape.type === 'geo') {
				const props = shape.props as { richText?: { content?: unknown }; text?: string }
				if (typeof props.text === 'string') return props.text
				return plainRichText(props.richText)
			}
			if (shape.type === 'image') return 'image'
			return ''
		})
		.filter(Boolean)
}

function plainRichText(rich: { content?: unknown } | undefined): string {
	const out: string[] = []
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') return
		const record = node as { text?: string; content?: unknown[] }
		if (typeof record.text === 'string') out.push(record.text)
		if (Array.isArray(record.content)) record.content.forEach(walk)
	}
	walk(rich)
	return out.join(' ')
}

function bubblesOf(editor: Editor, page: MangaContainer): PlannedBubble[] {
	return editor
		.getSortedChildIdsForParent(page.id)
		.map((id) => editor.getShape(id))
		.filter((shape): shape is MangaBubble => shape?.type === BUBBLE)
		.filter((shape) => {
			if (shape.props.bubble === "sfx" && page.props.showSfxLayer === false) return false;
			if (shape.props.bubble !== "sfx" && page.props.showBubblesLayer === false) return false;
			return true;
		})
		.map((shape) => ({
			style: shape.props.bubble,
			text: shape.props.text,
			prosody: shape.props.prosody,
			prosodyStyle: shape.props.prosodyStyle,
			prosodyOffsetX: shape.props.prosodyOffsetX,
			prosodyOffsetY: shape.props.prosodyOffsetY,
			prosodyScale: shape.props.prosodyScale,
			prosodyColor: shape.props.prosodyColor,
			fillColor: shape.props.fillColor,
			fontWeight: shape.props.fontWeight,
			hideProsody: page.props.showProsodyLayer === false,
			emphasis: shape.props.emphasis,
			w: shape.props.w,
			h: shape.props.h,
			tailX: shape.props.tailX,
			tailY: shape.props.tailY,
			spin: shape.props.spin,
			panelIndex: shape.props.panelIndex,
			x: shape.x,
			y: shape.y,
		}))
}

function layoutOf(page: MangaContainer) {
	const genome = sanitize(readJson(page.props.genomeJson, { rowW: [], rowTilt: [], rows: [] }))
	return realize(genome, configFor(page.props.layoutPreset, page.props.targetPanels))
}

export function compileBook(editor: Editor, filter?: { chapters?: TLShapeId[]; pages?: TLShapeId[] }): CompiledBook {
	const shapes = editor.getCurrentPageShapes()
	const containers = shapes.filter(isContainer)
	const bibles = containers.filter((shape) => shape.props.role === 'bible')
	const chapters = containers.filter((shape) => shape.props.role === 'chapter')
	const pages = containers.filter((shape) => shape.props.role === 'page')
	const bible = bibles[0]
	const bibleInside = bible ? inside(editor, bible.id) : []
	const cards = bibleInside.filter((shape): shape is MangaCard => shape.type === CARD)
	const characters = cards
		.filter((card) => card.props.kind === 'character')
		.map((card) => ({
			tag: card.props.tag,
			name: card.props.title,
			appearance: card.props.body,
			voice: card.props.voice,
			locked: card.props.locked,
			reference: '3-view',
		}))
	const worldCard = cards.find((card) => card.props.kind === 'world')
	const style = bible?.props.stylePreset || 'Shonen Screentone'
	const locks = characters.map((character) => `${character.tag} locked: ${character.appearance}`).join(' ')
	const selectedChapters = filter?.chapters?.length ? chapters.filter((chapter) => filter.chapters?.includes(chapter.id)) : chapters
	const chapterBlocks = (selectedChapters.length ? selectedChapters : chapters).map((chapter) => {
		const wired = downstream(editor, chapter.id).filter(isContainer).filter((shape) => shape.props.role === 'page')
		const contained = pages.filter((page) => {
			const bounds = editor.getShapePageBounds(chapter.id)
			const pageBounds = editor.getShapePageBounds(page.id)
			if (!bounds || !pageBounds) return false
			const cx = (pageBounds.minX + pageBounds.maxX) / 2
			const cy = (pageBounds.minY + pageBounds.maxY) / 2
			return cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY
		})
		const indexed = pages.filter((page) => page.props.chapterIndex === chapter.props.chapterIndex)
		const merged = new Map<string, MangaContainer>()
		for (const page of [...wired, ...contained, ...indexed]) merged.set(page.id, page)
		let list = [...merged.values()]
		if (filter?.pages?.length) list = list.filter((page) => filter.pages?.includes(page.id))
		list.sort((a, b) => a.props.pageIndex - b.props.pageIndex || a.x - b.x)
		const envCard = inside(editor, chapter.id).find((shape): shape is MangaCard => shape.type === CARD && shape.props.kind === 'environment')
		const environment = envCard?.props.title || chapter.props.environment
		const lighting = chapter.props.lighting || 'hard-noon'
		return { chapter, environment, lighting, pages: list, context: contextLines(inside(editor, chapter.id)) }
	})
	const used = new Set(chapterBlocks.flatMap((block) => block.pages.map((page) => page.id)))
	if (filter?.pages?.length) {
		for (const page of pages.filter((item) => filter.pages?.includes(item.id) && !used.has(item.id))) {
			chapterBlocks.push({
				chapter: {
					...page,
					props: { ...page.props, role: 'chapter', title: 'Unassigned', chapterIndex: page.props.chapterIndex },
				} as MangaContainer,
				environment: page.props.environment,
				lighting: page.props.lighting || 'hard-noon',
				pages: [page],
				context: [],
			})
		}
	}
	const compiledPages: CompiledPage[] = []
	const specChapters = chapterBlocks
		.filter((block) => block.pages.length || !filter?.pages?.length)
		.map((block, chapterPosition) => ({
			id: block.chapter.id,
			title: block.chapter.props.title,
			index: block.chapter.props.chapterIndex || chapterPosition + 1,
			overrides: { mood: block.chapter.props.mood, environment: block.environment, lighting: block.lighting },
			context: block.context,
			pages: block.pages.map((page) => {
				const layout = layoutOf(page)
				const script = readJson<Beat[]>(page.props.scriptJson, [])
				const stored = readJson<PanelMeta[]>(page.props.panelsJson, [])
				const metas = layout.panels.map((_panel, index) => stored[index] ?? {
					imageSeed: `${page.props.seed}-p${index}`,
					imageOffsetX: 0,
					imageOffsetY: 0,
					imageScale: 1,
					imageRotation: 0,
					aspect: '1:1',
					shot: 'MS' as const,
					angle: 'eye' as const,
					focal: '50mm' as const,
					beat: script[index]?.beat ?? '',
					who: script[index]?.who ?? [],
					fries: script[index]?.fries ?? 'none',
					eyeline: script[index]?.eyeline ?? [8, -4],
					imageDataUrl: '',
					environment: '',
				})
				const bubbles = bubblesOf(editor, page)
				const model = pageModel({
					uid: page.id,
					title: page.props.title,
					width: layout.width,
					height: layout.height,
					inner: layout.inner,
					panels: layout.panels.map((panel, index) => ({ pts: panel.pts, meta: metas[index] })),
					environment: page.props.environment || block.environment,
					lighting: page.props.lighting || block.lighting,
					scenario: page.props.scenario,
					bubbles,
					pageW: page.props.w,
					pageH: page.props.h,
					numbers: 'off',
					director: false,
				})
				const prompts = metas.map((meta, index) => {
					const bubble = bubbles.find((item) => item.panelIndex === index)
					// Only reserve balloon negative space when the panel actually carries a
					// (non-silent) bubble, and derive the corner from its real placement.
					const hasBubble = Boolean(bubble) && !meta.silent
					let corner = 'top-right'
					if (hasBubble && bubble) {
						const box = boundsOf(layout.panels[index].pts)
						const cx = ((bubble.x + bubble.w / 2) / Math.max(1, page.props.w)) * layout.width
						const cy = ((bubble.y + bubble.h / 2) / Math.max(1, page.props.h)) * layout.height
						const relX = (cx - box.minX) / Math.max(1, box.maxX - box.minX)
						const relY = (cy - box.minY) / Math.max(1, box.maxY - box.minY)
						corner = `${relY < 0.5 ? 'top' : 'bottom'}-${relX < 0.5 ? 'left' : 'right'}`
					}
					return buildPanelPrompt({
						environment: meta.environment || page.props.environment || block.environment,
						lighting: page.props.lighting || block.lighting,
						shot: meta.shot,
						angle: meta.angle,
						focal: meta.focal,
						aspect: meta.aspect,
						beat: meta.beat,
						locks,
						corner: safeCorner(corner),
						silent: meta.silent,
						hasBubble,
					})
				})
				const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
				compiledPages.push({
					id: page.id,
					chapterTitle: block.chapter.props.title,
					specTitle: page.props.title,
					svg: renderPageSvg(model),
					model,
					width: layout.width,
					height: layout.height,
					panels: layout.panels.map((panel, index) => {
						const box = boundsOf(panel.pts)
						return { n: index + 1, ...box, shot: metas[index].shot, angle: metas[index].angle, focal: metas[index].focal, beat: metas[index].beat }
					}),
				})
				return {
					id: page.id,
					index: page.props.pageIndex,
					scenario: page.props.scenario,
					layoutPreset: page.props.layoutPreset,
					dialogueDensity: page.props.dialogueDensity,
					targetPanels: page.props.targetPanels,
					score: page.props.score || judged.score,
					seed: page.props.seed,
					layout: {
						width: layout.width,
						height: layout.height,
						inner: layout.inner,
						panels: layout.panels.map((panel, index) => ({
							n: index + 1,
							pts: panel.pts,
							aspect: metas[index].aspect,
							shot: metas[index].shot,
							angle: metas[index].angle,
							focal: metas[index].focal,
							beat: metas[index].beat,
							prompt: prompts[index],
							imageOffsetX: metas[index].imageOffsetX,
							imageOffsetY: metas[index].imageOffsetY,
							imageScale: metas[index].imageScale,
							imageRotation: metas[index].imageRotation,
						})),
					},
					storyBoxes: metas.map((meta, index) => ({
						panel: index + 1,
						beat: meta.beat,
						shot: meta.shot,
						angle: meta.angle,
						focal: meta.focal,
						lines: bubbles
							.filter((bubble) => bubble.panelIndex === index)
							.map((bubble) => ({ type: bubble.style, text: bubble.text, prosody: bubble.prosody })),
					})),
				}
			}),
		}))
	const spec: ComicsSpec = {
		version: 'comics-spec/1',
		title: bible?.props.title || 'Untitled Manga',
		compiledAt: new Date().toISOString(),
		bible: {
			story: bible?.props.story || '',
			worldRules: worldCard?.props.body || bible?.props.worldRules || '',
			stylePreset: style,
			characters,
		},
		style: { preset: style, ink: 'Black ink lines', tone: 'Gray screentone with spot red' },
		chapters: specChapters,
	}
	return {
		spec,
		pages: compiledPages,
		sheets: characters.map((character) => characterSheetSvg(character.tag)),
	}
}
