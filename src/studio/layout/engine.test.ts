import { describe, expect, it } from 'vitest'
import { centroid, configFor, dragRowDivider, generate, mutate, mulberry32, pointInPoly, realize, sanitize, strHash } from './engine'
import { pickTopLayouts } from './score'

describe('polygon layout engine', () => {
	it('is deterministic for a seed', () => {
		const config = configFor('std', 6)
		const a = generate('seagull-c1-p2', config)
		const b = generate('seagull-c1-p2', config)
		expect(a.panels).toEqual(b.panels)
		expect(a.genome).toEqual(b.genome)
	})

	it('numbers panels right-to-left then top-to-bottom', () => {
		const config = configFor('std', 4)
		const genome = sanitize({
			rowW: [1.2, 1],
			rowTilt: [0.25],
			rows: [
				{
					colW: [1, 1.3],
					colTilt: [0.2],
					panels: [
						{ nest: null, bT: false, bB: false, bR: false, bL: false },
						{ nest: null, bT: false, bB: false, bR: false, bL: false },
					],
				},
				{
					colW: [1],
					colTilt: [],
					panels: [{ nest: null, bT: false, bB: false, bR: false, bL: false }],
				},
			],
		})
		const layout = realize(genome, config)
		expect(layout.panels.length).toBe(3)
		const [first, second, third] = layout.panels.map((panel) => centroid(panel.pts))
		expect(first[0]).toBeGreaterThan(second[0])
		expect(third[1]).toBeGreaterThan(first[1])
		expect(third[1]).toBeGreaterThan(second[1])
		for (const panel of layout.panels) {
			expect(panel.pts).toHaveLength(4)
			expect(panel.pts.every((point) => point.every((value) => Number.isFinite(value)))).toBe(true)
			expect(pointInPoly(centroid(panel.pts)[0], centroid(panel.pts)[1], panel.pts)).toBe(true)
		}
	})

	it('picks a top-4 shortlist from 36 seeds without an LLM', () => {
		const config = configFor('action', 6)
		pickTopLayouts('warmup', config, 6, 'action', 36)
		const samples = [0, 1, 2].map(() => pickTopLayouts('bench', config, 6, 'action', 36))
		const top = samples[0].top
		const ms = Math.min(...samples.map((sample) => sample.ms))
		expect(top).toHaveLength(4)
		expect(top[0].score).toBeGreaterThanOrEqual(top[3].score)
		expect(ms).toBeLessThan(5)
		expect(top[0].layout.panels.length).toBeGreaterThan(2)
	})

	it('mutates and still realizes finite polygons', () => {
		const config = configFor('action', 7)
		const base = generate('mutate-me', config)
		const random = mulberry32(strHash('mutate-me~local'))
		const next = mutate(base.genome, random, 0.7)
		const layout = realize(next, config)
		expect(layout.panels.length).toBeGreaterThan(0)
		expect(layout.dividers.length).toBeGreaterThan(0)
		const dragged = dragRowDivider(layout.genome, 0, 12, -30, config)
		const again = realize(dragged, config)
		expect(again.panels.every((panel) => panel.pts.every((point) => point.every(Number.isFinite)))).toBe(true)
	})
})
