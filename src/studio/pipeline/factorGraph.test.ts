import { describe, expect, it } from 'vitest'
import {
	FACTOR_DEFS,
	FACTOR_IDS,
	TOPO_ORDER,
	directDownstream,
	directUpstream,
	downstreamClosure,
	createFactorGraphState,
	markDirty,
	markClean,
	isStale,
	planRepropagation,
	planRepropagationForState,
	factorsForStage,
	type FactorId,
} from './factorGraph'

describe('factor graph — structure', () => {
	it('is a DAG whose topological order places every dependency before its dependents', () => {
		expect(TOPO_ORDER).toHaveLength(FACTOR_IDS.length)
		const index = new Map(TOPO_ORDER.map((id, i) => [id, i]))
		for (const id of FACTOR_IDS) {
			for (const dep of FACTOR_DEFS[id].dependsOn) {
				expect(index.get(dep)!).toBeLessThan(index.get(id)!)
			}
		}
	})

	it('derives downstream edges as the inverse of dependsOn', () => {
		expect(directDownstream('styleBible')).toEqual(['artPrompt'])
		expect(directUpstream('artPrompt').sort()).toEqual(['assetRefs', 'cameraFraming', 'panelLayout', 'styleBible'])
		expect(directDownstream('gazeTrajectory')).toEqual([])
	})

	it('groups factors by stage', () => {
		expect(factorsForStage(1).sort()).toEqual(['assets', 'readingDirection', 'styleBible'])
		expect(factorsForStage(3).sort()).toEqual(['panelLayout', 'panelRects'])
	})
})

describe('factor graph — dirtiness propagation', () => {
	it('styleBible only invalidates the art prompt', () => {
		expect(downstreamClosure('styleBible')).toEqual(['artPrompt'])
		const { staleFactors, staleStages } = markDirty(createFactorGraphState(), 'styleBible')
		expect(staleFactors).toEqual(['artPrompt'])
		expect(staleStages).toEqual([4])
	})

	it('transition cascades through layout, art and lettering stages', () => {
		const closure = downstreamClosure('transition')
		expect(new Set(closure)).toEqual(
			new Set<FactorId>(['panelLayout', 'panelRects', 'artPrompt', 'balloonPlacement', 'gazeTrajectory']),
		)
		const result = markDirty(createFactorGraphState(), 'transition')
		expect(result.staleStages).toEqual([3, 4, 5])
		expect(isStale(result.state, 'transition')).toBe(true)
		expect(isStale(result.state, 'gazeTrajectory')).toBe(true)
		// The edited factor plus its downstream closure are all dirty.
		expect(result.state.dirty.size).toBe(closure.length + 1)
	})

	it('leaves the input state untouched (pure)', () => {
		const state = createFactorGraphState()
		markDirty(state, 'assets')
		expect(state.dirty.size).toBe(0)
	})

	it('re-propagation order is topological over the dirty set', () => {
		const result = markDirty(createFactorGraphState(), 'readingDirection')
		const plan = planRepropagationForState(result.state)
		const pos = (id: FactorId) => plan.indexOf(id)
		// panelLayout before panelRects before balloonPlacement before gazeTrajectory.
		expect(pos('panelLayout')).toBeLessThan(pos('panelRects'))
		expect(pos('panelRects')).toBeLessThan(pos('balloonPlacement'))
		expect(pos('balloonPlacement')).toBeLessThan(pos('gazeTrajectory'))
		// Every dependency within the plan precedes its dependents.
		for (const id of plan) {
			for (const dep of FACTOR_DEFS[id].dependsOn) {
				if (plan.includes(dep)) expect(pos(dep)).toBeLessThan(pos(id))
			}
		}
	})

	it('planRepropagation dedupes and orders an arbitrary dirty set', () => {
		const plan = planRepropagation(['gazeTrajectory', 'panelLayout', 'panelLayout', 'artPrompt'])
		expect(plan).toEqual(['panelLayout', 'artPrompt', 'gazeTrajectory'])
	})

	it('markClean clears recomputed factors', () => {
		const dirtied = markDirty(createFactorGraphState(), 'transition').state
		const cleaned = markClean(dirtied, ['panelLayout', 'artPrompt'])
		expect(isStale(cleaned, 'panelLayout')).toBe(false)
		expect(isStale(cleaned, 'artPrompt')).toBe(false)
		expect(isStale(cleaned, 'gazeTrajectory')).toBe(true)
	})
})
