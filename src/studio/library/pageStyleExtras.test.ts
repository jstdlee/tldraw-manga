import { describe, expect, it } from 'vitest'
import {
	FACTOR_KINDS,
	PAGE_STYLE_META_KEY,
	createPageStyleState,
	isEmptyPageStyle,
	isFactorLocked,
	isMasterChecklistTicked,
	readPageStyleFromMeta,
	setMasterChecklistTick,
	toggleFactorLock,
	writePageStyleToMeta,
} from './pageStyle'

describe('pageStyle — per-factor locks', () => {
	it('toggles a factor lock and reports state', () => {
		let state = toggleFactorLock(createPageStyleState(), 'transitions')
		expect(isFactorLocked(state, 'transitions')).toBe(true)
		expect(isEmptyPageStyle(state)).toBe(false)
		state = toggleFactorLock(state, 'transitions')
		expect(isFactorLocked(state, 'transitions')).toBe(false)
		expect(isEmptyPageStyle(state)).toBe(true)
	})

	it('ignores unknown factor kinds', () => {
		expect(toggleFactorLock(createPageStyleState(), 'bogus' as never)).toEqual(createPageStyleState())
	})

	it('exposes exactly the six blendable factor families', () => {
		expect(FACTOR_KINDS).toEqual(['transitions', 'wordPicture', 'shots', 'angles', 'layouts', 'pacing'])
	})
})

describe('pageStyle — master decision-checklist ticks', () => {
	it('sets and clears a master checklist tick', () => {
		let state = setMasterChecklistTick(createPageStyleState(), 'miller', 2, true)
		expect(isMasterChecklistTicked(state, 'miller', 2)).toBe(true)
		expect(isMasterChecklistTicked(state, 'miller', 0)).toBe(false)
		state = setMasterChecklistTick(state, 'miller', 2, false)
		expect(isMasterChecklistTicked(state, 'miller', 2)).toBe(false)
	})
})

describe('pageStyle — extended round-trip is backward compatible', () => {
	it('persists factor locks and master ticks, dropping unknown masters', () => {
		let state = toggleFactorLock(createPageStyleState(), 'shots')
		state = setMasterChecklistTick(state, 'otomo', 1, true)
		const meta = writePageStyleToMeta({}, state)
		expect(readPageStyleFromMeta(meta)).toEqual(state)

		const junk = readPageStyleFromMeta({
			[PAGE_STYLE_META_KEY]: { factorLocks: ['nope', 'shots'], masterTicks: { 'bogus:0': true, 'oda:1': true } },
		})
		expect(junk.factorLocks).toEqual(['shots'])
		expect(junk.masterTicks).toEqual({ 'oda:1': true })
	})

	it('empty state is detected across all stores', () => {
		expect(isEmptyPageStyle(createPageStyleState())).toBe(true)
		expect(readPageStyleFromMeta(undefined)).toEqual(createPageStyleState())
	})
})
