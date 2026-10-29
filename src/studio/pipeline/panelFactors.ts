// =============================================================================
// panelFactors.ts — the per-panel, per-factor source/lock model that backs the
// Inspector's factor-level panel editing. It records, for each panel, which JEV
// factors the user has manually overridden and which are locked, and resolves
// each factor's display source (auto / master / manual). It is pure and JSON-
// serializable so it round-trips through a page shape's `meta` record backward-
// compatibly (empty/old meta loads as a neutral state).
//
// Two static maps couple a UI factor to the engine: MASTER_GOVERNED_FACTORS are
// the factors a master-style blend can bias, and PANEL_FACTOR_TO_GRAPH maps each
// editable factor to the factor-graph node whose downstream closure goes stale
// when it is edited.
// =============================================================================

import type { FactorId } from './factorGraph'

/** The editable per-panel JEV factors surfaced in the Panel inspector tab. */
export type PanelFactorKey =
	| 'transition'
	| 'shot'
	| 'angle'
	| 'lens'
	| 'wordPicture'
	| 'tension'
	| 'eyeline'
	| 'silent'
	| 'assetRefs'
	| 'masterStyle'

export const PANEL_FACTOR_KEYS: PanelFactorKey[] = [
	'transition',
	'shot',
	'angle',
	'lens',
	'wordPicture',
	'tension',
	'eyeline',
	'silent',
	'assetRefs',
	'masterStyle',
]

export type FactorSource = 'auto' | 'master' | 'manual'

/**
 * Factors a master-style blend can bias. The rest are always `auto` unless the
 * user overrides them manually. A master never governs tension, eyeline, silent
 * (Ma), bound asset refs or the panel's own master-style selector.
 */
export const MASTER_GOVERNED_FACTORS: ReadonlySet<PanelFactorKey> = new Set<PanelFactorKey>([
	'transition',
	'shot',
	'angle',
	'wordPicture',
])

/** Editable factor → the factor-graph node whose downstream goes stale on edit. */
export const PANEL_FACTOR_TO_GRAPH: Record<PanelFactorKey, FactorId> = {
	transition: 'transition',
	shot: 'cameraFraming',
	angle: 'cameraFraming',
	lens: 'cameraFraming',
	wordPicture: 'wordPictureMode',
	tension: 'tension',
	eyeline: 'eyeline',
	silent: 'wordPictureMode',
	assetRefs: 'assetRefs',
	masterStyle: 'styleBible',
}

export interface PanelFactorsState {
	/** Per-panel list of factor keys the user manually edited. */
	manual: Record<number, PanelFactorKey[]>
	/** Per-panel list of locked factor keys (survive re-runs and master application). */
	locks: Record<number, PanelFactorKey[]>
}

export const PANEL_FACTORS_META_KEY = 'panelFactors'

export function createPanelFactorsState(): PanelFactorsState {
	return { manual: {}, locks: {} }
}

export const EMPTY_PANEL_FACTORS: PanelFactorsState = createPanelFactorsState()

// -----------------------------------------------------------------------------
// Source resolution.
// -----------------------------------------------------------------------------

/**
 * Resolve a single factor's display source. Manual overrides win over everything;
 * otherwise a master governs the factor only if one is applied to this panel (or
 * inherited from the page) and the factor is in MASTER_GOVERNED_FACTORS.
 */
export function resolvePanelFactorSource(
	state: PanelFactorsState,
	panelIndex: number,
	key: PanelFactorKey,
	hasMaster: boolean,
): FactorSource {
	if (isManual(state, panelIndex, key)) return 'manual'
	if (hasMaster && MASTER_GOVERNED_FACTORS.has(key)) return 'master'
	return 'auto'
}

// -----------------------------------------------------------------------------
// Manual-edit tracking (pure; each mutator returns a new state).
// -----------------------------------------------------------------------------

function listHas(record: Record<number, PanelFactorKey[]>, panelIndex: number, key: PanelFactorKey): boolean {
	return (record[panelIndex] ?? []).includes(key)
}

function withListEntry(
	record: Record<number, PanelFactorKey[]>,
	panelIndex: number,
	key: PanelFactorKey,
	present: boolean,
): Record<number, PanelFactorKey[]> {
	const current = record[panelIndex] ?? []
	const has = current.includes(key)
	if (present === has) return record
	const next = { ...record }
	if (present) {
		next[panelIndex] = [...current, key]
	} else {
		const filtered = current.filter((k) => k !== key)
		if (filtered.length) next[panelIndex] = filtered
		else delete next[panelIndex]
	}
	return next
}

export function isManual(state: PanelFactorsState, panelIndex: number, key: PanelFactorKey): boolean {
	return listHas(state.manual, panelIndex, key)
}

/** Mark a factor as manually overridden (or clear that mark). */
export function setManual(
	state: PanelFactorsState,
	panelIndex: number,
	key: PanelFactorKey,
	manual: boolean,
): PanelFactorsState {
	if (!Number.isInteger(panelIndex) || panelIndex < 0) return state
	const next = withListEntry(state.manual, panelIndex, key, manual)
	if (next === state.manual) return state
	return { ...state, manual: next }
}

export function isLocked(state: PanelFactorsState, panelIndex: number, key: PanelFactorKey): boolean {
	return listHas(state.locks, panelIndex, key)
}

export function setLocked(
	state: PanelFactorsState,
	panelIndex: number,
	key: PanelFactorKey,
	locked: boolean,
): PanelFactorsState {
	if (!Number.isInteger(panelIndex) || panelIndex < 0) return state
	const next = withListEntry(state.locks, panelIndex, key, locked)
	if (next === state.locks) return state
	return { ...state, locks: next }
}

export function toggleLocked(state: PanelFactorsState, panelIndex: number, key: PanelFactorKey): PanelFactorsState {
	return setLocked(state, panelIndex, key, !isLocked(state, panelIndex, key))
}

/** The locked factor keys for a panel (a defensive copy). */
export function lockedFactorsForPanel(state: PanelFactorsState, panelIndex: number): PanelFactorKey[] {
	return [...(state.locks[panelIndex] ?? [])]
}

export function isEmptyPanelFactors(state: PanelFactorsState): boolean {
	return Object.keys(state.manual).length === 0 && Object.keys(state.locks).length === 0
}

// -----------------------------------------------------------------------------
// Serialization (meta round-trip, defensive against legacy / partial data).
// -----------------------------------------------------------------------------

const KEY_SET = new Set<string>(PANEL_FACTOR_KEYS)

function sanitizePanelMap(value: unknown): Record<number, PanelFactorKey[]> {
	const out: Record<number, PanelFactorKey[]> = {}
	if (!value || typeof value !== 'object') return out
	for (const [rawIdx, rawKeys] of Object.entries(value as Record<string, unknown>)) {
		const idx = Number(rawIdx)
		if (!Number.isInteger(idx) || idx < 0 || !Array.isArray(rawKeys)) continue
		const keys: PanelFactorKey[] = []
		for (const k of rawKeys) {
			if (typeof k === 'string' && KEY_SET.has(k) && !keys.includes(k as PanelFactorKey)) {
				keys.push(k as PanelFactorKey)
			}
		}
		if (keys.length) out[idx] = keys
	}
	return out
}

/** Read a page's panel-factor state from a shape `meta` object. */
export function readPanelFactorsFromMeta(meta: unknown): PanelFactorsState {
	if (!meta || typeof meta !== 'object') return createPanelFactorsState()
	const raw = (meta as Record<string, unknown>)[PANEL_FACTORS_META_KEY]
	if (!raw || typeof raw !== 'object') return createPanelFactorsState()
	const record = raw as Record<string, unknown>
	return { manual: sanitizePanelMap(record.manual), locks: sanitizePanelMap(record.locks) }
}

/** Merge a panel-factor state back into a shape `meta` object, keeping other keys. */
export function writePanelFactorsToMeta(meta: unknown, state: PanelFactorsState): Record<string, unknown> {
	const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
	base[PANEL_FACTORS_META_KEY] = {
		manual: Object.fromEntries(Object.entries(state.manual).map(([k, v]) => [k, [...v]])),
		locks: Object.fromEntries(Object.entries(state.locks).map(([k, v]) => [k, [...v]])),
	}
	return base
}
