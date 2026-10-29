import { describe, expect, it } from 'vitest'
import { clampBubbleBelowHeaderBand, planBubbles, PAGE_HEADER_BAND_PX, PAGE_HEADER_H } from './placement'
import type { Layout } from '../layout/engine'
import type { Beat } from '../model'

describe('clampBubbleBelowHeaderBand', () => {
	it('nudges a balloon overlapping the header band down to the band edge', () => {
		expect(clampBubbleBelowHeaderBand(0)).toBe(PAGE_HEADER_BAND_PX)
		expect(clampBubbleBelowHeaderBand(-120)).toBe(PAGE_HEADER_BAND_PX)
		expect(clampBubbleBelowHeaderBand(10)).toBe(PAGE_HEADER_BAND_PX)
	})

	it('leaves a balloon already clear of the band untouched', () => {
		expect(clampBubbleBelowHeaderBand(PAGE_HEADER_BAND_PX)).toBe(PAGE_HEADER_BAND_PX)
		expect(clampBubbleBelowHeaderBand(300)).toBe(300)
	})

	it('derives the band from the header height plus a margin', () => {
		expect(PAGE_HEADER_BAND_PX).toBeGreaterThan(PAGE_HEADER_H)
		expect(clampBubbleBelowHeaderBand(0, 50)).toBe(50)
		expect(clampBubbleBelowHeaderBand(80, 50)).toBe(80)
	})
})

describe('planBubbles — header band', () => {
	it('never places a balloon over the reserved header strip', () => {
		// A thin top row panel: an un-clamped caption would land above the band.
		const layout = {
			width: 460,
			height: 650,
			panels: [
				{
					pts: [
						[0, 0],
						[460, 0],
						[460, 80],
						[0, 80],
					],
				},
			],
		} as unknown as Layout
		const beat: Beat = {
			shot: 'WS',
			angle: 'eye',
			focal: '50mm',
			beat: 'opening',
			who: [],
			lines: [{ type: 'caption', text: 'Narration box at the very top of the page.' }],
		}
		const planned = planBubbles(layout, [beat], 460, 650)
		expect(planned.length).toBeGreaterThan(0)
		for (const bubble of planned) {
			expect(bubble.y).toBeGreaterThanOrEqual(PAGE_HEADER_BAND_PX)
		}
	})
})
