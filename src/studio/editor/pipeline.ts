import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { generateImage } from '../ai/client'
import { loadSettings } from '../ai/settings'
import { ENV_IDS, ENV_LABELS, LIGHT_IDS, LIGHT_LABELS, SEAGULL_TEXT, bookFromText } from '../demo/book'
import { boundsOf, configFor, mulberry32, mutate, pagePixelSize, realize, sanitize, strHash, type Genome, type Layout } from '../layout/engine'
import { asScenario, layoutFeatures, layoutScore, pickTopLayouts } from '../layout/score'
import {
	buildPanelPrompt,
	fitBeats,
	metaFromBeat,
	readJson,
	refreshAspects,
	safeCorner,
	type Beat,
	type BookDraft,
	type PageDraft,
	type PanelMeta,
	type Shot,
	type Angle,
	type Focal,
	type BubbleStyle,
} from '../model'
import { ANGLES, FOCALS, PROMPT_BLOCKS, SHOTS, defaultParams, type BlockId } from '../prompts/library'
import { BUBBLE, CARD, CONTAINER, PROMPT, type MangaContainer, type MangaPrompt } from '../shapes/schema'
import { isBubble, isCard, isChapter, isContainer, isPage, isPrompt } from '../shapes/guards'
import { wireShapes } from '../shapes/wire'
import { planBubbles } from './placement'
import { buildPage } from './build'
import { getState, notify, patch } from './store'

const PAGE = pagePixelSize()

export function targetPages(editor: Editor): MangaContainer[] {
	const selected = editor.getSelectedShapes()
	const pages = selected.filter(isPage)
	if (pages.length) return pages
	const chapters = selected.filter(isChapter)
	const all = editor.getCurrentPageShapes().filter(isPage)
	if (chapters.length) {
		const indexes = new Set(chapters.map((chapter) => chapter.props.chapterIndex))
		const matched = all.filter((page) => indexes.has(page.props.chapterIndex))
		if (matched.length) return matched
	}
	const crop = getState().crop
	if (crop) {
		const page = all.find((item) => item.id === crop.pageId)
		if (page) return [page]
	}
	return all
}

export function buildPipeline(editor: Editor, text: string) {
	const book = bookFromText(text.trim() || SEAGULL_TEXT)
	const prompts = editor.getCurrentPageShapes().filter(isPrompt)
	editor.run(() => {
		const remove = editor
			.getCurrentPageShapes()
			.filter((shape) => {
				if (isContainer(shape) || isCard(shape) || isBubble(shape)) return true
				if (shape.type !== 'arrow') return false
				return editor.getBindingsFromShape(shape.id, 'arrow').some((binding) => {
					const target = editor.getShape(binding.toId)
					return isContainer(target) || isPrompt(target)
				})
			})
			.map((shape) => shape.id)
		if (remove.length) editor.deleteShapes(remove)
		if (prompts.length === 0) createPromptBlocks(editor)
		spawnBook(editor, book)
	})
	const bible = editor.getCurrentPageShapes().find((shape) => isContainer(shape) && shape.props.role === 'bible')
	if (bible) editor.setSelectedShapes([bible.id])
	editor.zoomToFit({ animation: { duration: 180 } })
	notify(`已铺开《${book.title}》：${book.chapters.length} 话，${book.chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0)} 页。`)
}

export function extractBible(editor: Editor, text: string, stylePreset?: string) {
	const book = bookFromText(text.trim() || SEAGULL_TEXT)
	if (stylePreset) book.stylePreset = stylePreset
	const bible = editor.getCurrentPageShapes().find((shape) => isContainer(shape) && shape.props.role === 'bible')
	if (!bible || !isContainer(bible)) {
		buildPipeline(editor, book.story)
		return `已从故事抽出设定并铺到画布。\n${book.characters.map((character) => `${character.tag} ${character.name}`).join('\n')}`
	}
	editor.run(() => {
		editor.updateShape({
			id: bible.id,
			type: CONTAINER,
			props: {
				title: book.title,
				subtitle: book.subtitle,
				story: book.story,
				worldRules: book.world,
				stylePreset: book.stylePreset,
			},
		})
		const oldCards = editor.getSortedChildIdsForParent(bible.id).filter((id) => isCard(editor.getShape(id)))
		if (oldCards.length) editor.deleteShapes(oldCards)
		createBibleCards(editor, bible.id, book)
	})
	notify(`设定集已对齐：${book.characters.map((character) => character.name).join('、')}。分页还留着上一版。`)
	return `${book.characters.map((character) => `${character.tag} ${character.name} · ${character.voice}`).join('\n')}\n世界：${book.world}`
}

export function chapterize(editor: Editor, text: string, chapterLimit = 0, pageLimit = 0) {
	const book = bookFromText(text.trim() || SEAGULL_TEXT)
	if (chapterLimit > 0) book.chapters = book.chapters.slice(0, chapterLimit)
	if (pageLimit > 0) {
		for (const chapter of book.chapters) chapter.pages = chapter.pages.slice(0, pageLimit)
	}
	const bible = editor.getCurrentPageShapes().find((shape) => isContainer(shape) && shape.props.role === 'bible')
	const chapters = editor.getCurrentPageShapes().filter(isChapter)
	const sameStory = isContainer(bible) && bible.props.story.trim() === book.story.trim()
	const outline = book.chapters.map((chapter) => `${chapter.title} · ${chapter.pages.length} 页 · ${ENV_LABELS[chapter.environment] ?? chapter.environment}`).join('\n')
	if (sameStory && chapters.length === book.chapters.length) {
		editor.setSelectedShapes(chapters.map((chapter) => chapter.id))
		editor.zoomToSelection({ animation: { duration: 180 } })
		notify(`章节已在画布上。\n${outline}`)
		return outline
	}
	buildPipeline(editor, book.story)
	return outline
}

export function relayout(editor: Editor) {
	const pages = targetPages(editor)
	if (!pages.length) {
		notify('画布上还没有页。')
		return
	}
	editor.run(() => {
		for (const page of pages) cycleLayout(editor, page, page.props.variant + 1, false)
	})
	notify(`已换 ${pages.length} 页分格，每页从 36 个种子里取当前名次。`)
}

export function showLayoutChoices(editor: Editor, page: MangaContainer) {
	editor.setSelectedShapes([page.id])
	const draft = draftOf(page)
	const config = configFor(draft.layoutPreset, draft.targetPanels)
	const { top, ms } = pickTopLayouts(draft.seed, config, draft.beats.length || draft.targetPanels, asScenario(draft.scenario), 36)
	patch({
		modal: {
			kind: 'layouts',
			pageId: page.id,
			title: `${page.props.title} · ${ms.toFixed(1)} ms`,
			choices: top.map((item) => ({
				score: item.score,
				reasons: item.reasons,
				genomeJson: JSON.stringify(item.layout.genome),
				width: item.layout.width,
				height: item.layout.height,
				panels: item.layout.panels.map((panel) => ({ pts: panel.pts })),
			})),
		},
	})
}

export function applyGenome(editor: Editor, pageId: TLShapeId, genomeJson: string) {
	const page = editor.getShape(pageId)
	if (!isPage(page)) return
	const genome = sanitize(readJson<Genome>(genomeJson, { rowW: [1], rowTilt: [], rows: [] }))
	editor.run(() => commitGenome(editor, page, genome, true))
	patch({ modal: null })
	notify(`${page.props.title} 已换成所选分格。`)
}

export function mutatePages(editor: Editor) {
	const pages = targetPages(editor)
	if (!pages.length) {
		notify('先选中一页再做局部变异。')
		return
	}
	editor.run(() => {
		for (const page of pages) {
			const random = mulberry32(strHash(`${page.props.seed}:m${page.props.mutation + 1}`))
			const genome = mutate(sanitize(readJson(page.props.genomeJson, { rowW: [1], rowTilt: [], rows: [] })), random, 0.65)
			editor.updateShape({ id: page.id, type: CONTAINER, props: { mutation: page.props.mutation + 1 } })
			commitGenome(editor, { ...page, props: { ...page.props, mutation: page.props.mutation + 1 } }, genome, false)
		}
	})
	notify(`已变异 ${pages.length} 页的斜切和格子比例。`)
}

export function restageDialogue(editor: Editor) {
	const pages = targetPages(editor)
	if (!pages.length) {
		notify('没有可重排台词的页。')
		return
	}
	let count = 0
	editor.run(() => {
		for (const page of pages) {
			const layout = layoutFrom(page)
			const beats = readJson<Beat[]>(page.props.scriptJson, [])
			count += replaceBubbles(editor, page, layout, fitBeats(beats, layout.panels.length))
		}
	})
	notify(`已按右到左重排 ${count} 个气泡。高潮前的静帧保持无对白。`)
}

export function randomizeAtmosphere(editor: Editor): { preview: string; params: Record<string, string> } {
	const pages = targetPages(editor)
	if (!pages.length) {
		notify('没有可换气氛的页。')
		return { preview: '画布上还没有页。', params: {} }
	}
	const random = mulberry32(strHash(`roll-${Date.now()}`))
	const environment = ENV_IDS[Math.floor(random() * ENV_IDS.length)]
	const lighting = LIGHT_IDS[Math.floor(random() * LIGHT_IDS.length)]
	const shot = SHOTS[Math.floor(random() * SHOTS.length)]
	const angle = ANGLES[Math.floor(random() * ANGLES.length)]
	const focal = FOCALS[Math.floor(random() * FOCALS.length)]
	editor.run(() => {
		for (const page of pages) {
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, []).map((meta, index) => ({
				...meta,
				shot: SHOTS[Math.floor(random() * SHOTS.length)],
				angle: ANGLES[Math.floor(random() * ANGLES.length)],
				focal: FOCALS[Math.floor(random() * FOCALS.length)],
				environment: '',
				imageDataUrl: '',
				imageSeed: `${meta.imageSeed.split('-r')[0]}-r${index}${Math.floor(random() * 999)}`,
			}))
			editor.updateShape({
				id: page.id,
				type: CONTAINER,
				props: { environment, lighting, panelsJson: JSON.stringify(metas) },
			})
		}
	})
	const preview = `${ENV_LABELS[environment] ?? environment} · ${LIGHT_LABELS[lighting] ?? lighting} · ${shot} / ${angle} / ${focal}`
	notify(`随机气氛已落到 ${pages.length} 页：${preview}`)
	return { preview, params: { environment, lighting, shot, angle, focal } }
}

export function applyCamera(editor: Editor, shot: string, angle: string, focal: string) {
	const pages = targetPages(editor)
	const crop = getState().crop
	editor.run(() => {
		for (const page of pages) {
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, []).map((meta, index) => {
				if (crop && crop.pageId === page.id && crop.panel !== index) return meta
				return {
					...meta,
					shot: asShot(shot),
					angle: asAngle(angle),
					focal: asFocal(focal),
					imageDataUrl: '',
				}
			})
			editor.updateShape({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(metas) } })
		}
	})
	notify(`机位已写入 ${pages.length} 页：${shot} · ${angle} · ${focal}`)
}

export async function renderTargets(editor: Editor, onlyPanel: boolean) {
	const pages = targetPages(editor)
	if (!pages.length) {
		notify('没有可渲染的页。')
		return '没有页。'
	}
	patch({ busy: '渲染' })
	const settings = loadSettings()
	const locks = lockText(editor)
	const style = editor.getCurrentPageShapes().find((shape) => isContainer(shape) && shape.props.role === 'bible')
	const stylePreset = isContainer(style) ? style.props.stylePreset : '少年网点'
	let apiCount = 0
	let offlineCount = 0
	let error = ''
	try {
		for (const page of pages) {
			const current = editor.getShape(page.id)
			if (!isPage(current)) continue
			const layout = layoutFrom(current)
			const metas = readJson<PanelMeta[]>(current.props.panelsJson, [])
			const bubbles = editor.getSortedChildIdsForParent(current.id).map((id) => editor.getShape(id)).filter(isBubble)
			const crop = getState().crop
			const indexes = metas.map((_, index) => index).filter((index) => !onlyPanel || !crop || crop.pageId !== current.id || crop.panel === index)
			for (const index of indexes) {
				const meta = metas[index]
				if (!meta) continue
				const bubble = bubbles.find((item) => item.props.panelIndex === index)
				const corner = bubble ? cornerOf(bubble, layout, index, current.props.w) : 'top-right'
				const prompt = `${buildPanelPrompt({
					environment: meta.environment || current.props.environment,
					lighting: current.props.lighting,
					shot: meta.shot,
					angle: meta.angle,
					focal: meta.focal,
					aspect: meta.aspect,
					beat: meta.beat,
					locks,
					corner: safeCorner(corner),
				})} Style preset: ${stylePreset}.`
				if (settings.useApi) {
					const result = await generateImage(prompt, String(meta.aspect))
					if (result.dataUrl) {
						metas[index] = { ...meta, imageDataUrl: result.dataUrl }
						apiCount += 1
						continue
					}
					error = result.error || error
				}
				metas[index] = {
					...meta,
					imageDataUrl: '',
					imageSeed: `${current.props.seed}-p${index}-r${(Date.now() + index).toString(36)}`,
				}
				offlineCount += 1
			}
			editor.updateShape({ id: current.id, type: CONTAINER, props: { panelsJson: JSON.stringify(metas) } })
		}
	} finally {
		patch({ busy: '' })
	}
	const summary = settings.useApi
		? `图像接口 ${apiCount} 格，离线网点 ${offlineCount} 格。${error ? ` ${error}` : ''}`
		: `离线网点稿已重绘 ${offlineCount} 格。设置里打开 API 后会改走图像接口。`
	notify(summary)
	return summary
}

export function retargetPage(editor: Editor, pageId: TLShapeId, partial: Partial<MangaContainer['props']>) {
	const page = editor.getShape(pageId)
	if (!isPage(page)) return
	const next = { ...page.props, ...partial }
	const draft: PageDraft = {
		...draftOf(page),
		scenario: asScenario(next.scenario),
		layoutPreset: next.layoutPreset,
		targetPanels: next.targetPanels,
		dialogueDensity: next.dialogueDensity,
	}
	const built = buildPage(draft, next.variant)
	editor.run(() => {
		editor.updateShape({
			id: page.id,
			type: CONTAINER,
			props: {
				...partial,
				targetPanels: built.layout.panels.length,
				genomeJson: JSON.stringify(built.layout.genome),
				panelsJson: JSON.stringify(built.metas),
				scriptJson: JSON.stringify(built.beats),
				score: built.score,
			},
		})
		replaceBubbles(editor, { ...page, props: { ...page.props, w: page.props.w, h: page.props.h } }, built.layout, built.beats)
	})
}

export function updatePanels(editor: Editor, pageId: TLShapeId, metas: PanelMeta[], extra?: Partial<MangaContainer['props']>) {
	editor.updateShape({ id: pageId, type: CONTAINER, props: { panelsJson: JSON.stringify(metas), ...extra } })
}

export async function runBlock(editor: Editor, id: BlockId, params: Record<string, string | number | boolean>, shapeId?: TLShapeId) {
	const text = getState().story
	let preview = ''
	if (id === 'extract') preview = extractBible(editor, text, String(params.stylePreset ?? ''))
	else if (id === 'chapterize') preview = chapterize(editor, text, Number(params.chapters) || 0, Number(params.pages) || 0)
	else if (id === 'name') {
		restageDialogue(editor)
		preview = '右到左重排台词。高潮前留一格静帧，末格写翻页钩子。'
	} else if (id === 'camera') {
		applyCamera(editor, String(params.shot ?? 'MS'), String(params.angle ?? 'low'), String(params.focal ?? '18mm'))
		preview = `${params.shot} · ${params.angle} · ${params.focal}`
	} else if (id === 'random') {
		const rolled = randomizeAtmosphere(editor)
		preview = rolled.preview
		params = { ...params, ...rolled.params }
	} else {
		preview = await renderTargets(editor, false)
	}
	if (shapeId) {
		editor.updateShape({
			id: shapeId,
			type: PROMPT,
			props: { preview, paramsJson: JSON.stringify(params) },
		})
	}
}

export function createPromptAt(editor: Editor, id: BlockId, x: number, y: number) {
	const block = PROMPT_BLOCKS.find((item) => item.id === id)
	if (!block) return
	editor.createShape({
		type: PROMPT,
		x,
		y,
		props: promptProps(block.id, block.title),
	})
}

export function createCardAt(editor: Editor, props: { tag: string; title: string; body: string; voice: string; kind: 'character' | 'note' }, x: number, y: number) {
	editor.createShape({
		type: CARD,
		x,
		y,
		props: {
			w: 240,
			h: props.kind === 'character' ? 210 : 140,
			kind: props.kind,
			tag: props.tag,
			title: props.title,
			body: props.body,
			voice: props.voice,
			locked: props.kind === 'character',
			imageSeed: props.tag,
		},
	})
}

function promptProps(id: BlockId, title: string): MangaPrompt['props'] {
	return {
		w: 260,
		h: 188,
		block: id,
		title,
		paramsJson: JSON.stringify(defaultParams(id)),
		preview: '',
	}
}

function createPromptBlocks(editor: Editor) {
	PROMPT_BLOCKS.forEach((block, index) => {
		const column = index % 2
		const row = Math.floor(index / 2)
		editor.createShape({
			type: PROMPT,
			x: 28 + column * 280,
			y: 36 + row * 204,
			props: promptProps(block.id, block.title),
		})
	})
}

function spawnBook(editor: Editor, book: BookDraft) {
	const bibleId = createShapeId()
	editor.createShape({
		id: bibleId,
		type: CONTAINER,
		x: 600,
		y: 36,
		props: {
			...blankContainer('bible'),
			w: 520,
			h: 900,
			title: book.title,
			subtitle: book.subtitle,
			story: book.story,
			worldRules: book.world,
			stylePreset: book.stylePreset,
		},
	})
	createBibleCards(editor, bibleId, book)
	const extract = editor.getCurrentPageShapes().find((shape) => isPrompt(shape) && shape.props.block === 'extract')
	if (extract) wireShapes(editor, extract.id, bibleId)
	book.chapters.forEach((chapter, chapterIndex) => {
		const chapterId = createShapeId()
		const pageY = chapterIndex === 0 ? 36 : 760
		editor.createShape({
			id: chapterId,
			type: CONTAINER,
			x: 1180,
			y: pageY + 180,
			props: {
				...blankContainer('chapter'),
				w: 340,
				h: 270,
				title: chapter.title,
				subtitle: chapter.mood,
				mood: chapter.mood,
				environment: chapter.environment,
				lighting: chapter.lighting,
				chapterIndex: chapterIndex + 1,
			},
		})
		editor.createShape({
			type: CARD,
			parentId: chapterId,
			x: 16,
			y: 168,
			props: {
				w: 308,
				h: 84,
				kind: 'environment',
				tag: chapter.environment,
				title: chapter.environment,
				body: `${ENV_LABELS[chapter.environment] ?? chapter.environment} · ${LIGHT_LABELS[chapter.lighting] ?? chapter.lighting}`,
				voice: chapter.mood,
				locked: false,
				imageSeed: chapter.environment,
			},
		})
		wireShapes(editor, bibleId, chapterId)
		chapter.pages.forEach((draft, pageIndex) => {
			const built = buildPage(draft, 0)
			const pageId = createShapeId()
			editor.createShape({
				id: pageId,
				type: CONTAINER,
				x: 1580 + pageIndex * (PAGE.w + 36),
				y: pageY,
				props: {
					...blankContainer('page'),
					w: PAGE.w,
					h: PAGE.h,
					title: `${chapter.title} P${pageIndex + 1}`,
					subtitle: draft.scenario,
					scenario: draft.scenario,
					targetPanels: built.layout.panels.length,
					layoutPreset: draft.layoutPreset,
					dialogueDensity: draft.dialogueDensity,
					seed: draft.seed,
					showFlow: draft.showFlow,
					score: built.score,
					chapterIndex: chapterIndex + 1,
					pageIndex: pageIndex + 1,
					environment: chapter.environment,
					lighting: chapter.lighting,
					mood: chapter.mood,
					genomeJson: JSON.stringify(built.layout.genome),
					panelsJson: JSON.stringify(built.metas),
					scriptJson: JSON.stringify(built.beats),
				},
			})
			placeBubbles(editor, pageId, built.layout, built.beats, PAGE.w, PAGE.h)
			wireShapes(editor, chapterId, pageId)
		})
	})
}

function createBibleCards(editor: Editor, bibleId: TLShapeId, book: BookDraft) {
	editor.createShape({
		type: CARD,
		parentId: bibleId,
		x: 14,
		y: 58,
		props: { w: 492, h: 108, kind: 'story', tag: '', title: book.title, body: book.story, voice: book.subtitle, locked: false, imageSeed: 'story' },
	})
	editor.createShape({
		type: CARD,
		parentId: bibleId,
		x: 14,
		y: 176,
		props: { w: 492, h: 96, kind: 'world', tag: 'world', title: '世界规则', body: book.world, voice: book.stylePreset, locked: false, imageSeed: 'world' },
	})
	book.characters.forEach((character, index) => {
		editor.createShape({
			type: CARD,
			parentId: bibleId,
			x: 14,
			y: 284 + index * 196,
			props: {
				w: 492,
				h: 184,
				kind: 'character',
				tag: character.tag,
				title: character.name,
				body: character.appearance,
				voice: character.voice,
				locked: character.locked,
				imageSeed: character.tag,
			},
		})
	})
}

function blankContainer(role: MangaContainer['props']['role']): MangaContainer['props'] {
	return {
		w: 200,
		h: 200,
		role,
		title: '',
		subtitle: '',
		story: '',
		worldRules: '',
		stylePreset: '少年网点',
		mood: '',
		environment: 'boardwalk',
		lighting: 'hard-noon',
		scenario: 'tension',
		targetPanels: 4,
		layoutPreset: 'std',
		dialogueDensity: 40,
		seed: 'page',
		variant: 0,
		mutation: 0,
		showFlow: false,
		score: 0,
		chapterIndex: 0,
		pageIndex: 0,
		genomeJson: '{}',
		panelsJson: '[]',
		scriptJson: '[]',
	}
}

function draftOf(page: MangaContainer): PageDraft {
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	return {
		scenario: asScenario(page.props.scenario),
		layoutPreset: page.props.layoutPreset,
		dialogueDensity: page.props.dialogueDensity,
		targetPanels: page.props.targetPanels || beats.length || 4,
		seed: page.props.seed,
		showFlow: page.props.showFlow,
		beats,
	}
}

function cycleLayout(editor: Editor, page: MangaContainer, variant: number, keepOffsets: boolean) {
	const built = buildPage(draftOf(page), variant)
	const prev = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const metas = built.metas.map((meta, index) => ({
		...meta,
		imageDataUrl: keepOffsets ? prev[index]?.imageDataUrl ?? '' : '',
		imageOffsetX: keepOffsets ? prev[index]?.imageOffsetX ?? 0 : 0,
		imageOffsetY: keepOffsets ? prev[index]?.imageOffsetY ?? 0 : 0,
		imageScale: keepOffsets ? prev[index]?.imageScale ?? 1 : 1,
		imageRotation: keepOffsets ? prev[index]?.imageRotation ?? 0 : 0,
	}))
	editor.updateShape({
		id: page.id,
		type: CONTAINER,
		props: {
			variant,
			targetPanels: built.layout.panels.length,
			genomeJson: JSON.stringify(built.layout.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(built.beats),
			score: built.score,
		},
	})
	replaceBubbles(editor, page, built.layout, built.beats)
}

function commitGenome(editor: Editor, page: MangaContainer, genome: Genome, resetFraming: boolean) {
	const config = configFor(page.props.layoutPreset, page.props.targetPanels)
	const realized = realize(sanitize(genome), config)
	const layout: Layout = { ...realized, seed: page.props.seed }
	const beats = fitBeats(readJson<Beat[]>(page.props.scriptJson, []), layout.panels.length)
	const prev = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const metas = layout.panels.map((panel, index) => {
		const base = prev[index] ?? metaFromBeat(beats[index], panel, page.props.seed, index)
		const refreshed = refreshAspects([base], [panel], page.props.seed)[0]
		return resetFraming
			? { ...refreshed, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0, imageDataUrl: '' }
			: refreshed
	})
	const judged = layoutScore(layoutFeatures(layout), layout.panels.length, asScenario(page.props.scenario))
	editor.updateShape({
		id: page.id,
		type: CONTAINER,
		props: {
			genomeJson: JSON.stringify(layout.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			targetPanels: layout.panels.length,
			score: judged.score,
		},
	})
	if (resetFraming || prev.length !== layout.panels.length) replaceBubbles(editor, page, layout, beats)
}

function layoutFrom(page: MangaContainer): Layout {
	const realized = realize(sanitize(readJson(page.props.genomeJson, { rowW: [1], rowTilt: [], rows: [] })), configFor(page.props.layoutPreset, page.props.targetPanels))
	return { ...realized, seed: page.props.seed }
}

function placeBubbles(editor: Editor, pageId: TLShapeId, layout: Layout, beats: Beat[], pageW: number, pageH: number) {
	const planned = planBubbles(layout, beats, pageW, pageH)
	if (!planned.length) return
	editor.createShapes(
		planned.map((bubble) => ({
			type: BUBBLE,
			parentId: pageId,
			x: bubble.x,
			y: bubble.y,
			props: {
				w: bubble.w,
				h: bubble.h,
				bubble: asBubbleStyle(bubble.style),
				text: bubble.text,
				prosody: bubble.prosody,
				emphasis: bubble.emphasis,
				tailX: bubble.tailX,
				tailY: bubble.tailY,
				panelIndex: bubble.panelIndex,
				spin: bubble.spin,
			},
		})),
	)
}

function replaceBubbles(editor: Editor, page: MangaContainer, layout: Layout, beats: Beat[]) {
	const old = editor.getSortedChildIdsForParent(page.id).filter((id) => isBubble(editor.getShape(id)))
	if (old.length) editor.deleteShapes(old)
	placeBubbles(editor, page.id, layout, beats, page.props.w, page.props.h)
	return planBubbles(layout, beats, page.props.w, page.props.h).length
}

function lockText(editor: Editor) {
	return editor
		.getCurrentPageShapes()
		.filter(isCard)
		.filter((card) => card.props.kind === 'character')
		.map((card) => `${card.props.tag} locked: ${card.props.body}`)
		.join(' ')
}

function cornerOf(bubble: { x: number; props: { w: number } }, layout: Layout, index: number, pageW: number) {
	const panel = layout.panels[index]
	if (!panel) return 'top-right'
	const box = boundsOf(panel.pts)
	const mid = ((box.minX + box.maxX) / 2) * (pageW / layout.width)
	return bubble.x + bubble.props.w / 2 < mid ? 'top-left' : 'top-right'
}

const BUBBLE_STYLES: BubbleStyle[] = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']

function asBubbleStyle(value: string): BubbleStyle {
	return BUBBLE_STYLES.includes(value as BubbleStyle) ? (value as BubbleStyle) : 'speech'
}

function asShot(value: string): Shot {
	return SHOTS.includes(value as Shot) ? (value as Shot) : 'MS'
}

function asAngle(value: string): Angle {
	return ANGLES.includes(value as Angle) ? (value as Angle) : 'eye'
}

function asFocal(value: string): Focal {
	return FOCALS.includes(value as Focal) ? (value as Focal) : '50mm'
}
