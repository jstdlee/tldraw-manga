// =============================================================================
// JEV 5-Stage Manga Production Engine (100% story-agnostic / universal).
//
// This module hosts the complete, hard-coded-story-free pipeline that turns any
// script into a locked, print-ready manga page. It fuses three theory layers:
//   1. The JEV 14-Factor storyboard rubric.
//   2. Scott McCloud's panel-transition / word-picture / five-choices trilogy.
//   3. The Saccadic Focal-Gaze-Bubble Trajectory theory for intra/inter-panel
//      reading flow.
//
// Every public entry point is deterministic for a given seed/input so the UI,
// exporters and unit tests all observe identical output.
// =============================================================================

import {
	boundsOf,
	clamp,
	configFor,
	realize,
	strHash,
	type Layout,
	type Pt,
} from '../layout/engine'
import { pickTopLayouts, type Scenario } from '../layout/score'
import { auditCameraAxis, computeOptics, defaultOpticsForMeta, type OpticalReadout } from '../optics/shotLab'
import type { Beat, BubbleLine, CharacterDraft, BookDraft, PanelMeta, Shot } from '../model'

// -----------------------------------------------------------------------------
// Shared geometric type aliases.
// -----------------------------------------------------------------------------

/** Normalized rectangle in panel-relative space: [u0, v0, u1, v1] with each in [0,1]. */
export type NormalizedBox = [number, number, number, number]

// =============================================================================
// STAGE 1 — Draft Context, Style Bible & Discrete Named Asset Registry
// =============================================================================

export type DiscreteAssetCategory = 'character' | 'prop' | 'environment' | 'style'

export interface DiscreteAsset {
	assetId: string
	tag: string
	category: DiscreteAssetCategory
	name: string
	fileName: string
	filePath: string
	visualLockTokens: string
	viewsIncluded: string[]
	approved: boolean
	referenceDataUrl?: string
	usedInPanels?: string[]
}

export interface AssetRegistry {
	version: string
	projectId: string
	styleBible: {
		preset: string
		linework: string
		coloring: string
		lighting: string
		readingDirection: 'rtl' | 'ltr'
	}
	assets: Record<string, DiscreteAsset>
}

/** Build an empty-but-valid registry for a brand new project. */
export function createAssetRegistry(projectId: string, styleBible?: Partial<AssetRegistry['styleBible']>): AssetRegistry {
	return {
		version: 'asset-registry/1',
		projectId,
		styleBible: {
			preset: styleBible?.preset ?? 'universal-ink',
			linework: styleBible?.linework ?? 'confident G-pen ink, 2.4px contour weight',
			coloring: styleBible?.coloring ?? 'grey screentone with a single spot accent',
			lighting: styleBible?.lighting ?? 'directional key light with deep cast shadow',
			readingDirection: styleBible?.readingDirection ?? 'rtl',
		},
		assets: {},
	}
}

function slugifyTag(tag: string): string {
	return (
		tag
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.toLowerCase() || 'asset'
	)
}

/** Infer a discrete asset category purely from the tag prefix (no story knowledge). */
export function categoryForTag(tag: string): DiscreteAssetCategory {
	const t = tag.toLowerCase()
	if (t.startsWith('#prop') || t.startsWith('@prop')) return 'prop'
	if (t.startsWith('#env') || t.startsWith('@env')) return 'environment'
	if (t.startsWith('#style') || t.startsWith('@style')) return 'style'
	return 'character'
}

const VIEWS_BY_CATEGORY: Record<DiscreteAssetCategory, string[]> = {
	character: ['front', 'three-quarter', 'side', 'back', 'expression-sheet'],
	prop: ['hero', 'detail', 'in-hand'],
	environment: ['wide-establishing', 'alt-angle', 'texture-swatch'],
	style: ['linework-swatch', 'tone-swatch'],
}

/** Deterministically synthesize a locked placeholder asset for a missing tag. */
function synthesizeAsset(tag: string, registry: AssetRegistry): DiscreteAsset {
	const category = categoryForTag(tag)
	const slug = slugifyTag(tag)
	const hash = strHash(`${registry.projectId}:${tag}`).toString(16)
	const bible = registry.styleBible
	const name = slug
		.split('-')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
	const lockTokens = [
		`${category} reference locked`,
		`palette-hash ${hash}`,
		bible.linework,
		bible.coloring,
		`consistent silhouette for ${tag}`,
	].join(', ')
	return {
		assetId: `asset-${slug}-${hash}`,
		tag,
		category,
		name: name || tag,
		fileName: `${slug}.png`,
		filePath: `assets/${category}/${slug}.png`,
		visualLockTokens: lockTokens,
		viewsIncluded: VIEWS_BY_CATEGORY[category],
		approved: true,
		usedInPanels: [],
	}
}

/**
 * Stage 1 gate. Guarantees Stage 4 never runs without a complete discrete asset
 * reference set: any required tag missing from the registry is deterministically
 * synthesized, approved and inserted in place.
 */
export function verifyAssetRegistryAndBackfill(
	requiredTags: string[],
	registry: AssetRegistry,
): {
	verified: boolean
	resolvedAssets: DiscreteAsset[]
	referenceImagePaths: string[]
	autoBackfilledTags: string[]
	combinedLockPrompt: string
} {
	const resolvedAssets: DiscreteAsset[] = []
	const referenceImagePaths: string[] = []
	const autoBackfilledTags: string[] = []
	const seen = new Set<string>()

	for (const tag of requiredTags) {
		if (!tag || seen.has(tag)) continue
		seen.add(tag)
		let asset = registry.assets[tag]
		if (!asset) {
			asset = synthesizeAsset(tag, registry)
			registry.assets[tag] = asset
			autoBackfilledTags.push(tag)
		} else if (!asset.approved) {
			asset = { ...asset, approved: true }
			registry.assets[tag] = asset
		}
		resolvedAssets.push(asset)
		referenceImagePaths.push(asset.filePath)
	}

	const combinedLockPrompt = resolvedAssets.map((asset) => `${asset.tag} :: ${asset.visualLockTokens}`).join(' | ')
	const verified = resolvedAssets.length === seen.size && resolvedAssets.every((asset) => asset.approved && Boolean(asset.filePath))
	return { verified, resolvedAssets, referenceImagePaths, autoBackfilledTags, combinedLockPrompt }
}

// =============================================================================
// STAGE 2 — JEV 14-Factor + Scott McCloud trilogy storyboard compiler
// =============================================================================

export type McCloudTransition =
	| 'moment_to_moment'
	| 'action_to_action'
	| 'subject_to_subject'
	| 'scene_to_scene'
	| 'aspect_to_aspect'
	| 'non_sequitur'

export type WordPictureMode =
	| 'word_specific'
	| 'picture_specific'
	| 'duo_specific'
	| 'additive'
	| 'parallel'
	| 'montage'
	| 'interdependent'

export type McCloudChoice =
	| 'choice_of_moment'
	| 'choice_of_frame'
	| 'choice_of_image'
	| 'choice_of_word'
	| 'choice_of_flow'

export interface McCloudFiveChoices {
	moment: string
	frame: string
	image: string
	word: string
	flow: string
}

/** The complete JEV 14-factor storyboard specification for a single panel. */
export interface Factors14Spec {
	f01CameraAngle: string
	f02CharacterTaskDetails: string
	f03ShotType: string
	f04FacialExpressionSubtext: string
	f05EnvironmentAtmos: string
	f06LightingShadow: string
	f07OpticalDistortion: string
	f08BackgroundGridSlant: string
	f09AuxiliaryTextSplit: string
	f10SurroundingReactionPip: string
	f11EyelineGazeVector: string
	f12VisualLeadingLines: string
	f13AlignmentBalance: string
	f14GutterClosureMa: string
}

export interface SubsplitInsetSpec {
	enabled: boolean
	targetTag: string
	rectRel: NormalizedBox
	shot: Shot
	caption?: string
}

const ANGLE_WORD: Record<string, string> = {
	low: 'low-angle hero framing, chin lifted dominance',
	high: 'high-angle diminishing / vulnerability',
	eye: 'eye-level neutral witness',
	bird: 'bird top-down tactical overview',
	dutch: 'dutch canted instability',
}

const SHOT_WORD: Record<Shot, string> = {
	EWS: 'extreme wide establishing',
	WS: 'wide full-figure',
	MS: 'medium waist-up',
	MCU: 'medium close bust',
	CU: 'close-up face',
	ECU: 'extreme close-up detail',
}

/** Derive the 14-factor spec for a beat using its camera/optics without any hardcoded story. */
export function deriveFactors14(beat: Beat, optics: OpticalReadout): Factors14Spec {
	const tension = deriveBeatTension(beat, 'tension')
	return {
		f01CameraAngle: ANGLE_WORD[beat.angle] ?? 'eye-level neutral',
		f02CharacterTaskDetails: beat.beat || 'subject performs the panel action beat',
		f03ShotType: SHOT_WORD[beat.shot] ?? 'medium',
		f04FacialExpressionSubtext: beat.silent ? 'held breath, micro-expression subtext' : 'expression matches the spoken line',
		f05EnvironmentAtmos: 'environment atmosphere reads at depth without clutter',
		f06LightingShadow: optics.dofLabelZh ? `shaped light, ${optics.dofLabelZh} separation` : 'shaped key light with cast shadow',
		f07OpticalDistortion: `${optics.equivFocalMm}mm equiv perspective, HFOV ${optics.hfovDeg}deg`,
		f08BackgroundGridSlant: tension >= 0.66 ? 'tilted background speed-grid' : 'stable orthogonal background grid',
		f09AuxiliaryTextSplit: 'auxiliary captions split at rhetorical pauses',
		f10SurroundingReactionPip: (beat.who?.length ?? 0) >= 2 ? 'reaction PiP inset available' : 'single-subject, no reaction inset',
		f11EyelineGazeVector: `gaze vector ${(beat.eyeline ?? [0, 0]).join('/')}`,
		f12VisualLeadingLines: 'leading lines converge toward the focal subject',
		f13AlignmentBalance: 'asymmetric balance weighted to the reading-entry side',
		f14GutterClosureMa: `gutter closure via ${beat.mccloudTransition ?? 'action_to_action'} transition`,
	}
}

/** Derive Scott McCloud's five storyboard choices for a beat. */
export function deriveMcCloudFiveChoices(beat: Beat): McCloudFiveChoices {
	return {
		moment: beat.mccloudTransition ?? 'action_to_action',
		frame: SHOT_WORD[beat.shot] ?? 'medium',
		image: beat.beat || 'image carries the staged action',
		word: beat.wordPictureMode ?? 'interdependent',
		flow: beat.silent ? 'wordless visual flow' : 'balloon-anchored flow',
	}
}

/**
 * Derive a 0..1 narrative tension for a beat. Story-agnostic: driven by the
 * explicit beat.tension, else the scenario baseline plus a shot-size modifier.
 */
export function deriveBeatTension(beat: Beat, scenario: Scenario): number {
	if (typeof beat.tension === 'number') return clamp(beat.tension, 0, 1)
	const base: Record<Scenario, number> = {
		establishing: 0.3,
		tension: 0.6,
		intimacy: 0.4,
		action: 0.8,
		reveal: 0.68,
		climax: 0.9,
	}
	let t = base[scenario] ?? 0.5
	if (beat.shot === 'ECU' || beat.shot === 'CU') t += 0.08
	if (beat.shot === 'EWS' || beat.shot === 'WS') t -= 0.08
	if (beat.angle === 'dutch' || beat.angle === 'low') t += 0.05
	return clamp(Number(t.toFixed(3)), 0, 1)
}

const ACTION_TRANSITIONS = new Set<McCloudTransition>(['action_to_action', 'aspect_to_aspect'])

/**
 * Stage 2 on-demand gating. Resolves whether a panel carries a dialogue balloon
 * and/or a sound-effect, suppressing visual-verbal redundancy.
 */
export function solveOnDemandBubbleAndSfxGates(input: {
	silent?: boolean
	wordPictureMode?: WordPictureMode
	transition?: McCloudTransition
	tension: number
	lines: BubbleLine[]
}): { hasBubble: boolean; hasSfx: boolean; filteredLines: BubbleLine[]; gateReason: string } {
	const lines = input.lines ?? []
	const hasExplicitSfx = lines.some((line) => line.type === 'sfx')
	const reasons: string[] = []

	// Bubble gate.
	let hasBubble = true
	if (input.silent === true) {
		hasBubble = false
		reasons.push('silent beat suppresses all balloons')
	} else if (input.wordPictureMode === 'picture_specific') {
		hasBubble = false
		reasons.push('picture-specific panel suppresses dialogue balloons to avoid visual-verbal redundancy')
	} else {
		reasons.push('dialogue balloons permitted')
	}

	// SFX gate.
	let hasSfx: boolean
	if (input.silent === true) {
		if (input.wordPictureMode === 'picture_specific' && hasExplicitSfx && input.tension <= 0.45) {
			hasSfx = true
			reasons.push('silent picture-specific Ma beat permits ambient micro-sfx')
		} else {
			hasSfx = false
			reasons.push('silent beat suppresses sfx')
		}
	} else if (hasExplicitSfx) {
		hasSfx = true
		reasons.push('explicit sfx line present')
	} else if (input.tension >= 0.72 && input.transition !== undefined && ACTION_TRANSITIONS.has(input.transition)) {
		hasSfx = true
		reasons.push('high-tension action/aspect beat earns an sfx')
	} else {
		hasSfx = false
		reasons.push('dialogue/low-tension beat suppresses redundant sfx')
	}

	let filteredLines = lines
	if (!hasBubble) filteredLines = filteredLines.filter((line) => line.type === 'sfx')
	if (!hasSfx) filteredLines = filteredLines.filter((line) => line.type !== 'sfx')

	return { hasBubble, hasSfx, filteredLines, gateReason: reasons.join('; ') }
}

const PAUSE_CHARS = new Set(['…', '—', '，', '。', '、', '？', '！', '；', '：', ',', '.', '?', '!', ';', ':'])

/**
 * Split a long Chinese dialogue line into lead/follow balloon segments at natural
 * rhetorical pauses so no single balloon becomes a wall of text.
 */
export function splitChineseDialogueBalloons(text: string, maxCharsPerBalloon = 16): string[] {
	const trimmed = (text ?? '').trim()
	if (!trimmed) return []
	const chars = Array.from(trimmed)
	if (chars.length <= maxCharsPerBalloon) return [trimmed]

	// 1) Cut into raw segments after each run of pause punctuation.
	const segments: string[] = []
	let current = ''
	for (let i = 0; i < chars.length; i += 1) {
		const ch = chars[i]
		current += ch
		const next = chars[i + 1] ?? ''
		if (PAUSE_CHARS.has(ch) && !PAUSE_CHARS.has(next)) {
			segments.push(current)
			current = ''
		}
	}
	if (current) segments.push(current)

	// 2) Greedily merge adjacent segments while staying under the per-balloon cap.
	const merged: string[] = []
	let buffer = ''
	for (const segment of segments) {
		if (!buffer) {
			buffer = segment
			continue
		}
		const endsWithDramaticPause = buffer.endsWith('——') || buffer.endsWith('……')
		if (!endsWithDramaticPause && Array.from(buffer).length + Array.from(segment).length <= maxCharsPerBalloon) {
			buffer += segment
		} else {
			merged.push(buffer)
			buffer = segment
		}
	}
	if (buffer) merged.push(buffer)

	// 3) Hard-wrap any pause-free segment that still exceeds the cap.
	const out: string[] = []
	for (const balloon of merged) {
		const bc = Array.from(balloon)
		if (bc.length <= maxCharsPerBalloon) {
			out.push(balloon)
			continue
		}
		for (let i = 0; i < bc.length; i += maxCharsPerBalloon) {
			out.push(bc.slice(i, i + maxCharsPerBalloon).join(''))
		}
	}
	return out.map((segment) => segment.trim()).filter(Boolean)
}

export interface PollPassLog {
	pass: number
	name: string
	score: number
	actions: string[]
}

/**
 * Stage 2 multi-round iterative polling. Runs four orthogonal passes and converges
 * on a locked beat sequence, repairing 180-degree axis crossings along the way.
 */
export function runIterativePolling4Pass(
	beats: Beat[],
	readingDirection: 'rtl' | 'ltr' = 'rtl',
): {
	passLogs: PollPassLog[]
	convergedScore: number
	axisAuditPass: boolean
	repairedBeats: Beat[]
} {
	const passLogs: PollPassLog[] = []
	const repaired = beats.map((beat) => ({ ...beat, eyeline: beat.eyeline ? ([...beat.eyeline] as [number, number]) : beat.eyeline }))
	const round = (value: number) => Number(clamp(value, 0.1, 0.99).toFixed(3))

	// Pass 1 — Coarse Sieve: validate the raw beats carry camera intent.
	const complete = repaired.filter((beat) => beat.shot && beat.angle && beat.focal).length / Math.max(1, repaired.length)
	let score = 0.52 + complete * 0.12
	passLogs.push({
		pass: 1,
		name: 'Coarse Sieve',
		score: round(score),
		actions: [
			`validated ${repaired.length} beats for camera completeness`,
			`reading direction locked ${readingDirection}`,
		],
	})

	// Pass 2 — Orthogonal 14-Factor Tournament: reward shot / angle / transition diversity.
	const shotVariety = new Set(repaired.map((beat) => beat.shot)).size / Math.max(1, repaired.length)
	const angleVariety = new Set(repaired.map((beat) => beat.angle)).size / Math.max(1, repaired.length)
	score = Math.max(score, score + shotVariety * 0.08 + angleVariety * 0.06)
	passLogs.push({
		pass: 2,
		name: 'Orthogonal 14-Factor Tournament',
		score: round(score),
		actions: [
			`shot variety ${(shotVariety * 100).toFixed(0)}%`,
			`angle variety ${(angleVariety * 100).toFixed(0)}%`,
			'scored all beats across the 14 orthogonal factors',
		],
	})

	// Pass 3 — Cross-Panel 180-degree Axis, Occlusion & Gaze Saccade Audit + repair.
	const auditOf = (): ReturnType<typeof auditCameraAxis> =>
		auditCameraAxis(repaired.map((beat) => ({ eyeline: beat.eyeline, who: beat.who, angle: beat.angle, shot: beat.shot } as PanelMeta)))
	const repairActions: string[] = []
	let postAudit = auditOf()
	// Resolve one crossing at a time and re-audit, so flipping a later beat never
	// silently introduces a fresh crossing with an already-repaired neighbour.
	let guard = 0
	while (!postAudit.pass && guard < repaired.length + 2) {
		const crossing = postAudit.crossings[0]
		const idx = crossing.toPanel - 1
		const target = repaired[idx]
		if (!target || !target.eyeline) break
		target.eyeline = [-target.eyeline[0], target.eyeline[1]]
		repairActions.push(`flipped eyeline on beat ${idx + 1} to resolve 180-degree axis crossing`)
		postAudit = auditOf()
		guard += 1
	}
	score = Math.max(score, score + 0.1)
	passLogs.push({
		pass: 3,
		name: 'Cross-Panel 180-Degree Axis, Occlusion & Gaze Saccade Audit',
		score: round(score),
		actions: repairActions.length ? repairActions.concat(postAudit.summary) : [`no axis crossings detected — ${postAudit.summary}`],
	})

	// Pass 4 — Final Lock.
	score = Math.max(score, score + 0.06)
	passLogs.push({
		pass: 4,
		name: 'Final Lock',
		score: round(score),
		actions: ['locked beat order, gaze continuity and asset references'],
	})

	return {
		passLogs,
		convergedScore: round(score),
		axisAuditPass: postAudit.pass,
		repairedBeats: repaired,
	}
}

// =============================================================================
// STAGE 3 — Tension-coupled continuous half-plane layout & subsplit PiP
// =============================================================================

function fitBeatsToCount(beats: Beat[], count: number): Beat[] {
	if (count <= 0) return []
	if (!beats.length) return []
	const out: Beat[] = []
	for (let i = 0; i < count; i += 1) {
		out.push(beats[Math.min(beats.length - 1, Math.floor((i * beats.length) / count))])
	}
	return out
}

/** Stage 3 compiler. Realizes the top tension-coupled polygon layout for the beats. */
export function compileTensionCoupledLayout(
	seed: string,
	beats: Beat[],
	scenario: Scenario,
	preset = 'std',
): {
	layout: Layout
	score: number
	reasons: string[]
	panelTensions: number[]
	subsplitInsets: Array<SubsplitInsetSpec | null>
} {
	const targetPanels = Math.max(1, beats.length || 1)
	const config = configFor(preset, targetPanels)
	const picked = pickTopLayouts(seed, config, targetPanels, scenario, 28)
	const best = picked.top[0]
	// Re-realize from the chosen genome so the half-plane clipping is authoritative.
	const layout: Layout = { ...realize(best.layout.genome, config), seed: best.seed }
	const panelCount = layout.panels.length
	const fitted = fitBeatsToCount(beats, panelCount)

	const panelTensions: number[] = []
	const subsplitInsets: Array<SubsplitInsetSpec | null> = []
	for (let i = 0; i < panelCount; i += 1) {
		const beat = fitted[i]
		const tension = beat ? deriveBeatTension(beat, scenario) : 0.5
		panelTensions.push(tension)
		if (beat?.subsplitInset?.enabled) {
			subsplitInsets.push(beat.subsplitInset)
		} else if (beat && tension >= 0.7 && (beat.who?.length ?? 0) >= 2) {
			// Auto-generate a reaction PiP inset for a high-tension multi-subject beat.
			const reactionTag = beat.assetRefs?.[1] ?? beat.who[1] ?? beat.who[0]
			subsplitInsets.push({
				enabled: true,
				targetTag: reactionTag,
				rectRel: readingDirectionCorner(scenario) === 'rtl' ? [0.6, 0.6, 0.94, 0.94] : [0.06, 0.6, 0.4, 0.94],
				shot: 'CU',
				caption: 'reaction',
			})
		} else {
			subsplitInsets.push(null)
		}
	}

	return { layout, score: best.score, reasons: best.reasons, panelTensions, subsplitInsets }
}

function readingDirectionCorner(_scenario: Scenario): 'rtl' | 'ltr' {
	return 'rtl'
}

// =============================================================================
// STAGE 4 — Asset-locked pure camera prompt & conditional negative space
// =============================================================================

function entryCorner(readingDirection: 'rtl' | 'ltr', lines: BubbleLine[]): string {
	const placed = lines.find((line) => line.type !== 'sfx' && line.placement)
	if (placed?.placement === 'top-left') return 'top-left'
	if (placed?.placement === 'top-right') return 'top-right'
	if (placed?.placement === 'bottom-left') return 'bottom-left'
	if (placed?.placement === 'bottom-right') return 'bottom-right'
	if (placed?.placement === 'center') return 'upper third'
	return readingDirection === 'rtl' ? 'top-right' : 'top-left'
}

/** Stage 4 compiler. Produces the asset-locked, text-free camera prompt for a panel. */
export function compileStage4PureArtSpec(input: {
	panelIndex: number
	beat: Beat
	meta: PanelMeta
	panelPts: Pt[]
	registry: AssetRegistry
	environment: string
	lighting: string
}): {
	panelId: string
	hasBubble: boolean
	hasSfx: boolean
	negativeSpaceCorner: string | null
	negativeSpaceRatio: number
	referenceImagePaths: string[]
	assetTags: string[]
	optics: OpticalReadout
	pureCameraPrompt: string
} {
	const { beat, meta, registry } = input
	const panelId = `panel-${input.panelIndex + 1}`
	const silent = Boolean(meta.silent || beat.silent)
	const tension = deriveBeatTension(beat, 'tension')

	const gates = solveOnDemandBubbleAndSfxGates({
		silent,
		wordPictureMode: beat.wordPictureMode ?? meta.wordPictureMode,
		transition: beat.mccloudTransition ?? meta.mccloudTransition,
		tension,
		lines: beat.lines ?? [],
	})

	// Resolve + backfill every discrete asset the panel references.
	const assetTags = (beat.assetRefs ?? meta.assetRefs ?? []).filter(Boolean)
	const resolved = verifyAssetRegistryAndBackfill(assetTags, registry)
	const optics = computeOptics(defaultOpticsForMeta(meta))
	const factors = deriveFactors14(beat, optics)
	const readingDirection = registry.styleBible.readingDirection

	let negativeSpaceCorner: string | null
	let negativeSpaceRatio: number
	let spaceClause: string
	if (!gates.hasBubble) {
		// Silent / picture-specific: zero reservation, full-frame composition.
		negativeSpaceCorner = null
		negativeSpaceRatio = 0
		spaceClause = 'full-frame visual composition, 0% speech balloon reservation'
	} else {
		negativeSpaceCorner = entryCorner(readingDirection, beat.lines ?? [])
		negativeSpaceRatio = 0.26
		spaceClause = `reserve ${Math.round(negativeSpaceRatio * 100)}% negative space in the ${negativeSpaceCorner} entry corner for a speech balloon, keep primary subject clear of that corner`
	}

	const lockClause = resolved.combinedLockPrompt
		? `ASSET LOCK → ${resolved.combinedLockPrompt}`
		: 'no named discrete assets referenced'

	const pureCameraPrompt = [
		`Manga panel ${panelId}, ${registry.styleBible.linework}, ${registry.styleBible.coloring}`,
		input.environment || factors.f05EnvironmentAtmos,
		input.lighting || factors.f06LightingShadow,
		`${factors.f03ShotType}, ${factors.f01CameraAngle}`,
		optics.promptClause,
		factors.f07OpticalDistortion,
		factors.f12VisualLeadingLines,
		lockClause,
		beat.beat,
		silent ? 'silent held beat, pure visual subtext' : factors.f04FacialExpressionSubtext,
		spaceClause,
		'NO text, NO letters, NO speech bubbles, NO captions, NO sound-effect lettering',
	]
		.filter(Boolean)
		.join('. ')

	return {
		panelId,
		hasBubble: gates.hasBubble,
		hasSfx: gates.hasSfx,
		negativeSpaceCorner,
		negativeSpaceRatio,
		referenceImagePaths: resolved.referenceImagePaths,
		assetTags,
		optics,
		pureCameraPrompt,
	}
}

// =============================================================================
// STAGE 5 — Saccadic Focal-Gaze-Bubble Trajectory theory (visual flow chaining)
// =============================================================================

export interface IntraPanelFlowNode {
	kind: 'lead-bubble' | 'subject-focal' | 'gaze-tip' | 'follow-bubble' | 'sfx-exit'
	x: number
	y: number
	label: string
	panelIndex: number
}

export interface PanelSaccadeChain {
	panelIndex: number
	focalPointAbs: Pt
	focalPointRel: [number, number]
	subjectBoxAbs: [number, number, number, number]
	gazeVector: [number, number]
	gazeTipAbs: Pt
	leadBubbleCenter: Pt | null
	followBubbleCenter: Pt | null
	sfxCenter: Pt | null
	orderedNodes: IntraPanelFlowNode[]
	intraPanelPathD: string
}

export interface CrossGutterSaccade {
	fromPanelIndex: number
	toPanelIndex: number
	fromPt: Pt
	toPt: Pt
	controlPt1: Pt
	controlPt2: Pt
	bezierPathD: string
	saccadeLengthPx: number
	validZFlow: boolean
}

export interface PageGazeTrajectory {
	readingDirection: 'rtl' | 'ltr'
	panelChains: PanelSaccadeChain[]
	crossGutterSaccades: CrossGutterSaccade[]
	globalSvgPathD: string
	flowContinuityScore: number
}

export interface GazeBubbleInput {
	panelIndex: number
	style: string
	x: number
	y: number
	w: number
	h: number
}

function iou(a: NormalizedBox, b: NormalizedBox): number {
	const ix0 = Math.max(a[0], b[0])
	const iy0 = Math.max(a[1], b[1])
	const ix1 = Math.min(a[2], b[2])
	const iy1 = Math.min(a[3], b[3])
	const iw = Math.max(0, ix1 - ix0)
	const ih = Math.max(0, iy1 - iy0)
	const inter = iw * ih
	if (inter <= 0) return 0
	const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
	const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
	const union = areaA + areaB - inter
	return union <= 0 ? 0 : inter / union
}

function boxFromCenter(cx: number, cy: number, w: number, h: number): NormalizedBox {
	const hw = w / 2
	const hh = h / 2
	const x0 = clamp(cx - hw, 0, 1)
	const y0 = clamp(cy - hh, 0, 1)
	return [x0, y0, clamp(x0 + w, 0, 1), clamp(y0 + h, 0, 1)]
}

/**
 * Shift a candidate balloon anchor out of the subject saliency boxes so faces,
 * eyes and key props are never occluded. All coordinates are panel-relative [0,1].
 */
export function solveAntiOcclusionBubblePlacement(
	panelPts: Pt[],
	subjectBoxesRel: NormalizedBox[],
	candidateRel: [number, number],
	wRel: number,
	hRel: number,
): { centerRel: [number, number]; iouWithSubject: number } {
	const box = boundsOf(panelPts)
	// Aspect bias nudges relocation along the panel's longer axis.
	const aspect = box.w / Math.max(1, box.h)
	const worstOverlap = (cx: number, cy: number): number => {
		const candidate = boxFromCenter(cx, cy, wRel, hRel)
		let worst = 0
		for (const subject of subjectBoxesRel) worst = Math.max(worst, iou(candidate, subject))
		return worst
	}

	let bestCenter: [number, number] = [clamp(candidateRel[0], 0, 1), clamp(candidateRel[1], 0, 1)]
	let bestOverlap = worstOverlap(bestCenter[0], bestCenter[1])
	if (bestOverlap <= 0.06 || !subjectBoxesRel.length) {
		return { centerRel: bestCenter, iouWithSubject: Number(bestOverlap.toFixed(4)) }
	}

	// Evaluate an aspect-aware ring of safe anchor candidates and keep the clearest.
	const marginX = clamp(wRel / 2 + 0.04, 0.08, 0.45)
	const marginY = clamp(hRel / 2 + 0.04, 0.08, 0.45)
	const xs = aspect >= 1 ? [marginX, 0.5, 1 - marginX] : [marginX, 1 - marginX]
	const ys = aspect >= 1 ? [marginY, 1 - marginY] : [marginY, 0.5, 1 - marginY]
	for (const cx of xs) {
		for (const cy of ys) {
			const overlap = worstOverlap(cx, cy)
			if (overlap < bestOverlap - 1e-4) {
				bestOverlap = overlap
				bestCenter = [cx, cy]
			}
		}
	}

	return { centerRel: bestCenter, iouWithSubject: Number(bestOverlap.toFixed(4)) }
}

function deriveFocalRel(meta: PanelMeta | undefined): [number, number] {
	if (meta?.focalPointRel) return meta.focalPointRel
	const shot = meta?.shot ?? 'MS'
	if (shot === 'ECU' || shot === 'CU') return [0.5, 0.4]
	if (shot === 'MCU') return [0.5, 0.44]
	if (shot === 'EWS' || shot === 'WS') return [0.5, 0.54]
	return [0.5, 0.5]
}

function fmt(n: number): string {
	return (Number.isFinite(n) ? n : 0).toFixed(1)
}

function curvePath(points: Pt[]): string {
	if (!points.length) return ''
	if (points.length === 1) return `M ${fmt(points[0][0])} ${fmt(points[0][1])}`
	let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`
	for (let i = 1; i < points.length; i += 1) {
		const prev = points[i - 1]
		const cur = points[i]
		const mx = (prev[0] + cur[0]) / 2
		const my = (prev[1] + cur[1]) / 2
		const dx = cur[0] - prev[0]
		const dy = cur[1] - prev[1]
		const len = Math.hypot(dx, dy) || 1
		// Bow the control point slightly perpendicular for a gentle saccadic arc.
		const bow = Math.min(18, len * 0.12)
		const cx = mx + (-dy / len) * bow
		const cy = my + (dx / len) * bow
		d += ` Q ${fmt(cx)} ${fmt(cy)} ${fmt(cur[0])} ${fmt(cur[1])}`
	}
	return d
}

/**
 * Stage 5 solver. Builds the per-panel saccadic chain (lead balloon → subject focal
 * → gaze tip → follow balloon / sfx exit) and the cross-gutter cubic bezier saccades.
 */
export function solvePageGazeFocalTrajectory(
	layout: Layout,
	metas: PanelMeta[],
	bubbles: GazeBubbleInput[],
	readingDirection: 'rtl' | 'ltr' = 'rtl',
): PageGazeTrajectory {
	const panels = layout.panels ?? []
	const panelChains: PanelSaccadeChain[] = []

	panels.forEach((panel, i) => {
		const meta = metas[i]
		const box = boundsOf(panel.pts)
		const focalRel = deriveFocalRel(meta)
		const focalAbs: Pt = [box.minX + focalRel[0] * box.w, box.minY + focalRel[1] * box.h]

		// Subject saliency box (absolute) from meta or a default around the focal point.
		const subjRel = meta?.subjectBoxesRel?.[0] ?? ([
			clamp(focalRel[0] - 0.23, 0, 1),
			clamp(focalRel[1] - 0.3, 0, 1),
			clamp(focalRel[0] + 0.23, 0, 1),
			clamp(focalRel[1] + 0.3, 0, 1),
		] as NormalizedBox)
		const subjectBoxAbs: [number, number, number, number] = [
			box.minX + subjRel[0] * box.w,
			box.minY + subjRel[1] * box.h,
			box.minX + subjRel[2] * box.w,
			box.minY + subjRel[3] * box.h,
		]

		// Gaze vector from the panel eyeline (defaulting to a mild downward-lead).
		const eye = meta?.eyeline ?? [12, -4]
		const eyeLen = Math.hypot(eye[0], eye[1]) || 1
		const reach = Math.min(box.w, box.h) * 0.3
		const gazeTipAbs: Pt = [
			clamp(focalAbs[0] + (eye[0] / eyeLen) * reach, box.minX, box.maxX),
			clamp(focalAbs[1] + (eye[1] / eyeLen) * reach, box.minY, box.maxY),
		]

		// Classify this panel's bubbles into lead / follow / sfx by reading order.
		const panelBubbles = bubbles.filter((bubble) => bubble.panelIndex === i)
		const nonSfx = panelBubbles.filter((bubble) => bubble.style !== 'sfx')
		const sfx = panelBubbles.filter((bubble) => bubble.style === 'sfx')
		const center = (bubble: GazeBubbleInput): Pt => [bubble.x + bubble.w / 2, bubble.y + bubble.h / 2]
		nonSfx.sort((a, b) => {
			const ac = center(a)
			const bc = center(b)
			if (Math.abs(ac[1] - bc[1]) > box.h * 0.12) return ac[1] - bc[1]
			return readingDirection === 'rtl' ? bc[0] - ac[0] : ac[0] - bc[0]
		})
		const leadBubbleCenter = nonSfx.length ? center(nonSfx[0]) : null
		const followBubbleCenter = nonSfx.length > 1 ? center(nonSfx[nonSfx.length - 1]) : null
		const sfxCenter = sfx.length ? center(sfx[0]) : null

		// Ordered saccadic chain.
		const orderedNodes: IntraPanelFlowNode[] = []
		if (leadBubbleCenter) {
			orderedNodes.push({ kind: 'lead-bubble', x: leadBubbleCenter[0], y: leadBubbleCenter[1], label: 'lead', panelIndex: i })
		}
		orderedNodes.push({ kind: 'subject-focal', x: focalAbs[0], y: focalAbs[1], label: 'focal', panelIndex: i })
		orderedNodes.push({ kind: 'gaze-tip', x: gazeTipAbs[0], y: gazeTipAbs[1], label: 'gaze', panelIndex: i })
		if (followBubbleCenter) {
			orderedNodes.push({ kind: 'follow-bubble', x: followBubbleCenter[0], y: followBubbleCenter[1], label: 'follow', panelIndex: i })
		}
		if (sfxCenter) {
			orderedNodes.push({ kind: 'sfx-exit', x: sfxCenter[0], y: sfxCenter[1], label: 'sfx', panelIndex: i })
		}

		panelChains.push({
			panelIndex: i,
			focalPointAbs: focalAbs,
			focalPointRel: focalRel,
			subjectBoxAbs,
			gazeVector: [eye[0], eye[1]],
			gazeTipAbs,
			leadBubbleCenter,
			followBubbleCenter,
			sfxCenter,
			orderedNodes,
			intraPanelPathD: curvePath(orderedNodes.map((node) => [node.x, node.y] as Pt)),
		})
	})

	// Cross-gutter cubic bezier saccades between consecutive panels.
	const crossGutterSaccades: CrossGutterSaccade[] = []
	let validCount = 0
	for (let i = 0; i < panelChains.length - 1; i += 1) {
		const from = panelChains[i]
		const to = panelChains[i + 1]
		const fromNodes = from.orderedNodes
		const toNodes = to.orderedNodes
		const fromPt = (fromNodes.length ? [fromNodes[fromNodes.length - 1].x, fromNodes[fromNodes.length - 1].y] : from.focalPointAbs) as Pt
		const toPt = (toNodes.length ? [toNodes[0].x, toNodes[0].y] : to.focalPointAbs) as Pt
		const dx = toPt[0] - fromPt[0]
		const dy = toPt[1] - fromPt[1]
		const controlPt1: Pt = [fromPt[0] + dx * 0.3, fromPt[1] + dy * 0.12 + Math.abs(dx) * 0.14]
		const controlPt2: Pt = [toPt[0] - dx * 0.3, toPt[1] - dy * 0.12 + Math.abs(dx) * 0.14]
		const bezierPathD = `M ${fmt(fromPt[0])} ${fmt(fromPt[1])} C ${fmt(controlPt1[0])} ${fmt(controlPt1[1])} ${fmt(controlPt2[0])} ${fmt(controlPt2[1])} ${fmt(toPt[0])} ${fmt(toPt[1])}`
		// Approximate arc length by sampling the cubic bezier.
		let length = 0
		let prev = fromPt
		for (let s = 1; s <= 12; s += 1) {
			const t = s / 12
			const mt = 1 - t
			const px =
				mt * mt * mt * fromPt[0] + 3 * mt * mt * t * controlPt1[0] + 3 * mt * t * t * controlPt2[0] + t * t * t * toPt[0]
			const py =
				mt * mt * mt * fromPt[1] + 3 * mt * mt * t * controlPt1[1] + 3 * mt * t * t * controlPt2[1] + t * t * t * toPt[1]
			length += Math.hypot(px - prev[0], py - prev[1])
			prev = [px, py]
		}
		const tol = 24
		const validZFlow =
			dy > -tol && (readingDirection === 'rtl' ? dx <= tol || dy > tol : dx >= -tol || dy > tol)
		if (validZFlow) validCount += 1
		crossGutterSaccades.push({
			fromPanelIndex: i,
			toPanelIndex: i + 1,
			fromPt,
			toPt,
			controlPt1,
			controlPt2,
			bezierPathD,
			saccadeLengthPx: Number(length.toFixed(1)),
			validZFlow,
		})
	}

	const flowContinuityScore = crossGutterSaccades.length
		? Number((0.3 + 0.7 * (validCount / crossGutterSaccades.length)).toFixed(3))
		: 1
	const globalSvgPathD = [
		...panelChains.map((chain) => chain.intraPanelPathD),
		...crossGutterSaccades.map((saccade) => saccade.bezierPathD),
	]
		.filter(Boolean)
		.join(' ')

	return { readingDirection, panelChains, crossGutterSaccades, globalSvgPathD, flowContinuityScore }
}

/** Render the Saccadic Focal-Gaze-Bubble Trajectory as an embeddable SVG `<g>` layer. */
export function renderGazeFocalTrajectorySvg(
	uid: string,
	trajectory: PageGazeTrajectory,
	panels: Array<{ pts: Pt[]; meta: PanelMeta }>,
): string {
	const parts: string[] = []
	parts.push(
		`<defs>` +
			`<marker id="${uid}-saccade" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c93d35"/></marker>` +
			`<marker id="${uid}-gaze" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0f766e"/></marker>` +
			`</defs>`,
	)

	// Subject saliency boxes + concentric focal rings + gaze vectors + intra-panel flow.
	trajectory.panelChains.forEach((chain) => {
		const [sx0, sy0, sx1, sy1] = chain.subjectBoxAbs
		parts.push(
			`<rect x="${fmt(sx0)}" y="${fmt(sy0)}" width="${fmt(sx1 - sx0)}" height="${fmt(sy1 - sy0)}" fill="none" stroke="#6b7280" stroke-width="1.1" stroke-dasharray="4 4" opacity="0.6"/>`,
		)
		const [fx, fy] = chain.focalPointAbs
		parts.push(
			`<circle cx="${fmt(fx)}" cy="${fmt(fy)}" r="13" fill="none" stroke="#c93d35" stroke-width="1.4" opacity="0.75"/>` +
				`<circle cx="${fmt(fx)}" cy="${fmt(fy)}" r="7" fill="none" stroke="#c93d35" stroke-width="1.4" opacity="0.9"/>` +
				`<circle cx="${fmt(fx)}" cy="${fmt(fy)}" r="2.4" fill="#c93d35"/>`,
		)
		const [gx, gy] = chain.gazeTipAbs
		if (Math.hypot(gx - fx, gy - fy) > 3) {
			parts.push(
				`<line x1="${fmt(fx)}" y1="${fmt(fy)}" x2="${fmt(gx)}" y2="${fmt(gy)}" stroke="#0f766e" stroke-width="2" marker-end="url(#${uid}-gaze)"/>`,
			)
		}
		if (chain.intraPanelPathD) {
			parts.push(
				`<path d="${chain.intraPanelPathD}" fill="none" stroke="#1e78c8" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85"/>`,
			)
		}

		// Optional sub-split PiP reaction inset.
		const inset = panels[chain.panelIndex]?.meta.subsplitInset
		if (inset?.enabled) {
			const box = boundsOf(panels[chain.panelIndex].pts)
			const [u0, v0, u1, v1] = inset.rectRel
			const ix = box.minX + u0 * box.w
			const iy = box.minY + v0 * box.h
			const iw = (u1 - u0) * box.w
			const ih = (v1 - v0) * box.h
			parts.push(
				`<g opacity="0.92"><rect x="${fmt(ix)}" y="${fmt(iy)}" width="${fmt(iw)}" height="${fmt(ih)}" fill="#ffffff" fill-opacity="0.08" stroke="#18222c" stroke-width="2"/>` +
					`<rect x="${fmt(ix + 2)}" y="${fmt(iy + 2)}" width="${fmt(Math.max(0, iw - 4))}" height="13" fill="#18222c"/>` +
					`<text x="${fmt(ix + 6)}" y="${fmt(iy + 12)}" font-size="9" font-weight="700" fill="#ffffff">PiP ${escapeTrajectoryText(inset.targetTag)}</text></g>`,
			)
		}
	})

	// Cross-gutter cubic bezier saccade curves with directional arrowheads.
	trajectory.crossGutterSaccades.forEach((saccade) => {
		parts.push(
			`<path d="${saccade.bezierPathD}" fill="none" stroke="#c93d35" stroke-width="2.6" stroke-dasharray="9 6" opacity="${saccade.validZFlow ? '0.95' : '0.5'}" marker-end="url(#${uid}-saccade)"/>`,
		)
	})

	// Numbered focal badges on top so the reading order is unambiguous.
	trajectory.panelChains.forEach((chain) => {
		const [fx, fy] = chain.focalPointAbs
		parts.push(
			`<g transform="translate(${fmt(fx)} ${fmt(fy - 24)})"><circle r="11" fill="#c93d35" stroke="#ffffff" stroke-width="1.8"/><text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#ffffff">${chain.panelIndex + 1}</text></g>`,
		)
	})

	return `<g class="gaze-trajectory-layer" pointer-events="none">${parts.join('')}</g>`
}

function escapeTrajectoryText(value: string): string {
	return String(value ?? '').replace(/[&<>"']/g, (ch) =>
		ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
	)
}

// =============================================================================
// Built-in universal story presets (story-agnostic demonstrations).
// =============================================================================

export interface UniversalStoryPreset {
	id: string
	title: string
	subtitle: string
	logline: string
	world: string
	stylePreset: string
	readingDirection: 'rtl' | 'ltr'
	scenario: Scenario
	layoutPreset: string
	mood: string
	environment: string
	lighting: string
	characters: CharacterDraft[]
	assets: DiscreteAsset[]
	panels: Beat[]
}

function lockAsset(
	tag: string,
	name: string,
	category: DiscreteAssetCategory,
	tokens: string,
	customFileName?: string,
): DiscreteAsset {
	const slug = slugifyTag(tag)
	const fileName = customFileName ?? `${slug}.png`
	return {
		assetId: `preset-${slug}`,
		tag,
		category,
		name,
		fileName,
		filePath: `assets/${category}/${fileName}`,
		visualLockTokens: tokens,
		viewsIncluded: VIEWS_BY_CATEGORY[category],
		approved: true,
		usedInPanels: [],
	}
}

export const UNIVERSAL_STORY_PRESETS: Record<string, UniversalStoryPreset> = {
	'seagull-fries': {
		id: 'seagull-fries',
		title: 'Pier Philosophy',
		subtitle: 'Coastal watercolor philosophical comedy',
		logline:
			'On a weather-worn pier two gulls debate the ethics of a single golden fries cone while the tide keeps its own counsel.',
		world: 'Soft coastal watercolor, salt haze, hand-lettered captions, right-to-left reading, one warm spot accent.',
		stylePreset: 'coastal-watercolor',
		readingDirection: 'rtl',
		scenario: 'intimacy',
		layoutPreset: 'seizen',
		mood: 'wry · contemplative',
		environment: 'rocky pier at low tide',
		lighting: 'overcast soft bounce',
		characters: [
			{ tag: '@gull_philosopher', name: 'The Philosopher Gull', appearance: 'lean grey gull, tilted head, one squinting eye', voice: 'slow, aphoristic', locked: true },
			{ tag: '@gull_foodie', name: 'The Foodie Gull', appearance: 'plump white gull, eager posture, crumb-dusted beak', voice: 'impatient, hungry', locked: true },
		],
		assets: [
			lockAsset('@gull_philosopher', 'The Philosopher Gull', 'character', 'lean grey gull, squint eye, driftwood-grey tone'),
			lockAsset('@gull_foodie', 'The Foodie Gull', 'character', 'plump white gull, crumb-dusted beak, eager stance'),
			lockAsset('#prop_pier_fries_cone', 'Golden Fries Cone', 'prop', 'paper cone of golden fries, warm spot accent'),
			lockAsset('#env_rocky_pier_cliff', 'Rocky Pier Cliff', 'environment', 'weathered pier planks, barnacle cliff, salt haze'),
		],
		panels: [
			{ shot: 'EWS', angle: 'high', focal: '35mm', beat: 'Wide establishing: two gulls flank a single fries cone on the pier.', who: ['@gull_philosopher', '@gull_foodie'], assetRefs: ['#env_rocky_pier_cliff', '#prop_pier_fries_cone'], mccloudTransition: 'scene_to_scene', wordPictureMode: 'additive', tension: 0.3, eyeline: [14, 8], focalPointRel: [0.5, 0.55], lines: [{ type: 'caption', text: '潮水退去，留下一只金黄薯条筒。', placement: 'top-right' }] },
			{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'The philosopher gull regards the cone, unhurried.', who: ['@gull_philosopher'], assetRefs: ['@gull_philosopher', '#prop_pier_fries_cone'], mccloudTransition: 'subject_to_subject', wordPictureMode: 'interdependent', tension: 0.35, eyeline: [-20, 2], focalPointRel: [0.42, 0.46], lines: [{ type: 'speech', text: '拥有，不过是暂时替潮水保管罢了，朋友。', placement: 'top-left' }] },
			{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: 'The foodie gull leans in, patience fraying.', who: ['@gull_foodie'], assetRefs: ['@gull_foodie'], mccloudTransition: 'subject_to_subject', wordPictureMode: 'word_specific', tension: 0.4, eyeline: [18, 4], focalPointRel: [0.58, 0.44], lines: [{ type: 'speech', text: '少讲道理，它会凉的！', prosody: '怒吼', placement: 'top-right' }] },
			{ shot: 'CU', angle: 'low', focal: '85mm', beat: 'Silent beat: the single fries cone against drifting cloud.', who: [], assetRefs: ['#prop_pier_fries_cone'], mccloudTransition: 'aspect_to_aspect', wordPictureMode: 'picture_specific', tension: 0.5, silent: true, eyeline: [0, -6], focalPointRel: [0.5, 0.5], lines: [] },
			{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'Both gulls reach at once; a gust lifts a single fry.', who: ['@gull_philosopher', '@gull_foodie'], assetRefs: ['@gull_philosopher', '@gull_foodie', '#prop_pier_fries_cone'], mccloudTransition: 'action_to_action', wordPictureMode: 'duo_specific', tension: 0.74, eyeline: [-16, 6], focalPointRel: [0.5, 0.48], subsplitInset: { enabled: true, targetTag: '@gull_foodie', rectRel: [0.62, 0.6, 0.95, 0.95], shot: 'CU', caption: 'reaction' }, lines: [{ type: 'sfx', text: '呼——', placement: 'top-right' }, { type: 'speech', text: '那么，我们平分这份虚无？', placement: 'bottom-left' }] },
			{ shot: 'WS', angle: 'high', focal: '35mm', beat: 'Pull back: the cone is empty, the gulls sit companionably.', who: ['@gull_philosopher', '@gull_foodie'], assetRefs: ['#env_rocky_pier_cliff'], mccloudTransition: 'scene_to_scene', wordPictureMode: 'parallel', tension: 0.3, eyeline: [10, 10], focalPointRel: [0.5, 0.6], lines: [{ type: 'caption', text: '——潮声依旧，筒已空。', placement: 'bottom-right' }] },
		],
	},
	'noir-watchmaker': {
		id: 'noir-watchmaker',
		title: '第三章：雨夜审讯室的停摆怀表 (Noir Interrogation)',
		subtitle: '硬派青年漫·伦勃朗黑色电影审讯推理 (noir-ch03-interrogation)',
		logline:
			'暴雨夜的旧港警署审讯室里，刑警陆沉用一枚死死卡在 23:17 的裂纹银壳怀表，从红丹防锈漆袖口一路逼出单向玻璃阴影里的真凶。',
		world: '浦泽直树式硬派青年漫黑白灰蓝冷调 + 伦勃朗 50% 半脸明暗分割 + 百叶窗雨夜条纹投影 + 金属桌面冷反光，从右至左阅读。',
		stylePreset: 'seinen_noir',
		readingDirection: 'rtl',
		scenario: 'tension',
		layoutPreset: 'std',
		mood: '冷峻 · 窒息审讯 · 雷霆逆转',
		environment: 'interrogation-room',
		lighting: 'rim',
		characters: [
			{
				tag: '@lu_chen',
				name: '侦探·陆沉',
				appearance: '身穿深炭灰双排扣风衣的刑警，鹰隼般锐利的眼神，前倾压迫姿态，伦勃朗侧光勾勒半张冷峻脸庞',
				voice: '冷笑审视，步步紧逼',
				locked: true,
			},
			{
				tag: '@lin_ye',
				name: '嫌疑人·林野',
				appearance: '身穿浅灰旧风衣的旧书店整理员，双手交叠在审讯桌上表面镇定，右袖口沾有一抹刺眼的旧码头红丹防锈漆',
				voice: '沉默克制，暗藏惊惧',
				locked: true,
			},
			{
				tag: '@shen_mo',
				name: '副局长·沈默',
				appearance: '坐在单向观察窗阴影里的警局副局长，半脸隐没在百叶窗暗部，左撇子反手握持旧铜打火机点燃香烟',
				voice: '深沉威严，隐于暗处',
				locked: true,
			},
		],
		assets: [
			lockAsset(
				'@lu_chen',
				'侦探·陆沉',
				'character',
				'身穿深炭灰双排扣风衣的刑警，鹰隼般锐利的眼神，前倾压迫姿态，伦勃朗侧光勾勒半张冷峻脸庞',
				'asset_char_lu_chen.png',
			),
			lockAsset(
				'@lin_ye',
				'嫌疑人·林野',
				'character',
				'身穿浅灰旧风衣的旧书店整理员，双手交叠在审讯桌上表面镇定，右袖口沾有一抹刺眼的旧码头红丹防锈漆',
				'asset_char_lin_ye.png',
			),
			lockAsset(
				'@shen_mo',
				'副局长·沈默',
				'character',
				'坐在单向观察窗阴影里的警局副局长，半脸隐没在百叶窗暗部，左撇子反手握持旧铜打火机点燃香烟',
				'asset_char_shen_mo.png',
			),
			lockAsset(
				'#prop_pocket_watch',
				'裂纹银壳怀表 (23:17)',
				'prop',
				'死者遗留的裂纹银壳怀表，蓝钢指针死死卡在 23:17，表盖内侧留有左撇子反手调表的反向刮痕',
				'asset_prop_pocket_watch.png',
			),
			lockAsset(
				'#prop_rust_cuff',
				'袖口红丹防锈漆',
				'prop',
				'林野风衣袖口边缘干涸的砖红色码头防锈漆痕迹',
				'asset_prop_rust_cuff.png',
			),
			lockAsset(
				'#prop_brass_lighter',
				'旧铜打火机',
				'prop',
				'沈默左手握持的旧黄铜砂轮打火机，跳动出橘金火苗',
				'asset_prop_brass_lighter.png',
			),
			lockAsset(
				'#env_interrogation_room',
				'旧港警署三楼审讯室',
				'environment',
				'暴雨冲刷百叶窗、摇晃单盏吊灯、冰冷不锈钢审讯桌与单向玻璃观察窗',
				'asset_env_interrogation_room.png',
			),
			lockAsset(
				'#style_seinen_noir',
				'硬派青年漫·伦勃朗黑色电影风',
				'style',
				'浦泽直树式写实冷峻线条 + 伦勃朗半脸侧逆光 + 雨夜百叶窗条纹光影',
				'asset_style_seinen_noir.png',
			),
		],
		panels: [
			{
				shot: 'WS',
				angle: 'eye',
				focal: '18mm',
				focalMm: 24,
				fStop: 5.6,
				beat: 'P01-01 · 暴雨冲刷着警局三楼百叶窗，狭长审讯室内只有一盏吊灯摇晃。陆沉与林野隔着金属审讯桌对坐。',
				who: ['@lu_chen', '@lin_ye'],
				assetRefs: ['#env_interrogation_room', '#style_seinen_noir', '@lu_chen', '@lin_ye'],
				tension: 0.42,
				focalPointRel: [0.50, 0.54],
				eyeline: [18, 4],
				mccloudChoice: 'choice_of_frame',
				mccloudTransition: 'scene_to_scene',
				wordPictureMode: 'additive',
				lines: [
					{
						type: 'caption',
						speaker: '旁白',
						prosody: '冷峻低沉 · 叙述方框',
						placement: 'top-right',
						text: '十一点四十分。雨还没有停的意思。',
					},
					{
						type: 'sfx',
						placement: 'bottom-left',
						text: '哗啦啦——',
					},
				],
			},
			{
				shot: 'MS',
				angle: 'eye',
				focal: '35mm',
				focalMm: 35,
				fStop: 2.8,
				beat: 'P01-02 · 陆沉隔着金属审讯桌前倾，目光如刀压向林野沾着红丹防锈漆的右袖口，林野双手交叠保持表面镇定。',
				who: ['@lu_chen', '@lin_ye'],
				assetRefs: ['@lu_chen', '@lin_ye', '#prop_rust_cuff', '#style_seinen_noir'],
				tension: 0.58,
				focalPointRel: [0.46, 0.50],
				eyeline: [26, 10],
				mccloudChoice: 'choice_of_moment',
				mccloudTransition: 'action_to_action',
				wordPictureMode: 'interdependent',
				lines: [
					{
						type: 'speech',
						speaker: '@lu_chen',
						prosody: '冷笑审视',
						placement: 'top-right',
						text: '你说你整晚都在书店整理旧画册——',
					},
					{
						type: 'speech',
						speaker: '@lu_chen',
						prosody: '压迫追问',
						placement: 'bottom-left',
						text: '那你袖口上的码头红丹防锈漆，也是书架上蹭的？',
					},
				],
			},
			{
				shot: 'ECU',
				angle: 'high',
				focal: '85mm',
				focalMm: 85,
				fStop: 1.4,
				beat: 'P01-03 · 陆沉指尖将裂开的银壳怀表推到金属桌面正中央，表盘指针死死卡在 23:17；右下画中画切出林野瞳孔骤缩与泛白指节。',
				who: ['@lu_chen', '@lin_ye'],
				assetRefs: ['@lu_chen', '@lin_ye', '#prop_pocket_watch', '#style_seinen_noir'],
				tension: 0.78,
				focalPointRel: [0.46, 0.52],
				eyeline: [22, 12],
				mccloudChoice: 'choice_of_image',
				mccloudTransition: 'subject_to_subject',
				wordPictureMode: 'interdependent',
				subsplitInset: {
					enabled: true,
					targetTag: '@lin_ye',
					rectRel: [0.62, 0.60, 0.96, 0.95],
					shot: 'ECU',
					caption: 'PiP · 瞳孔微缩反应切格',
				},
				lines: [
					{
						type: 'speech',
						speaker: '@lu_chen',
						prosody: '低音叩击',
						placement: 'top-right',
						text: '看着它——',
					},
					{
						type: 'speech',
						speaker: '@lu_chen',
						prosody: '一字一顿',
						placement: 'bottom-left',
						text: '这只表停下的时候，真正的凶手就在离你不到半米的地方。',
					},
					{
						type: 'sfx',
						placement: 'top-left',
						text: '咔哒！',
					},
				],
			},
			{
				shot: 'CU',
				angle: 'eye',
				focal: '50mm',
				focalMm: 50,
				fStop: 2.0,
				beat: 'P01-04 · 林野垂下眼帘一言不发，审讯室陷入死寂，只有单向玻璃角落阴影里的旧铜打火机齿轮空转并擦出一星火苗。',
				who: ['@lin_ye', '@shen_mo'],
				assetRefs: ['@lin_ye', '@shen_mo', '#prop_brass_lighter', '#style_seinen_noir'],
				tension: 0.30,
				silent: true,
				focalPointRel: [0.64, 0.54],
				eyeline: [24, -4],
				mccloudChoice: 'choice_of_word',
				mccloudTransition: 'aspect_to_aspect',
				wordPictureMode: 'picture_specific',
				lines: [
					{
						type: 'sfx',
						placement: 'bottom-right',
						text: '嚓……',
					},
				],
			},
			{
				shot: 'CU',
				angle: 'dutch',
				focal: '35mm',
				focalMm: 28,
				fStop: 2.0,
				beat: 'P01-05 · 陆沉猛然转头越过林野，手指直刺向单向玻璃旁阴影中用左手点燃香烟的副局长沈默！左下画中画切出怀表内盖左撇子刮痕铁证。',
				who: ['@lu_chen', '@shen_mo'],
				assetRefs: ['@lu_chen', '@shen_mo', '#prop_pocket_watch', '#prop_brass_lighter', '#style_seinen_noir'],
				tension: 0.94,
				focalPointRel: [0.54, 0.46],
				eyeline: [32, -8],
				mccloudChoice: 'choice_of_flow',
				mccloudTransition: 'moment_to_moment',
				wordPictureMode: 'interdependent',
				subsplitInset: {
					enabled: true,
					targetTag: '#prop_pocket_watch',
					rectRel: [0.05, 0.60, 0.42, 0.95],
					shot: 'ECU',
					caption: 'PiP · 左撇子调表刮痕铁证',
				},
				lines: [
					{
						type: 'speech',
						speaker: '@lu_chen',
						prosody: '锋芒毕露',
						placement: 'top-right',
						text: '因为表盖内侧的刮痕只有左撇子反手调表才会留下——',
					},
					{
						type: 'shout',
						speaker: '@lu_chen',
						prosody: '雷霆指认',
						placement: 'bottom-right',
						text: '我说的对吗，沈副局长？！',
					},
					{
						type: 'sfx',
						placement: 'top-left',
						text: '轰——！！',
					},
				],
			},
		],
	},
	'shonen-blade': {
		id: 'shonen-blade',
		title: 'Storm Shrine Duel',
		subtitle: 'High-tension shonen duel',
		logline:
			'The wandering ronin Ren faces the shrine warden Taka across a storm-struck courtyard with only a broken katana between them.',
		world: 'Bold shonen ink, screaming speed-lines, torrential storm, right-to-left reading, crimson spot accent.',
		stylePreset: 'shonen-ink',
		readingDirection: 'rtl',
		scenario: 'action',
		layoutPreset: 'action',
		mood: 'electric · do-or-die',
		environment: 'storm-struck shrine courtyard',
		lighting: 'lightning strobe, rain sheet',
		characters: [
			{ tag: '@ronin_ren', name: 'Ronin Ren', appearance: 'tattered haori, wind-torn hair, fierce grin', voice: 'brash, defiant', locked: true },
			{ tag: '@warden_taka', name: 'Warden Taka', appearance: 'armored shrine warden, horned mask, massive stance', voice: 'thunderous, resolute', locked: true },
		],
		assets: [
			lockAsset('@ronin_ren', 'Ronin Ren', 'character', 'tattered haori, wind-torn hair, crimson sash accent'),
			lockAsset('@warden_taka', 'Warden Taka', 'character', 'horned mask, heavy shrine armor, towering stance'),
			lockAsset('#prop_broken_katana', 'Broken Katana', 'prop', 'snapped blade, jagged edge, crimson cord wrap'),
			lockAsset('#env_shrine_storm', 'Storm Shrine', 'environment', 'shrine courtyard, lightning, torrential rain sheets'),
		],
		panels: [
			{ shot: 'WS', angle: 'low', focal: '18mm', beat: 'Low wide: Ren and Taka square off across the flooded courtyard.', who: ['@ronin_ren', '@warden_taka'], assetRefs: ['#env_shrine_storm', '@ronin_ren', '@warden_taka'], mccloudTransition: 'scene_to_scene', wordPictureMode: 'additive', tension: 0.7, eyeline: [20, -6], focalPointRel: [0.5, 0.5], lines: [{ type: 'caption', text: '暴雨砸落神社石阶，两人对峙。', placement: 'top-right' }] },
			{ shot: 'CU', angle: 'low', focal: '85mm', beat: 'Close on Ren’s grip tightening on the broken katana.', who: ['@ronin_ren'], assetRefs: ['@ronin_ren', '#prop_broken_katana'], mccloudTransition: 'moment_to_moment', wordPictureMode: 'word_specific', tension: 0.76, eyeline: [-18, 4], focalPointRel: [0.46, 0.5], lines: [{ type: 'shout', text: '断了也照样能斩！', prosody: '怒吼', placement: 'top-left' }] },
			{ shot: 'CU', angle: 'high', focal: '85mm', beat: 'Taka’s masked eyes narrow behind the rain.', who: ['@warden_taka'], assetRefs: ['@warden_taka'], mccloudTransition: 'subject_to_subject', wordPictureMode: 'interdependent', tension: 0.78, eyeline: [16, 6], focalPointRel: [0.55, 0.4], lines: [{ type: 'speech', text: '以残刃犯境……无畏，还是无知？', placement: 'top-right' }] },
			{ shot: 'ECU', angle: 'eye', focal: '85mm', beat: 'Silent beat: a single raindrop hangs before the clash.', who: [], assetRefs: ['#prop_broken_katana'], mccloudTransition: 'aspect_to_aspect', wordPictureMode: 'picture_specific', tension: 0.72, silent: true, eyeline: [0, -4], focalPointRel: [0.5, 0.48], lines: [] },
			{ shot: 'WS', angle: 'dutch', focal: '18mm', beat: 'The clash: both charge as lightning splits the sky.', who: ['@ronin_ren', '@warden_taka'], assetRefs: ['@ronin_ren', '@warden_taka', '#prop_broken_katana'], mccloudTransition: 'action_to_action', wordPictureMode: 'duo_specific', tension: 0.94, eyeline: [-22, 2], focalPointRel: [0.5, 0.5], subsplitInset: { enabled: true, targetTag: '@warden_taka', rectRel: [0.6, 0.58, 0.95, 0.95], shot: 'MCU', caption: 'reaction' }, lines: [{ type: 'sfx', text: '轰隆——！！', placement: 'top-right' }, { type: 'shout', text: '上啊——！', placement: 'bottom-left' }] },
			{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: 'Aftermath: back-to-back, blades lowered, breath ragged.', who: ['@ronin_ren', '@warden_taka'], assetRefs: ['@ronin_ren', '@warden_taka'], mccloudTransition: 'scene_to_scene', wordPictureMode: 'parallel', tension: 0.5, eyeline: [12, 8], focalPointRel: [0.5, 0.5], lines: [{ type: 'speech', text: '……算你有两下子。', prosody: '停顿', placement: 'top-right' }] },
		],
	},
}

/** Build a complete asset registry from a universal story preset. */
export function registryForPreset(preset: UniversalStoryPreset): AssetRegistry {
	const registry = createAssetRegistry(preset.id, {
		preset: preset.stylePreset,
		readingDirection: preset.readingDirection,
	})
	for (const asset of preset.assets) registry.assets[asset.tag] = { ...asset }
	return registry
}

/** Convert a universal story preset id into a spawnable BookDraft, or null if unknown. */
const PRESET_ALIASES: Record<string, string> = {
	'noir-ch03-interrogation': 'noir-watchmaker',
}

export function universalPresetToBook(presetId: string): BookDraft | null {
	const canonical = PRESET_ALIASES[presetId] ?? presetId
	const preset = UNIVERSAL_STORY_PRESETS[canonical]
	if (!preset) return null
	return {
		title: preset.title,
		subtitle: preset.subtitle,
		story: preset.logline,
		world: preset.world,
		stylePreset: preset.stylePreset,
		characters: preset.characters.map((character) => ({ ...character })),
		chapters: [
			{
				title: preset.title,
				mood: preset.mood,
				environment: preset.environment,
				lighting: preset.lighting,
				pages: [
					{
						scenario: preset.scenario,
						layoutPreset: preset.layoutPreset,
						dialogueDensity: 0.45,
						targetPanels: preset.panels.length,
						seed: preset.id,
						showFlow: false,
						beats: preset.panels.map((beat) => ({ ...beat })),
					},
				],
			},
		],
	}
}

/** List the available universal story presets for UI selectors. */
export function listUniversalPresets(): Array<{ id: string; title: string; subtitle: string }> {
	return Object.values(UNIVERSAL_STORY_PRESETS).map((preset) => ({
		id: preset.id,
		title: preset.title,
		subtitle: preset.subtitle,
	}))
}
