import { describe, expect, it } from 'vitest'
import {
	DIRTY_META_KEY,
	clearPageDirty,
	clearPageRunning,
	createPageDirtyState,
	hasPageDirty,
	isPageFactorStale,
	markPageFactorDirty,
	markPageFactorsClean,
	markPageStagesRunning,
	pageStaleStages,
	planPageRepropagation,
	readDirtyStateFromMeta,
	writeDirtyStateToMeta,
} from './dirtyStore'
import { FACTOR_DEFS, type FactorId } from './factorGraph'

describe('dirtyStore — marking', () => {
	it('marks the edited factor and its downstream closure stale', () => {
		const { state, staleFactors, staleStages } = markPageFactorDirty(createPageDirtyState(), 'readingDirection')
		expect(state.dirty).toContain('readingDirection')
		expect(new Set(staleFactors)).toEqual(
			new Set<FactorId>(['panelLayout', 'panelRects', 'artPrompt', 'balloonPlacement', 'gazeTrajectory']),
		)
		// Edited factor stage (1) plus all downstream stages.
		expect(staleStages).toEqual([1, 3, 4, 5])
		expect(isPageFactorStale(state, 'gazeTrajectory')).toBe(true)
	})

	it('does not mutate the input state (pure)', () => {
		const state = createPageDirtyState()
		markPageFactorDirty(state, 'transition')
		expect(state.dirty).toHaveLength(0)
	})

	it('accumulates across several independent edits', () => {
		let state = createPageDirtyState()
		state = markPageFactorDirty(state, 'styleBible').state
		state = markPageFactorDirty(state, 'lettering').state
		expect(isPageFactorStale(state, 'artPrompt')).toBe(true) // from styleBible
		expect(isPageFactorStale(state, 'gazeTrajectory')).toBe(true) // from lettering
		// styleBible (stage 1) and lettering (stage 5) stay stale themselves, plus
		// artPrompt (stage 4) downstream.
		expect(pageStaleStages(state)).toEqual([1, 4, 5])
	})
})

describe('dirtyStore — clearing', () => {
	it('clears recomputed factors but leaves others stale', () => {
		const dirtied = markPageFactorDirty(createPageDirtyState(), 'transition').state
		const cleaned = markPageFactorsClean(dirtied, ['panelLayout', 'panelRects', 'artPrompt'])
		expect(isPageFactorStale(cleaned, 'panelLayout')).toBe(false)
		expect(isPageFactorStale(cleaned, 'balloonPlacement')).toBe(true)
	})

	it('clearPageDirty wipes dirty and running together', () => {
		let state = markPageFactorDirty(createPageDirtyState(), 'transition').state
		state = markPageStagesRunning(state, [3])
		const cleared = clearPageDirty(state)
		expect(hasPageDirty(cleared)).toBe(false)
		expect(cleared.running).toHaveLength(0)
	})
})

describe('dirtyStore — running markers', () => {
	it('adds and clears running stages without touching dirty', () => {
		const dirtied = markPageFactorDirty(createPageDirtyState(), 'panelLayout').state
		const running = markPageStagesRunning(dirtied, [3, 3, 9 as unknown as 3])
		expect(running.running).toEqual([3])
		expect(running.dirty).toEqual(dirtied.dirty)
		expect(clearPageRunning(running).running).toHaveLength(0)
	})
})

describe('dirtyStore — re-propagation plan', () => {
	it('orders factors topologically and stages ascending', () => {
		const state = markPageFactorDirty(createPageDirtyState(), 'readingDirection').state
		const { factors, stages } = planPageRepropagation(state)
		const pos = (id: FactorId) => factors.indexOf(id)
		// Every dependency within the plan precedes its dependents.
		for (const id of factors) {
			for (const dep of FACTOR_DEFS[id].dependsOn) {
				if (factors.includes(dep)) expect(pos(dep)).toBeLessThan(pos(id))
			}
		}
		expect(pos('panelLayout')).toBeLessThan(pos('panelRects'))
		expect(pos('panelRects')).toBeLessThan(pos('balloonPlacement'))
		expect(pos('balloonPlacement')).toBeLessThan(pos('gazeTrajectory'))
		// Stages are ascending and distinct.
		expect(stages).toEqual([...stages].sort((a, b) => a - b))
		expect(new Set(stages).size).toBe(stages.length)
	})

	it('an empty state plans nothing', () => {
		const plan = planPageRepropagation(createPageDirtyState())
		expect(plan.factors).toHaveLength(0)
		expect(plan.stages).toHaveLength(0)
	})
})

describe('dirtyStore — meta serialization', () => {
	it('round-trips through a shape meta object, preserving unrelated keys', () => {
		let state = markPageFactorDirty(createPageDirtyState(), 'transition').state
		state = markPageStagesRunning(state, [3])
		const meta = writeDirtyStateToMeta({ other: 'keep' }, state)
		expect(meta.other).toBe('keep')
		expect(meta[DIRTY_META_KEY]).toBeDefined()
		const restored = readDirtyStateFromMeta(meta)
		expect(restored.dirty).toEqual(state.dirty)
		expect(restored.running).toEqual(state.running)
	})

	it('loads empty from missing or malformed meta (backward compatible)', () => {
		expect(readDirtyStateFromMeta(undefined)).toEqual(createPageDirtyState())
		expect(readDirtyStateFromMeta({})).toEqual(createPageDirtyState())
		expect(readDirtyStateFromMeta({ [DIRTY_META_KEY]: { dirty: ['nope', 42], running: ['x', 7] } })).toEqual(
			createPageDirtyState(),
		)
	})
})
