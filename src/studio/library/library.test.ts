import { describe, expect, it } from 'vitest'
import {
	PRODUCTION_STAGES,
	PRODUCTION_STAGE_IDS,
	productionStagesForAppStage,
	PANEL_LAYOUTS,
	PANEL_LAYOUT_IDS,
	panelTemplateToRealizedPanels,
	isValidPanelTemplate,
	SHOT_SIZES,
	SHOT_SIZE_IDS,
	SHOT_ANGLE_IDS,
	LENS_PRESETS,
	CAMERA_MOVES,
	BALLOON_TYPES,
	BALLOON_TYPE_IDS,
	SFX_STYLES,
	SFX_STYLE_IDS,
	TONE_STYLES,
	TONE_STYLE_IDS,
	PACING_STRATEGIES,
	PACING_IDS,
	GENRES,
	GENRE_IDS,
	MASTERS,
	MASTER_IDS,
	THEORY_ITEMS,
	THEORY_IDS,
	allTheoryChecklistItems,
	type MasterId,
} from './index'
import {
	resolveWeightedMasters,
	isEmptyProfile,
	blendStyleBibleFragment,
	blendFactorVectors,
	styleProfileToLayoutBias,
	overrideFactor,
	evaluateTheoryChecklists,
	evaluableTheoryChecklistIds,
	type StyleProfile,
} from './blend'
import { SCENARIOS, layoutScore, type LayoutFeatures } from '../layout/score'
import { FACTOR_IDS } from '../pipeline/factorGraph'

const MCCLOUD_TRANSITIONS = [
	'moment_to_moment',
	'action_to_action',
	'subject_to_subject',
	'scene_to_scene',
	'aspect_to_aspect',
	'non_sequitur',
]
const WORD_PICTURE_MODES = [
	'word_specific',
	'picture_specific',
	'duo_specific',
	'additive',
	'parallel',
	'montage',
	'interdependent',
]
const BUBBLE_STYLES = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']

// Catches CJK ideographs, kana, and full/half-width forms.
const CJK_RE = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

function unique<T>(items: T[]): boolean {
	return new Set(items).size === items.length
}

describe('library — id integrity', () => {
	it('every module has unique ids', () => {
		expect(unique(PRODUCTION_STAGE_IDS)).toBe(true)
		expect(unique(PANEL_LAYOUT_IDS)).toBe(true)
		expect(unique(SHOT_SIZE_IDS)).toBe(true)
		expect(unique(SHOT_ANGLE_IDS)).toBe(true)
		expect(unique(LENS_PRESETS.map((l) => l.id))).toBe(true)
		expect(unique(CAMERA_MOVES.map((m) => m.id))).toBe(true)
		expect(unique(BALLOON_TYPE_IDS)).toBe(true)
		expect(unique(SFX_STYLE_IDS)).toBe(true)
		expect(unique(TONE_STYLE_IDS)).toBe(true)
		expect(unique(PACING_IDS)).toBe(true)
		expect(unique(GENRE_IDS)).toBe(true)
		expect(unique(MASTER_IDS)).toBe(true)
		expect(unique(THEORY_IDS)).toBe(true)
		expect(unique(allTheoryChecklistItems().map((c) => c.id))).toBe(true)
	})
})

describe('library — cross-reference resolution', () => {
	it('panel layouts reference valid scenarios and pacing', () => {
		for (const layout of PANEL_LAYOUTS) {
			expect(isValidPanelTemplate(layout)).toBe(true)
			expect(layout.scenarioAffinity.every((s) => SCENARIOS.includes(s))).toBe(true)
			expect(layout.pacingAffinity.every((p) => PACING_IDS.includes(p))).toBe(true)
			expect(layout.supportedDirections).toContain(layout.defaultDirection)
		}
	})

	it('pacing references valid shots and transitions', () => {
		for (const strategy of PACING_STRATEGIES) {
			expect(strategy.dominantShots.every((s) => SHOT_SIZE_IDS.includes(s))).toBe(true)
			expect(strategy.favouredTransitions.every((t) => MCCLOUD_TRANSITIONS.includes(t))).toBe(true)
			expect(strategy.panelCount[0]).toBeLessThanOrEqual(strategy.panelCount[1])
			expect(strategy.tensionCurve.every((v) => v >= 0 && v <= 1)).toBe(true)
		}
	})

	it('lettering balloon types map to valid engine bubble styles', () => {
		for (const balloon of BALLOON_TYPES) {
			if (balloon.mapsToBubbleStyle) expect(BUBBLE_STYLES).toContain(balloon.mapsToBubbleStyle)
		}
	})

	it('genres reference only valid ids from other modules', () => {
		for (const genre of GENRES) {
			expect(genre.preferredLayouts.every((l) => PANEL_LAYOUT_IDS.includes(l))).toBe(true)
			expect(genre.pacing.every((p) => PACING_IDS.includes(p))).toBe(true)
			expect(genre.tones.every((t) => TONE_STYLE_IDS.includes(t))).toBe(true)
			expect(genre.balloons.every((b) => BALLOON_TYPE_IDS.includes(b))).toBe(true)
			expect(genre.sfx.every((s) => SFX_STYLE_IDS.includes(s))).toBe(true)
			expect(genre.shots.every((s) => SHOT_SIZE_IDS.includes(s))).toBe(true)
		}
	})

	it('masters reference valid layouts, shots, and McCloud ids', () => {
		for (const master of MASTERS) {
			expect(master.preferredLayouts.every((l) => PANEL_LAYOUT_IDS.includes(l))).toBe(true)
			expect(master.shotVocabulary.every((s) => SHOT_SIZE_IDS.includes(s))).toBe(true)
			expect(Object.keys(master.mccloud.transitions).every((t) => MCCLOUD_TRANSITIONS.includes(t))).toBe(true)
			expect(Object.keys(master.mccloud.wordPicture).every((w) => WORD_PICTURE_MODES.includes(w))).toBe(true)
		}
	})

	it('production stages map to valid app stages', () => {
		for (const stage of PRODUCTION_STAGES) {
			expect(stage.mapsToAppStages.every((n) => n >= 1 && n <= 5)).toBe(true)
		}
		expect(productionStagesForAppStage(5).length).toBeGreaterThan(0)
	})

	it('theory checklist hooks reference valid factor ids', () => {
		for (const check of allTheoryChecklistItems()) {
			if (check.hook?.factorId) expect(FACTOR_IDS).toContain(check.hook.factorId)
			expect(['page', 'panel', 'balloon']).toContain(check.scope)
		}
	})
})

describe('library — weight normalization & completeness', () => {
	it('every master McCloud transition and word-picture vector sums to 1', () => {
		for (const master of MASTERS) {
			const tSum = Object.values(master.mccloud.transitions).reduce((a, b) => a + b, 0)
			const wSum = Object.values(master.mccloud.wordPicture).reduce((a, b) => a + b, 0)
			expect(tSum).toBeCloseTo(1, 5)
			expect(wSum).toBeCloseTo(1, 5)
			expect(master.mccloud.abstraction).toBeGreaterThanOrEqual(0)
			expect(master.mccloud.abstraction).toBeLessThanOrEqual(1)
			expect(master.mccloud.closureIntensity).toBeGreaterThanOrEqual(0)
			expect(master.mccloud.closureIntensity).toBeLessThanOrEqual(1)
		}
	})

	it('every master has a 5-10 item decision checklist', () => {
		for (const master of MASTERS) {
			expect(master.checklist.length).toBeGreaterThanOrEqual(5)
			expect(master.checklist.length).toBeLessThanOrEqual(10)
		}
	})

	it('includes the required master roster', () => {
		const required: MasterId[] = [
			'tezuka', 'toriyama', 'inoue', 'otomo', 'urasawa', 'miura', 'araki', 'oda',
			'takahashi', 'moebius', 'herge', 'miller', 'kirby', 'eisner', 'ware',
			'matsumoto', 'asano', 'nihei', 'junji-ito', 'miyazaki', 'he-youzhi',
		]
		for (const id of required) expect(MASTER_IDS).toContain(id)
		expect(MASTERS.length).toBeGreaterThanOrEqual(21)
	})
})

describe('library — zero CJK characters', () => {
	it('contains no Chinese / Japanese / full-width characters anywhere', () => {
		const blobs = [
			PRODUCTION_STAGES,
			PANEL_LAYOUTS,
			SHOT_SIZES,
			LENS_PRESETS,
			CAMERA_MOVES,
			BALLOON_TYPES,
			SFX_STYLES,
			TONE_STYLES,
			PACING_STRATEGIES,
			GENRES,
			MASTERS,
			THEORY_ITEMS,
		]
		for (const blob of blobs) {
			const serialized = JSON.stringify(blob)
			expect(CJK_RE.test(serialized)).toBe(false)
		}
	})
})

describe('library — panel template adapter', () => {
	it('converts normalized rects into scaled polygon panels in reading order', () => {
		const grid = PANEL_LAYOUTS.find((l) => l.id === 'three-tier-grid')!
		const panels = panelTemplateToRealizedPanels(grid, 1000, 1400)
		expect(panels).toHaveLength(grid.panels.length)
		for (const panel of panels) {
			expect(panel.pts).toHaveLength(4)
			for (const [x, y] of panel.pts) {
				expect(x).toBeGreaterThanOrEqual(-1)
				expect(x).toBeLessThanOrEqual(1001)
				expect(y).toBeGreaterThanOrEqual(-1)
				expect(y).toBeLessThanOrEqual(1401)
			}
		}
	})
})

const PROFILE_MILLER: StyleProfile = { masterWeights: { miller: 1 } }
const PROFILE_BLEND: StyleProfile = { masterWeights: { miller: 2, ware: 1 } }
const PROFILE_EMPTY: StyleProfile = { masterWeights: {} }

describe('blend — master weighting', () => {
	it('normalizes master weights to sum 1 and detects empty profiles', () => {
		const resolved = resolveWeightedMasters(PROFILE_BLEND)
		const sum = resolved.reduce((a, b) => a + b.weight, 0)
		expect(sum).toBeCloseTo(1, 6)
		expect(resolved.find((r) => r.master.id === 'miller')!.weight).toBeCloseTo(2 / 3, 6)
		expect(isEmptyProfile(PROFILE_EMPTY)).toBe(true)
		expect(isEmptyProfile(PROFILE_MILLER)).toBe(false)
		// Non-positive and unknown weights are ignored.
		expect(resolveWeightedMasters({ masterWeights: { miller: 0, tezuka: -1 } })).toHaveLength(0)
	})

	it('blends a style bible fragment weighted toward the dominant master', () => {
		expect(blendStyleBibleFragment(PROFILE_EMPTY).promptTokens).toHaveLength(0)
		const fragment = blendStyleBibleFragment(PROFILE_MILLER)
		expect(fragment.promptTokens.length).toBeGreaterThan(0)
		expect(fragment.abstraction).toBeCloseTo(0.35, 4)
		// Blended abstraction is the weighted average of miller (0.35) and ware (0.85).
		const blended = blendStyleBibleFragment(PROFILE_BLEND)
		expect(blended.abstraction).toBeCloseTo((2 * 0.35 + 1 * 0.85) / 3, 4)
	})
})

describe('blend — factor vectors', () => {
	it('produces normalized vectors for all six factor kinds', () => {
		const vectors = blendFactorVectors(PROFILE_BLEND)
		for (const kind of ['transitions', 'wordPicture', 'shots', 'angles', 'layouts', 'pacing'] as const) {
			const values = Object.values(vectors[kind]) as number[]
			expect(values.length).toBeGreaterThan(0)
			expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
			expect(values.every((v) => v >= 0)).toBe(true)
		}
	})

	it('a single-master lock reproduces that master transition vector', () => {
		const vectors = blendFactorVectors(PROFILE_MILLER)
		const miller = MASTERS.find((m) => m.id === 'miller')!
		for (const [key, value] of Object.entries(miller.mccloud.transitions)) {
			expect(vectors.transitions[key as keyof typeof vectors.transitions]).toBeCloseTo(value as number, 5)
		}
	})

	it('per-factor override replaces exactly one vector', () => {
		const base = blendFactorVectors(PROFILE_BLEND)
		const overridden = overrideFactor(base, 'transitions', { kind: 'lock-master', masterId: 'kirby' })
		expect(overridden.transitions).not.toEqual(base.transitions)
		expect(overridden.wordPicture).toEqual(base.wordPicture)
		const manual = overrideFactor(base, 'pacing', { kind: 'manual', weights: { crescendo: 3, cooldown: 1 } })
		expect(manual.pacing['crescendo' as keyof typeof manual.pacing]).toBeCloseTo(0.75, 5)
	})
})

describe('blend — engine layout bias', () => {
	// Mild features so the base score sits well below the 0.99 clamp, letting a
	// positive bias produce a measurable increase.
	const features: LayoutFeatures = {
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

	it('an empty profile yields an all-zero bias, leaving scoring identical', () => {
		const bias = styleProfileToLayoutBias(PROFILE_EMPTY)
		expect(bias).toEqual({ big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 })
		const base = layoutScore(features, 5, 'action')
		const neutral = layoutScore(features, 5, 'action', bias)
		expect(neutral.score).toBe(base.score)
		expect(neutral.axes).toEqual(base.axes)
	})

	it('omitting the bias argument is identical to passing a zero bias', () => {
		const base = layoutScore(features, 5, 'tension')
		const zero = layoutScore(features, 5, 'tension', { big: 0, diag: 0, bleed: 0, cv: 0, rhythm: 0, aspect: 0 })
		expect(zero.score).toBe(base.score)
	})

	it('a master bias shifts the candidate score', () => {
		const base = layoutScore(features, 5, 'tension')
		const biased = layoutScore(features, 5, 'tension', styleProfileToLayoutBias(PROFILE_MILLER))
		// Miller adds positive diag/bleed/cv weight; with non-zero diag & bleed features the score rises.
		expect(biased.score).toBeGreaterThan(base.score)
	})
})

describe('blend — theory evaluation', () => {
	it('returns pass / warn / info from the eval spec', () => {
		const results = evaluateTheoryChecklists({
			axisClean: true,
			hasSilentBeatBeforePeak: false,
			transitionsVaried: true,
		})
		const axis = results.find((r) => r.checklistId === 'axis-no-cross')!
		const ma = results.find((r) => r.checklistId === 'ma-silent-before-peak')!
		const variety = results.find((r) => r.checklistId === 'transition-variety')!
		const unevaluated = results.find((r) => r.checklistId === 'closure-gap-readable')!
		expect(axis.status).toBe('pass')
		expect(ma.status).toBe('warn')
		expect(variety.status).toBe('pass')
		expect(unevaluated.status).toBe('info')
		// Covers every checklist item across every theory entry.
		expect(results).toHaveLength(allTheoryChecklistItems().length)
	})

	it('exposes the set of programmatically evaluable checklist ids', () => {
		const ids = evaluableTheoryChecklistIds()
		const all = allTheoryChecklistItems().map((c) => c.id)
		expect(ids.every((id) => all.includes(id))).toBe(true)
	})
})
