// =============================================================================
// Lettering library: balloon types, font-role recommendations, SFX styles, and
// placement / reading-order rules. Balloon types map onto the engine BubbleStyle
// union where a direct equivalent exists.
// =============================================================================

import type { BubbleStyle } from '../model'

export type BalloonTypeId =
	| 'speech'
	| 'thought-cloud'
	| 'whisper-dashed'
	| 'shout-burst'
	| 'electronic-radio'
	| 'narration-caption'
	| 'off-panel-tail'
	| 'linked-balloons'
	| 'monologue-box'

export type FontRole = 'dialogue' | 'bold-emphasis' | 'italic-aside' | 'display-title' | 'narration' | 'robotic'

export interface BalloonType {
	id: BalloonTypeId
	name: string
	outlineStyle: string
	tailStyle: string
	fontRole: FontRole
	usage: string
	/** Nearest engine bubble style, when one exists. */
	mapsToBubbleStyle?: BubbleStyle
}

export const BALLOON_TYPES: BalloonType[] = [
	{
		id: 'speech',
		name: 'Speech Balloon',
		outlineStyle: 'smooth rounded outline',
		tailStyle: 'single pointed tail to the speaker',
		fontRole: 'dialogue',
		usage: 'Ordinary spoken dialogue.',
		mapsToBubbleStyle: 'speech',
	},
	{
		id: 'thought-cloud',
		name: 'Thought Cloud',
		outlineStyle: 'scalloped cloud outline',
		tailStyle: 'trail of shrinking bubbles',
		fontRole: 'italic-aside',
		usage: 'Interior thought not spoken aloud.',
		mapsToBubbleStyle: 'thought',
	},
	{
		id: 'whisper-dashed',
		name: 'Whisper Balloon',
		outlineStyle: 'dashed or broken outline',
		tailStyle: 'thin pointed tail',
		fontRole: 'italic-aside',
		usage: 'Quiet, hushed, or weakening speech.',
		mapsToBubbleStyle: 'whisper',
	},
	{
		id: 'shout-burst',
		name: 'Shout / Burst Balloon',
		outlineStyle: 'jagged spiked outline',
		tailStyle: 'sharp angular tail',
		fontRole: 'bold-emphasis',
		usage: 'Shouting, alarm, or forceful emphasis.',
		mapsToBubbleStyle: 'shout',
	},
	{
		id: 'electronic-radio',
		name: 'Electronic / Radio Balloon',
		outlineStyle: 'rectangular outline with squared corners',
		tailStyle: 'zig-zag lightning tail or no tail',
		fontRole: 'robotic',
		usage: 'Phone, radio, intercom, or synthetic voice.',
		mapsToBubbleStyle: 'broadcast',
	},
	{
		id: 'narration-caption',
		name: 'Narration Caption Box',
		outlineStyle: 'rectangular caption box',
		tailStyle: 'no tail',
		fontRole: 'narration',
		usage: 'Narrator voice, time/place captions, scene setting.',
		mapsToBubbleStyle: 'caption',
	},
	{
		id: 'off-panel-tail',
		name: 'Off-Panel Balloon',
		outlineStyle: 'standard outline at the panel edge',
		tailStyle: 'tail pointing beyond the panel border',
		fontRole: 'dialogue',
		usage: 'A speaker who is outside the current frame.',
		mapsToBubbleStyle: 'speech',
	},
	{
		id: 'linked-balloons',
		name: 'Linked Balloons',
		outlineStyle: 'two or more balloons joined by a bridge',
		tailStyle: 'single tail from the chain',
		fontRole: 'dialogue',
		usage: 'A single speech split into beats with internal pauses.',
		mapsToBubbleStyle: 'speech',
	},
	{
		id: 'monologue-box',
		name: 'Monologue Box',
		outlineStyle: 'borderless or faint-edged floating text',
		tailStyle: 'no tail',
		fontRole: 'narration',
		usage: 'First-person interior monologue laid over the art.',
		mapsToBubbleStyle: 'caption',
	},
]

export type SfxStyleId = 'integrated-hand-lettered' | 'western-block' | 'ink-brush'

export interface SfxStyle {
	id: SfxStyleId
	name: string
	description: string
	promptTokens: string[]
}

export const SFX_STYLES: SfxStyle[] = [
	{
		id: 'integrated-hand-lettered',
		name: 'Integrated Hand-Lettered Onomatopoeia',
		description:
			'Japanese-style SFX drawn as part of the art, following the motion and carved into the composition.',
		promptTokens: ['hand-lettered onomatopoeia integrated into art', 'brushed kinetic sound shapes'],
	},
	{
		id: 'western-block',
		name: 'Western Block SFX',
		description: 'Bold geometric display letters sitting on top of the panel as a graphic element.',
		promptTokens: ['bold block sound-effect lettering', 'heavy display SFX type'],
	},
	{
		id: 'ink-brush',
		name: 'Ink-Brush SFX',
		description: 'Expressive brushed strokes forming the sound with calligraphic energy.',
		promptTokens: ['calligraphic ink-brush sound strokes', 'gestural brushed SFX'],
	},
]

/** Placement and reading-order rules, parameterized by reading direction. */
export const LETTERING_RULES = {
	readingOrder: {
		rtl: 'Within a tier, read balloons top-to-bottom then right-to-left; the first balloon sits in the top-right.',
		ltr: 'Within a tier, read balloons top-to-bottom then left-to-right; the first balloon sits in the top-left.',
		vertical: 'Read balloons top-to-bottom following the scroll; stagger left/right to pace the descent.',
	},
	placement: [
		'Place the entry balloon in the reading-entry corner so the eye lands on it first.',
		'Never let a balloon or its tail cover a focal face, eyes, or a key prop.',
		'Order multiple balloons so tails never cross and the exchange reads in sequence.',
		'Keep balloons inside the safe area; only bleed SFX, never dialogue, past the trim.',
	],
	tail: [
		'A tail points at the speaker, not merely toward them; keep it short and unambiguous.',
		'Off-panel speakers use a tail that exits the panel border toward their implied position.',
	],
} as const

export const BALLOON_TYPE_IDS = BALLOON_TYPES.map((balloon) => balloon.id)
export const SFX_STYLE_IDS = SFX_STYLES.map((style) => style.id)

export function getBalloonType(id: BalloonTypeId): BalloonType | undefined {
	return BALLOON_TYPES.find((balloon) => balloon.id === id)
}
