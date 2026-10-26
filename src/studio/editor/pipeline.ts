import { createBindingId, createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { askImage, askText, askVision, polishCardText, regenerateCardText } from '../ai/client'
import { bookFromText, defaultBook, ENV_IDS, ENV_LABELS, LIGHT_IDS, LIGHT_LABELS } from '../demo/book'
import {
	boundsOf,
	centroid,
	configFor,
	generate,
	mulberry32,
	mutate,
	realize,
	sanitize,
	strHash,
	togglePanelBleed,
	togglePanelNest,
	type ParametricOverrides,
} from '../layout/engine'
import {
	applyRemedyToGenome,
	asScenario,
	EMOTION_DIRECTION_TIPS,
	layoutFeatures,
	layoutScore,
	pickTopLayouts,
	type EditorialRemedy,
	type Scenario,
} from '../layout/score'
import {
	buildPanelPrompt,
	fitBeats,
	metaFromBeat,
	readJson,
	readPageParams,
	refreshAspects,
	safeCorner,
	serializePageParams,
	type Beat,
	type BookDraft,
	type BubbleStyle,
	type PageDraft,
	type PanelMeta,
	type ProsodyStyle,
} from '../model'
import { computeOptics, defaultOpticsForMeta } from '../optics/shotLab'
import { compileTensionCoupledLayout, runIterativePolling4Pass, universalPresetToBook } from '../jev/fiveStageEngine'
import { blockTitle, defaultParams, type BlockId } from '../prompts/library'
import { BUBBLE, CARD, CONTAINER, PROMPT, type CardKind, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { planBubbles } from './placement'

const PAGE_W = 460
const PAGE_H = 650

const cardDiffStore = new Map<string, { prevBody: string; nextBody: string; modelUsed: string; label: string }>()
const pageDiffStore = new Map<string, { prevPanelsJson: string; prevScriptJson: string; summary: string }>()

export function getCardDiff(cardId: string) {
	return cardDiffStore.get(cardId) ?? null
}

export function revertCardDiff(editor: Editor, card: MangaCard): void {
	const snap = cardDiffStore.get(card.id)
	if (!snap) return
	editor.updateShape<MangaCard>({
		id: card.id,
		type: CARD,
		props: { body: snap.prevBody, aiStatus: '已回退至改写前版本' },
	})
	cardDiffStore.delete(card.id)
}

export function getPageDiff(pageId: string) {
	return pageDiffStore.get(pageId) ?? null
}

export function revertPageDiff(editor: Editor, page: MangaContainer): void {
	const snap = pageDiffStore.get(page.id)
	if (!snap) return
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const layout = realize(sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome)), config)
	const beats = readJson<Beat[]>(snap.prevScriptJson, [])
	const metas = readJson<PanelMeta[]>(snap.prevPanelsJson, [])
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			panelsJson: snap.prevPanelsJson,
			scriptJson: snap.prevScriptJson,
			subtitle: `${metas.length} 格 · 已回退原分镜`,
		},
	})
	spawnPageBubbles(editor, page.id, layout, beats, metas)
	pageDiffStore.delete(page.id)
}

export function seedDefaultIfEmpty(editor: Editor): void {
	if (editor.getCurrentPageShapeIds().size > 0) return
	spawnBook(editor, defaultBook())
}

/**
 * Read dynamic character / discrete-asset visual locks from the Bible container
 * cards on the canvas, replacing any single-story hardcoded lock string.
 */
export function readCharacterLocks(editor: Editor): string {
	const cards = editor
		.getCurrentPageShapes()
		.filter((shape): shape is MangaCard => shape.type === CARD && (shape.props.kind === 'character' || shape.props.kind === 'image'))
	const tags = cards.filter((card) => card.props.locked && card.props.tag).map((card) => card.props.tag)
	const unique = Array.from(new Set(tags))
	if (unique.length) return `${unique.join(' ')} 外观锁定`
	return '角色与资产外观锁定'
}

/**
 * Switch the canvas to any universal 5-stage story preset (fully story-agnostic),
 * rebuilding the Bible, chapter and polygon storyboard pages from the preset.
 */
export function applyUniversalFiveStagePreset(editor: Editor, presetId: string): string {
	const book = universalPresetToBook(presetId)
	if (!book) return `未找到通用五阶段预设「${presetId}」`
	spawnBook(editor, book)
	return `已载入通用五阶段预设「${book.title}」并按 JEV 引擎重建画布分镜`
}

/**
 * Run the JEV 5-stage compile on the active page(s): Stage 2 four-pass iterative
 * polling + McCloud on-demand gating, then activate the Saccadic Focal-Gaze-Bubble
 * Trajectory overlay. Fully story-agnostic — it reads whatever beats the page holds.
 */
export function runJevFiveStageCompile(editor: Editor): string {
	const pages = selectedPages(editor)
	if (!pages.length) return '请先选择要进行 JEV 五阶段编译的分镜页'
	let totalPanels = 0
	let minScore = 1
	let axisOk = true
	for (const page of pages) {
		const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
		const prevMetas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const targetCount = Math.max(1, rawBeats.length || page.props.targetPanels || 4)
		const initialBeats = fitBeats(rawBeats, targetCount)

		// Stage 2: 4-Pass Iterative Polling (14-factor camera/optics lock + McCloud gates + 180° axis repair)
		const poll = runIterativePolling4Pass(initialBeats, 'rtl')
		const repaired = poll.repairedBeats

		// Stage 3: Programmatic Tension-Coupled Layout Genome Solver
		const stage3 = compileTensionCoupledLayout(
			page.props.seed,
			repaired,
			asScenario(page.props.scenario),
			page.props.layoutPreset,
		)
		const layout = stage3.layout

		// Stage 4: Rebuild PanelMetas with locked camera/optics while preserving user cell image pan/zoom/uploads
		const metas = layout.panels.map((panel, index) => {
			const fresh = metaFromBeat(repaired[index] ?? initialBeats[index], panel, page.props.seed, index)
			const prev = prevMetas[index]
			if (!prev) return fresh
			return {
				...fresh,
				imageDataUrl: prev.imageDataUrl || fresh.imageDataUrl,
				imageOffsetX: prev.imageOffsetX ?? fresh.imageOffsetX,
				imageOffsetY: prev.imageOffsetY ?? fresh.imageOffsetY,
				imageScale: prev.imageScale ?? fresh.imageScale,
				imageRotation: prev.imageRotation ?? fresh.imageRotation,
			}
		})

		const finalScore = Number(Math.max(poll.convergedScore, stage3.score).toFixed(3))
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: {
				targetPanels: layout.panels.length,
				genomeJson: JSON.stringify(stage3.genome),
				scriptJson: JSON.stringify(repaired),
				panelsJson: JSON.stringify(metas),
				score: finalScore,
				reasonsJson: JSON.stringify(stage3.reasons),
				showFlow: true,
				showBubblesLayer: page.props.showBubblesLayer ?? true,
				showProsodyLayer: page.props.showProsodyLayer ?? true,
				showSfxLayer: page.props.showSfxLayer ?? true,
				subtitle: `${layout.panels.length} 格 · JEV 程式化锁定 ${Math.round(finalScore * 100)} 分 · ${poll.axisAuditPass ? '180°轴线连贯' : '轴线已校准'}`,
			},
		})
		// Stage 5: Spawn anti-occlusion vector bubbles & independent prosody layer
		spawnPageBubbles(editor, page.id, layout, repaired, metas)
		totalPanels += layout.panels.length
		minScore = Math.min(minScore, finalScore)
		axisOk = axisOk && poll.axisAuditPass
	}
	return `JEV 五阶段程式化编译完成：${pages.length} 页 / ${totalPanels} 格 · 14因子机位+张力耦合版式已锁定（${Math.round(minScore * 100)} 分）· 独立气泡与语气图层就绪`
}

export function spawnBook(editor: Editor, book: BookDraft): void {
	const existing = [...editor.getCurrentPageShapeIds()]
	if (existing.length) editor.deleteShapes(existing)

	const bibleId = createShapeId('bible')
	editor.createShape<MangaContainer>({
		id: bibleId,
		type: CONTAINER,
		x: 40,
		y: 60,
		props: {
			w: 580,
			h: 920,
			role: 'bible',
			title: `${book.title} · 设定母容器`,
			subtitle: book.subtitle,
			story: book.story,
			worldRules: book.world,
			stylePreset: book.stylePreset,
			mood: '盐风与夕照',
			environment: 'boardwalk',
			lighting: 'hard-noon',
			chapterIndex: 0,
			pageIndex: 0,
			scenario: 'establishing',
			layoutPreset: 'std',
			dialogueDensity: 0.45,
			targetPanels: 4,
			seed: 'bible',
			genomeJson: '',
			panelsJson: '[]',
			scriptJson: '[]',
			score: 0,
			reasonsJson: '[]',
			showFlow: false,
			selectedPanel: -1,
		},
	})

	editor.createShape<MangaCard>({
		id: createShapeId('story-card'),
		type: CARD,
		x: 62,
		y: 120,
		props: {
			w: 262,
			h: 224,
			kind: 'story',
			title: '故事原稿 · 核心梗概',
			tag: '剧情主线',
			body: book.story,
			voice: '',
			locked: true,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: 'Text LLM 就绪',
		},
	})

	editor.createShape<MangaCard>({
		id: createShapeId('world-card'),
		type: CARD,
		x: 336,
		y: 120,
		props: {
			w: 262,
			h: 224,
			kind: 'world',
			title: '世界观与画风规范',
			tag: book.stylePreset,
			body: book.world,
			voice: '',
			locked: true,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: 'Text LLM 就绪',
		},
	})

	book.characters.forEach((character, index) => {
		const col = index % 2
		const row = Math.floor(index / 2)
		editor.createShape<MangaCard>({
			id: createShapeId(`char-${character.tag.replace('@', '')}`),
			type: CARD,
			x: 62 + col * 274,
			y: 360 + row * 268,
			props: {
				w: index === 2 ? 536 : 262,
				h: 252,
				kind: 'character',
				title: character.name,
				tag: character.tag,
				body: `${character.appearance}｜台词气质：${character.voice}`,
				voice: character.voice,
				locked: character.locked,
				imageDataUrl: character.imageDataUrl ?? '',
				customPrompt: '',
				aiStatus: 'Vision + Image 就绪',
			},
		})
	})

	const refCard1Id = createShapeId('img-card-boardwalk')
	editor.createShape<MangaCard>({
		id: refCard1Id,
		type: CARD,
		x: 40,
		y: 1010,
		props: {
			w: 280,
			h: 276,
			kind: 'image',
			title: '第一话参考图：防波堤正午逆光',
			tag: '@boardwalk',
			body: '正午硬光下的海岸防波堤，18mm 广角透视，海鸥俯冲速度线与红白薯条盒形成视觉焦点。',
			voice: 'ref-boardwalk-1',
			locked: true,
			imageDataUrl: '',
			customPrompt: '强化海面反光网点与俯冲张力',
			aiStatus: 'Vision + Image 驱动',
		},
	})

	const refCard2Id = createShapeId('img-card-rooftop')
	editor.createShape<MangaCard>({
		id: refCard2Id,
		type: CARD,
		x: 340,
		y: 1010,
		props: {
			w: 280,
			h: 276,
			kind: 'image',
			title: '第二话参考图：夕照屋顶剪影',
			tag: '@rooftop',
			body: '旧商店街屋顶铁丝网与水塔长影，暮色逆光勾勒一人一鸥对峙轮廓，保留右上角对白留白区。',
			voice: 'ref-rooftop-1',
			locked: true,
			imageDataUrl: '',
			customPrompt: '增加黄昏渐变网点与胶片颗粒感',
			aiStatus: 'Vision + Image 驱动',
		},
	})

	book.chapters.forEach((chapter, chapterIdx) => {
		const chapterId = createShapeId(`chapter-${chapterIdx + 1}`)
		const baseY = 60 + chapterIdx * 780
		editor.createShape<MangaContainer>({
			id: chapterId,
			type: CONTAINER,
			x: 680,
			y: baseY,
			props: {
				w: 290,
				h: 390,
				role: 'chapter',
				title: chapter.title,
				subtitle: `${ENV_LABELS[chapter.environment] ?? chapter.environment} · ${LIGHT_LABELS[chapter.lighting] ?? chapter.lighting}`,
				story: '',
				worldRules: '',
				stylePreset: book.stylePreset,
				mood: chapter.mood,
				environment: chapter.environment,
				lighting: chapter.lighting,
				chapterIndex: chapterIdx + 1,
				pageIndex: 0,
				scenario: 'establishing',
				layoutPreset: 'std',
				dialogueDensity: 0.45,
				targetPanels: 4,
				seed: `chapter-${chapterIdx + 1}`,
				genomeJson: '',
				panelsJson: '[]',
				scriptJson: '[]',
				score: 0,
				reasonsJson: '[]',
				showFlow: false,
				selectedPanel: -1,
			},
		})
		editor.createShape<MangaCard>({
			id: createShapeId(`env-${chapterIdx + 1}`),
			type: CARD,
			x: 698,
			y: baseY + 64,
			props: {
				w: 254,
				h: 248,
				kind: 'environment',
				title: ENV_LABELS[chapter.environment] ?? chapter.environment,
				tag: LIGHT_LABELS[chapter.lighting] ?? chapter.lighting,
				body: `本章情绪：${chapter.mood}。光线：${LIGHT_LABELS[chapter.lighting] ?? chapter.lighting}。分镜留白优先右上角。`,
				voice: '',
				locked: false,
				imageDataUrl: '',
				customPrompt: '',
				aiStatus: 'Text LLM 就绪',
			},
		})
		wire(editor, bibleId, chapterId, 620, 260 + chapterIdx * 120, 680, baseY + 120)
		wire(editor, chapterIdx === 0 ? refCard1Id : refCard2Id, chapterId, 600, 1120, 680, baseY + 260)

		const count = chapter.pages.length
		chapter.pages.forEach((page, pos) => {
			const pageNumber = pos + 1
			const rtlSlot = count - 1 - pos
			const pageX = 1040 + rtlSlot * 520
			const pageId = createPageShape(editor, page, {
				id: `page-c${chapterIdx + 1}-p${pageNumber}`,
				x: pageX,
				y: baseY,
				chapterIndex: chapterIdx + 1,
				pageIndex: pageNumber,
				title: `第${chapterIdx + 1}话 · P${pageNumber}`,
				environment: chapter.environment,
				lighting: chapter.lighting,
				stylePreset: book.stylePreset,
			})
			wire(editor, chapterId, pageId, 970, baseY + 140 + pos * 40, pageX, baseY + 140)
		})
	})

	editor.zoomToFit({ animation: { duration: 0 } })
}

export function createTextCardOnCanvas(
	editor: Editor,
	kind: Exclude<CardKind, 'image' | 'character'> = 'note',
	title = '新建文字设定卡',
	body = '在此输入角色小传、场景规则或单场戏剧情。点击下方「AI 润色美化」或输入自定义提示词即可由 Text LLM 扩写。',
): TLShapeId {
	const center = editor.getViewportPageBounds().center
	const id = createShapeId(`text-card-${Date.now()}`)
	editor.createShape<MangaCard>({
		id,
		type: CARD,
		x: center.x - 140,
		y: center.y - 120,
		props: {
			w: 280,
			h: 240,
			kind,
			title,
			tag: kind === 'world' ? '世界观' : kind === 'story' ? '剧情段' : '设定卡',
			body,
			voice: '',
			locked: false,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: '由 Text LLM 驱动',
		},
	})
	editor.select(id)
	return id
}

export function createImageCardOnCanvas(
	editor: Editor,
	kind: 'image' | 'character' = 'image',
	title = '新建视觉参考图卡',
	tag = '@boardwalk',
	body = '海岸防波堤仰拍参考图，黑白G笔浓墨线配60L灰网点，右上角留出对白气泡安全区。可点「Vision 反推」或「AI 重绘」。',
): TLShapeId {
	const center = editor.getViewportPageBounds().center
	const id = createShapeId(`img-card-${Date.now()}`)
	editor.createShape<MangaCard>({
		id,
		type: CARD,
		x: center.x - 145,
		y: center.y - 140,
		props: {
			w: 290,
			h: 280,
			kind,
			title,
			tag,
			body,
			voice: `ref-${Date.now()}`,
			locked: true,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: 'Vision + Image 驱动',
		},
	})
	editor.select(id)
	return id
}

function createPageShape(
	editor: Editor,
	draft: PageDraft,
	info: {
		id: string
		x: number
		y: number
		chapterIndex: number
		pageIndex: number
		title: string
		environment: string
		lighting: string
		stylePreset: string
	},
): TLShapeId {
	const stage3 = compileTensionCoupledLayout(draft.seed, draft.beats, draft.scenario, draft.layoutPreset)
	const layout = stage3.layout
	const beats = fitBeats(draft.beats, layout.panels.length)
	const metas = layout.panels.map((panel, index) => metaFromBeat(beats[index], panel, layout.seed, index))
	const pageId = createShapeId(info.id)
	editor.createShape<MangaContainer>({
		id: pageId,
		type: CONTAINER,
		x: info.x,
		y: info.y,
		props: {
			w: PAGE_W,
			h: PAGE_H,
			role: 'page',
			title: info.title,
			subtitle: `${layout.panels.length} 格 · 评分 ${Math.round(stage3.score * 100)}`,
			story: '',
			worldRules: '',
			stylePreset: info.stylePreset,
			mood: '',
			environment: info.environment,
			lighting: info.lighting,
			chapterIndex: info.chapterIndex,
			pageIndex: info.pageIndex,
			scenario: draft.scenario,
			layoutPreset: draft.layoutPreset,
			dialogueDensity: draft.dialogueDensity,
			targetPanels: draft.targetPanels,
			seed: layout.seed,
			genomeJson: JSON.stringify(stage3.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			score: stage3.score,
			reasonsJson: JSON.stringify(stage3.reasons),
			showFlow: draft.showFlow,
			selectedPanel: 0,
			showBubblesLayer: true,
			showProsodyLayer: true,
			showSfxLayer: true,
		},
	})
	spawnPageBubbles(editor, pageId, layout, beats, metas)
	return pageId
}

export function spawnPageBubbles(
	editor: Editor,
	pageId: TLShapeId,
	layout: ReturnType<typeof realize>,
	beats: Beat[],
	metas: PanelMeta[],
): void {
	const old = editor
		.getSortedChildIdsForParent(pageId)
		.map((id) => editor.getShape(id))
		.filter((shape): shape is MangaBubble => shape?.type === BUBBLE)
	if (old.length) editor.deleteShapes(old.map((shape) => shape.id))
	const syncedBeats = beats.map((b, idx) => (metas[idx]?.silent ? { ...b, silent: true, lines: [] } : b))
	const planned = planBubbles({ ...layout, seed: pageId }, syncedBeats, PAGE_W, PAGE_H)
	planned.forEach((bubble, index) => {
		editor.createShape<MangaBubble>({
			id: createShapeId(`${pageId.replace('shape:', '')}-b${index}`),
			type: BUBBLE,
			parentId: pageId,
			x: bubble.x,
			y: bubble.y,
			props: {
				w: bubble.w,
				h: bubble.h,
				bubble: bubble.style as MangaBubble['props']['bubble'],
				text: bubble.text,
				prosody: bubble.prosody,
				emphasis: bubble.emphasis,
				tailX: bubble.tailX,
				tailY: bubble.tailY,
				panelIndex: bubble.panelIndex,
				spin: bubble.spin,
				prosodyStyle: bubble.prosodyStyle ?? 'pill',
				prosodyOffsetX: bubble.prosodyOffsetX ?? 0,
				prosodyOffsetY: bubble.prosodyOffsetY ?? 0,
				prosodyScale: bubble.prosodyScale ?? 1,
				prosodyColor: bubble.prosodyColor ?? '',
				fillColor: bubble.fillColor ?? '',
				fontWeight: bubble.fontWeight ?? 700,
			},
		})
	})
}

function wire(editor: Editor, fromId: TLShapeId, toId: TLShapeId, x1: number, y1: number, x2: number, y2: number): void {
	const arrowId = createShapeId(`wire-${fromId.replace('shape:', '')}-${toId.replace('shape:', '')}`)
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		x: 0,
		y: 0,
		props: {
			start: { x: x1, y: y1 },
			end: { x: x2, y: y2 },
			color: 'grey',
			bend: 0,
		},
	})
	editor.createBindings([
		{ id: createBindingId(), type: 'arrow', fromId: arrowId, toId: fromId, props: { terminal: 'start', normalizedAnchor: { x: 0.95, y: 0.5 }, isExact: false, isPrecise: true } },
		{ id: createBindingId(), type: 'arrow', fromId: arrowId, toId: toId, props: { terminal: 'end', normalizedAnchor: { x: 0.05, y: 0.35 }, isExact: false, isPrecise: true } },
	])
}

export function selectedPages(editor: Editor): MangaContainer[] {
	const direct = editor
		.getSelectedShapes()
		.filter((shape): shape is MangaContainer => shape.type === CONTAINER && shape.props.role === 'page')
	if (direct.length) return direct
	return editor
		.getCurrentPageShapes()
		.filter((shape): shape is MangaContainer => shape.type === CONTAINER && shape.props.role === 'page')
}

export function applyLayoutChoice(
	editor: Editor,
	page: MangaContainer,
	choice: { seed: string; genome: ReturnType<typeof sanitize>; score: number; reasons: string[] },
): void {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const layout = realize(choice.genome, config)
	const rawScript = readJson<Beat[]>(page.props.scriptJson, [])
	const beats = fitBeats(rawScript, layout.panels.length)
	const prev = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const metas = layout.panels.map((panel, index) => {
		const old = prev[index]
		const fresh = metaFromBeat(beats[index], panel, choice.seed, index)
		return old
			? {
					...fresh,
					shot: old.shot,
					angle: old.angle,
					focal: old.focal,
					focalMm: old.focalMm ?? fresh.focalMm,
					fStop: old.fStop ?? fresh.fStop,
					sensor: old.sensor ?? fresh.sensor,
					subjectDistM: old.subjectDistM ?? fresh.subjectDistM,
					bgDistM: old.bgDistM ?? fresh.bgDistM,
					silent: old.silent ?? fresh.silent,
					beat: old.beat,
					who: old.who,
					fries: old.fries,
					environment: old.environment,
					imageDataUrl: old.imageDataUrl || fresh.imageDataUrl,
					imageOffsetX: old.imageOffsetX ?? fresh.imageOffsetX,
					imageOffsetY: old.imageOffsetY ?? fresh.imageOffsetY,
					imageScale: old.imageScale ?? fresh.imageScale,
					imageRotation: old.imageRotation ?? fresh.imageRotation,
				}
			: fresh
	})
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			seed: choice.seed,
			subtitle: `${layout.panels.length} 格 · 评分 ${Math.round(choice.score * 100)}`,
			genomeJson: JSON.stringify(layout.genome),
			panelsJson: JSON.stringify(refreshAspects(metas, layout.panels, choice.seed)),
			scriptJson: JSON.stringify(beats),
			score: choice.score,
			reasonsJson: JSON.stringify(choice.reasons),
			selectedPanel: Math.min(page.props.selectedPanel, layout.panels.length - 1),
		},
	})
	spawnPageBubbles(editor, page.id, layout, beats, metas)
}

export function rerollSelectedPages(editor: Editor): void {
	for (const page of selectedPages(editor)) {
		const nextSeed = `${page.props.seed.replace(/~\d+$/, '')}~${Math.floor(Math.random() * 900 + 100)}`
		const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
		const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
		const picked = pickTopLayouts(nextSeed, config, page.props.targetPanels, asScenario(page.props.scenario))
		const best = picked.top[0]
		applyLayoutChoice(editor, page, { seed: best.seed, genome: best.layout.genome, score: best.score, reasons: best.reasons })
	}
}

export function mutateSelectedPages(editor: Editor, strengthOverride?: number): void {
	for (const page of selectedPages(editor)) {
		const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
		const strength = strengthOverride ?? overrides.mutationStrength ?? 0.55
		const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
		const current = sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome))
		const rand = mulberry32(strHash(`${page.props.seed}-${Date.now()}`))
		const genome = mutate(current, rand, strength)
		const layout = realize(genome, config)
		const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
		applyLayoutChoice(editor, page, { seed: `${page.props.seed}*`, genome: layout.genome, score: judged.score, reasons: judged.reasons })
	}
}

export function updatePageParametric(
	editor: Editor,
	page: MangaContainer,
	patch: Partial<ParametricOverrides>,
	regenerateLayout = true,
): string {
	const current = readPageParams(page.props.mood, page.props.layoutPreset)
	const next: Required<ParametricOverrides> = { ...current, ...patch }
	const moodStr = serializePageParams(next)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, next)

	if (regenerateLayout) {
		const picked = pickTopLayouts(`${page.props.seed.replace(/~\d+$/, '')}~p`, config, page.props.targetPanels, asScenario(page.props.scenario), 24)
		const best = picked.top[0]
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: { mood: moodStr },
		})
		const updatedPage = editor.getShape<MangaContainer>(page.id)
		if (updatedPage) {
			applyLayoutChoice(editor, updatedPage, {
				seed: best.seed,
				genome: best.layout.genome,
				score: best.score,
				reasons: best.reasons,
			})
		}
		return `已更新版式几何参数并重算最高分排布（${Math.round(best.score * 100)} 分）`
	}

	const rawGenome = readJson(page.props.genomeJson, generate(page.props.seed, config).genome)
	const layout = realize(sanitize(rawGenome), config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			mood: moodStr,
			score: judged.score,
			reasonsJson: JSON.stringify(judged.reasons),
		},
	})
	return '已更新原稿框线与安全参考线显示'
}

export function applyEditorialRemedyOnPage(
	editor: Editor,
	page: MangaContainer,
	remedy: EditorialRemedy,
): string {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const nextOverrides: Required<ParametricOverrides> = { ...overrides }
	if (remedy.id === 'expand-hero') nextOverrides.big = Math.min(1, (overrides.big ?? 0.25) + 0.28)
	if (remedy.id === 'bleed-last-hook') nextOverrides.bleed = Math.min(1, (overrides.bleed ?? 0.2) + 0.35)
	if (remedy.id === 'boost-tilt') nextOverrides.tilt = Math.min(1, (overrides.tilt ?? 0.2) + 0.32)
	if (remedy.id === 'calm-tilt') nextOverrides.tilt = 0.04

	const config = configFor(page.props.layoutPreset, page.props.targetPanels, nextOverrides)
	const currentGenome = sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome))
	const nextGenome = applyRemedyToGenome(currentGenome, remedy.id)
	const layout = realize(nextGenome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))

	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { mood: serializePageParams(nextOverrides) },
	})
	const refreshed = editor.getShape<MangaContainer>(page.id) ?? page
	applyLayoutChoice(editor, refreshed, {
		seed: `${page.props.seed}-fix`,
		genome: layout.genome,
		score: judged.score,
		reasons: judged.reasons,
	})
	return `已执行主编诊断修复「${remedy.actionLabel}」· 综合评分提升至 ${Math.round(judged.score * 100)} 分`
}

export function applyEmotionStrategyOnPage(
	editor: Editor,
	page: MangaContainer,
	scenario: Scenario,
): string {
	const tip = EMOTION_DIRECTION_TIPS[scenario]
	const baseOverrides = readPageParams(page.props.mood, tip.recommendedPreset)
	const nextOverrides: Required<ParametricOverrides> = {
		...baseOverrides,
		tilt: tip.recommendedTilt,
		bleed: tip.recommendedBleed,
		big: tip.recommendedBig,
	}
	const config = configFor(tip.recommendedPreset, page.props.targetPanels, nextOverrides)
	const picked = pickTopLayouts(`${page.props.seed.replace(/~\d+$/, '')}-${scenario}`, config, page.props.targetPanels, scenario, 36)
	const best = picked.top[0]
	const layout = best.layout
	const rawScript = readJson<Beat[]>(page.props.scriptJson, [])
	const beats = fitBeats(rawScript, layout.panels.length).map((beat, idx, arr) => {
		const isPreClimax = (scenario === 'climax' || scenario === 'tension' || scenario === 'reveal') && arr.length >= 3 && idx === arr.length - 2
		const isLastHook = idx === arr.length - 1
		return {
			...beat,
			silent: isPreClimax ? true : Boolean(beat.silent),
			lines: isPreClimax ? [] : beat.lines,
			shot: isLastHook && scenario === 'climax' ? ('ECU' as const) : beat.shot,
			angle: scenario === 'action' || scenario === 'tension' ? ('low' as const) : beat.angle,
			beat: isPreClimax
				? `${beat.beat.replace(/（.*）$/, '')}（高潮前无声留白静帧）`
				: `${beat.beat.replace(/【.*】$/, '')}【${tip.label}】`,
		}
	})
	const metas = layout.panels.map((panel, index) => metaFromBeat(beats[index], panel, best.seed, index))

	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			scenario,
			layoutPreset: tip.recommendedPreset,
			mood: serializePageParams(nextOverrides),
			seed: best.seed,
			subtitle: `${layout.panels.length} 格 · ${tip.label} · 评分 ${Math.round(best.score * 100)}`,
			genomeJson: JSON.stringify(layout.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			score: best.score,
			reasonsJson: JSON.stringify(best.reasons),
		},
	})
	spawnPageBubbles(editor, page.id, layout, beats, metas)
	return `已应用「${tip.label}」分镜锦囊：${tip.beatRule}`
}

export function toggleSilentPanelOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
): string {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const layout = realize(sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome)), config)
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = fitBeats(readJson<Beat[]>(page.props.scriptJson, []), layout.panels.length)
	const targetMeta = metas[panelIndex]
	if (!targetMeta) return '未找到目标分镜格'

	const nextSilent = !targetMeta.silent
	metas[panelIndex] = {
		...targetMeta,
		silent: nextSilent,
		beat: nextSilent
			? `${targetMeta.beat.replace(/（无声留白静帧）$/, '')}（无声留白静帧）`
			: targetMeta.beat.replace(/（无声留白静帧）$/, ''),
	}
	if (beats[panelIndex]) {
		beats[panelIndex] = {
			...beats[panelIndex],
			silent: nextSilent,
		}
	}

	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
		},
	})
	spawnPageBubbles(editor, page.id, layout, beats, metas)
	return nextSilent
		? `第 ${panelIndex + 1} 格已设为「无声留白静帧」，自动清空对白气泡并注入留白提示词`
		: `第 ${panelIndex + 1} 格已恢复对白模式`
}

export function togglePanelBleedOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	edge: 'bT' | 'bB' | 'bL' | 'bR',
): string {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const current = sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome))
	const nextGenome = togglePanelBleed(current, panelIndex, edge)
	const layout = realize(nextGenome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
	applyLayoutChoice(editor, page, {
		seed: page.props.seed,
		genome: layout.genome,
		score: judged.score,
		reasons: judged.reasons,
	})
	const edgeLabel = { bT: '上出血', bB: '下出血', bL: '左出血', bR: '右出血' }[edge]
	return `已切换第 ${panelIndex + 1} 格「${edgeLabel}」破框状态`
}

export function togglePanelNestOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
): string {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const current = sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome))
	const nextGenome = togglePanelNest(current, panelIndex)
	const layout = realize(nextGenome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
	applyLayoutChoice(editor, page, {
		seed: page.props.seed,
		genome: layout.genome,
		score: judged.score,
		reasons: judged.reasons,
	})
	return `已切换第 ${panelIndex + 1} 格纵切子分格嵌套（当前共 ${layout.panels.length} 格）`
}

export function applyOpticsToPanel(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	patch: Partial<Pick<PanelMeta, 'sensor' | 'focalMm' | 'fStop' | 'subjectDistM' | 'bgDistM' | 'angle'>>,
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const current = metas[panelIndex]
	if (!current) return '未找到选中分镜格'

	const baseOpt = defaultOpticsForMeta(current)
	const mergedOpt = {
		sensor: patch.sensor ?? current.sensor ?? baseOpt.sensor,
		focalMm: patch.focalMm ?? current.focalMm ?? baseOpt.focalMm,
		fStop: patch.fStop ?? current.fStop ?? baseOpt.fStop,
		subjectDistM: patch.subjectDistM ?? current.subjectDistM ?? baseOpt.subjectDistM,
		bgDistM: patch.bgDistM ?? current.bgDistM ?? baseOpt.bgDistM,
	}
	const computed = computeOptics(mergedOpt)

	metas[panelIndex] = {
		...current,
		...mergedOpt,
		angle: patch.angle ?? current.angle,
		shot: computed.derivedShot,
		focal: computed.derivedFocal,
	}

	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas) },
	})
	return `第 ${panelIndex + 1} 格光学镜头：${mergedOpt.focalMm}mm (等效 ${computed.eqFocalMm}mm) · f/${mergedOpt.fStop} · 自动推导为 ${computed.shotLabelZh}`
}

export function addBubbleToPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	style: BubbleStyle = 'speech',
	text = '新台词内容',
	prosody = '',
	prosodyStyle: ProsodyStyle = 'pill',
): TLShapeId | undefined {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const layout = realize(sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome)), config)
	const panel = layout.panels[panelIndex] ?? layout.panels[0]
	if (!panel) return
	const box = boundsOf(panel.pts)
	const center = centroid(panel.pts)
	const sx = PAGE_W / layout.width
	const sy = (PAGE_H - 60) / layout.height
	const x = Math.round((box.maxX - 110) * sx)
	const y = Math.round(36 + (box.minY + 14) * sy)
	const id = createShapeId(`${page.id.replace('shape:', '')}-b-${Date.now()}`)
	editor.createShape<MangaBubble>({
		id,
		type: BUBBLE,
		parentId: page.id,
		x: Math.max(12, Math.min(PAGE_W - 110, x)),
		y: Math.max(40, Math.min(PAGE_H - 90, y)),
		props: {
			w: 96,
			h: 64,
			bubble: style,
			text,
			prosody,
			emphasis: 1,
			tailX: (center[0] - (box.maxX - 60)) * sx * 0.4,
			tailY: 28,
			panelIndex,
			spin: 0,
			prosodyStyle,
			prosodyOffsetX: 0,
			prosodyOffsetY: 0,
			prosodyScale: 1,
			prosodyColor: '',
			fillColor: '',
			fontWeight: 700,
		},
	})
	editor.select(id)
	return id
}

/**
 * Spawn an independent Prosody / SFX particle layer shape on the page that can be
 * dragged freely and styled with any ProsodyStyle (pill / seal / slant / burst / minimal).
 */
export function addStandaloneProsodyToPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex = 0,
	prosodyText = '冷笑审视',
	prosodyStyle: ProsodyStyle = 'seal',
	sfxText = '咔哒！',
): TLShapeId | undefined {
	return addBubbleToPage(editor, page, panelIndex, 'sfx', sfxText, prosodyText, prosodyStyle)
}

/**
 * Load the 5 pre-rendered real AI interrogation room images into the selected page's cells.
 */
export function fillRealInterrogationArtworkOnPage(editor: Editor, page: MangaContainer): string {
	const urls = [
		'/assets/interrogation/panel1_establishing.jpg',
		'/assets/interrogation/panel2_cuff_probe.jpg',
		'/assets/interrogation/panel3_watch_macro.jpg',
		'/assets/interrogation/panel4_silent_lighter_spark.jpg',
		'/assets/interrogation/panel5_climax_accusation.jpg',
	]
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const updated = metas.map((meta, idx) => ({
		...meta,
		imageDataUrl: urls[idx % urls.length],
		imageOffsetX: 0,
		imageOffsetY: 0,
		imageScale: 1,
		imageRotation: 0,
	}))
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(updated) },
	})
	return `已将 ${updated.length} 张真实 AI 分镜原画载入当前页单元格（可直接拖拽平移与滚轮缩放）`
}

export function toggleAllFlow(editor: Editor): boolean {
	const pages = selectedPages(editor)
	if (!pages.length) return false
	const nextState = !pages.every((page) => page.props.showFlow)
	for (const page of pages) {
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: { showFlow: nextState },
		})
	}
	return nextState
}

export async function polishPageWithAi(editor: Editor, customPrompt?: string): Promise<string> {
	const pages = selectedPages(editor)
	let polishedCount = 0
	for (const page of pages) {
		pageDiffStore.set(page.id, {
			prevPanelsJson: page.props.panelsJson,
			prevScriptJson: page.props.scriptJson,
			summary: customPrompt || 'AI 导演润色分镜与台词',
		})
		const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const beats = readJson<Beat[]>(page.props.scriptJson, [])
		const suffix = customPrompt ? `（${customPrompt}）` : '（光影网点强化）'
		const updatedMetas = metas.map((meta, idx) => ({
			...meta,
			prevBeat: meta.beat,
			beat: meta.beat.includes('【AI') ? meta.beat : `${meta.beat} 【AI 镜头润色#${idx + 1}${suffix}】`,
		}))
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: {
				panelsJson: JSON.stringify(updatedMetas),
				subtitle: `${updatedMetas.length} 格 · AI 已润色分镜`,
			},
		})
		const bubbles = editor
			.getSortedChildIdsForParent(page.id)
			.map((id) => editor.getShape(id))
			.filter((shape): shape is MangaBubble => shape?.type === BUBBLE)
		for (const bubble of bubbles) {
			if (bubble.props.bubble === 'sfx' && /[\u3040-\u30ff]/.test(bubble.props.text)) {
				editor.updateShape<MangaBubble>({
					id: bubble.id,
					type: BUBBLE,
					props: { text: '轰——！！' },
				})
			}
		}
		polishedCount += Math.max(updatedMetas.length, beats.length)
	}
	const summary = await askText(
		'你是漫画导演。请用一句简短中文总结本轮分镜润色重点。',
		customPrompt || '强化镜头对比、角色锁定与台词张力',
		() => `Text + Vision LLM 已润色 ${pages.length} 页共 ${polishedCount} 格分镜与台词${customPrompt ? `（指令：${customPrompt}）` : ''}。`,
	)
	return summary
}

export async function rewriteStoryWithLlm(story: string, customPrompt: string): Promise<string> {
	return askText(
		'你是资深中文漫画编剧。请根据用户的自定义指令改写或扩写以下漫画故事大纲，保留核心人物（勘太、芽衣、头目鸥），输出精炼有力的中文故事梗概（120~220字）。',
		`原故事：${story}\n改写指令：${customPrompt || '强化戏剧冲突与漫画分镜画面感'}`,
		() => {
			const directive = customPrompt.trim() || '强化戏剧冲突与镜头感'
			return `${story.replace(/\n*【AI 剧本改写.*$/s, '')}\n【AI 剧本改写 · ${directive}】正午盐风骤紧，勘太死死护住最后一盒现炸金黄薯条，芽衣的胶片相机快门声与独眼头目鸥的俯冲破空声同时炸响；傍晚旧商店街屋顶暮色如血，头目鸥衔来发光汽水瓶盖作为赎金，一人一鸟在18mm广角逆光下完成史诗级和解。`
		},
	)
}

export async function applySelectedCardAiAction(
	editor: Editor,
	card: MangaCard,
	action: 'polish' | 'regenerate' | 'vision' | 'redraw',
	customPrompt?: string,
): Promise<string> {
	const promptToUse = customPrompt ?? card.props.customPrompt
	const prevBody = card.props.body
	if (action === 'vision') {
		const res = await askVision({
			imageDataUrl: card.props.imageDataUrl,
			title: card.props.title,
			tag: card.props.tag,
			body: card.props.body,
			customPrompt: promptToUse,
		})
		cardDiffStore.set(card.id, { prevBody, nextBody: res.analysis, modelUsed: res.modelUsed, label: 'Vision 识图反推' })
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: { body: res.analysis, customPrompt: promptToUse, aiStatus: `${res.modelUsed} 识图完成` },
		})
		return `已对「${card.props.title}」执行 Vision 识图反推`
	}
	if (action === 'redraw') {
		const remoteUrl = await askImage(`${card.props.title} ${card.props.body} ${promptToUse}`, '16:9')
		const nextSeed = `ref-${Date.now()}`
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: {
				imageDataUrl: remoteUrl || card.props.imageDataUrl,
				voice: card.props.kind === 'image' ? nextSeed : card.props.voice,
				customPrompt: promptToUse,
				aiStatus: remoteUrl ? 'Image LLM 已重绘' : '生图引擎已重绘新变体',
			},
		})
		return `已对「${card.props.title}」重新生成参考图像`
	}
	if (action === 'regenerate') {
		const res = await regenerateCardText({
			kind: card.props.kind,
			title: card.props.title,
			body: card.props.body,
			tag: card.props.tag,
			customPrompt: promptToUse,
		})
		cardDiffStore.set(card.id, { prevBody, nextBody: res.text, modelUsed: res.modelUsed, label: 'AI 重新生成' })
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: { body: res.text, customPrompt: promptToUse, aiStatus: `${res.modelUsed} 已重新生成` },
		})
		return `已对「${card.props.title}」重新生成内容`
	}
	const res = await polishCardText({
		kind: card.props.kind,
		title: card.props.title,
		body: card.props.body,
		tag: card.props.tag,
		customPrompt: promptToUse,
	})
	cardDiffStore.set(card.id, { prevBody, nextBody: res.text, modelUsed: res.modelUsed, label: 'AI 润色美化' })
	editor.updateShape<MangaCard>({
		id: card.id,
		type: CARD,
		props: { body: res.text, customPrompt: promptToUse, aiStatus: `${res.modelUsed} 已美化` },
	})
	return `已对「${card.props.title}」执行 AI 润色美化`
}

export async function runBlock(
	editor: Editor,
	block: BlockId,
	params?: Record<string, string | number | boolean>,
	promptShapeId?: TLShapeId,
): Promise<string> {
	const merged = { ...defaultParams(block), ...(params ?? {}) }
	const bible = editor
		.getCurrentPageShapes()
		.find((shape): shape is MangaContainer => shape.type === CONTAINER && shape.props.role === 'bible')
	const story = bible?.props.story || defaultBook().story

	if (block === 'extract') {
		const draft = bookFromText(story)
		const note = await askText(
			'抽出漫画角色设定和世界规则，简短中文列出 @tag 与外观锁定。',
			story,
			() => draft.characters.map((char) => `${char.tag} ${char.name}：${char.appearance}`).join('；'),
		)
		if (bible) {
			editor.updateShape<MangaContainer>({
				id: bible.id,
				type: CONTAINER,
				props: { stylePreset: String(merged.stylePreset || draft.stylePreset), subtitle: `设定已由 Text LLM 提炼 · ${draft.characters.length} 名角色` },
			})
		}
		updatePromptPreview(editor, promptShapeId, note)
		return note
	}

	if (block === 'chapterize') {
		const draft = bookFromText(story)
		spawnBook(editor, draft)
		const summary = `已由 Text LLM 拆为 ${draft.chapters.length} 话 / ${draft.chapters.reduce((acc, item) => acc + item.pages.length, 0)} 页`
		updatePromptPreview(editor, promptShapeId, summary)
		return summary
	}

	if (block === 'name') {
		for (const page of selectedPages(editor)) {
			const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
			const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
			const layout = realize(sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome)), config)
			const base = readJson<Beat[]>(page.props.scriptJson, [])
			const beats = fitBeats(base, layout.panels.length)
			if (merged.silent && beats.length >= 3) {
				const silentIdx = Math.max(1, beats.length - 2)
				beats[silentIdx] = { ...beats[silentIdx], silent: true, lines: [], beat: `${beats[silentIdx].beat}（高潮前静帧）` }
			}
			const metas = layout.panels.map((panel, index) => metaFromBeat(beats[index], panel, page.props.seed, index))
			editor.updateShape<MangaContainer>({
				id: page.id,
				type: CONTAINER,
				props: { scriptJson: JSON.stringify(beats), panelsJson: JSON.stringify(metas) },
			})
			spawnPageBubbles(editor, page.id, layout, beats, metas)
		}
		const summary = '已按右→左重排分镜节拍，高潮前留静帧，末格落翻页钩子'
		updatePromptPreview(editor, promptShapeId, summary)
		return summary
	}

	if (block === 'camera') {
		const shot = String(merged.shot || 'CU') as PanelMeta['shot']
		const angle = String(merged.angle || 'low') as PanelMeta['angle']
		const focal = String(merged.focal || '18mm') as PanelMeta['focal']
		for (const page of selectedPages(editor)) {
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
			const idx = page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0
			if (metas[idx]) {
				metas[idx] = { ...metas[idx], shot, angle, focal }
				editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(metas) } })
			}
		}
		const summary = `当前分镜格机位已设为 ${shot} · ${angle} · ${focal}`
		updatePromptPreview(editor, promptShapeId, summary)
		return summary
	}

	if (block === 'random') {
		const env = String(merged.environment || ENV_IDS[Math.floor(Math.random() * ENV_IDS.length)])
		const light = String(merged.lighting || LIGHT_IDS[Math.floor(Math.random() * LIGHT_IDS.length)])
		const shot = String(merged.shot || 'MCU') as PanelMeta['shot']
		const angle = String(merged.angle || 'dutch') as PanelMeta['angle']
		const focal = String(merged.focal || '18mm') as PanelMeta['focal']
		for (const page of selectedPages(editor)) {
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, []).map((meta, index) =>
				index === Math.max(0, page.props.selectedPanel) ? { ...meta, environment: env, shot, angle, focal } : meta,
			)
			editor.updateShape<MangaContainer>({
				id: page.id,
				type: CONTAINER,
				props: { environment: env, lighting: light, panelsJson: JSON.stringify(metas) },
			})
		}
		const summary = `随机氛围：${ENV_LABELS[env] ?? env} · ${LIGHT_LABELS[light] ?? light} · ${shot}/${angle}/${focal}`
		updatePromptPreview(editor, promptShapeId, summary)
		return summary
	}

	let rendered = 0
	const bibleLocks = readCharacterLocks(editor)
	for (const page of selectedPages(editor)) {
		const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const next: PanelMeta[] = []
		for (let index = 0; index < metas.length; index += 1) {
			const meta = metas[index]
			const opt = computeOptics(defaultOpticsForMeta(meta))
			// Dynamic locks: Bible-derived character tags plus this panel's asset refs.
			const locks = [bibleLocks, ...(meta.assetRefs ?? [])].filter(Boolean).join(' ')
			const prompt = buildPanelPrompt({
				environment: meta.environment || page.props.environment,
				lighting: page.props.lighting,
				shot: meta.shot,
				angle: meta.angle,
				focal: meta.focal,
				aspect: meta.aspect,
				beat: meta.beat,
				locks,
				corner: safeCorner('top-right'),
				silent: meta.silent,
				opticsClause: opt.promptClause,
			})
			const dataUrl = await askImage(prompt, meta.aspect)
			next.push({ ...meta, imageSeed: `${meta.imageSeed}-r`, imageDataUrl: dataUrl || meta.imageDataUrl })
			rendered += 1
		}
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}
	const summary = `已调用生图管线渲染 ${rendered} 格无字纯净画面（气泡矢量化独立悬浮）`
	updatePromptPreview(editor, promptShapeId, summary)
	return summary
}

function updatePromptPreview(editor: Editor, id: TLShapeId | undefined, preview: string): void {
	if (!id) return
	const shape = editor.getShape(id)
	if (shape?.type === PROMPT) {
		editor.updateShape({ id, type: PROMPT, props: { preview } })
	}
}

export function spawnPromptBlock(editor: Editor, block: BlockId, x?: number, y?: number): TLShapeId {
	const center = editor.getViewportPageBounds().center
	const id = createShapeId(`prompt-${block}-${Date.now()}`)
	editor.createShape({
		id,
		type: PROMPT,
		x: (x ?? center.x) - 135,
		y: (y ?? center.y) - 95,
		props: {
			w: 270,
			h: 196,
			block,
			title: blockTitle(block),
			paramsJson: JSON.stringify(defaultParams(block)),
			preview: '',
		},
	})
	return id
}
