// =============================================================================
// pageStyle.ts — the per-page style state that the Inspector's Masters and Theory
// tabs read and write: a blend of style masters (page-level and per-panel), the
// set of theory checklist items the user has promoted to engine constraints, and
// manual checklist tick state. It is pure and JSON-serializable so it round-trips
// through a tldraw shape's `meta` record, backward-compatibly (an empty/old meta
// loads as a neutral state that changes no engine output).
//
// The only engine coupling is `pageStyleToLayoutBias`, which folds the master
// blend bias and the enabled theory-constraint weight effects into a single
// additive `ScenarioWeightBias`. When nothing is applied it returns an all-zero
// bias, so `layoutScore` behaves exactly as it does today.
// =============================================================================

import type { ScenarioWeightBias } from '../layout/score'
import { styleProfileToLayoutBias, type StyleProfile } from './blend'
import { MASTER_IDS, type MasterId } from './masters'
import { THEORY_ITEMS } from './theory'

export interface PageStyleState {
	/** Page-level master blend (normalized downstream in blend.ts). */
	profile: StyleProfile
	/** Optional per-panel master overrides, keyed by panel index. */
	panelProfiles: Record<number, StyleProfile>
	/** Theory checklist ids promoted to active engine constraints. */
	constraints: string[]
	/** Manual pass/fail tick state keyed by checklist id. */
	ticks: Record<string, boolean>
}

export const PAGE_STYLE_META_KEY = 'pageStyle'

export function createPageStyleState(): PageStyleState {
	return { profile: { masterWeights: {} }, panelProfiles: {}, constraints: [], ticks: {} }
}

export const EMPTY_PAGE_STYLE: PageStyleState = createPageStyleState()

// -----------------------------------------------------------------------------
// Checklist → weight-effect index (built once from the theory library).
// -----------------------------------------------------------------------------

const CHECKLIST_WEIGHT_EFFECTS: Record<string, ScenarioWeightBias> = (() => {
	const map: Record<string, ScenarioWeightBias> = {}
	for (const item of THEORY_ITEMS) {
		for (const check of item.checklist) {
			if (check.hook?.weightEffect) map[check.id] = check.hook.weightEffect
		}
	}
	return map
})()

const CHECKLIST_IDS = new Set<string>(
	THEORY_ITEMS.flatMap((item) => item.checklist.map((check) => check.id)),
)

/** Checklist ids that carry an engine weight effect and can be used as constraints. */
export function constrainableChecklistIds(): string[] {
	return Object.keys(CHECKLIST_WEIGHT_EFFECTS)
}

export function isConstrainableChecklistId(id: string): boolean {
	return id in CHECKLIST_WEIGHT_EFFECTS
}

// -----------------------------------------------------------------------------
// Master application (all pure; each returns a new state).
// -----------------------------------------------------------------------------

/** Replace the page blend with a single master at full weight. */
export function applyMasterToPage(state: PageStyleState, masterId: MasterId): PageStyleState {
	return { ...state, profile: { masterWeights: { [masterId]: 1 } } }
}

/**
 * Blend a master into the page at a given weight (0..1), keeping any existing
 * masters. A non-positive weight removes the master from the blend.
 */
export function blendMasterIntoPage(state: PageStyleState, masterId: MasterId, weight: number): PageStyleState {
	const weights = { ...state.profile.masterWeights }
	if (!Number.isFinite(weight) || weight <= 0) {
		delete weights[masterId]
	} else {
		weights[masterId] = Number(weight)
	}
	return { ...state, profile: { masterWeights: weights } }
}

export function removeMasterFromPage(state: PageStyleState, masterId: MasterId): PageStyleState {
	const weights = { ...state.profile.masterWeights }
	delete weights[masterId]
	return { ...state, profile: { masterWeights: weights } }
}

export function clearPageMasters(state: PageStyleState): PageStyleState {
	return { ...state, profile: { masterWeights: {} } }
}

/** Apply a single master to one panel only (does not touch the page blend). */
export function applyMasterToPanel(state: PageStyleState, panelIndex: number, masterId: MasterId): PageStyleState {
	if (!Number.isInteger(panelIndex) || panelIndex < 0) return state
	return {
		...state,
		panelProfiles: { ...state.panelProfiles, [panelIndex]: { masterWeights: { [masterId]: 1 } } },
	}
}

export function clearPanelMaster(state: PageStyleState, panelIndex: number): PageStyleState {
	if (!(panelIndex in state.panelProfiles)) return state
	const panelProfiles = { ...state.panelProfiles }
	delete panelProfiles[panelIndex]
	return { ...state, panelProfiles }
}

// -----------------------------------------------------------------------------
// Theory constraints & ticks.
// -----------------------------------------------------------------------------

/** Toggle a theory checklist item as an active engine constraint. */
export function toggleTheoryConstraint(state: PageStyleState, checklistId: string): PageStyleState {
	if (!isConstrainableChecklistId(checklistId)) return state
	const has = state.constraints.includes(checklistId)
	const constraints = has
		? state.constraints.filter((id) => id !== checklistId)
		: [...state.constraints, checklistId]
	return { ...state, constraints }
}

export function setTheoryConstraint(state: PageStyleState, checklistId: string, enabled: boolean): PageStyleState {
	if (!isConstrainableChecklistId(checklistId)) return state
	const has = state.constraints.includes(checklistId)
	if (enabled === has) return state
	return toggleTheoryConstraint(state, checklistId)
}

export function isConstraintEnabled(state: PageStyleState, checklistId: string): boolean {
	return state.constraints.includes(checklistId)
}

/** Record a manual tick (pass/fail) for a checklist item. */
export function setTheoryTick(state: PageStyleState, checklistId: string, ticked: boolean): PageStyleState {
	if (!CHECKLIST_IDS.has(checklistId)) return state
	const ticks = { ...state.ticks }
	if (ticked) ticks[checklistId] = true
	else delete ticks[checklistId]
	return { ...state, ticks }
}

export function isChecklistTicked(state: PageStyleState, checklistId: string): boolean {
	return Boolean(state.ticks[checklistId])
}

// -----------------------------------------------------------------------------
// Engine bias.
// -----------------------------------------------------------------------------

function zeroBias(): Required<ScenarioWeightBias> {
	return { big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 }
}

function addBias(acc: Required<ScenarioWeightBias>, delta: ScenarioWeightBias): void {
	acc.big += delta.big ?? 0
	acc.diag += delta.diag ?? 0
	acc.bleed += delta.bleed ?? 0
	acc.cv += delta.cv ?? 0
	acc.rhythm += delta.rhythm ?? 0
	acc.aspect += delta.aspect ?? 0
}

function roundBias(acc: Required<ScenarioWeightBias>): ScenarioWeightBias {
	return {
		big: Number(acc.big.toFixed(5)),
		diag: Number(acc.diag.toFixed(5)),
		bleed: Number(acc.bleed.toFixed(5)),
		cv: Number(acc.cv.toFixed(5)),
		rhythm: Number(acc.rhythm.toFixed(5)),
		aspect: Number(acc.aspect.toFixed(5)),
	}
}

/** Combined additive layout bias from a set of enabled theory constraint ids. */
export function theoryConstraintsToBias(constraintIds: Iterable<string>): ScenarioWeightBias {
	const acc = zeroBias()
	for (const id of constraintIds) {
		const effect = CHECKLIST_WEIGHT_EFFECTS[id]
		if (effect) addBias(acc, effect)
	}
	return roundBias(acc)
}

/**
 * The page's total layout-score bias: the master blend bias plus every enabled
 * theory constraint's weight effect. An empty state returns an all-zero bias, so
 * `layoutScore` output is byte-identical to the no-style path.
 */
export function pageStyleToLayoutBias(state: PageStyleState): ScenarioWeightBias {
	const acc = zeroBias()
	addBias(acc, styleProfileToLayoutBias(state.profile))
	addBias(acc, theoryConstraintsToBias(state.constraints))
	return roundBias(acc)
}

export function isEmptyPageStyle(state: PageStyleState): boolean {
	return (
		Object.keys(state.profile.masterWeights).length === 0 &&
		Object.keys(state.panelProfiles).length === 0 &&
		state.constraints.length === 0 &&
		Object.keys(state.ticks).length === 0
	)
}

// -----------------------------------------------------------------------------
// Serialization (meta round-trip, defensive against legacy/partial data).
// -----------------------------------------------------------------------------

const MASTER_ID_SET = new Set<string>(MASTER_IDS)

function sanitizeProfile(value: unknown): StyleProfile {
	const weights: Partial<Record<MasterId, number>> = {}
	if (value && typeof value === 'object') {
		const raw = (value as { masterWeights?: unknown }).masterWeights
		if (raw && typeof raw === 'object') {
			for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
				const num = Number(val)
				if (MASTER_ID_SET.has(key) && Number.isFinite(num) && num > 0) weights[key as MasterId] = num
			}
		}
	}
	return { masterWeights: weights }
}

/** Read a page's style state from a shape `meta` object (empty on missing/old). */
export function readPageStyleFromMeta(meta: unknown): PageStyleState {
	if (!meta || typeof meta !== 'object') return createPageStyleState()
	const raw = (meta as Record<string, unknown>)[PAGE_STYLE_META_KEY]
	if (!raw || typeof raw !== 'object') return createPageStyleState()
	const record = raw as Record<string, unknown>

	const panelProfiles: Record<number, StyleProfile> = {}
	if (record.panelProfiles && typeof record.panelProfiles === 'object') {
		for (const [key, val] of Object.entries(record.panelProfiles as Record<string, unknown>)) {
			const idx = Number(key)
			if (Number.isInteger(idx) && idx >= 0) {
				const profile = sanitizeProfile(val)
				if (Object.keys(profile.masterWeights).length) panelProfiles[idx] = profile
			}
		}
	}

	const constraints = Array.isArray(record.constraints)
		? record.constraints.filter((id): id is string => typeof id === 'string' && isConstrainableChecklistId(id))
		: []

	const ticks: Record<string, boolean> = {}
	if (record.ticks && typeof record.ticks === 'object') {
		for (const [key, val] of Object.entries(record.ticks as Record<string, unknown>)) {
			if (CHECKLIST_IDS.has(key) && val === true) ticks[key] = true
		}
	}

	return { profile: sanitizeProfile(record.profile), panelProfiles, constraints, ticks }
}

/** Merge a page's style state into a shape `meta` object, preserving other keys. */
export function writePageStyleToMeta(meta: unknown, state: PageStyleState): Record<string, unknown> {
	const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
	base[PAGE_STYLE_META_KEY] = {
		profile: { masterWeights: { ...state.profile.masterWeights } },
		panelProfiles: Object.fromEntries(
			Object.entries(state.panelProfiles).map(([k, v]) => [k, { masterWeights: { ...v.masterWeights } }]),
		),
		constraints: [...state.constraints],
		ticks: { ...state.ticks },
	}
	return base
}
