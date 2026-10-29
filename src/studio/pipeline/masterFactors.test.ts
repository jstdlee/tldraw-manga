import { describe, expect, it } from 'vitest'
import { applyMasterFactorsToBeats, hasMasterStyle } from './masterFactors'
import { createPageStyleState, type PageStyleState } from '../library/pageStyle'
import { createPanelFactorsState, setLocked, setManual } from './panelFactors'
import { blendFactorVectors } from '../library/blend'
import type { Beat, Shot } from '../model'

const SEED = 'master-factors-spec'

function beat(i: number): Beat {
	return {
		shot: 'MS',
		angle: 'eye',
		focal: '50mm',
		beat: `beat ${i}`,
		who: [],
		lines: [],
		// Alternating tension so the tension-constrained picks exercise both ends.
		tension: i % 2 === 0 ? 0.3 : 0.8,
	}
}

function makeBeats(n: number): Beat[] {
	return Array.from({ length: n }, (_, i) => beat(i))
}

function style(partial: Partial<PageStyleState>): PageStyleState {
	return { ...createPageStyleState(), ...partial }
}

describe('applyMasterFactorsToBeats', () => {
	it('is a no-op (same reference) when no master is applied', () => {
		const beats = makeBeats(6)
		const out = applyMasterFactorsToBeats(beats, {
			pageStyle: createPageStyleState(),
			panelFactors: createPanelFactorsState(),
			seed: SEED,
		})
		expect(out).toBe(beats)
	})

	it('leaves beats untouched when only theory constraints (no masters) are set', () => {
		const beats = makeBeats(4)
		const pageStyle = style({ constraints: ['flow-entry-corner'] })
		expect(hasMasterStyle(pageStyle)).toBe(false)
		expect(applyMasterFactorsToBeats(beats, { pageStyle, panelFactors: createPanelFactorsState(), seed: SEED })).toBe(beats)
	})

	it('a master changes the chosen per-panel factor values', () => {
		const beats = makeBeats(6)
		const pageStyle = style({ profile: { masterWeights: { 'junji-ito': 1 } } })
		const out = applyMasterFactorsToBeats(beats, { pageStyle, panelFactors: createPanelFactorsState(), seed: SEED })
		expect(out).not.toBe(beats)
		// Every panel now carries a master-governed transition (baseline had none),
		// and at least one panel's shot changed away from the uniform 'MS' baseline.
		expect(out.every((b) => Boolean(b.mccloudTransition))).toBe(true)
		expect(out.some((b) => b.shot !== 'MS')).toBe(true)
		// The chosen shots only come from the master's shot vocabulary.
		const vocab = new Set<Shot>(['MS', 'CU', 'ECU'])
		expect(out.every((b) => vocab.has(b.shot))).toBe(true)
	})

	it('a factor lock to master A in a blend of A+B uses A\'s vector for that factor', () => {
		const beats = makeBeats(12)
		const factors = createPanelFactorsState()
		// A = junji-ito (vocab MS/CU/ECU), B = he-youzhi (vocab WS/MS/EWS). A dominant.
		const blendUnlocked = style({ profile: { masterWeights: { 'junji-ito': 0.7, 'he-youzhi': 0.3 } } })
		const blendLockedToA = style({ profile: { masterWeights: { 'junji-ito': 0.7, 'he-youzhi': 0.3 } }, factorLocks: ['shots'] })
		const aOnly = style({ profile: { masterWeights: { 'junji-ito': 1 } } })

		const shotsOf = (ps: PageStyleState) =>
			applyMasterFactorsToBeats(beats, { pageStyle: ps, panelFactors: factors, seed: SEED }).map((b) => b.shot)

		const unlocked = shotsOf(blendUnlocked)
		const locked = shotsOf(blendLockedToA)
		const aAlone = shotsOf(aOnly)

		// Locking the shots factor to the dominant master reproduces A's own picks...
		expect(locked).toEqual(aAlone)
		// ...never leaks a B-only shot (WS / EWS)...
		expect(locked.every((s) => s === 'MS' || s === 'CU' || s === 'ECU')).toBe(true)
		// ...while the unlocked blend does mix in a B-only shot, proving the lock matters.
		expect(unlocked.some((s) => s === 'WS' || s === 'EWS')).toBe(true)
	})

	it('a manual per-panel override always wins over the master value', () => {
		const beats = makeBeats(4)
		// Pin panel 0's shot manually; panel 1's shot via an explicit lock.
		let factors = setManual(createPanelFactorsState(), 0, 'shot', true)
		factors = setLocked(factors, 1, 'shot', true)
		const pageStyle = style({ profile: { masterWeights: { 'junji-ito': 1 } } })
		const out = applyMasterFactorsToBeats(beats, { pageStyle, panelFactors: factors, seed: SEED })
		expect(out[0].shot).toBe('MS')
		expect(out[1].shot).toBe('MS')
	})

	it('resolves the blended shot vector deterministically from blend.ts', () => {
		// Sanity: the module reads the same vectors blend.ts produces.
		const vectors = blendFactorVectors({ masterWeights: { 'junji-ito': 1 } })
		expect(Object.keys(vectors.shots).length).toBeGreaterThan(0)
	})
})
