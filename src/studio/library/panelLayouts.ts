// =============================================================================
// Panel layout template library.
//
// Each template defines its panels as normalized rectangles in page space
// ([0,1] x [0,1], origin top-left), listed in intended reading order. Templates
// declare which reading directions they support, their tension/pacing affinities,
// and best-use notes. An adapter converts a template into engine RealizedPanel
// polygons so the existing layout/render path can consume them directly.
// =============================================================================

import type { Pt, RealizedPanel } from '../layout/engine'
import type { Scenario } from '../layout/score'
import type { PacingId } from './pacing'

export type ReadingDirection = 'rtl' | 'ltr' | 'vertical'

export type PanelLayoutId =
	| 'four-koma'
	| 'three-tier-grid'
	| 'six-panel-grid'
	| 'splash'
	| 'double-page-spread'
	| 'diagonal-action-cut'
	| 'inset-panel'
	| 'broken-border'
	| 'borderless-bleed'
	| 'vertical-webtoon-stack'
	| 'staircase'
	| 'widescreen-strip'
	| 'kakekomi-irregular'
	| 'eisner-open-panel'

/** Normalized panel rectangle in page space; each component in [0,1]. */
export interface PanelRect {
	x: number
	y: number
	w: number
	h: number
}

export interface PanelLayoutTemplate {
	id: PanelLayoutId
	name: string
	summary: string
	/** Panels in intended reading order for the template's default direction. */
	panels: PanelRect[]
	supportedDirections: ReadingDirection[]
	defaultDirection: ReadingDirection
	scenarioAffinity: Scenario[]
	pacingAffinity: PacingId[]
	bestUse: string
}

const r = (x: number, y: number, w: number, h: number): PanelRect => ({ x, y, w, h })

export const PANEL_LAYOUTS: PanelLayoutTemplate[] = [
	{
		id: 'four-koma',
		name: '4-Koma Strip',
		summary: 'Four equal stacked panels for setup / development / turn / punchline.',
		panels: [r(0, 0, 1, 0.25), r(0, 0.25, 1, 0.25), r(0, 0.5, 1, 0.25), r(0, 0.75, 1, 0.25)],
		supportedDirections: ['vertical', 'rtl', 'ltr'],
		defaultDirection: 'vertical',
		scenarioAffinity: ['establishing', 'intimacy'],
		pacingAffinity: ['comedic-beat', 'compression'],
		bestUse: 'Gag strips and kishotenketsu four-beat comedy; the third panel carries the turn.',
	},
	{
		id: 'three-tier-grid',
		name: '3-Tier Grid',
		summary: 'Three horizontal tiers, each split into two panels; the workhorse narrative page.',
		panels: [
			r(0.5, 0, 0.5, 0.333),
			r(0, 0, 0.5, 0.333),
			r(0.5, 0.333, 0.5, 0.334),
			r(0, 0.333, 0.5, 0.334),
			r(0.5, 0.667, 0.5, 0.333),
			r(0, 0.667, 0.5, 0.333),
		],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['tension', 'intimacy'],
		pacingAffinity: ['decompression', 'action-rhythm'],
		bestUse: 'Steady dialogue and procedural storytelling where even rhythm keeps focus on content.',
	},
	{
		id: 'six-panel-grid',
		name: '6-Panel Grid',
		summary: 'Dense regular 2x3 grid for compressed time and rapid information.',
		panels: [
			r(0.5, 0, 0.5, 0.333),
			r(0, 0, 0.5, 0.333),
			r(0.5, 0.333, 0.5, 0.334),
			r(0, 0.333, 0.5, 0.334),
			r(0.5, 0.667, 0.5, 0.333),
			r(0, 0.667, 0.5, 0.333),
		],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['tension'],
		pacingAffinity: ['compression'],
		bestUse: 'Montage and ticking-clock compression; the regular grid reads as mechanical time.',
	},
	{
		id: 'splash',
		name: 'Splash Page',
		summary: 'A single full-page panel for maximum impact or establishment.',
		panels: [r(0, 0, 1, 1)],
		supportedDirections: ['rtl', 'ltr', 'vertical'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['establishing', 'climax', 'reveal'],
		pacingAffinity: ['reveal-page-turn', 'crescendo'],
		bestUse: 'Chapter openers and single-image climaxes where one picture must dominate.',
	},
	{
		id: 'double-page-spread',
		name: 'Double-Page Spread',
		summary: 'One composition across two facing pages; the widest possible stage.',
		panels: [r(0, 0, 1, 1)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['climax', 'establishing'],
		pacingAffinity: ['crescendo', 'reveal-page-turn'],
		bestUse: 'Epic reveals and battlefield scope; keep the gutter clear of critical detail.',
	},
	{
		id: 'diagonal-action-cut',
		name: 'Diagonal Action Cut',
		summary: 'Slanted gutters shatter the grid to drive kinetic downward motion.',
		panels: [r(0, 0, 1, 0.42), r(0.42, 0.38, 0.58, 0.34), r(0, 0.36, 0.46, 0.36), r(0, 0.68, 1, 0.32)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['action', 'climax'],
		pacingAffinity: ['action-rhythm', 'crescendo'],
		bestUse: 'Fight choreography and chases; diagonals carry the eye fast and unsteadily.',
	},
	{
		id: 'inset-panel',
		name: 'Inset Panel',
		summary: 'A small reaction or detail panel floating inside a larger host panel.',
		panels: [r(0, 0, 1, 1), r(0.64, 0.62, 0.32, 0.34)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['tension', 'reveal'],
		pacingAffinity: ['action-rhythm', 'ma-silent-beat'],
		bestUse: 'Simultaneous wide action plus a close reaction without spending a full tier.',
	},
	{
		id: 'broken-border',
		name: 'Broken-Border Panel',
		summary: 'A panel whose border is deliberately open on one side to leak into the gutter.',
		panels: [r(0.5, 0, 0.5, 0.5), r(0, 0, 0.5, 0.5), r(0, 0.5, 1, 0.5)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['reveal', 'intimacy'],
		pacingAffinity: ['decompression'],
		bestUse: 'Memory, dream, or emotional overflow where containment should feel breached.',
	},
	{
		id: 'borderless-bleed',
		name: 'Borderless Bleed',
		summary: 'A panel bled to the page edge with no frame, reading as open or timeless space.',
		panels: [r(0, 0, 1, 0.55), r(0.5, 0.55, 0.5, 0.45), r(0, 0.55, 0.5, 0.45)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['establishing', 'intimacy'],
		pacingAffinity: ['decompression', 'ma-silent-beat'],
		bestUse: 'Establishing vistas and quiet pillow shots; absence of border suspends time.',
	},
	{
		id: 'vertical-webtoon-stack',
		name: 'Vertical Webtoon Stack',
		summary: 'Tall stacked panels with generous gutters for infinite-scroll pacing.',
		panels: [
			r(0, 0, 1, 0.18),
			r(0, 0.2, 1, 0.16),
			r(0, 0.38, 1, 0.22),
			r(0, 0.62, 1, 0.14),
			r(0, 0.78, 1, 0.22),
		],
		supportedDirections: ['vertical'],
		defaultDirection: 'vertical',
		scenarioAffinity: ['tension', 'reveal', 'intimacy'],
		pacingAffinity: ['decompression', 'reveal-page-turn'],
		bestUse: 'Smartphone vertical scroll; long gutters become scroll-time for timing beats.',
	},
	{
		id: 'staircase',
		name: 'Staircase',
		summary: 'Panels stepping diagonally down the page to pace a descent or escalation.',
		panels: [r(0.4, 0, 0.6, 0.34), r(0.2, 0.33, 0.6, 0.34), r(0, 0.66, 0.6, 0.34)],
		supportedDirections: ['rtl', 'ltr'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['tension', 'action'],
		pacingAffinity: ['crescendo', 'action-rhythm'],
		bestUse: 'Staged escalation; each step lands lower and further along the reading path.',
	},
	{
		id: 'widescreen-strip',
		name: 'Widescreen Strip',
		summary: 'Stacked cinematic letterbox panels for decompressed, film-like pacing.',
		panels: [r(0, 0, 1, 0.3), r(0, 0.34, 1, 0.3), r(0, 0.68, 1, 0.32)],
		supportedDirections: ['ltr', 'rtl'],
		defaultDirection: 'ltr',
		scenarioAffinity: ['establishing', 'intimacy', 'reveal'],
		pacingAffinity: ['decompression', 'ma-silent-beat'],
		bestUse: 'Decompressed, atmosphere-forward storytelling in the widescreen comics idiom.',
	},
	{
		id: 'kakekomi-irregular',
		name: 'Kakekomi Irregular',
		summary: 'Irregular wedge and trapezoid panels that overlap the margin for drama.',
		panels: [r(0, 0, 1, 0.4), r(0.52, 0.36, 0.48, 0.3), r(0, 0.4, 0.5, 0.34), r(0, 0.66, 1, 0.34)],
		supportedDirections: ['rtl'],
		defaultDirection: 'rtl',
		scenarioAffinity: ['climax', 'action', 'reveal'],
		pacingAffinity: ['crescendo', 'action-rhythm'],
		bestUse: 'Shonen climaxes; irregular panels maximize dynamism and emotional volume.',
	},
	{
		id: 'eisner-open-panel',
		name: 'Eisner Open Panel',
		summary: 'A page where panels are implied by composition rather than drawn borders.',
		panels: [r(0, 0, 1, 0.5), r(0.5, 0.5, 0.5, 0.5), r(0, 0.5, 0.5, 0.5)],
		supportedDirections: ['ltr', 'rtl'],
		defaultDirection: 'ltr',
		scenarioAffinity: ['establishing', 'intimacy'],
		pacingAffinity: ['decompression'],
		bestUse: 'Eisner-style pages where the environment itself frames the sequence.',
	},
]

export const PANEL_LAYOUT_IDS = PANEL_LAYOUTS.map((layout) => layout.id)

export function getPanelLayout(id: PanelLayoutId): PanelLayoutTemplate | undefined {
	return PANEL_LAYOUTS.find((layout) => layout.id === id)
}

/**
 * Adapter: convert a normalized panel template into engine RealizedPanel polygons
 * scaled to a concrete page size. Panels keep their template reading order, so the
 * output drops straight into the existing layout/render path. This is the natural
 * hook for templates the procedural Genome solver does not generate.
 */
export function panelTemplateToRealizedPanels(
	template: PanelLayoutTemplate,
	width: number,
	height: number,
): RealizedPanel[] {
	return template.panels.map((rect, index) => {
		const x0 = rect.x * width
		const y0 = rect.y * height
		const x1 = (rect.x + rect.w) * width
		const y1 = (rect.y + rect.h) * height
		const pts: Pt[] = [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1],
		]
		return { pts, row: index, col: 0, sub: 0 }
	})
}

/** True when every panel rect sits inside the unit page and has positive area. */
export function isValidPanelTemplate(template: PanelLayoutTemplate): boolean {
	return template.panels.every(
		(rect) =>
			rect.w > 0 &&
			rect.h > 0 &&
			rect.x >= -1e-6 &&
			rect.y >= -1e-6 &&
			rect.x + rect.w <= 1 + 1e-6 &&
			rect.y + rect.h <= 1 + 1e-6,
	)
}
