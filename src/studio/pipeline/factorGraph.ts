// =============================================================================
// factorGraph.ts — explicit, story-agnostic factor dependency graph spanning the
// app's Stage 1-5 pipeline. Editing a factor marks its transitive downstream
// factors (and their stages) stale; re-propagation runs in topological order so a
// factor is never recomputed before its dependencies are fresh. Fully pure.
// =============================================================================

import type { AppStage } from '../library/productionStages'

export type FactorId =
	// Stage 1 — context / style bible / assets
	| 'styleBible'
	| 'assets'
	| 'readingDirection'
	// Stage 2 — storyboard decisions
	| 'transition'
	| 'tension'
	| 'cameraFraming'
	| 'wordPictureMode'
	| 'eyeline'
	// Stage 3 — layout
	| 'panelLayout'
	| 'panelRects'
	// Stage 4 — asset-locked art prompt
	| 'assetRefs'
	| 'negativeSpace'
	| 'artPrompt'
	// Stage 5 — lettering / reading flow
	| 'lettering'
	| 'balloonPlacement'
	| 'gazeTrajectory'

export interface FactorDef {
	id: FactorId
	stage: AppStage
	label: string
	/** Upstream factors this factor is computed from. */
	dependsOn: FactorId[]
}

export const FACTOR_DEFS: Record<FactorId, FactorDef> = {
	styleBible: { id: 'styleBible', stage: 1, label: 'Style Bible', dependsOn: [] },
	assets: { id: 'assets', stage: 1, label: 'Discrete Assets', dependsOn: [] },
	readingDirection: { id: 'readingDirection', stage: 1, label: 'Reading Direction', dependsOn: [] },

	transition: { id: 'transition', stage: 2, label: 'Panel Transition', dependsOn: [] },
	tension: { id: 'tension', stage: 2, label: 'Tension', dependsOn: [] },
	cameraFraming: { id: 'cameraFraming', stage: 2, label: 'Camera Framing', dependsOn: [] },
	wordPictureMode: { id: 'wordPictureMode', stage: 2, label: 'Word-Picture Mode', dependsOn: [] },
	eyeline: { id: 'eyeline', stage: 2, label: 'Eyeline', dependsOn: [] },

	panelLayout: {
		id: 'panelLayout',
		stage: 3,
		label: 'Panel Layout',
		dependsOn: ['readingDirection', 'transition', 'tension', 'cameraFraming'],
	},
	panelRects: { id: 'panelRects', stage: 3, label: 'Panel Rectangles', dependsOn: ['panelLayout'] },

	assetRefs: { id: 'assetRefs', stage: 4, label: 'Resolved Asset Refs', dependsOn: ['assets'] },
	negativeSpace: { id: 'negativeSpace', stage: 4, label: 'Negative Space', dependsOn: ['wordPictureMode'] },
	artPrompt: {
		id: 'artPrompt',
		stage: 4,
		label: 'Pure Art Prompt',
		dependsOn: ['styleBible', 'cameraFraming', 'panelLayout', 'assetRefs'],
	},

	lettering: { id: 'lettering', stage: 5, label: 'Lettering', dependsOn: ['wordPictureMode'] },
	balloonPlacement: {
		id: 'balloonPlacement',
		stage: 5,
		label: 'Balloon Placement',
		dependsOn: ['readingDirection', 'panelRects', 'negativeSpace'],
	},
	gazeTrajectory: {
		id: 'gazeTrajectory',
		stage: 5,
		label: 'Gaze Trajectory',
		dependsOn: ['readingDirection', 'eyeline', 'lettering', 'balloonPlacement'],
	},
}

export const FACTOR_IDS = Object.keys(FACTOR_DEFS) as FactorId[]

// -----------------------------------------------------------------------------
// Derived adjacency (downstream edges) and topological order.
// -----------------------------------------------------------------------------

const DOWNSTREAM: Record<FactorId, FactorId[]> = (() => {
	const map = Object.fromEntries(FACTOR_IDS.map((id) => [id, [] as FactorId[]])) as Record<FactorId, FactorId[]>
	for (const id of FACTOR_IDS) {
		for (const dep of FACTOR_DEFS[id].dependsOn) {
			map[dep].push(id)
		}
	}
	return map
})()

/** Factors directly computed from the given factor. */
export function directDownstream(factorId: FactorId): FactorId[] {
	return [...DOWNSTREAM[factorId]]
}

/** Factors the given factor is directly computed from. */
export function directUpstream(factorId: FactorId): FactorId[] {
	return [...FACTOR_DEFS[factorId].dependsOn]
}

/**
 * Deterministic topological order over all factors (dependencies before
 * dependents). Computed once via depth-first post-order; the graph is a DAG.
 */
export const TOPO_ORDER: FactorId[] = (() => {
	const visited = new Set<FactorId>()
	const temp = new Set<FactorId>()
	const order: FactorId[] = []
	const visit = (id: FactorId): void => {
		if (visited.has(id)) return
		if (temp.has(id)) throw new Error(`Factor graph cycle detected at ${id}`)
		temp.add(id)
		for (const dep of FACTOR_DEFS[id].dependsOn) visit(dep)
		temp.delete(id)
		visited.add(id)
		order.push(id)
	}
	// Visit in stable id order for a deterministic result.
	for (const id of FACTOR_IDS) visit(id)
	return order
})()

const TOPO_INDEX: Record<FactorId, number> = Object.fromEntries(
	TOPO_ORDER.map((id, index) => [id, index]),
) as Record<FactorId, number>

/** Transitive downstream closure of a factor (not including the factor itself). */
export function downstreamClosure(factorId: FactorId): FactorId[] {
	const seen = new Set<FactorId>()
	const stack = [...DOWNSTREAM[factorId]]
	while (stack.length) {
		const next = stack.pop()
		if (next === undefined || seen.has(next)) continue
		seen.add(next)
		for (const child of DOWNSTREAM[next]) stack.push(child)
	}
	return TOPO_ORDER.filter((id) => seen.has(id))
}

// -----------------------------------------------------------------------------
// Dirtiness state (pure; every mutator returns a new state).
// -----------------------------------------------------------------------------

export interface FactorGraphState {
	dirty: ReadonlySet<FactorId>
}

export function createFactorGraphState(): FactorGraphState {
	return { dirty: new Set<FactorId>() }
}

export interface MarkDirtyResult {
	state: FactorGraphState
	/** Downstream factors turned stale by this edit (the edited factor is re-run by definition). */
	staleFactors: FactorId[]
	/** Distinct stages (1-5) that now contain stale factors. */
	staleStages: AppStage[]
}

/**
 * Mark a factor edited: the factor itself and its entire downstream closure become
 * dirty. Returns a new state plus the downstream factors and stages that went stale.
 */
export function markDirty(state: FactorGraphState, factorId: FactorId): MarkDirtyResult {
	const downstream = downstreamClosure(factorId)
	const nextDirty = new Set(state.dirty)
	nextDirty.add(factorId)
	for (const id of downstream) nextDirty.add(id)
	const staleStages = Array.from(new Set(downstream.map((id) => FACTOR_DEFS[id].stage))).sort((a, b) => a - b)
	return { state: { dirty: nextDirty }, staleFactors: downstream, staleStages }
}

export function isStale(state: FactorGraphState, factorId: FactorId): boolean {
	return state.dirty.has(factorId)
}

/** Clear the dirty flag on specific factors (e.g. after they are recomputed). */
export function markClean(state: FactorGraphState, factorIds: FactorId[]): FactorGraphState {
	const nextDirty = new Set(state.dirty)
	for (const id of factorIds) nextDirty.delete(id)
	return { dirty: nextDirty }
}

/**
 * Plan re-propagation: the dirty factors in topological order so each is
 * recomputed only after every dependency it needs is already fresh.
 */
export function planRepropagation(dirtyFactors: Iterable<FactorId>): FactorId[] {
	const set = new Set(dirtyFactors)
	return [...set].sort((a, b) => TOPO_INDEX[a] - TOPO_INDEX[b])
}

/** Plan re-propagation for the whole current dirty set of a state. */
export function planRepropagationForState(state: FactorGraphState): FactorId[] {
	return planRepropagation(state.dirty)
}

export function factorsForStage(stage: AppStage): FactorId[] {
	return FACTOR_IDS.filter((id) => FACTOR_DEFS[id].stage === stage)
}
