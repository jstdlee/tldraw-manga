// =============================================================================
// blend.ts — pure logic that turns a StyleProfile (a normalized blend of masters)
// into: (a) a style bible fragment + factor weight vectors, (b) per-factor
// overrides, and (c) theory-checklist evaluations. All functions are pure and
// deterministic. An empty profile yields neutral output, so the JEV engine's
// behaviour is identical to today when no master is applied.
// =============================================================================

import type { McCloudTransition, WordPictureMode } from '../jev/fiveStageEngine'
import type { ScenarioWeightBias } from '../layout/score'
import type { Focal } from '../model'
import { MASTERS, getMaster, type Master, type MasterId } from './masters'
import { getPanelLayout, type PanelLayoutId } from './panelLayouts'
import type { PacingId } from './pacing'
import type { ShotAngleId, ShotSizeId } from './shots'
import { THEORY_ITEMS, type TheoryChecklistItem } from './theory'

/** The four Beat-holdable focal lengths, widest first. */
export const FOCAL_IDS: Focal[] = ['18mm', '35mm', '50mm', '85mm']

// -----------------------------------------------------------------------------
// Style profile
// -----------------------------------------------------------------------------

export interface StyleProfile {
	/** Raw master weights; need not be normalized. Missing / non-positive ignored. */
	masterWeights: Partial<Record<MasterId, number>>
}

export interface WeightedMaster {
	master: Master
	weight: number
}

/** Resolve a profile into the contributing masters with weights summing to 1. */
export function resolveWeightedMasters(profile: StyleProfile): WeightedMaster[] {
	const entries: WeightedMaster[] = []
	let total = 0
	for (const [id, raw] of Object.entries(profile.masterWeights)) {
		const weight = Number(raw)
		if (!Number.isFinite(weight) || weight <= 0) continue
		const master = getMaster(id as MasterId)
		if (!master) continue
		entries.push({ master, weight })
		total += weight
	}
	if (total <= 0) return []
	return entries.map((entry) => ({ master: entry.master, weight: entry.weight / total }))
}

export function isEmptyProfile(profile: StyleProfile): boolean {
	return resolveWeightedMasters(profile).length === 0
}

// -----------------------------------------------------------------------------
// Weight-map blending helpers
// -----------------------------------------------------------------------------

type WeightMap<K extends string> = Partial<Record<K, number>>

/** Blend several partial weight maps by contribution and renormalize to sum 1. */
export function blendWeightMaps<K extends string>(entries: Array<{ map: WeightMap<K>; weight: number }>): Record<K, number> {
	const acc: Record<string, number> = {}
	for (const entry of entries) {
		let mapTotal = 0
		for (const value of Object.values(entry.map)) mapTotal += Number(value) || 0
		if (mapTotal <= 0) continue
		for (const [key, value] of Object.entries(entry.map)) {
			const normalized = (Number(value) || 0) / mapTotal
			acc[key] = (acc[key] ?? 0) + normalized * entry.weight
		}
	}
	const total = Object.values(acc).reduce((sum, value) => sum + value, 0)
	if (total <= 0) return {} as Record<K, number>
	const out: Record<string, number> = {}
	for (const [key, value] of Object.entries(acc)) out[key] = Number((value / total).toFixed(6))
	return out as Record<K, number>
}

/** Turn an ordered id list into a decaying weight map (first = strongest). */
function listToWeightMap<K extends string>(ids: K[]): WeightMap<K> {
	const map: Record<string, number> = {}
	ids.forEach((id, index) => {
		map[id] = (map[id] ?? 0) + 1 / (index + 1)
	})
	return map as WeightMap<K>
}

/**
 * Infer an angle preference from a master's layout bias and abstraction. Dynamic
 * masters (positive diagonal/bleed bias) lean to low / dutch / worm angles; calm,
 * negative-diagonal masters lean to eye / high. Pure, data-derived heuristic.
 */
function inferAngleMap(master: Master): WeightMap<ShotAngleId> {
	const diag = master.jevBias.diag ?? 0
	const bleed = master.jevBias.bleed ?? 0
	const energy = diag + bleed
	const eye = 1
	const high = 0.6
	const low = 0.5 + Math.max(0, energy) * 4
	const dutch = 0.2 + Math.max(0, energy) * 5
	const worm = 0.15 + Math.max(0, energy) * 3
	const bird = 0.2 + Math.max(0, -diag) * 3
	return { eye, high, low, dutch, worm, bird }
}

/**
 * Infer a focal-length preference from a master's existing data. Dynamic,
 * foreshortening masters (positive diagonal/bleed bias, wide shot vocabulary) lean
 * to the 18mm ultra-wide; intimate masters that live in close framings lean to the
 * 85mm portrait. The 35mm / 50mm normals are the always-present middle. An explicit
 * `lensPreference` on the master overrides the whole derivation. Pure, data-derived.
 */
function inferLensMap(master: Master): WeightMap<Focal> {
	if (master.lensPreference && Object.keys(master.lensPreference).length) {
		return { ...master.lensPreference }
	}
	const diag = master.jevBias.diag ?? 0
	const bleed = master.jevBias.bleed ?? 0
	const energy = diag + bleed
	const vocab = master.shotVocabulary
	const share = (ids: ShotSizeId[]): number => (vocab.length ? vocab.filter((s) => ids.includes(s)).length / vocab.length : 0)
	const wideShare = share(['EWS', 'WS'])
	const closeShare = share(['MCU', 'CU', 'ECU'])
	const w18 = 0.5 + Math.max(0, energy) * 6 + wideShare * 0.8
	const w35 = 1
	const w50 = 0.9
	const w85 = 0.5 + closeShare * 1.3 + Math.max(0, -diag) * 3
	return { '18mm': w18, '35mm': w35, '50mm': w50, '85mm': w85 }
}

/** Derive a pacing preference from the pacing affinities of preferred layouts. */
function masterPacingMap(master: Master): WeightMap<PacingId> {
	const map: Record<string, number> = {}
	master.preferredLayouts.forEach((layoutId, index) => {
		const layout = getPanelLayout(layoutId)
		if (!layout) return
		const share = 1 / (index + 1)
		layout.pacingAffinity.forEach((pacingId) => {
			map[pacingId] = (map[pacingId] ?? 0) + share
		})
	})
	return map as WeightMap<PacingId>
}

// -----------------------------------------------------------------------------
// (a) Style bible fragment + factor vectors
// -----------------------------------------------------------------------------

export interface StyleBibleFragment {
	promptTokens: string[]
	lineInkRules: string[]
	toneBlackRules: string[]
	abstraction: number
	closureIntensity: number
}

function orderByWeight(entries: Array<{ text: string; weight: number }>): string[] {
	const acc = new Map<string, number>()
	const order: string[] = []
	for (const entry of entries) {
		if (!acc.has(entry.text)) order.push(entry.text)
		acc.set(entry.text, (acc.get(entry.text) ?? 0) + entry.weight)
	}
	return order.sort((a, b) => (acc.get(b) ?? 0) - (acc.get(a) ?? 0))
}

/** Blend masters into a style bible fragment (prompt tokens + line/tone rules). */
export function blendStyleBibleFragment(profile: StyleProfile): StyleBibleFragment {
	const weighted = resolveWeightedMasters(profile)
	if (!weighted.length) {
		return { promptTokens: [], lineInkRules: [], toneBlackRules: [], abstraction: 0, closureIntensity: 0 }
	}
	const tokenEntries: Array<{ text: string; weight: number }> = []
	const lineEntries: Array<{ text: string; weight: number }> = []
	const toneEntries: Array<{ text: string; weight: number }> = []
	let abstraction = 0
	let closureIntensity = 0
	for (const { master, weight } of weighted) {
		master.promptStyleTokens.forEach((text) => tokenEntries.push({ text, weight }))
		master.lineInkRules.forEach((text) => lineEntries.push({ text, weight }))
		master.toneBlackRules.forEach((text) => toneEntries.push({ text, weight }))
		abstraction += master.mccloud.abstraction * weight
		closureIntensity += master.mccloud.closureIntensity * weight
	}
	return {
		promptTokens: orderByWeight(tokenEntries),
		lineInkRules: orderByWeight(lineEntries),
		toneBlackRules: orderByWeight(toneEntries),
		abstraction: Number(abstraction.toFixed(4)),
		closureIntensity: Number(closureIntensity.toFixed(4)),
	}
}

export interface FactorVectors {
	transitions: Record<McCloudTransition, number>
	wordPicture: Record<WordPictureMode, number>
	shots: Record<ShotSizeId, number>
	angles: Record<ShotAngleId, number>
	lenses: Record<Focal, number>
	layouts: Record<PanelLayoutId, number>
	pacing: Record<PacingId, number>
}

/** Blend masters into normalized factor weight vectors across the five stages. */
export function blendFactorVectors(profile: StyleProfile): FactorVectors {
	const weighted = resolveWeightedMasters(profile)
	return {
		transitions: blendWeightMaps<McCloudTransition>(weighted.map((w) => ({ map: w.master.mccloud.transitions, weight: w.weight }))),
		wordPicture: blendWeightMaps<WordPictureMode>(weighted.map((w) => ({ map: w.master.mccloud.wordPicture, weight: w.weight }))),
		shots: blendWeightMaps<ShotSizeId>(weighted.map((w) => ({ map: listToWeightMap(w.master.shotVocabulary), weight: w.weight }))),
		angles: blendWeightMaps<ShotAngleId>(weighted.map((w) => ({ map: inferAngleMap(w.master), weight: w.weight }))),
		lenses: blendWeightMaps<Focal>(weighted.map((w) => ({ map: inferLensMap(w.master), weight: w.weight }))),
		layouts: blendWeightMaps<PanelLayoutId>(weighted.map((w) => ({ map: listToWeightMap(w.master.preferredLayouts), weight: w.weight }))),
		pacing: blendWeightMaps<PacingId>(weighted.map((w) => ({ map: masterPacingMap(w.master), weight: w.weight }))),
	}
}

/**
 * Blend masters into a layout-score bias (additive weight deltas) for the engine.
 * An empty profile returns an all-zero bias, so layoutScore output is unchanged.
 */
export function styleProfileToLayoutBias(profile: StyleProfile): ScenarioWeightBias {
	const weighted = resolveWeightedMasters(profile)
	const bias: Required<ScenarioWeightBias> = { big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 }
	for (const { master, weight } of weighted) {
		bias.big += (master.jevBias.big ?? 0) * weight
		bias.diag += (master.jevBias.diag ?? 0) * weight
		bias.bleed += (master.jevBias.bleed ?? 0) * weight
		bias.cv += (master.jevBias.cv ?? 0) * weight
		bias.rhythm += (master.jevBias.rhythm ?? 0) * weight
		bias.aspect += (master.jevBias.aspect ?? 0) * weight
	}
	return {
		big: Number(bias.big.toFixed(5)),
		diag: Number(bias.diag.toFixed(5)),
		bleed: Number(bias.bleed.toFixed(5)),
		cv: Number(bias.cv.toFixed(5)),
		rhythm: Number(bias.rhythm.toFixed(5)),
		aspect: Number(bias.aspect.toFixed(5)),
	}
}

// -----------------------------------------------------------------------------
// (b) Per-factor override
// -----------------------------------------------------------------------------

export type FactorKind = keyof FactorVectors

export type FactorOverride =
	| { kind: 'lock-master'; masterId: MasterId }
	| { kind: 'manual'; weights: Record<string, number> }

/**
 * Override one factor vector, either by locking it to a single master's vector or
 * by supplying a manual weight map. Other factors in the result are untouched.
 */
export function overrideFactor(base: FactorVectors, factor: FactorKind, override: FactorOverride): FactorVectors {
	let replacement: Record<string, number>
	if (override.kind === 'lock-master') {
		const single = blendFactorVectors({ masterWeights: { [override.masterId]: 1 } })
		replacement = single[factor] as Record<string, number>
	} else {
		replacement = blendWeightMaps<string>([{ map: override.weights, weight: 1 }])
	}
	return { ...base, [factor]: replacement } as FactorVectors
}

// -----------------------------------------------------------------------------
// (c) Theory checklist evaluation
// -----------------------------------------------------------------------------

export type TheoryStatus = 'pass' | 'warn' | 'info'

/** Observable facts about a page/panel used to evaluate theory checklists. */
export interface TheoryEvalSpec {
	axisClean?: boolean
	hasSilentBeatBeforePeak?: boolean
	silentBeatHasNoBalloon?: boolean
	hasEstablishingShot?: boolean
	readingEntryCorrect?: boolean
	noUpstreamJump?: boolean
	endsOnPageTurnHook?: boolean
	allPanelsHaveWordPictureMode?: boolean
	pictureSpecificSuppressesDialogue?: boolean
	transitionsVaried?: boolean
	allCutsIntentional?: boolean
	allPanelsHaveSingleFocal?: boolean
	hasTurnBeat?: boolean
}

/** Maps a checklist item id to the spec flag that decides its status. */
const ITEM_EVALUATORS: Record<string, keyof TheoryEvalSpec> = {
	'axis-no-cross': 'axisClean',
	'ma-silent-before-peak': 'hasSilentBeatBeforePeak',
	'ma-no-balloon': 'silentBeatHasNoBalloon',
	'estab-opens-scene': 'hasEstablishingShot',
	'flow-entry-corner': 'readingEntryCorrect',
	'flow-no-upstream': 'noUpstreamJump',
	'turn-hook-last-panel': 'endsOnPageTurnHook',
	'wp-mode-named': 'allPanelsHaveWordPictureMode',
	'wp-no-redundancy': 'pictureSpecificSuppressesDialogue',
	'transition-variety': 'transitionsVaried',
	'transition-intentional': 'allCutsIntentional',
	'focal-single': 'allPanelsHaveSingleFocal',
	'kst-turn-present': 'hasTurnBeat',
}

export interface TheoryCheckResult {
	theoryId: string
	checklistId: string
	text: string
	scope: TheoryChecklistItem['scope']
	status: TheoryStatus
	note: string
}

/**
 * Evaluate every theory checklist item against a spec. Items with a known
 * evaluator return pass/warn from the spec flag; items without one, or whose flag
 * is undefined, return 'info' (needs human / visual judgement).
 */
export function evaluateTheoryChecklists(spec: TheoryEvalSpec): TheoryCheckResult[] {
	const results: TheoryCheckResult[] = []
	for (const item of THEORY_ITEMS) {
		for (const check of item.checklist) {
			const flagKey = ITEM_EVALUATORS[check.id]
			let status: TheoryStatus = 'info'
			let note = 'Informational: requires visual review.'
			if (flagKey !== undefined) {
				const value = spec[flagKey]
				if (value === true) {
					status = 'pass'
					note = 'Satisfied.'
				} else if (value === false) {
					status = 'warn'
					note = 'Not satisfied; review this principle.'
				}
			}
			results.push({ theoryId: item.id, checklistId: check.id, text: check.text, scope: check.scope, status, note })
		}
	}
	return results
}

/** Convenience: the subset of checklist items that have a programmatic evaluator. */
export function evaluableTheoryChecklistIds(): string[] {
	return Object.keys(ITEM_EVALUATORS)
}

export const MASTER_LIBRARY = MASTERS
