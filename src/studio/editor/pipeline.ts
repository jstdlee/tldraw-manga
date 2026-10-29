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
	fitBeats,
	metaFromBeat,
	readJson,
	readPageParams,
	refreshAspects,
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
import { categoryForTag, compileStage4PureArtSpec, compileTensionCoupledLayout, createAssetRegistry, registryForPreset, runIterativePolling4Pass, UNIVERSAL_STORY_PRESETS, universalPresetToBook, verifyAssetRegistryAndBackfill, type AssetRegistry } from '../jev/fiveStageEngine'
import { blockTitle, defaultParams, type BlockId } from '../prompts/library'
import { isEmptyPageStyle, pageStyleToLayoutBias, readPageStyleFromMeta } from '../library/pageStyle'
import { applyMasterFactorsToBeats } from '../pipeline/masterFactors'
import { readPanelFactorsFromMeta } from '../pipeline/panelFactors'
import { BUBBLE, CARD, CONTAINER, PROMPT, type CardKind, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { clampBubbleBelowHeaderBand, planBubbles } from './placement'

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
		props: { body: snap.prevBody, aiStatus: 'Reverted to previous version' },
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
			subtitle: `${metas.length} Panels · Reverted`,
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
	if (unique.length) return `${unique.join(' ')} Locked`
	return 'Character & Asset Consistency Locked'
}

/**
 * Switch the canvas to any universal 5-stage story preset (fully story-agnostic),
 * rebuilding the Bible, chapter and polygon storyboard pages from the preset.
 */
export function applyUniversalFiveStagePreset(editor: Editor, presetId: string): string {
	const book = universalPresetToBook(presetId)
	if (!book) return `Preset not found: ${presetId}`
	spawnBook(editor, book)
	return `Loaded preset "${book.title}" and compiled JEV storyboard`
}

/**
 * Run the JEV 5-stage compile on the active page(s): Stage 2 four-pass iterative
 * polling + McCloud on-demand gating, then activate the Saccadic Focal-Gaze-Bubble
 * Trajectory overlay. Fully story-agnostic — it reads whatever beats the page holds.
 */
export function runJevFiveStageCompile(editor: Editor): string {
	const pages = selectedPages(editor)
	if (!pages.length) return 'Select a page to run JEV 5-Stage compilation'
	let totalPanels = 0
	let minScore = 1
	let axisOk = true
	for (const page of pages) {
		const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
		const prevMetas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const targetCount = Math.max(1, rawBeats.length || page.props.targetPanels || 4)
		const fittedBeats = fitBeats(rawBeats, targetCount)

		// Apply any master-style blend on the page to the per-panel JEV factor values
		// (shot / angle / transition / word-picture) before Stage 2. Manual per-panel
		// locks win; an unstyled page returns the beats unchanged (byte-identical).
		const pageStyle = readPageStyleFromMeta(page.meta)
		const initialBeats = applyMasterFactorsToBeats(fittedBeats, {
			pageStyle,
			panelFactors: readPanelFactorsFromMeta(page.meta),
			seed: page.props.seed,
		})

		// Stage 2: 4-Pass Iterative Polling (14-factor camera/optics lock + McCloud gates + 180° axis repair)
		const poll = runIterativePolling4Pass(initialBeats, 'rtl')
		const repaired = poll.repairedBeats

		// Stage 3: Programmatic Tension-Coupled Layout Genome Solver. Any applied
		// master blend or theory constraint on the page becomes an additive layout
		// bias; an unstyled page passes `undefined`, keeping output byte-identical.
		const styleBias = isEmptyPageStyle(pageStyle) ? undefined : pageStyleToLayoutBias(pageStyle)
		const stage3 = compileTensionCoupledLayout(
			page.props.seed,
			repaired,
			asScenario(page.props.scenario),
			page.props.layoutPreset,
			styleBias,
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
				subtitle: `${layout.panels.length} Panels · JEV ${Math.round(finalScore * 100)} · ${poll.axisAuditPass ? '180° Axis OK' : 'Axis Calibrated'}`,
			},
		})
		// Stage 5: Spawn anti-occlusion vector bubbles & independent prosody layer
		spawnPageBubbles(editor, page.id, layout, repaired, metas)
		totalPanels += layout.panels.length
		minScore = Math.min(minScore, finalScore)
		axisOk = axisOk && poll.axisAuditPass
	}
	return `JEV 5-Stage compilation complete: ${pages.length} pages / ${totalPanels} panels · Score ${Math.round(minScore * 100)}`
}

// -----------------------------------------------------------------------------
// Stage-scoped re-propagation runners.
//
// These recompute a single downstream stage for a page without regenerating any
// artwork. They are the real work behind the stage-bar "Re-propagate" button and
// are driven by the pure `executeRepropagationAsync` executor (pipeline/repropagate).
// Each re-reads the latest page shape by id so a chain (Stage 3 → 4 → 5) sees the
// previous runner's output.
// -----------------------------------------------------------------------------

/** Recompute the tension-coupled layout + panel metas while preserving artwork. */
function recomputeLayoutForPage(page: MangaContainer) {
	const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
	const prevMetas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const targetCount = Math.max(1, rawBeats.length || page.props.targetPanels || 4)
	const fitted = fitBeats(rawBeats, targetCount)
	const pageStyle = readPageStyleFromMeta(page.meta)
	const beats = applyMasterFactorsToBeats(fitted, {
		pageStyle,
		panelFactors: readPanelFactorsFromMeta(page.meta),
		seed: page.props.seed,
	})
	const styleBias = isEmptyPageStyle(pageStyle) ? undefined : pageStyleToLayoutBias(pageStyle)
	const stage3 = compileTensionCoupledLayout(
		page.props.seed,
		beats,
		asScenario(page.props.scenario),
		page.props.layoutPreset,
		styleBias,
	)
	const metas = stage3.layout.panels.map((panel, index) => {
		const fresh = metaFromBeat(beats[index] ?? beats[0], panel, page.props.seed, index)
		const prev = prevMetas[index]
		if (!prev) return fresh
		// Preserve all user-owned artwork transforms; never regenerate an image.
		return {
			...fresh,
			imageDataUrl: prev.imageDataUrl || fresh.imageDataUrl,
			imageOffsetX: prev.imageOffsetX ?? fresh.imageOffsetX,
			imageOffsetY: prev.imageOffsetY ?? fresh.imageOffsetY,
			imageScale: prev.imageScale ?? fresh.imageScale,
			imageRotation: prev.imageRotation ?? fresh.imageRotation,
			artPrompt: prev.artPrompt,
		}
	})
	return { stage3, layout: stage3.layout, beats, metas }
}

/** Stage 3: recompute the panel layout genome + rectangles from the current beats. */
export function relayoutPageStage3(editor: Editor, pageId: TLShapeId): void {
	const page = editor.getShape<MangaContainer>(pageId)
	if (!page || page.type !== CONTAINER) return
	const { stage3, layout, metas } = recomputeLayoutForPage(page)
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: {
			targetPanels: layout.panels.length,
			genomeJson: JSON.stringify(stage3.genome),
			panelsJson: JSON.stringify(metas),
			score: Number(stage3.score.toFixed(3)),
			reasonsJson: JSON.stringify(stage3.reasons),
		},
	})
}

/** Stage 4: recompile the asset-locked pure-art prompt per panel (no image regen). */
export function recompilePromptsStage4(editor: Editor, pageId: TLShapeId): void {
	const page = editor.getShape<MangaContainer>(pageId)
	if (!page || page.type !== CONTAINER) return
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	if (!metas.length) return
	// Fold any master-style blend into the per-panel factor values so the Stage 4
	// prompt is asset-locked to the same shot/angle the layout used. Manual panel
	// locks win; an unstyled page leaves the beats untouched (byte-identical).
	const beats = applyMasterFactorsToBeats(readJson<Beat[]>(page.props.scriptJson, []), {
		pageStyle: readPageStyleFromMeta(page.meta),
		panelFactors: readPanelFactorsFromMeta(page.meta),
		seed: page.props.seed,
	})
	const ctx = readPageContext(editor, page)
	const registry = buildCanvasAssetRegistryForPage(editor, page, ctx)
	const next = metas.map((meta, idx) => {
		const beat: Beat = beats[idx] ?? {
			shot: meta.shot,
			angle: meta.angle,
			focal: meta.focal,
			beat: meta.beat,
			who: meta.who,
			assetRefs: meta.assetRefs?.length ? meta.assetRefs : ctx.lockedAssetTags.slice(0, 3),
			silent: meta.silent,
			lines: [],
		}
		const stage4 = compileStage4PureArtSpec({
			panelIndex: idx,
			beat,
			meta,
			panelPts: [
				[0, 0],
				[320, 0],
				[320, 220],
				[0, 220],
			],
			registry,
			environment: meta.environment || page.props.environment,
			lighting: page.props.lighting,
		})
		// Store the recompiled prompt + resolved asset tags; leave imageDataUrl alone.
		return { ...meta, assetRefs: stage4.assetTags, artPrompt: stage4.pureCameraPrompt }
	})
	editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
}

/** Stage 5: re-place balloons / lettering for the current layout (no image regen). */
export function relayoutLetteringStage5(editor: Editor, pageId: TLShapeId): void {
	const page = editor.getShape<MangaContainer>(pageId)
	if (!page || page.type !== CONTAINER) return
	const { layout, beats, metas } = recomputeLayoutForPage(page)
	spawnPageBubbles(editor, page.id, layout, beats, metas)
}

export function spawnBook(editor: Editor, book: BookDraft): void {
	const existing = [...editor.getCurrentPageShapeIds()]
	if (existing.length) editor.deleteShapes(existing)

	// Page-first workspace: the production unit is the Page. Rather than dumping a
	// cluttered Story Bible, Chapter container, prompt node and six scattered
	// reference cards across the canvas, seed a clean, spacious 2-page horizontal
	// pipeline (P1 -> P2). All reference assets, world rules and the style preset
	// live inside the Page Context (contextJson) and are surfaced in the Page
	// Context Inspector and the Reference Assets drawer -- never as loose shapes.
	const chapter = book.chapters[0]
	const firstPage: PageDraft = chapter?.pages[0] ?? {
		scenario: 'establishing',
		layoutPreset: 'std',
		dialogueDensity: 0.45,
		targetPanels: 4,
		seed: `${book.stylePreset || 'page'}-c1-p1`,
		showFlow: false,
		beats: [],
	}

	// Build the locked reference-asset tag set from the book's cast plus any
	// character / prop / environment tags referenced by the opening page beats.
	const castTags = book.characters.map((character) => character.tag).filter(Boolean)
	const beatTags = firstPage.beats
		.flatMap((beat) => [...(beat.who ?? []), ...(beat.assetRefs ?? [])])
		.filter(Boolean)
	const isNoir = book.stylePreset === 'seinen_noir' || book.title.toLowerCase().includes('interrogation')
	const isWutai = book.stylePreset === 'shanshui_ink' || book.title.toLowerCase().includes('wutai')
	const referenceTags = isNoir
		? ['#prop_pocket_watch', '#env_interrogation_room']
		: isWutai
			? ['#env_wutai_monastery_steps', '#env_zen_tea_chamber', '#prop_poem_brush_inkstone']
			: []
	const lockedAssetTags = Array.from(new Set([...castTags, ...beatTags, ...referenceTags]))

	const sceneTitle = isWutai
		? 'Ascending Wutai & The Probe'
		: (chapter?.title || book.title).split(/[·:]/)[0].trim() || 'Opening Scene'

	// Page 1 -- top-left origin, clean and focused.
	const page1Id = createPageShape(editor, firstPage, {
		id: 'page-c1-p1',
		x: 80,
		y: 80,
		chapterIndex: 1,
		pageIndex: 1,
		title: `Ch.1 · P1 · ${sceneTitle}`,
		environment: chapter?.environment ?? 'boardwalk',
		lighting: chapter?.lighting ?? 'hard-noon',
		stylePreset: book.stylePreset,
		lockedAssetTags,
		worldRules: book.world,
		prevPageSummary: `Opening Page (P1) of "${book.title}". Context, ${lockedAssetTags.length} locked reference assets, world rules and the style preset are injected from the story bible.`,
		pageDirective: `${sceneTitle}: establish the scene, lock the ${lockedAssetTags.length} reference assets and the 180° camera axis, and land a page-turn hook on the final panel to hand off into P2.`,
	})

	// Page 2 (and Page 3 for 3-act Wutai Debate) -- automatically extended to the right,
	// inheriting the full page context (locked assets, 180° axis, world rules).
	try {
		const p2 = extendNextPageFromPage(editor, page1Id)
		if (isWutai && p2?.pageId) {
			extendNextPageFromPage(editor, p2.pageId)
		}
	} catch {
		// In headless / mock environments the extension step may be unavailable;
		// Page 1 still stands as a valid single-page pipeline root.
	}

	// Start the user at the pipeline root and frame the whole pipeline cleanly.
	try {
		editor.select(page1Id)
		editor.zoomToFit({ animation: { duration: 0 } })
	} catch {
		// Ignore selection / zoom errors in headless / mock environments.
	}
}

export function createTextCardOnCanvas(
	editor: Editor,
	kind: Exclude<CardKind, 'image' | 'character'> = 'note',
	title = 'New Text Reference Card',
	body = 'Enter character bio, environment rules, or scene beats here. Use AI Polish to expand with Text LLM.',
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
			tag: kind === 'world' ? 'World' : kind === 'story' ? 'Story' : 'Ref',
			body,
			voice: '',
			locked: false,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: 'Powered by Text LLM',
		},
	})
	editor.select(id)
	return id
}

export function createImageCardOnCanvas(
	editor: Editor,
	kind: 'image' | 'character' = 'image',
	title = 'New Visual Reference Card',
	tag = '@boardwalk',
	body = 'Low-angle coastal breakwater reference, monochrome G-pen ink with 60L screentone and top-right safe balloon zone.',
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
			aiStatus: 'Powered by Vision + Image',
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
		// Optional book-level context overrides. When seeding the clean 2-page
		// pipeline these carry the story bible's locked reference-asset tags, world
		// rules and page directive straight into the page context (contextJson) so
		// nothing is dumped onto the canvas as scattered cards.
		lockedAssetTags?: string[]
		worldRules?: string
		prevPageSummary?: string
		pageDirective?: string
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
	const mergedLockedTags = Array.from(new Set([...(info.lockedAssetTags ?? []), ...initialTags]))
	const initialCtx: PagePipelineContext = {
		inheritedFromPageIndex: info.pageIndex > 1 ? info.pageIndex - 1 : undefined,
		stylePreset: info.stylePreset,
		environment: info.environment,
		lighting: info.lighting,
		worldRules: info.worldRules?.trim()
			? info.worldRules
			: info.stylePreset === 'seinen_noir'
				? 'Hardboiled seinen monochrome slate-blue palette + 50% Rembrandt split lighting + venetian-blind rain shadows + 180° axis continuity'
				: 'G-pen linework + 60L grey screentone + top-right balloon negative space',
		lockedAssetTags: mergedLockedTags.length
			? mergedLockedTags
			: ['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch', '#env_interrogation_room'],
		prevPageSummary: info.prevPageSummary?.trim()
			? info.prevPageSummary
			: info.pageIndex === 1
				? 'Opening Page (P1): Initial context injected from story bible and locked character/prop reference assets.'
				: `Continues narrative beats and 180° camera axis from Page ${info.pageIndex - 1}.`,
		prevExitShot: lastMeta?.shot ?? lastBeat?.shot ?? 'CU',
		prevExitAngle: lastMeta?.angle ?? lastBeat?.angle ?? 'eye',
		prevExitEyeline: (lastMeta?.eyeline ?? lastBeat?.eyeline ?? [-22, 2]) as [number, number],
		prevExitTension: Number((lastBeat?.tension ?? 0.85).toFixed(2)),
		pageDirective: info.pageDirective?.trim()
			? info.pageDirective
			: `${info.title}: Advance ${draft.scenario} pacing beats and land a page-turn hook on the final panel.`,
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
			subtitle: `${layout.panels.length} Panels · JEV ${Math.round(stage3.score * 100)}`,
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
			subtitle: `${layout.panels.length} Panels · JEV ${Math.round(choice.score * 100)}`,
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
		return `Updated layout geometry and recomputed optimal topology (JEV ${Math.round(best.score * 100)})`
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
	return 'Updated manuscript border and guide visibility'
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
	return `Applied layout remedy "${remedy.actionLabel}" · JEV score ${Math.round(judged.score * 100)}`
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
				? `${beat.beat} (Silent Ma Beat)`
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
			subtitle: `${layout.panels.length} Panels · ${tip.label} · JEV ${Math.round(best.score * 100)}`,
			genomeJson: JSON.stringify(layout.genome),
			panelsJson: JSON.stringify(metas),
			scriptJson: JSON.stringify(beats),
			score: best.score,
			reasonsJson: JSON.stringify(best.reasons),
		},
	})
	spawnPageBubbles(editor, page.id, layout, beats, metas)
	return `Applied director preset "${tip.label}": ${tip.beatRule}`
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
	if (!targetMeta) return 'Target panel not found'

	const nextSilent = !targetMeta.silent
	metas[panelIndex] = {
		...targetMeta,
		silent: nextSilent,
		beat: nextSilent
			? `${targetMeta.beat.replace(/ \(Silent Ma Beat\)$/, '')} (Silent Ma Beat)`
			: targetMeta.beat.replace(/ \(Silent Ma Beat\)$/, ''),
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
		? `Panel #${panelIndex + 1} set to Silent Ma Beat (dialogue hidden)`
		: `Panel #${panelIndex + 1} restored to dialogue mode`
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
	const edgeLabel = { bT: 'Top Bleed', bB: 'Bottom Bleed', bL: 'Left Bleed', bR: 'Right Bleed' }[edge]
	return `Toggled ${edgeLabel} on Panel #${panelIndex + 1}`
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
	return `Toggled subsplit on Panel #${panelIndex + 1} (${layout.panels.length} panels total)`
}

export function applyOpticsToPanel(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	patch: Partial<Pick<PanelMeta, 'sensor' | 'focalMm' | 'fStop' | 'subjectDistM' | 'bgDistM' | 'angle'>>,
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const current = metas[panelIndex]
	if (!current) return 'No selected panel found'

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
	return `Panel #${panelIndex + 1} optics: ${mergedOpt.focalMm}mm (eq ${computed.eqFocalMm}mm) · f/${mergedOpt.fStop} · ${computed.shotLabelZh}`
}

export function addBubbleToPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	style: BubbleStyle = 'speech',
	text = 'New dialogue line...',
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
		y: clampBubbleBelowHeaderBand(Math.min(PAGE_H - 90, y)),
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
	prosodyText = 'Cold Scrutinizing',
	prosodyStyle: ProsodyStyle = 'seal',
	sfxText = 'CLACK!',
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
	return `Loaded ${updated.length} panel illustrations into current page (drag to pan, scroll to zoom)`
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
			summary: customPrompt || 'AI Director Polish',
		})
		const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const beats = readJson<Beat[]>(page.props.scriptJson, [])
		const suffix = customPrompt ? ` (${customPrompt})` : ' (Chiaroscuro & Screentone Polish)'
		const updatedMetas = metas.map((meta, idx) => ({
			...meta,
			prevBeat: meta.beat,
			beat: meta.beat.includes('[AI') ? meta.beat : `${meta.beat} [AI Polish #${idx + 1}${suffix}]`,
		}))
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: {
				panelsJson: JSON.stringify(updatedMetas),
				subtitle: `${updatedMetas.length} Panels · AI Polished`,
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
					props: { text: 'BOOM—!!' },
				})
			}
		}
		polishedCount += Math.max(updatedMetas.length, beats.length)
	}
	const summary = await askText(
		'You are a manga director. Summarize this storyboard polish pass in one concise sentence.',
		customPrompt || 'Sharpen camera contrast, character consistency locks, and dialogue subtext',
		() => `Polished ${polishedCount} panels across ${pages.length} pages${customPrompt ? ` (${customPrompt})` : ''}.`,
	)
	return summary
}

export async function rewriteStoryWithLlm(story: string, customPrompt: string): Promise<string> {
	return askText(
		'You are a senior manga writer. Rewrite or expand the story synopsis below according to the directive while preserving the core characters.',
		`Original Story: ${story}\nDirective: ${customPrompt || 'Heighten dramatic conflict and visual staging'}`,
		() => {
			const directive = customPrompt.trim() || 'Heighten dramatic conflict and visual staging'
			return `${story.replace(/\n*\[AI Script Rewrite.*$/s, '')}\n[AI Script Rewrite · ${directive}] Under the fierce noon salt wind, Kanta guards the last cone of golden fries as Mei's shutter clicks against the one-eyed Gull Boss's dive; at dusk on the rooftop, the Gull Boss offers a gleaming bottle cap as truce under 18mm backlight.`
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
		cardDiffStore.set(card.id, { prevBody, nextBody: res.analysis, modelUsed: res.modelUsed, label: 'Vision Reverse-Analysis' })
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: { body: res.analysis, customPrompt: promptToUse, aiStatus: `${res.modelUsed} Analysis Complete` },
		})
		return `Completed Vision Reverse-Analysis on "${card.props.title}"`
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
				aiStatus: remoteUrl ? 'Image LLM Rendered' : 'Screentone Engine Rendered Variant',
			},
		})
		return `Regenerated reference illustration for "${card.props.title}"`
	}
	if (action === 'regenerate') {
		const res = await regenerateCardText({
			kind: card.props.kind,
			title: card.props.title,
			body: card.props.body,
			tag: card.props.tag,
			customPrompt: promptToUse,
		})
		cardDiffStore.set(card.id, { prevBody, nextBody: res.text, modelUsed: res.modelUsed, label: 'AI Regenerated' })
		editor.updateShape<MangaCard>({
			id: card.id,
			type: CARD,
			props: { body: res.text, customPrompt: promptToUse, aiStatus: `${res.modelUsed} Regenerated` },
		})
		return `Regenerated content for "${card.props.title}"`
	}
	const res = await polishCardText({
		kind: card.props.kind,
		title: card.props.title,
		body: card.props.body,
		tag: card.props.tag,
		customPrompt: promptToUse,
	})
	cardDiffStore.set(card.id, { prevBody, nextBody: res.text, modelUsed: res.modelUsed, label: 'AI Polished' })
	editor.updateShape<MangaCard>({
		id: card.id,
		type: CARD,
		props: { body: res.text, customPrompt: promptToUse, aiStatus: `${res.modelUsed} Polished` },
	})
	return `Applied AI Polish to "${card.props.title}"`
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
			'Extract manga character sheets and world rules, listing @tag and consistency locks.',
			story,
			() => draft.characters.map((char) => `${char.tag} ${char.name}：${char.appearance}`).join('；'),
		)
		if (bible) {
			editor.updateShape<MangaContainer>({
				id: bible.id,
				type: CONTAINER,
				props: { stylePreset: String(merged.stylePreset || draft.stylePreset), subtitle: `Extracted by Text LLM · ${draft.characters.length} Characters` },
			})
		}
		updatePromptPreview(editor, promptShapeId, note)
		return note
	}

	if (block === 'chapterize') {
		const draft = bookFromText(story)
		spawnBook(editor, draft)
		const summary = `Structured into ${draft.chapters.length} chapters / ${draft.chapters.reduce((acc, item) => acc + item.pages.length, 0)} pages`
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
				beats[silentIdx] = { ...beats[silentIdx], silent: true, lines: [], beat: `${beats[silentIdx].beat} (Pre-climax Silent Beat)` }
			}
			const metas = layout.panels.map((panel, index) => metaFromBeat(beats[index], panel, page.props.seed, index))
			editor.updateShape<MangaContainer>({
				id: page.id,
				type: CONTAINER,
				props: { scriptJson: JSON.stringify(beats), panelsJson: JSON.stringify(metas) },
			})
			spawnPageBubbles(editor, page.id, layout, beats, metas)
		}
		const summary = 'Arranged right-to-left beats with pre-climax silent pause and final-panel hook'
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
		const summary = `Panel camera set to ${shot} · ${angle} · ${focal}`
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
		const summary = `Randomized mood: ${ENV_LABELS[env] ?? env} · ${LIGHT_LABELS[light] ?? light} · ${shot}/${angle}/${focal}`
		updatePromptPreview(editor, promptShapeId, summary)
		return summary
	}

	let rendered = 0
	for (const page of selectedPages(editor)) {
		const ctx = readPageContext(editor, page)
		const registry = buildCanvasAssetRegistryForPage(editor, page, ctx)
		const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
		const beats = readJson<Beat[]>(page.props.scriptJson, [])
		const next: PanelMeta[] = []
		for (let index = 0; index < metas.length; index += 1) {
			const meta = metas[index]
			const beat: Beat = beats[index] ?? {
				shot: meta.shot,
				angle: meta.angle,
				focal: meta.focal,
				beat: meta.beat,
				who: meta.who,
				assetRefs: meta.assetRefs?.length ? meta.assetRefs : ctx.lockedAssetTags.slice(0, 3),
				silent: meta.silent,
			}
			const stage4 = compileStage4PureArtSpec({
				panelIndex: index,
				beat,
				meta,
				panelPts: [
					[0, 0],
					[320, 0],
					[320, 220],
					[0, 220],
				],
				registry,
				environment: meta.environment || page.props.environment,
				lighting: page.props.lighting,
			})
			const dataUrl = await askImage(stage4.pureCameraPrompt, meta.aspect, stage4.referenceImagePaths)
			next.push({
				...meta,
				assetRefs: stage4.assetTags,
				imageSeed: `${meta.imageSeed}-r`,
				imageDataUrl: dataUrl || meta.imageDataUrl,
			})
			rendered += 1
		}
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}
	const summary = `Rendered ${rendered} clean panel illustrations with independent vector balloon layers`
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
				.map((l) => `${l.type === 'sfx' ? '[SFX]' : l.type === 'caption' ? '[CAP]' : ''}「${l.text}」${l.prosody ? `(${l.prosody})` : ''}`)
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
		const isSilent = /silent|wordless|ma-beat/i.test(actionPart) && quotedMatches.length === 0

		const parsedLines: Beat['lines'] = isSilent
			? []
			: quotedMatches.length > 0
				? quotedMatches.map((m, mIdx) => {
						const prefixChar = (dialoguePart || rest).slice(0, m.index ?? 0)
						// Accept the clean [SFX]/[CAP] markers emitted by the formatter and
						// the legacy emoji markers kept for backward compatibility with any
						// previously saved scripts.
						const isSfx =
							prefixChar.endsWith('[SFX]') ||
							prefixChar.endsWith('⚡') ||
							/^(CLACK|BOOM|BANG|SHAAA|KCHK|RUMBLE|WHOOSH)/i.test(m[1])
						const isCaption =
							prefixChar.endsWith('[CAP]') ||
							prefixChar.endsWith('📝') ||
							(idx === 0 && mIdx === 0 && m[1].includes('：'))
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
			beat: actionPart.trim() || fallback?.beat || `P-0${idx + 1} · Panel Action Beat`,
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

/**
 * Page titles are authored as "Ch.N · PN · Scene" (see createPageShape calls above).
 * UI surfaces that already show the page index separately (the source list row, the
 * on-canvas page header) only need the scene label plus the chapter number, not the
 * redundant "Ch.N · PN ·" prefix repeated on top of their own index badge.
 */
export function splitPageTitle(title: string): { chapter: number | null; label: string } {
	const match = /^ch\.?\s*(\d+)\s*(?:·|-|:)\s*p\.?\s*\d+\s*(?:·|-|:)?\s*(.*)$/i.exec(title.trim())
	if (!match) return { chapter: null, label: title }
	const label = match[2].trim()
	return { chapter: Number(match[1]), label: label || title }
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
			'Hardboiled seinen monochrome slate-blue palette + 50% Rembrandt split lighting + 180° axis continuity',
		lockedAssetTags: mergedTags.length
			? mergedTags
			: ['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch', '#env_interrogation_room'],
		prevPageSummary:
			parsed.prevPageSummary ||
			(page.props.pageIndex <= 1
				? 'Opening Page (P1): Initial context injected from story bible and locked character/prop reference assets.'
				: `Inherits 180° camera axis, locked character assets, and cliffhanger hook from P${page.props.pageIndex - 1}.`),
		prevExitShot: parsed.prevExitShot || lastMeta?.shot || lastBeat?.shot || 'CU',
		prevExitAngle: parsed.prevExitAngle || lastMeta?.angle || lastBeat?.angle || 'eye',
		prevExitEyeline: (parsed.prevExitEyeline || lastMeta?.eyeline || lastBeat?.eyeline || [-24, 2]) as [number, number],
		prevExitTension: parsed.prevExitTension ?? Number((lastBeat?.tension ?? 0.85).toFixed(2)),
		pageDirective:
			parsed.pageDirective ||
			`${page.props.title}: Drive ${page.props.scenario || 'tension'} staging while preserving cross-page character locks and 180° axis continuity.`,
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

	const firstBeatSummary = (beats[0]?.beat || metas[0]?.beat || 'Opening establishing shot').replace(/^P\d+-\d+\s*·\s*/, '')
	const lastBeatSummary = (lastBeat?.beat || lastMeta?.beat || 'Final cliffhanger hook').replace(/^P\d+-\d+\s*·\s*/, '')
	const keySpoken = beats
		.flatMap((b) => b.lines ?? [])
		.filter((l) => l.type !== 'sfx')
		.slice(-2)
		.map((l) => `「${l.text}」`)
		.join(' ')

	const summary = `Continues from ${page.props.title} (${beats.length || metas.length} panels): from "${firstBeatSummary.slice(0, 36)}" to exit beat "${lastBeatSummary.slice(0, 42)}"${keySpoken ? ` ${keySpoken}` : ''} (exit ${exitShot}/${exitAngle} · tension ${Math.round(exitTension * 100)}%).`

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
		pageDirective: `Carry over ${page.props.title} exit frame (${exitShot}/${exitAngle}, tension ${Math.round(exitTension * 100)}%), 180° axis [${exitEyeline[0]}, ${exitEyeline[1]}], and locked assets into Page ${(page.props.pageIndex || 1) + 1}.`,
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
		sourcePage.props.title.toLowerCase().includes('interrogation')
	const isSeagull =
		outgoing.lockedAssetTags.some((t) => t.includes('gull') || t === '@kanta') ||
		sourcePage.props.stylePreset === 'shonen_water' ||
		sourcePage.props.title.toLowerCase().includes('seagull')
	const isWutai =
		outgoing.stylePreset === 'shanshui_ink' ||
		sourcePage.props.stylePreset === 'shanshui_ink' ||
		outgoing.lockedAssetTags.some((t) => t === '@ding_yuanying' || t === '@master_zhixuan') ||
		sourcePage.props.title.toLowerCase().includes('wutai')

	const eyeSign = outgoing.prevExitEyeline[0] >= 0 ? 1 : -1

	if (isWutai) {
		if (nextPageIndex === 2) {
			return {
				titleSuffix: 'Cultivation vs Awakening & Three Realms',
				scenario: 'tension',
				layoutPreset: 'std',
				environment: outgoing.environment || 'wutai-zen-hall',
				lighting: outgoing.lighting || 'ink-wash-diffused',
				directive:
					'Inherited from P1 (Ascending Wutai & The Probe): Ding Yuanying and Master Zhixuan sit over tea in the cliffside chamber, debating outward Cultivation (Xiu) vs inward Awakening (Wu), the Three Realms of Buddhism, and the metaphor of a stone cast into still water.',
				beats: [
					{
						shot: 'WS',
						angle: 'eye',
						focal: '35mm',
						focalMm: 35,
						fStop: 4.0,
						imageDataUrl: '/assets/wutai/p2_01_tea_debate.jpg',
						beat: 'P02-01 · Across a low wooden tea table before the round lattice window opening onto a sea of clouds, Ding Yuanying distinguishes outward Cultivation from inward Awakening.',
						who: ['@ding_yuanying', '@master_zhixuan'],
						assetRefs: ['#env_zen_tea_chamber', '@ding_yuanying', '@master_zhixuan'],
						mccloudTransition: 'scene_to_scene',
						wordPictureMode: 'interdependent',
						tension: 0.78,
						eyeline: [eyeSign * 20, 0],
						focalPointRel: [0.46, 0.48],
						lines: [
							{
								type: 'speech',
								text: 'Master, Cultivation is merely outward behavioral restraint—seeking outside oneself. Only Awakening is the inward realization of true nature.',
								prosody: 'Inward Awakening',
								prosodyStyle: 'seal',
								prosodyColor: '#b91c1c',
								fillColor: '#fffdf4',
								placement: 'top-left',
							},
						],
					},
					{
						shot: 'MCU',
						angle: 'eye',
						focal: '50mm',
						focalMm: 50,
						fStop: 2.8,
						imageDataUrl: '/assets/wutai/p2_02_three_realms.jpg',
						beat: 'P02-02 · Ding Yuanying dissects the Three Realms of Buddhism while three translucent ink rings of cosmic clouds, temple eaves, and mortal smoke rise behind him.',
						who: ['@ding_yuanying'],
						assetRefs: ['@ding_yuanying', '#env_zen_tea_chamber'],
						mccloudTransition: 'subject_to_subject',
						wordPictureMode: 'duo_specific',
						tension: 0.85,
						eyeline: [eyeSign * 24, -2],
						focalPointRel: [0.38, 0.44],
						lines: [
							{
								type: 'speech',
								text: 'To me, the Dharma has three tiers: profound Dao-Law as objective reality, Exoteric Teaching as moral governance, and Expedient Means as mortal consolation.',
								prosody: 'Dao · Teaching · Means',
								prosodyStyle: 'seal',
								prosodyColor: '#1e3a8a',
								fillColor: '#fffdf4',
								placement: 'top-right',
							},
						],
					},
					{
						shot: 'ECU',
						angle: 'high',
						focal: '85mm',
						focalMm: 85,
						fStop: 2.0,
						imageDataUrl: '/assets/wutai/p2_03_stone_ripples.jpg',
						beat: 'P02-03 · Metaphor Beat: a dark river pebble drops into a mirror-still lotus pond, sending concentric sumi-e ink ripples outward as it sinks into the depths.',
						who: ['@master_zhixuan'],
						assetRefs: ['#prop_poem_brush_inkstone', '@master_zhixuan', '#env_zen_tea_chamber'],
						mccloudTransition: 'aspect_to_aspect',
						wordPictureMode: 'interdependent',
						tension: 0.91,
						eyeline: [eyeSign * 16, 4],
						focalPointRel: [0.5, 0.52],
						lines: [
							{ type: 'sfx', text: 'PLOP—', placement: 'top-left' },
							{
								type: 'caption',
								text: 'Your plan to "plunder the rich to aid the poor" in Wangmiao Village is but a stone cast into still water: the stone sinks, leaving only passing ripples.',
								prosody: 'Stone in Still Water',
								prosodyStyle: 'seal',
								prosodyColor: '#0f172a',
								fillColor: '#fef9c3',
								placement: 'bottom-right',
							},
						],
					},
				],
			}
		}

		return {
			titleSuffix: 'Stone in Still Water & The Brush Awakening',
			scenario: 'climax',
			layoutPreset: 'std',
			environment: outgoing.environment || 'wutai-summit',
			lighting: outgoing.lighting || 'ink-wash-diffused',
			directive:
				`Inherited from P2 (Cultivation vs Awakening & Three Realms): Master Zhixuan exposes the illusion of "waiting, relying, and demanding" (Deng-Kao-Yao), revises two characters on Ding Yuanying's scroll with a calligrapher's brush, and sends him forth into the clearing mountain clouds.`,
			beats: [
				{
					shot: 'MS',
					angle: 'low',
					focal: '35mm',
					focalMm: 35,
					fStop: 2.8,
					imageDataUrl: '/assets/wutai/p3_01_salvation_dao.jpg',
					beat: 'P03-01 · Master Zhixuan speaks with serene authority on the stone terrace as sunlight pierces the mountain clouds, naming the true path of salvation.',
					who: ['@master_zhixuan', '@ding_yuanying'],
					assetRefs: ['#env_zen_tea_chamber', '@master_zhixuan', '@ding_yuanying'],
					mccloudTransition: 'subject_to_subject',
					wordPictureMode: 'interdependent',
					tension: 0.88,
					eyeline: [eyeSign * 22, -4],
					focalPointRel: [0.48, 0.42],
					lines: [
						{
							type: 'speech',
							text: 'True salvation lies in shattering the reflex of "waiting, relying, and demanding"! Because survival of the fittest is ruthless, the strong must bear higher moral duty.',
							prosody: 'Shatter Dependency',
							prosodyStyle: 'seal',
							prosodyColor: '#b91c1c',
							fillColor: '#fffdf4',
							placement: 'top-right',
						},
					],
				},
				{
					shot: 'ECU',
					angle: 'high',
					focal: '85mm',
					focalMm: 85,
					fStop: 1.8,
					imageDataUrl: '/assets/wutai/p3_02_brush_correction.jpg',
					beat: 'P03-02 · Extreme close-up: Master Zhixuan dips a bamboo wolf-hair brush in rich ink and alters two characters on the rice-paper scroll—turning defiance into harmony with the Dao.',
					who: ['@master_zhixuan'],
					assetRefs: ['#prop_poem_brush_inkstone', '@master_zhixuan', '#env_zen_tea_chamber'],
					mccloudTransition: 'action_to_action',
					wordPictureMode: 'duo_specific',
					tension: 0.96,
					eyeline: [eyeSign * 18, 2],
					focalPointRel: [0.52, 0.48],
					lines: [
						{ type: 'sfx', text: 'SWISH—', placement: 'top-left' },
						{
							type: 'speech',
							text: `Let this old monk revise two words: "Awakening to the Dao reveals Heaven's Mandate; Cultivation must seek the True Sutra." Karma never errs—why harbor wrath?`,
							prosody: 'Two Words Revised',
							prosodyStyle: 'seal',
							prosodyColor: '#b91c1c',
							fillColor: '#fffdf4',
							placement: 'bottom-left',
						},
					],
				},
				{
					shot: 'EWS',
					angle: 'high',
					focal: '18mm',
					focalMm: 24,
					fStop: 5.6,
					imageDataUrl: '/assets/wutai/p3_03_bow_farewell.jpg',
					beat: 'P03-03 · Vast Shan-Shui finale: golden dawn parts the sea of clouds over Wutai Mountain as Ding Yuanying bows in silent clarity on the cliffside stone steps.',
					who: ['@ding_yuanying', '@master_zhixuan'],
					assetRefs: ['@ding_yuanying', '@master_zhixuan', '#env_wutai_monastery'],
					mccloudTransition: 'scene_to_scene',
					wordPictureMode: 'additive',
					tension: 0.92,
					eyeline: [eyeSign * 26, -6],
					focalPointRel: [0.5, 0.46],
					lines: [
						{
							type: 'caption',
							text: 'Strong and weak alike abide within the karma of the Dao. There has never been a savior—only self-awakening walks the true path.',
							prosody: 'Harmony with the Dao',
							prosodyStyle: 'seal',
							prosodyColor: '#0f172a',
							fillColor: '#fef9c3',
							placement: 'top-right',
						},
					],
				},
			],
		}
	}

	if (isNoir) {
		if (nextPageIndex === 2) {
			return {
				titleSuffix: 'Hidden Negative & Footsteps in the Corridor',
				scenario: 'reveal',
				layoutPreset: 'kin',
				environment: outgoing.environment || 'interrogation-room',
				lighting: outgoing.lighting || 'rim',
				directive: 'Continuing from P1 where Lu Chen points out Deputy Chief Shen Mo behind the one-way mirror: corridor lights cut out, the watch\'s hidden negative is exposed, and heavy footsteps close in.',
				beats: [
					{
						shot: 'WS',
						angle: 'dutch',
						focal: '18mm',
						focalMm: 24,
						fStop: 4.0,
						imageDataUrl: '/assets/interrogation/panel1_establishing.jpg',
						beat: 'P02-01 · The corridor light behind the observation glass snaps off! Lightning splits the room into stark white and ink black as Lin Ye bolts upright.',
						who: ['@lu_chen', '@lin_ye'],
						assetRefs: ['#env_interrogation_room', '@lu_chen', '@lin_ye'],
						mccloudTransition: 'action_to_action',
						wordPictureMode: 'interdependent',
						tension: 0.78,
						eyeline: [eyeSign * 22, 2],
						focalPointRel: [0.46, 0.42],
						lines: [
							{ type: 'caption', text: '23:18. Behind the observation glass, the lighter flame goes dark.', placement: 'top-right' },
							{ type: 'speech', text: 'He cut the third-floor breaker... he\'s going to silence us both!', prosody: 'Panicked', placement: 'bottom-left' },
						],
					},
					{
						shot: 'ECU',
						angle: 'high',
						focal: '85mm',
						focalMm: 85,
						fStop: 2.0,
						imageDataUrl: '/assets/interrogation/panel3_watch_macro.jpg',
						beat: 'P02-02 · Lu Chen seizes the cracked silver pocket watch, thumb prying open the inner seam along the reverse scratch to reveal a micro-film roll.',
						who: ['@lu_chen'],
						assetRefs: ['#prop_pocket_watch', '@lu_chen'],
						mccloudTransition: 'subject_to_subject',
						wordPictureMode: 'duo_specific',
						tension: 0.84,
						eyeline: [eyeSign * 18, 6],
						focalPointRel: [0.5, 0.48],
						lines: [
							{ type: 'sfx', text: 'CLACK!', placement: 'top-left' },
							{ type: 'speech', text: 'Stopping at 23:17 wasn\'t impact damage—it locked this hidden compartment gear.', prosody: 'Sharp Insight', placement: 'top-right' },
						],
					},
					{
						shot: 'MCU',
						angle: 'eye',
						focal: '50mm',
						focalMm: 50,
						fStop: 2.8,
						imageDataUrl: '/assets/interrogation/panel2_cuff_probe.jpg',
						beat: 'P02-03 · Lin Ye pulls back his red-lead-stained cuff, voice dropping to a tense whisper as he points toward the corridor behind the mirror.',
						who: ['@lin_ye', '@lu_chen'],
						assetRefs: ['@lin_ye', '#prop_rust_cuff', '#env_interrogation_room'],
						mccloudTransition: 'subject_to_subject',
						wordPictureMode: 'word_specific',
						tension: 0.81,
						eyeline: [eyeSign * 20, -2],
						focalPointRel: [0.54, 0.44],
						lines: [
							{ type: 'whisper', text: 'The Pier 3 smuggling negatives are inside the movement... footsteps are coming up the hall!', prosody: 'Hushed Breath', placement: 'top-right' },
						],
					},
					{
						shot: 'CU',
						angle: 'low',
						focal: '85mm',
						focalMm: 85,
						fStop: 1.4,
						imageDataUrl: '/assets/interrogation/panel4_silent_lighter_spark.jpg',
						beat: 'P02-04 · Silent Ma Beat: the steel door handle slowly depresses; puddle water under the gap reflects the glint of a left-handed brass lighter.',
						who: ['@shen_mo'],
						assetRefs: ['@shen_mo', '#prop_brass_lighter'],
						mccloudTransition: 'aspect_to_aspect',
						wordPictureMode: 'interdependent',
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
						beat: 'P02-05 · Lu Chen slips the watch negative into his trench coat, stepping in front of Lin Ye as his gaze locks onto Deputy Chief Shen Mo entering the doorway!',
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
							caption: 'Shen Mo at the doorway',
						},
						lines: [
							{ type: 'sfx', text: 'BANG—!!', placement: 'top-left' },
							{ type: 'shout', text: 'Deputy Chief Shen—coming in person at midnight to collect this watch?!', prosody: 'Thunderous Challenge', placement: 'top-right' },
						],
					},
				],
			}
		}

		// P3 and beyond for Noir Interrogation
		return {
			titleSuffix: nextPageIndex === 3 ? 'Rain-Lashed Rooftop Showdown' : `Act ${nextPageIndex} · Final Net`,
			scenario: 'climax',
			layoutPreset: 'kin',
			environment: 'rooftop',
			lighting: 'rim',
			directive: `Continuing from P${nextPageIndex - 1}, Lu Chen and Lin Ye back onto the storm-swept precinct rooftop, using the micro-film under searchlight backlight for the final indictment.`,
			beats: [
				{
					shot: 'EWS',
					angle: 'high',
					focal: '18mm',
					focalMm: 24,
					fStop: 4.0,
					imageDataUrl: '/assets/interrogation/panel1_establishing.jpg',
					beat: `P0${nextPageIndex}-01 · Gale-force rain sweeps the 4F precinct rooftop as Pier 3 searchlights slice the night; Lu Chen and Shen Mo face off across the flooded deck.`,
					who: ['@lu_chen', '@shen_mo'],
					assetRefs: ['@lu_chen', '@shen_mo', '#env_interrogation_room'],
					mccloudTransition: 'scene_to_scene',
					wordPictureMode: 'additive',
					tension: 0.82,
					eyeline: [eyeSign * 24, 4],
					focalPointRel: [0.5, 0.45],
					lines: [
						{ type: 'caption', text: '23:25 · Precinct Rooftop. Torrential rain.', placement: 'top-right' },
					],
				},
				{
					shot: 'MCU',
					angle: 'eye',
					focal: '50mm',
					focalMm: 50,
					fStop: 2.2,
					imageDataUrl: '/assets/interrogation/panel4_silent_lighter_spark.jpg',
					beat: `P0${nextPageIndex}-02 · Shen Mo advances a step in the rain, brass lighter in his left hand, demanding the pocket-watch negative.`,
					who: ['@shen_mo'],
					assetRefs: ['@shen_mo', '#prop_brass_lighter'],
					mccloudTransition: 'subject_to_subject',
					wordPictureMode: 'interdependent',
					tension: 0.86,
					eyeline: [eyeSign * 20, 2],
					focalPointRel: [0.52, 0.44],
					lines: [
						{ type: 'speech', text: 'Lu Chen, hand over the 23:17 negative and this case closes tonight.', prosody: 'Menacing', placement: 'top-right' },
					],
				},
				{
					shot: 'ECU',
					angle: 'low',
					focal: '85mm',
					focalMm: 85,
					fStop: 1.8,
					imageDataUrl: '/assets/interrogation/panel3_watch_macro.jpg',
					beat: `P0${nextPageIndex}-03 · Silent Ma Beat: rainwater streams over the cracked silver watch as lightning illuminates the 23:17 hands and reverse scratch.`,
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
					beat: `P0${nextPageIndex}-04 · Lu Chen raises his live-transmitting police terminal as red-and-blue sirens ignite around the rooftop perimeter!`,
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
						caption: 'Witness Lin Ye\'s identification',
					},
					lines: [
						{ type: 'sfx', text: 'RUMBLE—!!', placement: 'top-left' },
						{ type: 'shout', text: 'The micro-film and your confession were just transmitted live to Internal Affairs!', prosody: 'Decisive Verdict', placement: 'top-right' },
					],
				},
			],
		}
	}

	if (isSeagull) {
		return {
			titleSuffix: nextPageIndex === 2 ? 'Headwind Dive on the Breakwater' : 'Bottle-Cap Ransom on the Sunset Roof',
			scenario: nextPageIndex === 2 ? 'action' : 'climax',
			layoutPreset: 'kin',
			environment: nextPageIndex === 2 ? 'boardwalk' : 'rooftop',
			lighting: nextPageIndex === 2 ? 'hard-noon' : 'sunset',
			directive: `Continuing from P${nextPageIndex - 1}'s gull standoff, carrying coastal high-contrast lighting and character locks into Page ${nextPageIndex}.`,
			beats: [
				{
					shot: 'WS',
					angle: 'low',
					focal: '18mm',
					imageDataUrl: '/assets/seagull/env_rocky_pier_cliff.jpg',
					beat: `P0${nextPageIndex}-01 · Sea spray erupts over the breakwater as both gulls circle high above the paper cone of fries.`,
					who: ['@gull_philosopher', '@gull_foodie'],
					assetRefs: ['#env_rocky_pier_cliff', '#prop_pier_fries_cone', '@gull_philosopher', '@gull_foodie'],
					tension: 0.72,
					eyeline: [eyeSign * 18, 4],
					lines: [{ type: 'caption', text: 'The sea wind sharpens; Round Two is about to break.', placement: 'top-right' }],
				},
				{
					shot: 'MCU',
					angle: 'eye',
					focal: '50mm',
					imageDataUrl: '/assets/seagull/char_gull_foodie.jpg',
					beat: `P0${nextPageIndex}-02 · The foodie gull tucks its wings low, eyes locked onto the golden fries.`,
					who: ['@gull_foodie'],
					assetRefs: ['@gull_foodie', '#prop_pier_fries_cone'],
					tension: 0.8,
					eyeline: [eyeSign * 22, 2],
					lines: [{ type: 'shout', text: 'The last fry is mine!', prosody: 'Diving Roar', placement: 'top-right' }],
				},
				{
					shot: 'CU',
					angle: 'high',
					focal: '85mm',
					imageDataUrl: '/assets/seagull/prop_pier_fries_cone.jpg',
					beat: `P0${nextPageIndex}-03 · Silent Ma Beat: the red-and-white paper cone teeters on the edge of the reef.`,
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
					beat: `P0${nextPageIndex}-04 · The philosopher gull deftly catches the rim of the cone, steadying it just as the wave crashes.`,
					who: ['@gull_philosopher', '@gull_foodie'],
					assetRefs: ['@gull_philosopher', '@gull_foodie', '#prop_pier_fries_cone'],
					tension: 0.9,
					eyeline: [eyeSign * 20, -2],
					lines: [
						{ type: 'sfx', text: 'SPLASH—!', placement: 'top-left' },
						{ type: 'speech', text: 'Keeping lunch dry in a storm—that is true philosophy.', prosody: 'Calm & Composed', placement: 'bottom-left' },
					],
				},
			],
		}
	}

	// Generic continuation template for any custom story (always locks active #env_* + @char + #prop assets)
	const genericEnvTag = outgoing.lockedAssetTags.find((t) => t.startsWith('#env')) || `#env_${(outgoing.environment || 'scene').replace(/[^a-z0-9_]+/gi, '_').toLowerCase()}`
	const genericAllLocks = Array.from(new Set([genericEnvTag, ...outgoing.lockedAssetTags]))
	return {
		titleSuffix: `Page ${nextPageIndex} · Continuity Extension`,
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
				beat: `P0${nextPageIndex}-01 · Picking up from the previous exit frame (${outgoing.prevExitShot}/${outgoing.prevExitAngle}), the tension tightens.`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')).slice(0, 2),
				assetRefs: genericAllLocks,
				tension: 0.68,
				eyeline: [eyeSign * 18, 2],
				lines: [{ type: 'caption', text: outgoing.prevPageSummary.slice(0, 34), placement: 'top-right' }],
			},
			{
				shot: 'MCU',
				angle: 'eye',
				focal: '50mm',
				beat: `P0${nextPageIndex}-02 · The lead confronts the core clue with a sharp counter-gaze.`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')).slice(0, 1),
				assetRefs: genericAllLocks,
				tension: 0.78,
				eyeline: [eyeSign * 22, 0],
				lines: [{ type: 'speech', text: 'Every clue pointed from the start to the flaw left on the previous page.', prosody: 'Steady Pressing', placement: 'top-right' }],
			},
			{
				shot: 'CU',
				angle: 'low',
				focal: '85mm',
				beat: `P0${nextPageIndex}-03 · Silent Ma Beat: extreme close-up on the key evidence as breath freezes along the shadow line.`,
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
				beat: `P0${nextPageIndex}-04 · The tables turn sharply, launching a cliffhanger hook toward the next page.`,
				who: outgoing.lockedAssetTags.filter((t) => t.startsWith('@')),
				assetRefs: genericAllLocks,
				tension: 0.94,
				eyeline: [eyeSign * 26, -2],
				lines: [
					{ type: 'sfx', text: 'BANG—!', placement: 'top-left' },
					{ type: 'shout', text: 'The true mastermind has only just stepped into the light!', prosody: 'Thunderous Reveal', placement: 'top-right' },
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
		throw new Error('No source manga page found on canvas to extend')
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
	const newTitle = `Ch.${chapterIdx} · P${nextPageIndex} · ${template.titleSuffix}`

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
			subtitle: `${layout.panels.length} Panels · From P${sourcePage.props.pageIndex || 1} · JEV ${Math.round(finalScore * 100)}`,
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
		message: `Extended "${newTitle}" from P${sourcePage.props.pageIndex || 1}: inherited ${nextContext.lockedAssetTags.length} locked assets (${nextContext.lockedAssetTags.slice(0, 4).join(' ')}) and 180° exit axis (${nextContext.prevExitShot}/${nextContext.prevExitAngle})`,
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
			subtitle: `${layout.panels.length} Panels · Context Synced · JEV ${Math.round(finalScore * 100)}`,
		},
	})

	spawnPageBubbles(editor, page.id, layout, repaired, metas)
	return `Saved inherited context for ${page.props.title} (${nextCtx.lockedAssetTags.length} locked assets) and recompiled (JEV ${Math.round(finalScore * 100)})`
}

export function cloneVariantPage(editor: Editor, sourcePageId?: TLShapeId): string {
	const page =
		(sourcePageId ? (editor.getShape(sourcePageId) as MangaContainer | undefined) : undefined) ??
		selectedPages(editor)[0]
	if (!page) return 'Select a page to duplicate as a layout variant'

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
			title: `${page.props.title} · Variant`,
			subtitle: `${layout.panels.length} Panels · Variant JEV ${Math.round(judged.score * 100)}`,
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
	return `Cloned layout variant for "${page.props.title}" (JEV ${Math.round(judged.score * 100)})`
}

/**
 * Story-agnostic Stage 1 Asset Registry Builder:
 * Dynamically aggregates all locked `MangaCard` reference sheets on the canvas (`@char`, `#env`, `#prop`)
 * together with any matching universal preset assets and backfills missing tags so ANY story on the canvas
 * has a complete Stage 1 `AssetRegistry` with multi-image `referenceImagePaths` for Stage 4 I2I rendering.
 */
export function buildCanvasAssetRegistryForPage(
	editor: Editor | null,
	page: MangaContainer,
	ctx: PagePipelineContext,
): AssetRegistry {
	const activeStylePreset = ctx.stylePreset || page.props.stylePreset || 'shanshui_ink'
	const registry = createAssetRegistry(`canvas-${page.id}`, {
		preset: activeStylePreset,
		lighting: `${ctx.lighting || page.props.lighting} · ${ctx.worldRules || page.props.worldRules || 'Consistent lighting'}`,
	})

	// 1. Seed baseline assets from the one universal preset whose style matches this page, so
	// built-in tags resolve their canonical sheets without leaking unrelated stories' assets
	// into a document that never loaded them (the registry stays scoped to this page's story).
	const matchingPreset = Object.values(UNIVERSAL_STORY_PRESETS).find((preset) => preset.stylePreset === activeStylePreset)
	if (matchingPreset) {
		const presetReg = registryForPreset(matchingPreset)
		for (const [tag, asset] of Object.entries(presetReg.assets)) {
			registry.assets[tag] = { ...asset }
		}
	}

	// 2. Override / extend with live `MangaCard` reference asset cards placed on the canvas by the user or Stage 1
	if (editor) {
		const cards = editor
			.getCurrentPageShapes()
			.filter((s): s is MangaCard => s.type === CARD && Boolean(s.props.tag))
		for (const card of cards) {
			const rawTag = card.props.tag.trim()
			if (!rawTag) continue
			const tag = rawTag.startsWith('@') || rawTag.startsWith('#') ? rawTag : `@${rawTag}`
			const category = categoryForTag(tag)
			const existing = registry.assets[tag]
			registry.assets[tag] = {
				assetId: `canvas_asset_${tag.replace(/^[@#]/, '')}`,
				tag,
				name: card.props.title || existing?.name || tag,
				category,
				fileName: existing?.fileName || `asset_${category}_${tag.replace(/^[@#]/, '')}.png`,
				filePath: card.props.imageDataUrl || existing?.filePath || `/assets/stage1/asset_${category}_${tag.replace(/^[@#]/, '')}.png`,
				visualLockTokens: card.props.body || existing?.visualLockTokens || `${card.props.title} (${tag})`,
				viewsIncluded: existing?.viewsIncluded ?? ['front', 'three-quarter'],
				approved: true,
			}
		}
	}

	// 3. Ensure the page's active fixed scene environment has a dedicated `#env_*` asset in the registry
	const envSlug = (ctx.environment || page.props.environment || 'scene_interior').replace(/[^a-z0-9_]+/gi, '_').toLowerCase()
	const hasActiveEnvTag = ctx.lockedAssetTags.some((t) => t.startsWith('#env') && registry.assets[t])
	if (!hasActiveEnvTag) {
		const envTag = `#env_${envSlug}`
		if (!registry.assets[envTag]) {
			registry.assets[envTag] = {
				assetId: `asset_env_${envSlug}`,
				tag: envTag,
				name: `Fixed Scene Environment (${ctx.environment || page.props.environment})`,
				category: 'environment',
				fileName: `asset_env_${envSlug}.png`,
				filePath: `/assets/stage1/asset_env_${envSlug}.png`,
				visualLockTokens: `Fixed scene environment: ${ctx.environment || page.props.environment}, lighting: ${ctx.lighting || page.props.lighting}, world rules: ${ctx.worldRules || page.props.worldRules}`,
				viewsIncluded: ['establishing-wide', 'reverse-angle'],
				approved: true,
			}
		}
	}

	// 4. Backfill any custom user tags referenced in lockedAssetTags so Stage 4 never drops a tag
	verifyAssetRegistryAndBackfill(ctx.lockedAssetTags, registry)
	return registry
}

/**
 * Spawn or update Stage 1 Reference Asset Sheet cards directly on the canvas to the left of Page 1
 * (and optionally generate missing reference sheet images via `askImage`), working for ANY story.
 */
export async function spawnStage1AssetSheetCardsOnCanvas(
	editor: Editor,
	page?: MangaContainer,
	generateMissingImages = false,
): Promise<string> {
	const targetPage = page ?? selectedPages(editor)[0]
	if (!targetPage) return 'Select a page first to materialize its Stage 1 Reference Asset Sheets'
	const ctx = readPageContext(editor, targetPage)
	const registry = buildCanvasAssetRegistryForPage(editor, targetPage, ctx)
	const existingCards = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaCard => s.type === CARD)

	const activeTags = Array.from(
		new Set([
			...ctx.lockedAssetTags,
			...Object.keys(registry.assets).filter((t) => ctx.lockedAssetTags.includes(t)),
		]),
	)
	let spawned = 0
	for (let i = 0; i < activeTags.length; i += 1) {
		const tag = activeTags[i]
		const asset = registry.assets[tag]
		if (!asset) continue
		const col = i % 2
		const row = Math.floor(i / 2)
		const x = targetPage.x - 640 + col * 304
		const y = targetPage.y + row * 296
		let imgUrl = asset.filePath.startsWith('/assets/stage1/') ? '' : asset.filePath
		if (!imgUrl && generateMissingImages) {
			const sheetPrompt = `Stage 1 Canonical Reference Turnaround Sheet for ${asset.tag} (${asset.name}, ${asset.category}): ${asset.visualLockTokens}. Clean character/environment/prop concept sheet, neutral parchment background, no text or speech bubbles.`
			imgUrl = await askImage(sheetPrompt, '4:3')
		}
		const found = existingCards.find((c) => c.props.tag === tag)
		if (found) {
			editor.updateShape<MangaCard>({
				id: found.id,
				type: CARD,
				props: {
					title: asset.name,
					body: asset.visualLockTokens,
					locked: true,
					imageDataUrl: imgUrl || found.props.imageDataUrl,
					aiStatus: `Stage 1 Locked · ${asset.category.toUpperCase()}`,
				},
			})
		} else {
			const id = createShapeId(`stage1-asset-${tag.replace(/^[@#]/, '')}`)
			editor.createShape<MangaCard>({
				id,
				type: CARD,
				x,
				y,
				props: {
					w: 288,
					h: 276,
					kind: asset.category === 'character' ? 'character' : 'image',
					title: asset.name,
					tag: asset.tag,
					body: asset.visualLockTokens,
					voice: asset.fileName,
					locked: true,
					imageDataUrl: imgUrl,
					customPrompt: '',
					aiStatus: `Stage 1 Canonical Sheet · ${asset.category.toUpperCase()}`,
				},
			})
			spawned += 1
		}
	}
	return `Materialized ${activeTags.length} Stage 1 Reference Asset Sheet cards (${spawned} new) for ${targetPage.props.title}`
}

export async function regenerateSelectedPanel(
	editor: Editor,
	page: MangaContainer,
	panelIndex?: number,
): Promise<string> {
	const idx = panelIndex ?? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0)
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	const target = metas[idx]
	if (!target) return 'Target panel not found'

	const ctx = readPageContext(editor, page)
	const registry = buildCanvasAssetRegistryForPage(editor, page, ctx)
	const beat: Beat = beats[idx] ?? {
		shot: target.shot,
		angle: target.angle,
		focal: target.focal,
		beat: target.beat,
		who: target.who,
		assetRefs: target.assetRefs?.length ? target.assetRefs : ctx.lockedAssetTags.slice(0, 3),
		silent: target.silent,
	}
	const stage4 = compileStage4PureArtSpec({
		panelIndex: idx,
		beat,
		meta: target,
		panelPts: [
			[0, 0],
			[320, 0],
			[320, 220],
			[0, 220],
		],
		registry,
		environment: target.environment || page.props.environment,
		lighting: page.props.lighting,
	})
	const remoteUrl = await askImage(stage4.pureCameraPrompt, target.aspect, stage4.referenceImagePaths)
	metas[idx] = {
		...target,
		assetRefs: stage4.assetTags,
		imageSeed: `${target.imageSeed}-ai-${Date.now().toString(36).slice(-3)}`,
		imageDataUrl: remoteUrl || target.imageDataUrl,
	}
	editor.updateShape<MangaContainer>({
		id: page.id,
		type: CONTAINER,
		props: { panelsJson: JSON.stringify(metas), selectedPanel: idx },
	})
	return `Redrew Panel #${idx + 1} (${target.shot}/${target.focal}) via Multi-Image I2I [${stage4.assetTags.join(' + ')} → ${stage4.referenceImagePaths.length} ref sheets]`
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
	const wutaiUrls = [
		'/assets/wutai/p1_01_mountain_mist.jpg',
		'/assets/wutai/p1_02_offering_poem.jpg',
		'/assets/wutai/p1_03_master_zhixuan.jpg',
		'/assets/wutai/p2_01_tea_debate.jpg',
		'/assets/wutai/p2_02_three_realms.jpg',
		'/assets/wutai/p2_03_stone_ripples.jpg',
		'/assets/wutai/p3_01_salvation_dao.jpg',
		'/assets/wutai/p3_02_brush_correction.jpg',
		'/assets/wutai/p3_03_bow_farewell.jpg',
	]
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const target = metas[panelIndex]
	if (!target) return 'Target panel not found'
	const isWutai = page.props.stylePreset === 'shanshui_ink' || page.props.title.toLowerCase().includes('wutai')
	const isSeagull = page.props.stylePreset === 'shonen_water' || page.props.title.toLowerCase().includes('seagull')
	const pool = isWutai ? wutaiUrls : isSeagull ? seagullUrls : noirUrls
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
	return `Loaded studio illustration into Panel #${panelIndex + 1}`
}

export function resetPanelTransformOnPage(editor: Editor, page: MangaContainer, panelIndex: number): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	if (!metas[panelIndex]) return 'Target panel not found'
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
	return `Reset Panel #${panelIndex + 1} pan, zoom (100%), and rotation (0°)`
}

export function rotatePanelImageOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
	deltaOrReset: number | 'reset',
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const target = metas[panelIndex]
	if (!target) return 'Target panel not found'
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
	return `Set Panel #${panelIndex + 1} artwork rotation to ${nextRot}°`
}

export function togglePanelSubsplitOnPage(
	editor: Editor,
	page: MangaContainer,
	panelIndex: number,
): string {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const beats = readJson<Beat[]>(page.props.scriptJson, [])
	const target = metas[panelIndex]
	if (!target) return 'Target panel not found'

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
				caption: `${firstCharTag} Reaction CU`,
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
		? `Disabled PiP inset on Panel #${panelIndex + 1}`
		: `Enabled PiP reaction inset on Panel #${panelIndex + 1} (${firstCharTag})`
}

export function bindCardToPageContext(
	editor: Editor,
	card: MangaCard,
	targetPage?: MangaContainer,
): string {
	const page = targetPage ?? selectedPages(editor)[0]
	if (!page) return 'No target page found on canvas'
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
	return `Locked "${card.props.title} (${normalizedTag})" and injected into ${page.props.title} context`
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
		title: `Ch.1 · P${nextIdx}`,
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
	return `Aligned all ${pages.length} pages horizontally in pipeline order (P1 → P${pages.length})`
}
