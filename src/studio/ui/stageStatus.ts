// =============================================================================
// stageStatus.ts — derive the five pipeline-stage status chips (bottom stage
// bar) from the factor-graph dirty set plus runtime running/completed sets.
// Pure and unit-testable; the UI only renders what this returns.
// =============================================================================

import { FACTOR_DEFS, type FactorId } from '../pipeline/factorGraph'
import type { AppStage } from '../library/productionStages'

export type StageStatus = 'idle' | 'done' | 'stale' | 'running'

export const APP_STAGES: readonly AppStage[] = [1, 2, 3, 4, 5]

export interface StageMeta {
	stage: AppStage
	title: string
	/** Inspector tab to focus when the chip is clicked. */
	inspectorTab: 'cards' | 'layout' | 'story' | 'camera' | 'llm'
}

/** Labels + the Inspector tab each stage focuses, per the V2 architecture. */
export const STAGE_META: readonly StageMeta[] = [
	{ stage: 1, title: 'Context & Assets', inspectorTab: 'cards' },
	{ stage: 2, title: 'Content & Storyboard', inspectorTab: 'story' },
	{ stage: 3, title: 'Layout', inspectorTab: 'layout' },
	{ stage: 4, title: 'Art', inspectorTab: 'camera' },
	{ stage: 5, title: 'Lettering', inspectorTab: 'llm' },
]

export interface StageStatusInput {
	/** Factors currently marked dirty in the factor graph. */
	dirty: Iterable<FactorId>
	/** Stages mid-recompute. Takes precedence over everything else. */
	running?: Iterable<AppStage>
	/** Stages that have produced output at least once (otherwise idle). */
	completed?: Iterable<AppStage>
}

/**
 * Status for every stage 1-5:
 * - `running` if the stage is mid-recompute.
 * - else `stale` if any factor on the stage is dirty.
 * - else `done` if the stage has been computed at least once.
 * - else `idle`.
 */
export function deriveStageStatuses(input: StageStatusInput): Record<AppStage, StageStatus> {
	const dirtyStages = new Set<AppStage>()
	for (const factorId of input.dirty) {
		const def = FACTOR_DEFS[factorId]
		if (def) dirtyStages.add(def.stage)
	}
	const running = new Set<AppStage>(input.running ?? [])
	const completed = new Set<AppStage>(input.completed ?? [])

	const result = {} as Record<AppStage, StageStatus>
	for (const stage of APP_STAGES) {
		if (running.has(stage)) result[stage] = 'running'
		else if (dirtyStages.has(stage)) result[stage] = 'stale'
		else if (completed.has(stage)) result[stage] = 'done'
		else result[stage] = 'idle'
	}
	return result
}

/** True when any stage is stale and a re-propagate action should be offered. */
export function hasStaleStage(statuses: Record<AppStage, StageStatus>): boolean {
	return APP_STAGES.some((stage) => statuses[stage] === 'stale')
}

/**
 * Observable evidence that each pipeline stage has produced output on the
 * canvas. Kept as plain booleans so the UI can collect them from tldraw shapes
 * and this module stays free of any editor dependency.
 */
export interface StageEvidence {
	/** Stage 1: at least one reference/style asset exists. */
	hasAssets: boolean
	/** Stage 2: panel beats / storyboard metadata exist. */
	hasStoryboard: boolean
	/** Stage 3: a realized panel layout (genome) exists. */
	hasLayout: boolean
	/** Stage 4: at least one panel carries rendered art. */
	hasArt: boolean
	/** Stage 5: at least one balloon / lettering layer exists. */
	hasLettering: boolean
}

/**
 * Map canvas evidence to the set of stages that have been computed at least
 * once. Stages are independent flags: a later stage can read as done even if an
 * earlier one is not, which the status derivation still renders faithfully.
 */
export function completedStagesFrom(evidence: StageEvidence): AppStage[] {
	const done: AppStage[] = []
	if (evidence.hasAssets) done.push(1)
	if (evidence.hasStoryboard) done.push(2)
	if (evidence.hasLayout) done.push(3)
	if (evidence.hasArt) done.push(4)
	if (evidence.hasLettering) done.push(5)
	return done
}
