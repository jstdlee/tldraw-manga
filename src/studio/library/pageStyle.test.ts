import { describe, expect, it } from 'vitest'
import {
	PAGE_STYLE_META_KEY,
	applyMasterToPage,
	applyMasterToPanel,
	blendMasterIntoPage,
	constrainableChecklistIds,
	createPageStyleState,
	isConstraintEnabled,
	isEmptyPageStyle,
	pageStyleToLayoutBias,
	readPageStyleFromMeta,
	removeMasterFromPage,
	setTheoryTick,
	theoryConstraintsToBias,
	toggleTheoryConstraint,
	writePageStyleToMeta,
} from './pageStyle'
import { resolveWeightedMasters } from './blend'
import { layoutScore, type LayoutFeatures } from '../layout/score'

const FEATURES: LayoutFeatures = {
	n: 5,
	rows: 3,
	bigShare: 0.2,
	bigIdx: 0,
	diagRatio: 0.2,
	bleedRatio: 0.1,
	cv: 0.2,
	vRhythm: 0.15,
	aspectSpread: 0.2,
	lastShare: 0.18,
}

describe('pageStyle — master application', () => {
	it('applyMasterToPage sets a single full-weight master', () => {
		const state = applyMasterToPage(createPageStyleState(), 'miller')
		expect(state.profile.masterWeights).toEqual({ miller: 1 })
		expect(isEmptyPageStyle(state)).toBe(false)
	})

	it('blendMasterIntoPage keeps prior masters and normalizes downstream', () => {
		let state = applyMasterToPage(createPageStyleState(), 'miller')
		state = blendMasterIntoPage(state, 'ware', 0.5)
		expect(state.profile.masterWeights).toEqual({ miller: 1, ware: 0.5 })
		const resolved = resolveWeightedMasters(state.profile)
		expect(resolved.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(1, 6)
		expect(resolved.find((r) => r.master.id === 'miller')!.weight).toBeCloseTo(1 / 1.5, 6)
	})

	it('a non-positive blend weight removes the master', () => {
		let state = blendMasterIntoPage(createPageStyleState(), 'miller', 1)
		state = blendMasterIntoPage(state, 'miller', 0)
		expect(state.profile.masterWeights.miller).toBeUndefined()
	})

	it('applyMasterToPanel scopes a master to one panel only', () => {
		const state = applyMasterToPanel(createPageStyleState(), 2, 'kirby')
		expect(state.panelProfiles[2].masterWeights).toEqual({ kirby: 1 })
		expect(state.profile.masterWeights).toEqual({})
	})
})

describe('pageStyle — theory constraints alter engine bias', () => {
	it('exposes only checklist items that carry a weight effect', () => {
		const ids = constrainableChecklistIds()
		expect(ids).toContain('turn-hook-last-panel')
		expect(ids).not.toContain('wp-mode-named') // no weightEffect hook
	})

	it('toggling a constraint produces a non-zero additive bias', () => {
		const empty = theoryConstraintsToBias([])
		expect(empty).toEqual({ big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 })
		const biased = theoryConstraintsToBias(['turn-hook-last-panel'])
		expect(biased.bleed).toBeCloseTo(0.04, 5)
		expect(biased.big).toBeCloseTo(0.03, 5)
	})

	it('an enabled constraint shifts the layout score relative to none', () => {
		const neutral = pageStyleToLayoutBias(createPageStyleState())
		expect(neutral).toEqual({ big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 })
		const base = layoutScore(FEATURES, 5, 'tension')
		const unbiased = layoutScore(FEATURES, 5, 'tension', neutral)
		expect(unbiased.score).toBe(base.score)

		const state = toggleTheoryConstraint(createPageStyleState(), 'turn-hook-last-panel')
		expect(isConstraintEnabled(state, 'turn-hook-last-panel')).toBe(true)
		const biased = layoutScore(FEATURES, 5, 'tension', pageStyleToLayoutBias(state))
		expect(biased.score).not.toBe(base.score)
	})

	it('folds master bias and constraint bias together', () => {
		let state = applyMasterToPage(createPageStyleState(), 'miller') // bleed +0.08, diag +0.06, cv +0.04
		state = toggleTheoryConstraint(state, 'turn-hook-last-panel') // bleed +0.04, big +0.03
		const bias = pageStyleToLayoutBias(state)
		expect(bias.bleed).toBeCloseTo(0.12, 5)
		expect(bias.big).toBeCloseTo(0.03, 5)
		expect(bias.diag).toBeCloseTo(0.06, 5)
	})
})

describe('pageStyle — meta round-trip (backward compatible)', () => {
	it('persists master apply, constraints and ticks, preserving other keys', () => {
		let state = applyMasterToPage(createPageStyleState(), 'inoue')
		state = applyMasterToPanel(state, 1, 'otomo')
		state = toggleTheoryConstraint(state, 'gutter-varies')
		state = setTheoryTick(state, 'wp-mode-named', true)
		const meta = writePageStyleToMeta({ keepMe: 1 }, state)
		expect(meta.keepMe).toBe(1)
		expect(meta[PAGE_STYLE_META_KEY]).toBeDefined()

		const restored = readPageStyleFromMeta(meta)
		expect(restored.profile.masterWeights).toEqual({ inoue: 1 })
		expect(restored.panelProfiles[1].masterWeights).toEqual({ otomo: 1 })
		expect(restored.constraints).toEqual(['gutter-varies'])
		expect(restored.ticks['wp-mode-named']).toBe(true)
	})

	it('loads an empty, neutral state from missing or malformed meta', () => {
		expect(readPageStyleFromMeta(undefined)).toEqual(createPageStyleState())
		expect(readPageStyleFromMeta({})).toEqual(createPageStyleState())
		const junk = readPageStyleFromMeta({
			[PAGE_STYLE_META_KEY]: { profile: { masterWeights: { bogus: 3, miller: -1 } }, constraints: ['nope'] },
		})
		expect(junk.profile.masterWeights).toEqual({})
		expect(junk.constraints).toEqual([])
		expect(isEmptyPageStyle(junk)).toBe(true)
	})

	it('removeMasterFromPage drops only that master', () => {
		let state = blendMasterIntoPage(createPageStyleState(), 'miller', 1)
		state = blendMasterIntoPage(state, 'ware', 1)
		state = removeMasterFromPage(state, 'miller')
		expect(state.profile.masterWeights).toEqual({ ware: 1 })
	})
})
