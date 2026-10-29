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

/** An injectable delay (ms) → Promise. Lets the UI pulse each chip for a
 * minimum visible duration while tests pass a zero-delay stub. */
export type DelayFn = (ms: number) => Promise<void>

export interface AsyncRepropagationHooks {
	/** Yield + hold each stage visible for at least this long. Default 0. */
	minVisibleMs?: number
	/** How the executor yields / waits. Default: a real `setTimeout` promise. */
	delay?: DelayFn
	/** Called just before a stage's runner (chip → running). */
	onStageStart?: (stage: AppStage) => void
	/** Called just after a stage's runner completes (chip → done). */
	onStageDone?: (stage: AppStage) => void
}

const immediateDelay: DelayFn = () =>
	typeof queueMicrotask === 'function'
		? new Promise<void>((resolve) => queueMicrotask(resolve))
		: Promise.resolve()

/**
 * Run the stage runners one at a time, in topological order, yielding to the
 * caller between stages so a UI can render each stage's `running` state. The
 * `onStageStart` / `onStageDone` hooks bracket each runner; a configurable
 * minimum visible delay holds the running indicator long enough to be seen.
 * Pure control flow — all side effects live in the injected runners and hooks.
 */
export async function executeRepropagationAsync(
	plan: RepropagationPlan,
	runners: StageRunners,
	hooks: AsyncRepropagationHooks = {},
): Promise<RepropagationRun> {
	const order = stageOrderFromFactors(plan.factors)
	const ran: AppStage[] = []
	const skipped: AppStage[] = []
	const delay = hooks.delay ?? immediateDelay
	const minVisibleMs = Math.max(0, hooks.minVisibleMs ?? 0)
	for (const stage of order) {
		hooks.onStageStart?.(stage)
		// Yield first so the running indicator paints before the (sync) runner
		// blocks the main thread, and hold it for the minimum visible duration.
		await delay(minVisibleMs)
		const runner = runners[stage]
		if (runner) {
			runner()
			ran.push(stage)
		} else {
			skipped.push(stage)
		}
		hooks.onStageDone?.(stage)
	}
	return { order, ran, skipped }
}
