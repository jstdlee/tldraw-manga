// =============================================================================
// masterFactors.ts — pure, story-agnostic injection of a page's master-style
// blend into per-panel JEV factor *values* (not just layout bias and prompt
// tokens). When a page has a master or blend applied, this picks each panel's
// shot size, camera angle, McCloud transition and word-picture mode from the
// blended factor weight vectors by deterministic, seeded weighted selection,
// constrained by the beat's tension and the existing engine rules.
//
// Precedence, highest first:
//   1. A manual per-panel override or lock (panelFactors) — the user always wins.
//   2. A page-level factor lock (pageStyle.factorLocks) — pins that factor family
//      to the blend's dominant master's vector.
//   3. The blended master vector for that factor.
//
// When no master/blend is applied to the page (and no per-panel master override
// exists), `applyMasterFactorsToBeats` returns the input array unchanged (same
// reference), so the engine's output stays byte-identical to the no-style path.
// =============================================================================

import { blendFactorVectors, overrideFactor, resolveWeightedMasters, type FactorKind, type FactorVectors } from '../library/blend'
import type { StyleProfile } from '../library/blend'
import type { MasterId } from '../library/masters'
import type { PageStyleState } from '../library/pageStyle'
import { SHOT_SIZES, type ShotSizeId } from '../library/shots'
import { strHash } from '../layout/engine'
import type { Angle, Beat, Shot } from '../model'
import type { McCloudTransition, WordPictureMode } from '../jev/fiveStageEngine'
import { isLocked, isManual, type PanelFactorKey, type PanelFactorsState } from './panelFactors'

// -----------------------------------------------------------------------------
// Valid Beat-level value sets (the blended vectors can carry library ids a Beat
// cannot hold, e.g. the 'insert' shot or the 'worm' angle — those are dropped).
// -----------------------------------------------------------------------------

const VALID_SHOTS = new Set<Shot>(['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU'])
const VALID_ANGLES = new Set<Angle>(['low', 'high', 'eye', 'bird', 'dutch'])

/** One governed factor: how it reads from the vectors and writes back to a Beat. */
interface GovernedFactor {
	/** Panel-factor key used for manual / lock checks (panelFactors). */
	panelKey: PanelFactorKey
	/** Factor family used for the page-level factor lock (pageStyle.factorLocks). */
	factorKind: FactorKind
	/** A stable token folded into the per-panel seed so each factor picks independently. */
	seedTag: string
}

const GOVERNED_FACTORS: GovernedFactor[] = [
	{ panelKey: 'shot', factorKind: 'shots', seedTag: 'shot' },
	{ panelKey: 'angle', factorKind: 'angles', seedTag: 'angle' },
	{ panelKey: 'transition', factorKind: 'transitions', seedTag: 'transition' },
	{ panelKey: 'wordPicture', factorKind: 'wordPicture', seedTag: 'wordpicture' },
]

const SHOT_TENSION_BIAS: Record<string, number> = Object.fromEntries(SHOT_SIZES.map((s) => [s.id, s.tensionBias]))

// -----------------------------------------------------------------------------
// Deterministic weighted selection.
// -----------------------------------------------------------------------------

/** A uniform number in [0,1) derived purely from a seed string. */
function seed01(seedStr: string): number {
	return strHash(seedStr) / 4294967296
}

/**
 * Pick one key from a weight map by a seeded cumulative draw. Keys are sorted so
 * the result depends only on the weights and the seed, never on object order.
 */
function seededPick<K extends string>(weights: Partial<Record<K, number>>, r: number): K | null {
	const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => Number.isFinite(w) && w > 0)
	if (!entries.length) return null
	entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
	const total = entries.reduce((sum, [, w]) => sum + w, 0)
	const target = r * total
	let acc = 0
	for (const [key, weight] of entries) {
		acc += weight
		if (target < acc) return key
	}
	return entries[entries.length - 1][0]
}

/** Keep only weights whose key is a Beat-valid value. */
function filterByValidKeys<K extends string>(weights: Partial<Record<K, number>>, valid: ReadonlySet<K>): Partial<Record<K, number>> {
	const out: Partial<Record<K, number>> = {}
	for (const [key, weight] of Object.entries(weights) as [K, number][]) {
		if (valid.has(key) && Number(weight) > 0) out[key] = weight
	}
	return out
}

/** Shot affinity for a tension: framings whose tension bias matches read stronger. */
function shotTensionMultiplier(shot: ShotSizeId, tension: number): number {
	const bias = SHOT_TENSION_BIAS[shot]
	if (bias === undefined) return 1
	return Math.max(0.15, 1 - 2 * Math.abs(bias - tension))
}

/** Angle affinity for a tension: calm beats read level/high, peaks read low/canted. */
function angleTensionMultiplier(angle: Angle, tension: number): number {
	if (tension >= 0.7) {
		if (angle === 'low' || angle === 'dutch') return 1.5
		if (angle === 'eye') return 0.7
		if (angle === 'high') return 0.9
		return 1
	}
	if (tension <= 0.35) {
		if (angle === 'eye') return 1.3
		if (angle === 'high') return 1.2
		if (angle === 'low' || angle === 'dutch') return 0.7
		return 1
	}
	return 1
}

function applyMultiplier<K extends string>(weights: Partial<Record<K, number>>, mult: (key: K) => number): Partial<Record<K, number>> {
	const out: Partial<Record<K, number>> = {}
	for (const [key, weight] of Object.entries(weights) as [K, number][]) {
		const scaled = Number(weight) * mult(key)
		if (scaled > 0) out[key] = scaled
	}
	return out
}

// -----------------------------------------------------------------------------
// Profile / dominant-master resolution.
// -----------------------------------------------------------------------------

/** The highest-weighted master in a profile; ties break on the master id. */
function dominantMaster(profile: StyleProfile): MasterId | null {
	const weighted = resolveWeightedMasters(profile)
	if (!weighted.length) return null
	let best = weighted[0]
	for (const entry of weighted) {
		if (entry.weight > best.weight || (entry.weight === best.weight && entry.master.id < best.master.id)) {
			best = entry
		}
	}
	return best.master.id
}

/** Whether a page carries any master blend (page-level or per-panel). */
export function hasMasterStyle(pageStyle: PageStyleState): boolean {
	if (resolveWeightedMasters(pageStyle.profile).length) return true
	for (const profile of Object.values(pageStyle.panelProfiles)) {
		if (resolveWeightedMasters(profile).length) return true
	}
	return false
}

/**
 * Build the effective factor vectors for one panel: the panel's own master
 * override if it has one, else the page blend, then pin any page-level
 * factor-locked families to that profile's dominant master vector.
 */
function vectorsForPanel(pageStyle: PageStyleState, panelIndex: number): { vectors: FactorVectors; profile: StyleProfile } | null {
	const panelProfile = pageStyle.panelProfiles[panelIndex]
	const profile =
		panelProfile && resolveWeightedMasters(panelProfile).length ? panelProfile : pageStyle.profile
	if (!resolveWeightedMasters(profile).length) return null
	let vectors = blendFactorVectors(profile)
	if (pageStyle.factorLocks.length) {
		const dominant = dominantMaster(profile)
		if (dominant) {
			for (const kind of pageStyle.factorLocks) {
				vectors = overrideFactor(vectors, kind, { kind: 'lock-master', masterId: dominant })
			}
		}
	}
	return { vectors, profile }
}

// -----------------------------------------------------------------------------
// Public entry point.
// -----------------------------------------------------------------------------

export interface ApplyMasterFactorsInput {
	pageStyle: PageStyleState
	panelFactors: PanelFactorsState
	/** Page seed; folded into the per-panel per-factor selection seed. */
	seed: string
}

/**
 * Return a new beat list with each panel's master-governed factor values chosen
 * from the page's blended master vectors, unless a manual per-panel override /
 * lock holds that factor (which always wins). When no master/blend is applied,
 * the input array is returned unchanged so output is byte-identical to today.
 */
export function applyMasterFactorsToBeats(beats: Beat[], input: ApplyMasterFactorsInput): Beat[] {
	const { pageStyle, panelFactors, seed } = input
	if (!beats.length || !hasMasterStyle(pageStyle)) return beats

	let mutated = false
	const next = beats.map((beat, panelIndex) => {
		const resolved = vectorsForPanel(pageStyle, panelIndex)
		if (!resolved) return beat
		const { vectors } = resolved
		const tension = typeof beat.tension === 'number' ? beat.tension : 0.5
		let out = beat

		const setValue = (patch: Partial<Beat>): void => {
			out = out === beat ? { ...beat, ...patch } : { ...out, ...patch }
			mutated = true
		}

		for (const factor of GOVERNED_FACTORS) {
			// A manual override or an explicit lock on the panel always wins.
			if (isManual(panelFactors, panelIndex, factor.panelKey) || isLocked(panelFactors, panelIndex, factor.panelKey)) {
				continue
			}
			const r = seed01(`${seed}:p${panelIndex}:${factor.seedTag}`)
			if (factor.panelKey === 'shot') {
				const weights = applyMultiplier(filterByValidKeys(vectors.shots, VALID_SHOTS), (k) => shotTensionMultiplier(k, tension))
				const chosen = seededPick<ShotSizeId>(weights, r)
				if (chosen && chosen !== beat.shot) setValue({ shot: chosen as Shot })
			} else if (factor.panelKey === 'angle') {
				const weights = applyMultiplier(filterByValidKeys(vectors.angles as Partial<Record<Angle, number>>, VALID_ANGLES), (k) =>
					angleTensionMultiplier(k, tension),
				)
				const chosen = seededPick<Angle>(weights, r)
				if (chosen && chosen !== beat.angle) setValue({ angle: chosen })
			} else if (factor.panelKey === 'transition') {
				const chosen = seededPick<McCloudTransition>(vectors.transitions, r)
				if (chosen && chosen !== beat.mccloudTransition) setValue({ mccloudTransition: chosen })
			} else if (factor.panelKey === 'wordPicture') {
				// A silent (Ma) beat keeps its picture-specific wording; never reword it.
				if (beat.silent) continue
				const chosen = seededPick<WordPictureMode>(vectors.wordPicture, r)
				if (chosen && chosen !== beat.wordPictureMode) setValue({ wordPictureMode: chosen })
			}
		}
		return out
	})

	return mutated ? next : beats
}
