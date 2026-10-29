// =============================================================================
// dirtyStore.ts — a small, serializable per-page record of which factors (and
// therefore which pipeline stages) are stale, plus which stages are mid-recompute.
// It wraps the pure factor graph (factorGraph.ts) with a JSON-friendly shape that
// round-trips through a tldraw shape's `meta` record, so the dirty set survives
// reload and is independent per page. Every mutator is pure and returns a new
// state; nothing here touches the editor or React.
// =============================================================================

import type { AppStage } from '../library/productionStages'
import {
	FACTOR_DEFS,
	FACTOR_IDS,
	createFactorGraphState,
	downstreamClosure,
	markClean,
	markDirty,
	planRepropagation,
	type FactorId,
} from './factorGraph'

/** Per-page staleness, stored as plain arrays so it serializes into shape meta. */
export interface PageDirtyState {
	/** Factors currently stale (the edited factor plus its downstream closure). */
	dirty: FactorId[]
	/** Stages currently being recomputed; takes precedence in the status chips. */
	running: AppStage[]
}

/** The meta key under which a page's dirty state is persisted. */
export const DIRTY_META_KEY = 'pipelineDirty'

export const EMPTY_DIRTY_STATE: PageDirtyState = { dirty: [], running: [] }

export function createPageDirtyState(): PageDirtyState {
	return { dirty: [], running: [] }
}

const FACTOR_SET = new Set<string>(FACTOR_IDS)
const STAGE_SET = new Set<number>([1, 2, 3, 4, 5])

function sanitizeFactors(value: unknown): FactorId[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<FactorId>()
	for (const entry of value) {
		if (typeof entry === 'string' && FACTOR_SET.has(entry)) seen.add(entry as FactorId)
	}
	// Keep a deterministic, stage-grouped order.
	return FACTOR_IDS.filter((id) => seen.has(id))
}

function sanitizeStages(value: unknown): AppStage[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<AppStage>()
	for (const entry of value) {
		const n = Number(entry)
		if (STAGE_SET.has(n)) seen.add(n as AppStage)
	}
	return Array.from(seen).sort((a, b) => a - b)
}

/**
 * Read a page's dirty state from a shape `meta` object. Missing or malformed data
 * yields an empty state, so documents and presets saved before this feature load
 * cleanly with nothing marked stale.
 */
export function readDirtyStateFromMeta(meta: unknown): PageDirtyState {
	if (!meta || typeof meta !== 'object') return createPageDirtyState()
	const raw = (meta as Record<string, unknown>)[DIRTY_META_KEY]
	if (!raw || typeof raw !== 'object') return createPageDirtyState()
	const record = raw as Record<string, unknown>
	return { dirty: sanitizeFactors(record.dirty), running: sanitizeStages(record.running) }
}

/** Merge a dirty state back into a shape `meta` object without dropping other keys. */
export function writeDirtyStateToMeta(meta: unknown, state: PageDirtyState): Record<string, unknown> {
	const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
	base[DIRTY_META_KEY] = { dirty: [...state.dirty], running: [...state.running] }
	return base
}

export interface MarkPageDirtyResult {
	state: PageDirtyState
	/** Downstream factors this edit turned stale (not counting the edited factor). */
	staleFactors: FactorId[]
	/** Distinct stages that now contain a stale factor. */
	staleStages: AppStage[]
}

/**
 * Mark a factor edited: it and its whole downstream closure become stale. The
 * edited factor's stage is included in `staleStages` because its own output must
 * be recomputed too — this is what the StageBar highlights.
 */
export function markPageFactorDirty(state: PageDirtyState, factorId: FactorId): MarkPageDirtyResult {
	const graph = createFactorGraphState()
	graph.dirty = new Set(state.dirty)
	const result = markDirty(graph, factorId)
	const dirty = FACTOR_IDS.filter((id) => result.state.dirty.has(id))
	// Stages of every factor this edit newly turned stale, including the edited
	// factor's own stage, since its output must be recomputed too.
	const edited = new Set<FactorId>([factorId, ...result.staleFactors])
	const staleStages = Array.from(new Set([...edited].map((id) => FACTOR_DEFS[id].stage))).sort((a, b) => a - b)
	return { state: { dirty, running: state.running }, staleFactors: result.staleFactors, staleStages }
}

/** Factors that are stale purely as a downstream consequence of `factorId`. */
export function dependentsOf(factorId: FactorId): FactorId[] {
	return downstreamClosure(factorId)
}

/** Mark specific stages as mid-recompute (idempotent, deduped, sorted). */
export function markPageStagesRunning(state: PageDirtyState, stages: Iterable<AppStage>): PageDirtyState {
	const next = new Set<AppStage>(state.running)
	for (const stage of stages) if (STAGE_SET.has(stage)) next.add(stage)
	return { dirty: state.dirty, running: Array.from(next).sort((a, b) => a - b) }
}

/** Clear all running markers (e.g. when a re-propagation pass finishes). */
export function clearPageRunning(state: PageDirtyState): PageDirtyState {
	if (!state.running.length) return state
	return { dirty: state.dirty, running: [] }
}

/** Clear the dirty flag on recomputed factors (keeps running untouched). */
export function markPageFactorsClean(state: PageDirtyState, factorIds: Iterable<FactorId>): PageDirtyState {
	const graph = createFactorGraphState()
	graph.dirty = new Set(state.dirty)
	const cleaned = markClean(graph, [...factorIds])
	return { dirty: FACTOR_IDS.filter((id) => cleaned.dirty.has(id)), running: state.running }
}

/** Clear everything (dirty + running) — used after a full compile. */
export function clearPageDirty(state: PageDirtyState): PageDirtyState {
	if (!state.dirty.length && !state.running.length) return state
	return createPageDirtyState()
}

export function isPageFactorStale(state: PageDirtyState, factorId: FactorId): boolean {
	return state.dirty.includes(factorId)
}

export function hasPageDirty(state: PageDirtyState): boolean {
	return state.dirty.length > 0
}

/** Distinct stages that currently hold a stale factor, ascending. */
export function pageStaleStages(state: PageDirtyState): AppStage[] {
	const stages = new Set<AppStage>()
	for (const id of state.dirty) stages.add(FACTOR_DEFS[id].stage)
	return Array.from(stages).sort((a, b) => a - b)
}

export interface RepropagationPlan {
	/** Stale factors in topological order (dependencies before dependents). */
	factors: FactorId[]
	/** Distinct stale stages in ascending stage order. */
	stages: AppStage[]
}

/**
 * Plan a re-propagation: the dirty factors sorted topologically so no factor is
 * recomputed before its dependencies are fresh, plus the ascending list of stages
 * those factors belong to. Image regeneration is never part of this plan.
 */
export function planPageRepropagation(state: PageDirtyState): RepropagationPlan {
	const factors = planRepropagation(state.dirty)
	const stages = Array.from(new Set(factors.map((id) => FACTOR_DEFS[id].stage))).sort((a, b) => a - b)
	return { factors, stages }
}
