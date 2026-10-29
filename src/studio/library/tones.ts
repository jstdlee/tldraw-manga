// =============================================================================
// Screentone and line-weight style library. Each entry carries descriptive prompt
// tokens for the asset-locked art stage (no artist names, pure style descriptors).
// =============================================================================

export type ToneStyleId =
	| 'ligne-claire'
	| 'feathered-hatching'
	| 'cross-hatching'
	| 'gekiga-heavy-blacks'
	| 'dot-tone'
	| 'gradient-tone'
	| 'ink-wash'
	| 'speed-lines'
	| 'focus-lines'
	| 'beta-flat'

export type ToneFamily = 'line' | 'tone' | 'effect' | 'fill'

export interface ToneStyle {
	id: ToneStyleId
	name: string
	family: ToneFamily
	description: string
	promptTokens: string[]
	bestUse: string
}

export const TONE_STYLES: ToneStyle[] = [
	{
		id: 'ligne-claire',
		name: 'Ligne Claire',
		family: 'line',
		description: 'Clean, uniform-weight contour lines with flat areas and no hatching.',
		promptTokens: ['clean clear-line art', 'uniform contour weight', 'flat unshaded areas'],
		bestUse: 'Franco-Belgian clarity; legible, calm, architectural storytelling.',
	},
	{
		id: 'feathered-hatching',
		name: 'Feathered Hatching',
		family: 'line',
		description: 'Tapered parallel strokes that fade to model soft form and light.',
		promptTokens: ['feathered tapering hatch lines', 'soft modeled shading', 'line falloff'],
		bestUse: 'Gentle volume and skin/cloth modeling without flattening with tone.',
	},
	{
		id: 'cross-hatching',
		name: 'Cross-Hatching',
		family: 'line',
		description: 'Layered crossed line sets building dense value by hand.',
		promptTokens: ['cross-hatched shading', 'layered ink hatching', 'engraved value build-up'],
		bestUse: 'Textural realism and gritty value in pen-and-ink traditions.',
	},
	{
		id: 'gekiga-heavy-blacks',
		name: 'Gekiga Heavy Blacks',
		family: 'fill',
		description: 'Bold spotted blacks and stark contrast for dramatic, adult weight.',
		promptTokens: ['heavy spotted blacks', 'high-contrast chiaroscuro ink', 'dramatic black masses'],
		bestUse: 'Gekiga and noir; mood and gravity carried by black shapes.',
	},
	{
		id: 'dot-tone',
		name: 'Dot Screentone',
		family: 'tone',
		description: 'Regular halftone dot fields giving flat grey values by density.',
		promptTokens: ['halftone dot screentone', 'flat grey tone field', 'benday dot shading'],
		bestUse: 'Standard manga greys for skin, sky, and mid-value surfaces.',
	},
	{
		id: 'gradient-tone',
		name: 'Gradient Tone',
		family: 'tone',
		description: 'Dot density ramps producing smooth value transitions.',
		promptTokens: ['gradient screentone', 'smooth tonal ramp', 'graduated dot density'],
		bestUse: 'Skies, backlight, and emotional atmosphere behind figures.',
	},
	{
		id: 'ink-wash',
		name: 'Ink Wash',
		family: 'tone',
		description: 'Diluted ink washes laying soft, fluid grey values.',
		promptTokens: ['sumi ink wash', 'fluid grey wash values', 'bleeding ink gradient'],
		bestUse: 'Shuimo and painterly atmosphere; fog, water, and distance.',
	},
	{
		id: 'speed-lines',
		name: 'Speed Lines',
		family: 'effect',
		description: 'Parallel or radial lines encoding motion and velocity.',
		promptTokens: ['parallel speed lines', 'motion line hatching', 'kinetic streaks'],
		bestUse: 'Movement and impact; direction and force without blur.',
	},
	{
		id: 'focus-lines',
		name: 'Focus Lines',
		family: 'effect',
		description: 'Radial lines converging on a subject to spike attention and shock.',
		promptTokens: ['radial focus lines', 'converging emphasis lines', 'burst concentration lines'],
		bestUse: 'Sudden realization, reveals, and dramatic emphasis on one subject.',
	},
	{
		id: 'beta-flat',
		name: 'Beta Flat Black',
		family: 'fill',
		description: 'Solid flat black fills (beta) for silhouettes, hair, and negative space.',
		promptTokens: ['solid flat black fill', 'beta silhouette', 'pure black negative space'],
		bestUse: 'Silhouettes, night, and anchoring the value range with true black.',
	},
]

export const TONE_STYLE_IDS = TONE_STYLES.map((tone) => tone.id)

export function getToneStyle(id: ToneStyleId): ToneStyle | undefined {
	return TONE_STYLES.find((tone) => tone.id === id)
}

export function toneStylesByFamily(family: ToneFamily): ToneStyle[] {
	return TONE_STYLES.filter((tone) => tone.family === family)
}
