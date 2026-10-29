import { describe, expect, it } from 'vitest'
import { executeRepropagation, executeRepropagationAsync, stageOrderFromFactors } from './repropagate'
import { createPageDirtyState, markPageFactorDirty, planPageRepropagation } from './dirtyStore'
import type { AppStage } from '../library/productionStages'

describe('repropagate — stage order', () => {
	it('collapses a topo factor list to first-appearance stage order', () => {
		// panelLayout(3) → panelRects(3), artPrompt(4), balloonPlacement(5), gazeTrajectory(5)
		const dirty = markPageFactorDirty(createPageDirtyState(), 'panelLayout').state
		const plan = planPageRepropagation(dirty)
		const order = stageOrderFromFactors(plan.factors)

		// Every stale stage appears exactly once.
		expect(new Set(order).size).toBe(order.length)
		expect(order).toContain(3)
		expect(order).toContain(4)
		expect(order).toContain(5)
		// Topological: layout (3) before art (4) before lettering (5).
		expect(order.indexOf(3)).toBeLessThan(order.indexOf(4))
		expect(order.indexOf(4)).toBeLessThan(order.indexOf(5))
	})

	it('ignores unknown factor ids and maps only the factors given', () => {
		expect(stageOrderFromFactors(['bogus' as never, 'panelLayout', 'artPrompt'])).toEqual([3, 4])
	})
})

describe('repropagate — executor', () => {
	it('runs runners in topological stage order and records calls', () => {
		const dirty = markPageFactorDirty(createPageDirtyState(), 'panelLayout').state
		const plan = planPageRepropagation(dirty)

		const calls: AppStage[] = []
		const run = executeRepropagation(plan, {
			3: () => calls.push(3),
			4: () => calls.push(4),
			5: () => calls.push(5),
		})

		expect(run.ran).toEqual([3, 4, 5])
		expect(run.skipped).toEqual([])
		// Runners fire in the planned order.
		expect(calls).toEqual(run.order.filter((s) => [3, 4, 5].includes(s)))
	})

	it('skips stages that have no runner (never recomputes them)', () => {
		// Editing a Stage-2 factor leaves Stage 2 in the plan, but it has no runner:
		// the manual edit is the fresh value, so it is skipped, not recomputed.
		const dirty = markPageFactorDirty(createPageDirtyState(), 'transition').state
		const plan = planPageRepropagation(dirty)

		const calls: AppStage[] = []
		const run = executeRepropagation(plan, {
			3: () => calls.push(3),
			4: () => calls.push(4),
			5: () => calls.push(5),
		})

		expect(run.order).toContain(2)
		expect(run.skipped).toContain(2)
		expect(run.ran).not.toContain(2)
		expect(calls).toEqual([3, 4, 5])
	})

	it('runs nothing for an empty plan', () => {
		const plan = planPageRepropagation(createPageDirtyState())
		const run = executeRepropagation(plan, { 3: () => undefined })
		expect(run.order).toEqual([])
		expect(run.ran).toEqual([])
		expect(run.skipped).toEqual([])
	})
})

describe('repropagate — async executor', () => {
	it('fires start/done hooks around each stage, in topological order, with an injected delay', async () => {
		const dirty = markPageFactorDirty(createPageDirtyState(), 'panelLayout').state
		const plan = planPageRepropagation(dirty)

		const log: string[] = []
		const delays: number[] = []
		const run = await executeRepropagationAsync(
			plan,
			{
				3: () => log.push('run:3'),
				4: () => log.push('run:4'),
				5: () => log.push('run:5'),
			},
			{
				minVisibleMs: 350,
				delay: (ms) => {
					delays.push(ms)
					return Promise.resolve()
				},
				onStageStart: (stage) => log.push(`start:${stage}`),
				onStageDone: (stage) => log.push(`done:${stage}`),
			},
		)

		expect(run.ran).toEqual([3, 4, 5])
		// Each stage: start → (delay) → run → done, strictly before the next stage.
		expect(log).toEqual([
			'start:3', 'run:3', 'done:3',
			'start:4', 'run:4', 'done:4',
			'start:5', 'run:5', 'done:5',
		])
		// The minimum-visible delay is honoured once per stage.
		expect(delays).toEqual([350, 350, 350])
	})

	it('skips stages with no runner but still brackets them with hooks', async () => {
		const dirty = markPageFactorDirty(createPageDirtyState(), 'transition').state
		const plan = planPageRepropagation(dirty)
		const started: AppStage[] = []
		const run = await executeRepropagationAsync(
			plan,
			{ 3: () => undefined, 4: () => undefined, 5: () => undefined },
			{ delay: () => Promise.resolve(), onStageStart: (s) => started.push(s) },
		)
		expect(run.skipped).toContain(2)
		expect(run.ran).toEqual([3, 4, 5])
		expect(started).toContain(2)
	})
})
