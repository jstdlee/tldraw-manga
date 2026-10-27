import { describe, expect, it } from 'vitest'
import {
	boundsOf,
	centroid,
	configFor,
	generate,
	locatePanelGene,
	mulberry32,
	mutate,
	realize,
	sanitize,
	strHash,
	togglePanelBleed,
	togglePanelNest,
} from './engine'
import {
	applyRemedyToGenome,
	EMOTION_DIRECTION_TIPS,
	layoutFeatures,
	layoutScore,
	pickLayoutBundle,
	pickTopLayouts,
} from './score'
import { auditCameraAxis, computeOptics } from '../optics/shotLab'
import { renderPageSvg } from '../render/pageSvg'

describe('parametric polygon layout engine (jev-comics)', () => {
	it('is deterministic for a given seed and parametric overrides', () => {
		const cfg = configFor('std', 5, { ratio: 0.708, rowRange: '2-4', tilt: 0.35, bleed: 0.4, nest: 0.2, big: 0.5, lineW: 3.5 })
		const a = generate('seagull-c1-p2', cfg)
		const b = generate('seagull-c1-p2', cfg)
		expect(a.panels).toEqual(b.panels)
		expect(a.genome).toEqual(b.genome)
	})

	it('orders panels right-to-left within a row and top-to-bottom across rows', () => {
		const cfg = configFor('seizen', 3, { tilt: 0, nest: 0, bleed: 0 })
		const genome = sanitize({
			rows: [
				{
					h: 0.55,
					s: 0,
					g: 12,
					w: [0.5, 0.5],
					vs: [{ s: 0, g: 10 }],
					p: [
						{ nest: null, bT: false, bB: false, bR: false, bL: false },
						{ nest: null, bT: false, bB: false, bR: false, bL: false },
					],
				},
				{
					h: 0.45,
					s: 0,
					g: 12,
					w: [1],
					vs: [],
					p: [{ nest: null, bT: false, bB: false, bR: false, bL: false }],
				},
			],
		})
		const layout = realize(genome, cfg)
		expect(layout.panels).toHaveLength(3)
		const [first, second, third] = layout.panels.map((p) => centroid(p.pts))
		expect(first[0]).toBeGreaterThan(second[0])
		expect(third[1]).toBeGreaterThan(first[1])
		for (const panel of layout.panels) {
			expect(panel.pts).toHaveLength(4)
			const box = boundsOf(panel.pts)
			expect(box.w).toBeGreaterThan(20)
			expect(box.h).toBeGreaterThan(20)
		}
	})

	it('toggles per-panel 4-edge bleed and nested sub-panels', () => {
		const cfg = configFor('std', 4, { nest: 0, bleed: 0 })
		const base = generate('bleed-test', cfg)
		const beforeCount = realize(base.genome, cfg).panels.length
		const bled = togglePanelBleed(base.genome, 0, 'bT')
		expect(locatePanelGene(bled, 0)?.gene.bT).toBe(true)
		const nested = togglePanelNest(bled, 0)
		const afterCount = realize(nested, cfg).panels.length
		expect(afterCount).toBe(beforeCount + 1)
	})

	it('evaluates 6-axis editorial rubric and executes remedies that modify layout', () => {
		const cfg = configFor('action', 5)
		const top = pickTopLayouts('remedy-seed', cfg, 5, 'climax', 24).top[0]
		expect(top.score).toBeGreaterThan(0.45)
		expect(top.axes.narrative).toBeGreaterThan(40)
		expect(top.axes.readingFlow).toBeGreaterThan(40)

		const fixedHook = applyRemedyToGenome(top.layout.genome, 'bleed-last-hook')
		const fixedLayout = realize(fixedHook, cfg)
		const reScored = layoutScore(layoutFeatures(fixedLayout), 5, 'climax')
		expect(reScored.score).toBeGreaterThan(0.4)
		expect(Object.keys(EMOTION_DIRECTION_TIPS)).toHaveLength(6)
	})

	it('generates 8-sheet layout bundles in both roll and base-genome mutate modes', () => {
		const cfg = configFor('std', 5)
		const rollBundle = pickLayoutBundle('bundle-seed', cfg, 5, 'tension', {
			mode: 'roll',
			returnCount: 8,
		})
		expect(rollBundle.top).toHaveLength(8)
		expect(rollBundle.top[0].score).toBeGreaterThanOrEqual(rollBundle.top[7].score)

		const mutateBundle = pickLayoutBundle('bundle-seed', cfg, 5, 'tension', {
			mode: 'mutate',
			baseGenome: rollBundle.top[0].layout.genome,
			mutationStrength: 0.45,
			returnCount: 8,
		})
		expect(mutateBundle.top).toHaveLength(8)
		const rand = mulberry32(strHash('mutate-test'))
		expect(mutate(rollBundle.top[0].layout.genome, rand, 0.4).rows.length).toBeGreaterThan(0)
	})
})

describe('optical shot lab & composition overlays (sim4director)', () => {
	it('computes FOV, depth-of-field, bokeh blur, and derived shot size accurately', () => {
		const wide = computeOptics({
			sensor: 'ff',
			focalMm: 18,
			fStop: 8.0,
			subjectDistM: 5.0,
			bgDistM: 20.0,
		})
		const tele = computeOptics({
			sensor: 'ff',
			focalMm: 85,
			fStop: 1.4,
			subjectDistM: 1.2,
			bgDistM: 20.0,
		})
		expect(wide.hfovDeg).toBeGreaterThan(tele.hfovDeg)
		expect(tele.blurPercent).toBeGreaterThan(wide.blurPercent)
		expect(wide.derivedFocal).toBe('18mm')
		expect(tele.derivedFocal).toBe('85mm')
		expect(['CU', 'ECU', 'MCU']).toContain(tele.derivedShot)
	})

	it('audits 180-degree camera axis crossings and renders SVG composition guides & silent panels', () => {
		const cfg = configFor('std', 3)
		const layout = generate('axis-seed', cfg)
		const panels = layout.panels.map((p, idx) => ({
			pts: p.pts,
			environment: 'harbor-noon',
			lighting: 'noon-hard',
			energy: 'burst' as const,
			meta: {
				beat: `Panel ${idx + 1}`,
				who: ['kanta'],
				shot: 'CU' as const,
				angle: 'low' as const,
				focal: '85mm' as const,
				focalMm: 85,
				fStop: 1.4,
				silent: idx === 1,
				fries: 'none' as const,
				environment: 'boardwalk',
				aspect: '3:4',
				eyeline: [idx % 2 === 0 ? 28 : -28, 6] as [number, number],
				imageDataUrl: '',
				imageSeed: `seed-${100 + idx}`,
				imageOffsetX: 0,
				imageOffsetY: 0,
				imageScale: 1,
				imageRotation: 0,
			},
		}))
		const audit = auditCameraAxis(panels.map((p) => p.meta))
		expect(audit.crossings.length).toBeGreaterThan(0)

		const svg = renderPageSvg({
			uid: 'test-page',
			title: 'Test Page',
			width: layout.width,
			height: layout.height,
			inner: layout.inner,
			panels,
			bubbles: [
				{
					panelIndex: 0,
					style: 'speech',
					text: 'Dialogue Visible',
					prosody: '',
					emphasis: 1,
					x: 80,
					y: 80,
					w: 160,
					h: 80,
					tailX: 80,
					tailY: 110,
					spin: 0,
				},
				{
					panelIndex: 1,
					style: 'speech',
					text: 'Silent Hidden',
					prosody: '',
					emphasis: 1,
					x: 120,
					y: 220,
					w: 160,
					h: 80,
					tailX: 80,
					tailY: 110,
					spin: 0,
				},
			],
			numbers: 'corner',
			director: true,
			lineWidth: 4.2,
			showInnerFrame: true,
			showRuleOfThirds: true,
			showAxis180: true,
		})
		expect(svg).toContain('B4 Safe Trim Margin')
		expect(svg).toContain('180° Axis Warning')
		expect(svg).toContain('Dialogue')
		expect(svg).not.toContain('Silent Hidden')
	})
})
