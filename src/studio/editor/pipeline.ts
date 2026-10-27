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
	type PagePipelineContext,
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
	const noir = universalPresetToBook("noir-watchmaker")
	spawnBook(editor, noir ?? defaultBook())
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

	const isNoirBook = book.stylePreset === 'seinen_noir' || book.title.includes('审讯')
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
			title: isNoirBook ? '关键证物：裂纹银壳怀表 (23:17)' : '第一话参考图：防波堤正午逆光',
			tag: isNoirBook ? '#prop_pocket_watch' : '@boardwalk',
			body: isNoirBook
				? '死者遗留的裂纹银壳怀表，蓝钢指针死死卡在 23:17，表盖内侧留有左撇子反手调表的反向刮痕与暗格底片。'
				: '正午硬光下的海岸防波堤，18mm 广角透视，海鸥俯冲速度线与红白薯条盒形成视觉焦点。',
			voice: 'ref-boardwalk-1',
			locked: true,
			imageDataUrl: isNoirBook ? '/assets/interrogation/asset_prop_pocket_watch.jpg' : '',
			customPrompt: isNoirBook ? '微距银质裂纹与23:17指针反光' : '强化海面反光网点与俯冲张力',
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
			title: isNoirBook ? '场景拓扑：旧港警署三楼审讯室' : '第二话参考图：夕照屋顶剪影',
			tag: isNoirBook ? '#env_interrogation_room' : '@rooftop',
			body: isNoirBook
				? '暴雨冲刷百叶窗、摇晃单盏吊灯、冰冷不锈钢审讯桌与单向玻璃观察窗，严格遵守180°审讯轴线。'
				: '旧商店街屋顶铁丝网与水塔长影，暮色逆光勾勒一人一鸥对峙轮廓，保留右上角对白留白区。',
			voice: 'ref-rooftop-1',
			locked: true,
			imageDataUrl: isNoirBook ? '/assets/interrogation/asset_env_interrogation_room.jpg' : '',
			customPrompt: isNoirBook ? '百叶窗雨夜条纹投影与伦勃朗侧逆光' : '增加黄昏渐变网点与胶片颗粒感',
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
	const initialTags = Array.from(
		new Set(
			beats.flatMap((b) => [...(b.who ?? []), ...(b.assetRefs ?? [])]).filter(Boolean),
		),
	)
	const lastBeat = beats[beats.length - 1]
	const lastMeta = metas[metas.length - 1]
	const initialCtx: PagePipelineContext = {
		inheritedFromPageIndex: info.pageIndex > 1 ? info.pageIndex - 1 : undefined,
		stylePreset: info.stylePreset,
		environment: info.environment,
		lighting: info.lighting,
		worldRules: info.stylePreset === 'seinen_noir'
			? '浦泽直树式硬派青年漫黑白灰蓝冷调 + 伦勃朗 50% 半脸明暗分割 + 百叶窗雨夜条纹投影 + 180°审讯轴线连贯'
			: 'G笔主线 + 60L灰网点 + 右上角对白留白安全区',
		lockedAssetTags: initialTags.length ? initialTags : ['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch', '#env_interrogation_room'],
		prevPageSummary: info.pageIndex === 1
			? '开篇起始页（P1）：由全局故事母容器与锁定角色/道具资产卡直接注入初始上下文。'
			: `承接第 ${info.pageIndex - 1} 页分镜叙事与镜头轴线。`,
		prevExitShot: lastMeta?.shot ?? lastBeat?.shot ?? 'CU',
		prevExitAngle: lastMeta?.angle ?? lastBeat?.angle ?? 'eye',
		prevExitEyeline: (lastMeta?.eyeline ?? lastBeat?.eyeline ?? [-22, 2]) as [number, number],
		prevExitTension: Number((lastBeat?.tension ?? 0.85).toFixed(2)),
		pageDirective: `${info.title}：围绕 ${draft.scenario} 情绪推进分镜节拍，末格制造翻页悬念钩子。`,
	}
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
			story: formatBeatsToScriptText(beats),
			worldRules: initialCtx.worldRules,
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
			contextJson: JSON.stringify(initialCtx),
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

/* ==========================================================================
   PAGE-AS-PRODUCTION-UNIT PIPELINE & CONTEXT INHERITANCE (P1 -> P2 -> P3)
   ========================================================================== */

export function formatBeatsToScriptText(beats: Beat[]): string {
	return beats
		.map((b, idx) => {
			const header = `${idx + 1}. [${b.shot}/${b.angle}/${b.focal}]`
			const lineStr = (b.lines ?? [])
				.map((l) => `${l.type === 'sfx' ? '⚡' : l.type === 'caption' ? '📝' : '💬'}「${l.text}」${l.prosody ? `(${l.prosody})` : ''}`)
				.join(' ')
			return `${header} ${b.beat}${lineStr ? ` — ${lineStr}` : ''}`
		})
		.join('\n')
}

export function parseScriptTextToBeats(
	scriptText: string,
	inheritedTags: string[],
	prevExitEyeline: [number, number],
	fallbackBeats: Beat[] = [],
): Beat[] {
	const rawLines = scriptText
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
	if (!rawLines.length) return fallbackBeats

	const charTags = inheritedTags.filter((t) => t.startsWith('@'))
	const allTags = inheritedTags.length ? inheritedTags : ['@lu_chen', '@lin_ye', '#prop_pocket_watch']

	return rawLines.map((line, idx) => {
		const fallback = fallbackBeats[idx]
		const clean = line.replace(/^\d+\.\s*/, '')
		const bracketMatch = clean.match(/^\[([A-Z]+)(?:\/([a-z]+))?(?:\/(\d+mm))?\]\s*(.*)$/i)
		const shot = (bracketMatch?.[1]?.toUpperCase() || fallback?.shot || (idx === 0 ? 'WS' : idx === rawLines.length - 1 ? 'CU' : 'MS')) as Beat['shot']
		const angle = (bracketMatch?.[2]?.toLowerCase() || fallback?.angle || (idx === rawLines.length - 1 ? 'low' : 'eye')) as Beat['angle']
		const focal = (bracketMatch?.[3] || fallback?.focal || (shot === 'WS' || shot === 'EWS' ? '18mm' : shot === 'CU' || shot === 'ECU' ? '85mm' : '50mm')) as Beat['focal']
		const rest = bracketMatch ? bracketMatch[4] : clean

		const [actionPart, dialoguePart] = rest.split(/\s*—\s*/)
		const quotedMatches = [...(dialoguePart || rest).matchAll(/[「“"]([^」”"]+)[」”"](?:\(([^)]+)\))?/g)]
		const isSilent = /无声|静帧|silent/i.test(actionPart) && quotedMatches.length === 0

		const parsedLines: Beat['lines'] = isSilent
			? []
			: quotedMatches.length > 0
				? quotedMatches.map((m, mIdx) => {
						const prefixChar = (dialoguePart || rest).slice(0, m.index ?? 0)
						const isSfx = prefixChar.endsWith('⚡') || /^(咔|砰|轰|哗|叮|啪)/.test(m[1])
						const isCaption = prefixChar.endsWith('📝') || (idx === 0 && mIdx === 0 && m[1].includes('：'))
						return {
							type: isSfx ? 'sfx' : isCaption ? 'caption' : m[1].endsWith('？！') || m[1].endsWith('！！') ? 'shout' : 'speech',
							text: m[1],
							prosody: m[2] || fallback?.lines?.[mIdx]?.prosody,
							placement: mIdx === 0 ? 'top-right' : 'bottom-left',
						}
					})
				: fallback?.lines ?? []

		const sign = prevExitEyeline[0] >= 0 ? 1 : -1
		const defaultEyeline: [number, number] =
			idx === 0
				? [sign * Math.max(16, Math.abs(prevExitEyeline[0])), prevExitEyeline[1]]
				: idx % 2 === 1
					? [sign * 20, 2]
					: [sign * 18, -2]

		return {
			shot,
			angle,
			focal,
			focalMm: shot === 'WS' || shot === 'EWS' ? 24 : shot === 'CU' || shot === 'ECU' ? 85 : 50,
			fStop: shot === 'CU' || shot === 'ECU' ? 1.8 : 2.8,
			beat: actionPart.trim() || fallback?.beat || `P-0${idx + 1} · 分镜动作节拍`,
			who: fallback?.who?.length ? fallback.who : charTags.slice(0, 2),
			assetRefs: Array.from(new Set([...(fallback?.assetRefs ?? []), ...allTags])),
			imageDataUrl: fallback?.imageDataUrl,
			mccloudTransition: idx === 0 ? 'scene_to_scene' : isSilent ? 'aspect_to_aspect' : idx === rawLines.length - 1 ? 'action_to_action' : 'subject_to_subject',
			wordPictureMode: isSilent ? 'picture_specific' : parsedLines.length ? 'interdependent' : 'duo_specific',
			tension: fallback?.tension ?? Number(Math.min(0.96, 0.48 + idx * 0.12).toFixed(2)),
			silent: isSilent,
			eyeline: fallback?.eyeline ?? defaultEyeline,
			focalPointRel: fallback?.focalPointRel ?? [0.5, 0.45],
			subsplitInset: fallback?.subsplitInset,
			lines: parsedLines,
		}
	})
}

export function readPageContext(editor: Editor | null, page: MangaContainer): PagePipelineContext {
	const parsed = readJson<Partial<PagePipelineContext>>(page.props.contextJson || '{}', {})
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	const lastMeta = metas[metas.length - 1]
	const lastBeat = beats[beats.length - 1]

	const canvasLockedTags: string[] = []
	let bibleWorld = page.props.worldRules || ''
	if (editor) {
		for (const shape of editor.getCurrentPageShapes()) {
			if (shape.type === CARD && shape.props.locked && shape.props.tag) {
				canvasLockedTags.push(shape.props.tag)
			}
			if (shape.type === CONTAINER && shape.props.role === 'bible' && shape.props.worldRules && !bibleWorld) {
				bibleWorld = shape.props.worldRules
			}
		}
	}

	const panelTags = [
		...beats.flatMap((b) => [...(b.who ?? []), ...(b.assetRefs ?? [])]),
		...metas.flatMap((m) => [...(m.who ?? []), ...(m.assetRefs ?? [])]),
	].filter(Boolean)

	const mergedTags = Array.from(
		new Set([
			...(parsed.lockedAssetTags ?? []),
			...canvasLockedTags,
			...panelTags,
		]),
	)

	return {
		parentPageId: parsed.parentPageId,
		parentPageTitle: parsed.parentPageTitle,
		inheritedFromPageIndex: parsed.inheritedFromPageIndex,
		stylePreset: parsed.stylePreset || page.props.stylePreset || 'seinen_noir',
		environment: parsed.environment || page.props.environment || 'interrogation-room',
		lighting: parsed.lighting || page.props.lighting || 'rim',
		worldRules:
			parsed.worldRules ||
			bibleWorld ||
			'浦泽直树式硬派青年漫黑白灰蓝冷调 + 伦勃朗 50% 半脸明暗分割 + 180°审讯轴线连贯',
		lockedAssetTags: mergedTags.length
			? mergedTags
			: ['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch', '#env_interrogation_room'],
		prevPageSummary:
			parsed.prevPageSummary ||
			(page.props.pageIndex <= 1
				? '开篇起始页（P1）：由全局故事设定母容器与锁定角色/道具卡直接注入初始上下文。'
				: `承接 P${page.props.pageIndex - 1} 的镜头轴线、人物锁定与悬念钩子。`),
		prevExitShot: parsed.prevExitShot || lastMeta?.shot || lastBeat?.shot || 'CU',
		prevExitAngle: parsed.prevExitAngle || lastMeta?.angle || lastBeat?.angle || 'eye',
		prevExitEyeline: (parsed.prevExitEyeline || lastMeta?.eyeline || lastBeat?.eyeline || [-24, 2]) as [number, number],
		prevExitTension: parsed.prevExitTension ?? Number((lastBeat?.tension ?? 0.85).toFixed(2)),
		pageDirective:
			parsed.pageDirective ||
			`${page.props.title}：围绕 ${page.props.scenario || 'tension'} 情绪推进分镜叙事，保持跨页人物外观与 180° 视线轴连贯。`,
	}
}

/**
 * Extract the outgoing PagePipelineContext from a source page (`P(n)`) so it can be
 * passed down the pipeline into the next page (`P(n+1)`).
 */
export function extractPageOutgoingContext(editor: Editor | null, page: MangaContainer): PagePipelineContext {
	const currentCtx = readPageContext(editor, page)
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	const lastMeta = metas[metas.length - 1]
	const lastBeat = beats[beats.length - 1]

	const exitShot = lastMeta?.shot || lastBeat?.shot || currentCtx.prevExitShot || 'CU'
	const exitAngle = lastMeta?.angle || lastBeat?.angle || currentCtx.prevExitAngle || 'eye'
	const exitEyeline = (lastMeta?.eyeline || lastBeat?.eyeline || currentCtx.prevExitEyeline || [-26, 2]) as [number, number]
	const exitTension = Number((lastBeat?.tension ?? currentCtx.prevExitTension ?? 0.88).toFixed(2))

	const firstBeatSummary = (beats[0]?.beat || metas[0]?.beat || '开场镜头建立空间').replace(/^P\d+-\d+\s*·\s*/, '')
	const lastBeatSummary = (lastBeat?.beat || lastMeta?.beat || '末格抛出悬念钩子').replace(/^P\d+-\d+\s*·\s*/, '')
	const keySpoken = beats
		.flatMap((b) => b.lines ?? [])
		.filter((l) => l.type !== 'sfx')
		.slice(-2)
		.map((l) => `「${l.text}」`)
		.join(' ')

	const summary = `承接 ${page.props.title}（${beats.length || metas.length} 格）：由「${firstBeatSummary.slice(0, 28)}」推进至尾格「${lastBeatSummary.slice(0, 32)}」${keySpoken ? ` ${keySpoken}` : ''}（末格定格 ${exitShot}/${exitAngle} · 张力 ${Math.round(exitTension * 100)}%）。`

	return {
		parentPageId: page.id,
		parentPageTitle: page.props.title,
		inheritedFromPageIndex: page.props.pageIndex || 1,
		stylePreset: page.props.stylePreset || currentCtx.stylePreset,
		environment: page.props.environment || currentCtx.environment,
		lighting: page.props.lighting || currentCtx.lighting,
		worldRules: page.props.worldRules || currentCtx.worldRules,
		lockedAssetTags: currentCtx.lockedAssetTags,
		prevPageSummary: summary,
		prevExitShot: exitShot,
		prevExitAngle: exitAngle,
		prevExitEyeline: exitEyeline,
		prevExitTension: exitTension,
		pageDirective: `承接 ${page.props.title} 尾格（${exitShot}/${exitAngle}，张力 ${Math.round(exitTension * 100)}%），延续 180° 视线轴（${exitEyeline[0]}, ${exitEyeline[1]}）与锁定资产展开第 ${(page.props.pageIndex || 1) + 1} 页交锋。`,
	}
}

interface ContinuationPageTemplate {
	titleSuffix: string
	scenario: Scenario
	layoutPreset: string
	environment?: string
	lighting?: string
	directive: string
	beats: Beat[]
}

function buildContinuationTemplate(
	sourcePage: MangaContainer,
	nextPageIndex: number,
	outgoing: PagePipelineContext,
): ContinuationPageTemplate {
	const isNoir =
		outgoing.stylePreset === 'seinen_noir' ||
		outgoing.lockedAssetTags.some((t) => t === '@lu_chen' || t === '#prop_pocket_watch') ||
		sourcePage.props.title.includes('审讯')
	const isSeagull =
		outgoing.lockedAssetTags.some((t) => t.includes('gull') || t === '@kanta') ||
		sourcePage.props.stylePreset === 'shonen_water' ||
		sourcePage.props.title.includes('海鸥')

	const eyeSign = outgoing.prevExitEyeline[0] >= 0 ? 1 : -1

	if (isNoir) {
		if (nextPageIndex === 2) {
			return {
				titleSuffix: '暗格底片与走廊脚步',
				scenario: 'reveal',
				layoutPreset: 'kin',
				environment: outgoing.environment || 'interrogation-room',
				lighting: outgoing.lighting || 'rim',
				directive: '承接 P1 陆沉当庭指认单向玻璃后的沈默副局长，廊灯骤灭，怀表暗格底片揭晓，门外逼近灭口脚步。',
				beats: [
					{
						shot: 'WS',
						angle: 'dutch',
						focal: '18mm',
						focalMm: 24,
						fStop: 4.0,
						imageDataUrl: '/assets/interrogation/panel1_establishing.jpg',
						beat: 'P02-01 · 观察窗后的廊灯骤然熄灭！窗外闪电将审讯室劈成惨白与深黑，林野猛地从椅上撑身弹起。',
						who: ['@lu_chen', '@lin_ye'],
						assetRefs: ['#env_interrogation_room', '@lu_chen', '@lin_ye'],
						mccloudTransition: 'action_to_action',
						wordPictureMode: 'interdependent',
						tension: 0.78,
						eyeline: [eyeSign * 22, 2],
						focalPointRel: [0.46, 0.42],
						lines: [
							{ type: 'caption', text: '23:18，观察窗后的打火机火苗掐灭了。', placement: 'top-right' },
							{ type: 'speech', text: '他拉断了三楼电闸……要把我们一起灭口！', prosody: '惊骇急促', placement: 'bottom-left' },
						],
					},
					{
						shot: 'ECU',
						angle: 'high',
						focal: '85mm',
						focalMm: 85,
						fStop: 2.0,
						imageDataUrl: '/assets/interrogation/panel3_watch_macro.jpg',
						beat: 'P02-02 · 陆沉一把按住桌上的裂纹银壳怀表，拇指顺着反向刮痕撬开表盖夹层——露出一卷微缩胶片。',
						who: ['@lu_chen'],
						assetRefs: ['#prop_pocket_watch', '@lu_chen'],
						mccloudTransition: 'subject_to_subject',
						wordPictureMode: 'duo_specific',
						tension: 0.84,
						eyeline: [eyeSign * 18, 6],
						focalPointRel: [0.5, 0.48],
						lines: [
							{ type: 'sfx', text: '咔哒！', placement: 'top-left' },
							{ type: 'speech', text: '23:17 停摆不是摔坏，是为了锁死这枚暗格齿轮。', prosody: '冷峻洞察', placement: 'top-right' },
						],
					},
					{
						shot: 'MCU',
						angle: 'eye',
						focal: '50mm',
						focalMm: 50,
						fStop: 2.8,
						imageDataUrl: '/assets/interrogation/panel2_cuff_probe.jpg',
						beat: 'P02-03 · 林野扯开沾着红丹防锈漆的右袖口，声音压得极低，指向单向玻璃后的证物暗道。',
						who: ['@lin_ye', '@lu_chen'],
						assetRefs: ['@lin_ye', '#prop_rust_cuff', '#env_interrogation_room'],
						mccloudTransition: 'subject_to_subject',
						wordPictureMode: 'word_specific',
						tension: 0.81,
						eyeline: [eyeSign * 20, -2],
						focalPointRel: [0.54, 0.44],
						lines: [
							{ type: 'whisper', text: '旧码头三号仓的走私底片就在表芯里……走廊脚步声上来了！', prosody: '压低喘息', placement: 'top-right' },
						],
					},
					{
						shot: 'CU',
						angle: 'low',
						focal: '85mm',
						focalMm: 85,
						fStop: 1.4,
						imageDataUrl: '/assets/interrogation/panel4_silent_lighter_spark.jpg',
						beat: 'P02-04 · 无声静帧：审讯室金属门把手缓缓下压，门缝积水倒映出左撇子铜打火机的冷光。',
						who: ['@shen_mo'],
						assetRefs: ['@shen_mo', '#prop_brass_lighter'],
						mccloudTransition: 'aspect_to_aspect',
						wordPictureMode: 'picture_specific',
						tension: 0.9,
						silent: true,
						eyeline: [eyeSign * 14, 0],
						focalPointRel: [0.52, 0.46],
						lines: [],
					},
					{
						shot: 'MS',
						angle: 'low',
						focal: '35mm',
						focalMm: 35,
						fStop: 2.0,
						imageDataUrl: '/assets/interrogation/panel5_climax_accusation.jpg',
						beat: 'P02-05 · 陆沉将怀表底片塞进风衣内袋，拔枪横挡在林野身前，目光直刺推门而入的沈默副局长！',
						who: ['@lu_chen', '@shen_mo'],
						assetRefs: ['@lu_chen', '@shen_mo', '#prop_pocket_watch', '#env_interrogation_room'],
						mccloudTransition: 'action_to_action',
						wordPictureMode: 'duo_specific',
						tension: 0.96,
						eyeline: [eyeSign * 26, -3],
						focalPointRel: [0.44, 0.38],
						subsplitInset: {
							enabled: true,
							targetTag: '@shen_mo',
							rectRel: [0.62, 0.06, 0.96, 0.42],
							shot: 'ECU',
							caption: '门口冷笑的沈默',
						},
						lines: [
							{ type: 'sfx', text: '砰——！！', placement: 'top-left' },
							{ type: 'shout', text: '沈副局长，深更半夜亲自来取这块怀表吗？！', prosody: '雷霆喝问', placement: 'top-right' },
						],
					},
				],
			}
		}

		// P3 and beyond for Noir Interrogation
		return {
			titleSuffix: nextPageIndex === 3 ? '旧港天台雨幕对决' : `第 ${nextPageIndex} 幕·雷霆收网`,
			scenario: 'climax',
			layoutPreset: 'kin',
			environment: 'rooftop',
			lighting: 'rim',
			directive: `承接 P${nextPageIndex - 1} 正面交锋，陆沉与林野退上旧港警署暴雨天台，在探照灯逆光下用怀表微缩底片完成终极定罪。`,
			beats: [
				{
					shot: 'EWS',
					angle: 'high',
					focal: '18mm',
					focalMm: 24,
					fStop: 4.0,
					imageDataUrl: '/assets/interrogation/panel1_establishing.jpg',
					beat: `P0${nextPageIndex}-01 · 狂风暴雨席卷警署四楼天台，远处旧港三号仓探照灯划破夜幕，陆沉与沈默隔着积水对峙。`,
					who: ['@lu_chen', '@shen_mo'],
					assetRefs: ['@lu_chen', '@shen_mo', '#env_interrogation_room'],
					mccloudTransition: 'scene_to_scene',
					wordPictureMode: 'additive',
					tension: 0.82,
					eyeline: [eyeSign * 24, 4],
					focalPointRel: [0.5, 0.45],
					lines: [
						{ type: 'caption', text: '23:25 · 旧港警署天台，暴雨如注。', placement: 'top-right' },
					],
				},
				{
					shot: 'MCU',
					angle: 'eye',
					focal: '50mm',
					focalMm: 50,
					fStop: 2.2,
					imageDataUrl: '/assets/interrogation/panel4_silent_lighter_spark.jpg',
					beat: `P0${nextPageIndex}-02 · 沈默在雨中左手反握铜打火机，冷笑着逼近一步，试图索要怀表底片。`,
					who: ['@shen_mo'],
					assetRefs: ['@shen_mo', '#prop_brass_lighter'],
					mccloudTransition: 'subject_to_subject',
					wordPictureMode: 'interdependent',
					tension: 0.86,
					eyeline: [eyeSign * 20, 2],
					focalPointRel: [0.52, 0.44],
					lines: [
						{ type: 'speech', text: '陆沉，把 23:17 的底片交出来，这案子今晚就能结。', prosody: '阴鸷威逼', placement: 'top-right' },
					],
				},
				{
					shot: 'ECU',
					angle: 'low',
					focal: '85mm',
					focalMm: 85,
					fStop: 1.8,
					imageDataUrl: '/assets/interrogation/panel3_watch_macro.jpg',
					beat: `P0${nextPageIndex}-03 · 无声静帧：雨水顺着裂纹银壳怀表滑落，蓝钢指针与内盖反向刮痕在闪电下清晰无比。`,
					who: [],
					assetRefs: ['#prop_pocket_watch'],
					mccloudTransition: 'aspect_to_aspect',
					wordPictureMode: 'picture_specific',
					tension: 0.91,
					silent: true,
					eyeline: [eyeSign * 16, 0],
					focalPointRel: [0.5, 0.5],
					lines: [],
				},
				{
					shot: 'CU',
					angle: 'low',
					focal: '50mm',
					focalMm: 50,
					fStop: 1.8,
					imageDataUrl: '/assets/interrogation/panel5_climax_accusation.jpg',
					beat: `P0${nextPageIndex}-04 · 陆沉举起胸前开启录音与微距传输的警用终端，天台四周红蓝警灯骤然亮起！`,
					who: ['@lu_chen', '@lin_ye', '@shen_mo'],
					assetRefs: ['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch'],
					mccloudTransition: 'action_to_action',
					wordPictureMode: 'duo_specific',
					tension: 0.98,
					eyeline: [eyeSign * 28, -2],
					focalPointRel: [0.46, 0.38],
					subsplitInset: {
						enabled: true,
						targetTag: '@lin_ye',
						rectRel: [0.64, 0.56, 0.96, 0.94],
						shot: 'CU',
						caption: '证人林野指认',
					},
					lines: [
						{ type: 'sfx', text: '轰隆——！！', placement: 'top-left' },
						{ type: 'shout', text: '底片和刚才的口供，已经同步发往督察处了！', prosody: '决绝宣判', placement: 'top-right' },
					],
				},
			],
		}
	}

	if (isSeagull) {
		return {
			titleSuffix: nextPageIndex === 2 ? '防波堤逆风俯冲' : '夕照屋顶的瓶盖赎金',
			scenario: nextPageIndex === 2 ? 'action' : 'climax',
			layoutPreset: 'kin',
			environment: nextPageIndex === 2 ? 'boardwalk' : 'rooftop',
			lighting: nextPageIndex === 2 ? 'hard-noon' : 'sunset',
			directive: `承接 P${nextPageIndex - 1} 的海鸥对峙，延续海岸高对比光影与角色锁定展开第 ${nextPageIndex} 页动作交锋。`,
			beats: [
				{
					shot: 'WS',
					angle: 'low',
					focal: '18mm',
					imageDataUrl: '/assets/seagull/env_rocky_pier_cliff.jpg',
					beat: `P0${nextPageIndex}-01 · 狂风卷起防波堤浪花，两只海鸥围绕薯条筒展开高空盘旋。`,
					who: ['@gull_philosopher', '@gull_foodie'],
					assetRefs: ['#env_rocky_pier_cliff', '#prop_pier_fries_cone', '@gull_philosopher', '@gull_foodie'],
					tension: 0.72,
					eyeline: [eyeSign * 18, 4],
					lines: [{ type: 'caption', text: '海风骤紧，第二轮争夺一触即发。', placement: 'top-right' }],
				},
				{
					shot: 'MCU',
					angle: 'eye',
					focal: '50mm',
					imageDataUrl: '/assets/seagull/char_gull_foodie.jpg',
					beat: `P0${nextPageIndex}-02 · 馋嘴海鸥压低双翼，目光死死锁定金黄薯条。`,
					who: ['@gull_foodie'],
					assetRefs: ['@gull_foodie', '#prop_pier_fries_cone'],
					tension: 0.8,
					eyeline: [eyeSign * 22, 2],
					lines: [{ type: 'shout', text: '最后一根归我了！', prosody: '俯冲咆哮', placement: 'top-right' }],
				},
				{
					shot: 'CU',
					angle: 'high',
					focal: '85mm',
					imageDataUrl: '/assets/seagull/prop_pier_fries_cone.jpg',
					beat: `P0${nextPageIndex}-03 · 无声静帧：红白纸筒在礁石边缘摇摇欲坠。`,
					who: [],
					assetRefs: ['#prop_pier_fries_cone'],
					tension: 0.86,
					silent: true,
					eyeline: [eyeSign * 12, 0],
					lines: [],
				},
				{
					shot: 'MS',
					angle: 'eye',
					focal: '35mm',
					imageDataUrl: '/assets/seagull/char_gull_philosopher.jpg',
					beat: `P0${nextPageIndex}-04 · 哲学家海鸥轻巧叼住纸筒边缘，在浪花拍岸瞬间稳住平衡。`,
					who: ['@gull_philosopher', '@gull_foodie'],
					assetRefs: ['@gull_philosopher', '@gull_foodie', '#prop_pier_fries_cone'],
					tension: 0.9,
					eyeline: [eyeSign * 20, -2],
					lines: [
						{ type: 'sfx', text: '哗啦——！', placement: 'top-left' },
						{ type: 'speech', text: '在风暴里守住午餐，才算真正的哲学。', prosody: '从容笃定', placement: 'bottom-left' },
					],
				},
			],
		}
	}

	// Generic continuation template for any custom story
	return {
		titleSuffix: `第 ${nextPageIndex} 页·剧情延续`,
		scenario: nextPageIndex % 2 === 0 ? 'tension' : 'climax',
		layoutPreset: 'kin',
		environment: outgoing.environment,
		lighting: outgoing.lighting,
		directive: outgoing.pageDirective,
		beats: [
			{
				shot: 'WS',
				angle: 'eye',
				focal: '35mm',
				beat: `P0${nextPageIndex}-01 · 承接上页尾格状态（${outgoing.prevExitShot}/${outgoing.prevExitAngle}），场景气氛进一步收紧。`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')).slice(0, 2),
				assetRefs: outgoing.lockedAssetTags,
				tension: 0.68,
				eyeline: [eyeSign * 18, 2],
				lines: [{ type: 'caption', text: outgoing.prevPageSummary.slice(0, 34), placement: 'top-right' }],
			},
			{
				shot: 'MCU',
				angle: 'eye',
				focal: '50mm',
				beat: `P0${nextPageIndex}-02 · 主角直面核心线索，眼神锋利回应对方质疑。`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')).slice(0, 1),
				assetRefs: outgoing.lockedAssetTags,
				tension: 0.78,
				eyeline: [eyeSign * 22, 0],
				lines: [{ type: 'speech', text: '线索从一开始就指向上一页留下的破绽。', prosody: '沉稳追问', placement: 'top-right' }],
			},
			{
				shot: 'CU',
				angle: 'low',
				focal: '85mm',
				beat: `P0${nextPageIndex}-03 · 无声静帧：关键证物特写，呼吸声在光影分界线上凝滞。`,
				who: [],
				assetRefs: outgoing.lockedAssetTags.filter((t) => t.startsWith('#')),
				tension: 0.86,
				silent: true,
				eyeline: [eyeSign * 15, 0],
				lines: [],
			},
			{
				shot: 'MS',
				angle: 'low',
				focal: '35mm',
				beat: `P0${nextPageIndex}-04 · 局势骤然翻转，抛出通往下一页的悬念钩子。`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')),
				assetRefs: outgoing.lockedAssetTags,
				tension: 0.94,
				eyeline: [eyeSign * 26, -2],
				lines: [
					{ type: 'sfx', text: '砰——！', placement: 'top-left' },
					{ type: 'shout', text: '真正的幕后之人，现在才刚刚现身！', prosody: '雷霆揭晓', placement: 'top-right' },
				],
			},
		],
	}
}

export interface ExtendPageOptions {
	customStoryText?: string
	customDirective?: string
	scenario?: Scenario
	targetPanels?: number
	lockedAssetTags?: string[]
	environment?: string
	lighting?: string
	stylePreset?: string
	worldRules?: string
}

/**
 * Core Multi-Page Pipeline Extension:
 * Given a source page `P(n)` (or the latest page on canvas), extracts its outgoing
 * `PagePipelineContext` (locked characters/props/environments, style, lighting, 180° exit eyeline,
 * exit tension, and story summary) and spawns `P(n+1)` to the right with full JEV 5-stage compilation.
 */
export function extendNextPageFromPage(
	editor: Editor,
	sourcePageId?: TLShapeId,
	options?: ExtendPageOptions,
): { pageId: TLShapeId; page: MangaContainer; context: PagePipelineContext; message: string } {
	const allPages = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
		.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))

	let sourcePage: MangaContainer | undefined
	if (sourcePageId) {
		const candidate = editor.getShape(sourcePageId)
		if (candidate?.type === CONTAINER && candidate.props.role === 'page') {
			sourcePage = candidate as MangaContainer
		}
	}
	if (!sourcePage) {
		const sel = selectedPages(editor)
		sourcePage = sel.length === 1 ? sel[0] : allPages[allPages.length - 1]
	}

	if (!sourcePage) {
		throw new Error('画布上尚未找到可延续的源分镜页')
	}

	const outgoing = extractPageOutgoingContext(editor, sourcePage)
	const maxPageIndex = allPages.reduce((max, p) => Math.max(max, p.props.pageIndex || 1), sourcePage.props.pageIndex || 1)
	const nextPageIndex = Math.max((sourcePage.props.pageIndex || 1) + 1, maxPageIndex + 1)
	const template = buildContinuationTemplate(sourcePage, nextPageIndex, outgoing)

	const nextContext: PagePipelineContext = {
		...outgoing,
		stylePreset: options?.stylePreset || outgoing.stylePreset,
		environment: options?.environment || template.environment || outgoing.environment,
		lighting: options?.lighting || template.lighting || outgoing.lighting,
		worldRules: options?.worldRules || outgoing.worldRules,
		lockedAssetTags: options?.lockedAssetTags?.length ? options.lockedAssetTags : outgoing.lockedAssetTags,
		pageDirective: options?.customDirective?.trim() || template.directive,
	}

	const rawBeats = options?.customStoryText?.trim()
		? parseScriptTextToBeats(options.customStoryText, nextContext.lockedAssetTags, nextContext.prevExitEyeline, template.beats)
		: template.beats.map((b) => ({
				...b,
				assetRefs: Array.from(new Set([...(b.assetRefs ?? []), ...nextContext.lockedAssetTags])),
			}))

	const targetPanels = options?.targetPanels ?? rawBeats.length
	const fittedBeats = fitBeats(rawBeats, targetPanels)

	// Stage 2: 4-Pass Iterative Polling & Cross-Page 180° Axis Continuity
	const poll = runIterativePolling4Pass(fittedBeats, 'rtl')
	const repairedBeats = poll.repairedBeats.map((b, idx) => ({
		...b,
		imageDataUrl: b.imageDataUrl || fittedBeats[idx]?.imageDataUrl || template.beats[idx % template.beats.length]?.imageDataUrl,
		assetRefs: Array.from(new Set([...(b.assetRefs ?? []), ...nextContext.lockedAssetTags])),
	}))

	const scenario = options?.scenario ?? template.scenario
	const seed = `page-c${sourcePage.props.chapterIndex || 1}-p${nextPageIndex}-${Date.now().toString(36).slice(-4)}`

	// Stage 3: Programmatic Tension-Coupled Layout Genome Solver
	const stage3 = compileTensionCoupledLayout(seed, repairedBeats, scenario, template.layoutPreset)
	const layout = stage3.layout
	const metas = layout.panels.map((panel, index) => {
		const beat = repairedBeats[index] ?? repairedBeats[repairedBeats.length - 1]
		const m = metaFromBeat(beat, panel, seed, index)
		return {
			...m,
			environment: nextContext.environment,
			imageDataUrl: beat?.imageDataUrl || m.imageDataUrl,
		}
	})

	// Place cleanly to the right of sourcePage (avoiding overlap with any existing page at the same row)
	const sameRowPages = allPages.filter((p) => Math.abs(p.y - sourcePage.y) < 320)
	const rightmostX = sameRowPages.reduce((maxX, p) => Math.max(maxX, p.x + (p.props.w || PAGE_W)), sourcePage.x + (sourcePage.props.w || PAGE_W))
	const newX = Math.max(sourcePage.x + (sourcePage.props.w || PAGE_W) + 96, rightmostX + 96)
	const newY = sourcePage.y

	const newPageId = createShapeId(`page-c${sourcePage.props.chapterIndex || 1}-p${nextPageIndex}-${Date.now().toString(36).slice(-3)}`)
	const finalScore = Number(Math.max(poll.convergedScore, stage3.score).toFixed(3))
	const chapterIdx = sourcePage.props.chapterIndex || 1
	const newTitle = `第${chapterIdx}话 · P${nextPageIndex} · ${template.titleSuffix}`

	editor.createShape<MangaContainer>({
		id: newPageId,
		type: CONTAINER,
		x: newX,
		y: newY,
		props: {
			w: PAGE_W,
			h: PAGE_H,
			role: 'page',
			title: newTitle,
			subtitle: `${layout.panels.length} 格 · 承接 P${sourcePage.props.pageIndex || 1} · JEV ${Math.round(finalScore * 100)} 分`,
			story: formatBeatsToScriptText(repairedBeats),
			worldRules: nextContext.worldRules,
			stylePreset: nextContext.stylePreset,
			mood: sourcePage.props.mood || '',
			environment: nextContext.environment,
			lighting: nextContext.lighting,
			chapterIndex: chapterIdx,
			pageIndex: nextPageIndex,
			scenario,
			layoutPreset: template.layoutPreset,
			dialogueDensity: sourcePage.props.dialogueDensity ?? 0.45,
			targetPanels: layout.panels.length,
			seed,
			genomeJson: JSON.stringify(stage3.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(repairedBeats),
			score: finalScore,
			reasonsJson: JSON.stringify(stage3.reasons),
			showFlow: sourcePage.props.showFlow ?? false,
			selectedPanel: 0,
			showBubblesLayer: true,
			showProsodyLayer: true,
			showSfxLayer: true,
			contextJson: JSON.stringify(nextContext),
		},
	})

	spawnPageBubbles(editor, newPageId, layout, repairedBeats, metas)
	wire(
		editor,
		sourcePage.id,
		newPageId,
		sourcePage.x + (sourcePage.props.w || PAGE_W),
		sourcePage.y + PAGE_H * 0.48,
		newX,
		newY + PAGE_H * 0.48,
	)

	editor.select(newPageId)
	// Frame both sourcePage and the newly extended page so the user sees the pipeline handoff clearly
	const unionMinX = Math.min(sourcePage.x, newX) - 48
	const unionMinY = Math.min(sourcePage.y, newY) - 36
	const unionMaxX = Math.max(sourcePage.x + PAGE_W, newX + PAGE_W) + 64
	const unionMaxY = Math.max(sourcePage.y + PAGE_H, newY + PAGE_H) + 36
	try {
		editor.zoomToBounds(
			{ x: unionMinX, y: unionMinY, w: unionMaxX - unionMinX, h: unionMaxY - unionMinY },
			{ animation: { duration: 180 } },
		)
	} catch {
		// Ignore zoom errors in headless/mock environments
	}

	const created = editor.getShape<MangaContainer>(newPageId)!
	return {
		pageId: newPageId,
		page: created,
		context: nextContext,
		message: `已从 P${sourcePage.props.pageIndex || 1} 流水线延续生成「${newTitle}」：继承 ${nextContext.lockedAssetTags.length} 项锁定设定（${nextContext.lockedAssetTags.slice(0, 4).join(' ')}）与 180° 尾格视线轴（${nextContext.prevExitShot}/${nextContext.prevExitAngle}）`,
	}
}

/**
 * Save edited PagePipelineContext & script beats on a page and recompile its layout/bubbles.
 */
export function updatePageContextAndRecompile(
	editor: Editor,
	page: MangaContainer,
	patch: Partial<PagePipelineContext> & {
		story?: string
		scenario?: string
		targetPanels?: number
		recompile?: boolean
	},
): string {
	const currentCtx = readPageContext(editor, page)
	const nextCtx: PagePipelineContext = {
		...currentCtx,
		...patch,
		lockedAssetTags: patch.lockedAssetTags ?? currentCtx.lockedAssetTags,
	}

	const rawExistingBeats = readJson<Beat[]>(page.props.scriptJson, [])
	const prevMetas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const storyText = patch.story !== undefined ? patch.story : page.props.story || formatBeatsToScriptText(rawExistingBeats)
	const parsedBeats = parseScriptTextToBeats(storyText, nextCtx.lockedAssetTags, nextCtx.prevExitEyeline, rawExistingBeats)
	const targetCount = Math.max(1, patch.targetPanels ?? (parsedBeats.length || page.props.targetPanels || 4))
	const fitted = fitBeats(parsedBeats, targetCount)

	const scenario = asScenario(patch.scenario ?? page.props.scenario)
	const poll = runIterativePolling4Pass(fitted, 'rtl')
	const repaired = poll.repairedBeats.map((b, idx) => ({
		...b,
		imageDataUrl: b.imageDataUrl || prevMetas[idx]?.imageDataUrl || rawExistingBeats[idx]?.imageDataUrl,
		assetRefs: Array.from(new Set([...(b.assetRefs ?? []), ...nextCtx.lockedAssetTags])),
	}))

	const stage3 = compileTensionCoupledLayout(page.props.seed, repaired, scenario, page.props.layoutPreset)
	const layout = stage3.layout
	const metas = layout.panels.map((panel, index) => {
		const fresh = metaFromBeat(repaired[index] ?? fitted[index], panel, page.props.seed, index)
		const prev = prevMetas[index]
		return {
			...fresh,
			environment: nextCtx.environment,
			imageDataUrl: prev?.imageDataUrl || fresh.imageDataUrl,
			imageOffsetX: prev?.imageOffsetX ?? fresh.imageOffsetX,
			imageOffsetY: prev?.imageOffsetY ?? fresh.imageOffsetY,
			imageScale: prev?.imageScale ?? fresh.imageScale,
			imageRotation: prev?.imageRotation ?? fresh.imageRotation,
		}
	})

	const finalScore = Number(Math.max(poll.convergedScore, stage3.score).toFixed(3))
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			story: formatBeatsToScriptText(repaired),
			worldRules: nextCtx.worldRules,
			stylePreset: nextCtx.stylePreset,
			environment: nextCtx.environment,
			lighting: nextCtx.lighting,
			scenario,
			targetPanels: layout.panels.length,
			genomeJson: JSON.stringify(stage3.genome),
			scriptJson: JSON.stringify(repaired),
			panelsJson: JSON.stringify(metas),
			score: finalScore,
			reasonsJson: JSON.stringify(stage3.reasons),
			contextJson: JSON.stringify(nextCtx),
			subtitle: `${layout.panels.length} 格 · Context 已同步 · JEV ${Math.round(finalScore * 100)} 分`,
		},
	})

	spawnPageBubbles(editor, page.id, layout, repaired, metas)
	return `已保存 ${page.props.title} 的继承上下文（${nextCtx.lockedAssetTags.length} 项锁定资产）并完成 JEV 重编译（${Math.round(finalScore * 100)} 分）`
}

export function cloneVariantPage(editor: Editor, sourcePageId?: TLShapeId): string {
	const page =
		(sourcePageId ? (editor.getShape(sourcePageId) as MangaContainer | undefined) : undefined) ??
		selectedPages(editor)[0]
	if (!page) return '请先选择要克隆变体的分镜页'

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const currentGenome = sanitize(readJson(page.props.genomeJson, generate(page.props.seed, config).genome))
	const rand = mulberry32(strHash(`${page.props.seed}-var-${Date.now()}`))
	const mutatedGenome = mutate(currentGenome, rand, 0.58)
	const layout = realize(mutatedGenome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
	const beats = fitBeats(readJson<Beat[]>(page.props.scriptJson, []), layout.panels.length)
	const prevMetas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const metas = layout.panels.map((panel, idx) => {
		const fresh = metaFromBeat(beats[idx], panel, `${page.props.seed}-var`, idx)
		return {
			...fresh,
			imageDataUrl: prevMetas[idx]?.imageDataUrl || fresh.imageDataUrl,
		}
	})

	const cloneId = createShapeId(`${page.id.replace('shape:', '')}-var-${Date.now().toString(36).slice(-3)}`)
	const cloneY = page.y + PAGE_H + 56
	editor.createShape<MangaContainer>({
		id: cloneId,
		type: CONTAINER,
		x: page.x,
		y: cloneY,
		props: {
			...page.props,
			title: `${page.props.title} · 变体对比`,
			subtitle: `${layout.panels.length} 格 · 变体评分 ${Math.round(judged.score * 100)}`,
			seed: `${page.props.seed}-var`,
			genomeJson: JSON.stringify(layout.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			score: judged.score,
			reasonsJson: JSON.stringify(judged.reasons),
		},
	})
	spawnPageBubbles(editor, cloneId, layout, beats, metas)
	editor.select(cloneId)
	return `已克隆生成「${page.props.title} · 变体对比」（评分 ${Math.round(judged.score * 100)} 分）`
}

export async function regenerateSelectedPanel(
	editor: Editor,
	page: MangaContainer,
	panelIndex?: number,
): Promise<string> {
	const idx = panelIndex ?? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0)
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const target = metas[idx]
	if (!target) return '未找到目标分镜格'

	const ctx = readPageContext(editor, page)
	const opt = computeOptics(defaultOpticsForMeta(target))
	const prompt = buildPanelPrompt({
		environment: target.environment || page.props.environment,
		lighting: page.props.lighting,
		shot: target.shot,
		angle: target.angle,
		focal: target.focal,
		aspect: target.aspect,
		beat: target.beat,
		locks: ctx.lockedAssetTags.join(' '),
		corner: safeCorner('top-right'),
		silent: target.silent,
		opticsClause: opt.promptClause,
	})
	const remoteUrl = await askImage(prompt, target.aspect)
	metas[idx] = {
		...target,
		imageSeed: `${target.imageSeed}-ai-${Date.now().toString(36).slice(-3)}`,
		imageDataUrl: remoteUrl || target.imageDataUrl,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas), selectedPanel: idx },
	})
	return `已按本页锁定资产（${ctx.lockedAssetTags.slice(0, 3).join(' ')}）重绘第 ${idx + 1} 格（${target.shot}/${target.focal}）`
}

export function loadPresetArtIntoPanel(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	customUrl?: string,
): string {
	const noirUrls = [
		'/assets/interrogation/panel1_establishing.jpg',
		'/assets/interrogation/panel2_cuff_probe.jpg',
		'/assets/interrogation/panel3_watch_macro.jpg',
		'/assets/interrogation/panel4_silent_lighter_spark.jpg',
		'/assets/interrogation/panel5_climax_accusation.jpg',
	]
	const seagullUrls = [
		'/assets/seagull/env_rocky_pier_cliff.jpg',
		'/assets/seagull/char_gull_philosopher.jpg',
		'/assets/seagull/char_gull_foodie.jpg',
		'/assets/seagull/prop_pier_fries_cone.jpg',
	]
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const target = metas[panelIndex]
	if (!target) return '未找到目标分镜格'
	const isSeagull = page.props.stylePreset === 'shonen_water' || page.props.title.includes('海鸥')
	const pool = isSeagull ? seagullUrls : noirUrls
	const currentIdx = pool.indexOf(target.imageDataUrl || '')
	const chosenUrl = customUrl || pool[(currentIdx >= 0 ? currentIdx + 1 : panelIndex) % pool.length]

	metas[panelIndex] = {
		...target,
		imageDataUrl: chosenUrl,
		imageOffsetX: 0,
		imageOffsetY: 0,
		imageScale: 1,
		imageRotation: 0,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas), selectedPanel: panelIndex },
	})
	return `已为第 ${panelIndex + 1} 格载入高清分镜原画`
}

export function resetPanelTransformOnPage(editor: Editor, page: MangaContainer, panelIndex: number): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	if (!metas[panelIndex]) return '未找到目标分镜格'
	metas[panelIndex] = {
		...metas[panelIndex],
		imageOffsetX: 0,
		imageOffsetY: 0,
		imageScale: 1,
		imageRotation: 0,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas), selectedPanel: panelIndex },
	})
	return `已复位第 ${panelIndex + 1} 格画面位移、缩放 (100%) 与旋转角 (0°)`
}

export function rotatePanelImageOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	deltaOrReset: number | 'reset',
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const target = metas[panelIndex]
	if (!target) return '未找到目标分镜格'
	const nextRot = deltaOrReset === 'reset' ? 0 : Math.max(-45, Math.min(45, (target.imageRotation ?? 0) + deltaOrReset))
	metas[panelIndex] = {
		...target,
		imageRotation: nextRot,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas), selectedPanel: panelIndex },
	})
	return `第 ${panelIndex + 1} 格画面旋转角度已设为 ${nextRot}°`
}

export function togglePanelSubsplitOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	const target = metas[panelIndex]
	if (!target) return '未找到目标分镜格'

	const ctx = readPageContext(editor, page)
	const firstCharTag = ctx.lockedAssetTags.find((t) => t.startsWith('@')) || '@shen_mo'
	const currentlyEnabled = Boolean(target.subsplitInset?.enabled)
	const nextInset = currentlyEnabled
		? undefined
		: {
				enabled: true,
				targetTag: firstCharTag,
				rectRel: [0.62, 0.08, 0.95, 0.44] as [number, number, number, number],
				shot: 'ECU' as const,
				caption: `${firstCharTag} 反应特写`,
			}

	metas[panelIndex] = {
		...target,
		subsplitInset: nextInset,
	}
	if (beats[panelIndex]) {
		beats[panelIndex] = {
			...beats[panelIndex],
			subsplitInset: nextInset,
		}
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			selectedPanel: panelIndex,
		},
	})
	return currentlyEnabled
		? `已关闭第 ${panelIndex + 1} 格画中画反应子格 (PiP)`
		: `已在第 ${panelIndex + 1} 格开启画中画反应子格 (PiP · 锁定 ${firstCharTag})`
}

export function bindCardToPageContext(
	editor: Editor,
	card: MangaCard,
	targetPage?: MangaContainer,
): string {
	const page = targetPage ?? selectedPages(editor)[0]
	if (!page) return '画布上没有可绑定的目标分镜页'
	const rawTag = card.props.tag?.trim() || (card.props.kind === 'character' ? `@${card.props.title}` : `#${card.props.title}`)
	const normalizedTag = rawTag.startsWith('@') || rawTag.startsWith('#') ? rawTag : card.props.kind === 'character' ? `@${rawTag}` : `#${rawTag}`

	if (!card.props.locked || card.props.tag !== normalizedTag) {
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: { locked: true, tag: normalizedTag },
		})
	}

	const ctx = readPageContext(editor, page)
	const nextTags = Array.from(new Set([...ctx.lockedAssetTags, normalizedTag]))
	const nextCtx: PagePipelineContext = {
		...ctx,
		lockedAssetTags: nextTags,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			contextJson: JSON.stringify(nextCtx),
		},
	})
	return `已将设定卡「${card.props.title} (${normalizedTag})」锁定并注入 ${page.props.title} 的继承上下文`
}

export function spawnBlankPageAtPoint(editor: Editor, x?: number, y?: number): TLShapeId {
	const allPages = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
	const nextIdx = allPages.reduce((max, p) => Math.max(max, p.props.pageIndex || 1), 0) + 1
	const center = editor.getViewportPageBounds().center
	const px = x ?? center.x - PAGE_W / 2
	const py = y ?? center.y - PAGE_H / 2
	const draft = universalPresetToBook('noir-watchmaker')?.chapters[0]?.pages[0] ?? defaultBook().chapters[0].pages[0]
	const pageId = createPageShape(editor, draft, {
		id: `page-custom-p${nextIdx}-${Date.now().toString(36).slice(-3)}`,
		x: px,
		y: py,
		chapterIndex: 1,
		pageIndex: nextIdx,
		title: `第1话 · P${nextIdx}`,
		environment: 'interrogation-room',
		lighting: 'rim',
		stylePreset: 'seinen_noir',
	})
	editor.select(pageId)
	return pageId
}

export function tidyCanvasLayout(editor: Editor): string {
	const pages = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
		.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))
	pages.forEach((p, idx) => {
		editor.updateShape<MangaContainer>({
			id: p.id,
			type: CONTAINER,
			x: 1040 + idx * (PAGE_W + 96),
			y: 60,
		})
	})
	editor.zoomToFit({ animation: { duration: 180 } })
	return `已按流水线顺序（P1 → P${pages.length}）横向对齐全部 ${pages.length} 页分镜稿`
}
