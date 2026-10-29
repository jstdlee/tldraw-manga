// =============================================================================
// repropagate.ts — a pure executor that runs stage-recompute functions in the
// factor-graph's topological re-propagation order. It is deliberately decoupled
// from the editor: the caller supplies a map of per-stage runner closures (built
// over the live pipeline functions) and this module only decides which stages
// run and in what order. Image regeneration is never part of a re-propagation,
// so the runner map intentionally covers only the derivable stages (3-5); any
// stage without a runner is skipped, not recomputed.
// =============================================================================

import type { AppStage } from '../library/productionStages'
import { FACTOR_DEFS, type FactorId } from './factorGraph'
import type { RepropagationPlan } from './dirtyStore'

/** A synchronous stage recompute. Must never trigger image generation. */
export type StageRunner = () => void

/** Per-stage runner map. Missing stages are skipped (e.g. Stage 1/2 are inputs). */
export type StageRunners = Partial<Record<AppStage, StageRunner>>

/**
 * Collapse a topologically-ordered factor list to the stages it touches, in the
 * order each stage first appears. Because the factor list is already in
 * dependency order, this yields a stage order where every stage runs only after
 * the stages feeding it have been visited.
 */
export function stageOrderFromFactors(factors: Iterable<FactorId>): AppStage[] {
	const seen = new Set<AppStage>()
	const order: AppStage[] = []
	for (const id of factors) {
		const def = FACTOR_DEFS[id]
		if (!def) continue
		if (!seen.has(def.stage)) {
			seen.add(def.stage)
			order.push(def.stage)
		}
	}
	return order
}

export interface RepropagationRun {
	/** The stage order derived from the plan (every stale stage, in run order). */
	order: AppStage[]
	/** Stages that had a runner and were executed, in order. */
	ran: AppStage[]
	/** Stages with no runner (treated as already-fresh inputs), in order. */
	skipped: AppStage[]
}

/**
 * Execute the supplied runners for every stale stage in `plan`, honouring the
 * topological order. Returns which stages ran and which were skipped. A stage
 * without a runner is skipped silently — its factors are still considered
 * satisfied by the edit that produced them (the caller clears the dirty set).
 */
export function executeRepropagation(plan: RepropagationPlan, runners: StageRunners): RepropagationRun {
	const order = stageOrderFromFactors(plan.factors)
	const ran: AppStage[] = []
	const skipped: AppStage[] = []
	for (const stage of order) {
		const runner = runners[stage]
		if (runner) {
			runner()
			ran.push(stage)
		} else {
			skipped.push(stage)
		}
	}
	return { order, ran, skipped }
}
