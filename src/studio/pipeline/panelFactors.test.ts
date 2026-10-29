import { describe, expect, it } from 'vitest'
import {
	PANEL_FACTORS_META_KEY,
	PANEL_FACTOR_KEYS,
	PANEL_FACTOR_TO_GRAPH,
	createPanelFactorsState,
	isEmptyPanelFactors,
	isLocked,
	isManual,
	lockedFactorsForPanel,
	readPanelFactorsFromMeta,
	resolvePanelFactorSource,
	setLocked,
	setManual,
	toggleLocked,
	writePanelFactorsToMeta,
} from './panelFactors'
import { FACTOR_DEFS } from './factorGraph'

describe('panelFactors — source resolution', () => {
	it('manual overrides win over master and auto', () => {
		const state = setManual(createPanelFactorsState(), 0, 'shot', true)
		expect(resolvePanelFactorSource(state, 0, 'shot', true)).toBe('manual')
		expect(resolvePanelFactorSource(state, 0, 'shot', false)).toBe('manual')
	})

	it('a master governs only master-governed factors when one is applied', () => {
		const state = createPanelFactorsState()
		expect(resolvePanelFactorSource(state, 0, 'transition', true)).toBe('master')
		expect(resolvePanelFactorSource(state, 0, 'shot', true)).toBe('master')
		// tension / eyeline / silent are never governed by a master.
		expect(resolvePanelFactorSource(state, 0, 'tension', true)).toBe('auto')
		expect(resolvePanelFactorSource(state, 0, 'eyeline', true)).toBe('auto')
	})

	it('falls back to auto with no master and no manual edit', () => {
		const state = createPanelFactorsState()
		expect(resolvePanelFactorSource(state, 0, 'transition', false)).toBe('auto')
		expect(resolvePanelFactorSource(state, 0, 'tension', false)).toBe('auto')
	})
})

describe('panelFactors — manual + lock tracking', () => {
	it('setManual is idempotent and clears cleanly', () => {
		let state = setManual(createPanelFactorsState(), 2, 'tension', true)
		expect(isManual(state, 2, 'tension')).toBe(true)
		const same = setManual(state, 2, 'tension', true)
		expect(same).toBe(state) // no-op returns same reference
		state = setManual(state, 2, 'tension', false)
		expect(isManual(state, 2, 'tension')).toBe(false)
		expect(isEmptyPanelFactors(state)).toBe(true)
	})

	it('toggleLocked flips and lists per-panel locks', () => {
		let state = toggleLocked(createPanelFactorsState(), 1, 'angle')
		expect(isLocked(state, 1, 'angle')).toBe(true)
		state = setLocked(state, 1, 'shot', true)
		expect(lockedFactorsForPanel(state, 1).sort()).toEqual(['angle', 'shot'])
		state = toggleLocked(state, 1, 'angle')
		expect(isLocked(state, 1, 'angle')).toBe(false)
		expect(lockedFactorsForPanel(state, 1)).toEqual(['shot'])
	})

	it('rejects negative / non-integer panel indices', () => {
		expect(setManual(createPanelFactorsState(), -1, 'shot', true)).toEqual(createPanelFactorsState())
		expect(setLocked(createPanelFactorsState(), 1.5, 'shot', true)).toEqual(createPanelFactorsState())
	})
})

describe('panelFactors — meta round-trip', () => {
	it('persists manual + locks while preserving other keys', () => {
		let state = setManual(createPanelFactorsState(), 0, 'transition', true)
		state = setLocked(state, 0, 'transition', true)
		state = setManual(state, 3, 'assetRefs', true)
		const meta = writePanelFactorsToMeta({ keepMe: 7 }, state)
		expect(meta.keepMe).toBe(7)
		expect(meta[PANEL_FACTORS_META_KEY]).toBeDefined()
		expect(readPanelFactorsFromMeta(meta)).toEqual(state)
	})

	it('loads an empty, neutral state from missing or malformed meta', () => {
		expect(readPanelFactorsFromMeta(undefined)).toEqual(createPanelFactorsState())
		expect(readPanelFactorsFromMeta({})).toEqual(createPanelFactorsState())
		const junk = readPanelFactorsFromMeta({
			[PANEL_FACTORS_META_KEY]: { manual: { 0: ['bogus', 'shot'], '-1': ['shot'] }, locks: 'nope' },
		})
		expect(junk.manual).toEqual({ 0: ['shot'] })
		expect(junk.locks).toEqual({})
	})
})

describe('panelFactors — graph mapping', () => {
	it('every editable factor maps to a real factor-graph node', () => {
		for (const key of PANEL_FACTOR_KEYS) {
			expect(FACTOR_DEFS[PANEL_FACTOR_TO_GRAPH[key]]).toBeDefined()
		}
	})
})
