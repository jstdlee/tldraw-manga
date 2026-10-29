// =============================================================================
// Shot / angle / lens vocabulary library.
//
// Extends the engine Shot union (EWS..ECU) with an 'insert' size, and adds angle
// and focal-length presets plus static-panel translations of camera moves (speed
// lines, motion blur, multi-image sequences). Reuses the existing optics Shot type
// rather than duplicating it.
// =============================================================================

import type { Shot } from '../model'

/** Shot sizes: the engine's six plus a cut-in insert detail. */
export type ShotSizeId = Shot | 'insert'

export interface ShotSize {
	id: ShotSizeId
	name: string
	abbr: string
	fieldDescription: string
	narrativeUse: string
	/** Relative tension contribution 0..1 that this framing tends to add. */
	tensionBias: number
}

export const SHOT_SIZES: ShotSize[] = [
	{
		id: 'EWS',
		name: 'Extreme Wide Shot',
		abbr: 'EWS',
		fieldDescription: 'Figure tiny within a vast environment; location dominates.',
		narrativeUse: 'Establish place and scale, or isolate a figure in emptiness.',
		tensionBias: 0.2,
	},
	{
		id: 'WS',
		name: 'Wide Shot',
		abbr: 'WS',
		fieldDescription: 'Full figure head to toe with surrounding space.',
		narrativeUse: 'Stage blocking and full-body action within a readable environment.',
		tensionBias: 0.3,
	},
	{
		id: 'MS',
		name: 'Medium Shot',
		abbr: 'MS',
		fieldDescription: 'Figure from roughly the waist up.',
		narrativeUse: 'Default conversational framing balancing gesture and expression.',
		tensionBias: 0.45,
	},
	{
		id: 'MCU',
		name: 'Medium Close-Up',
		abbr: 'MCU',
		fieldDescription: 'Chest and head fill the frame.',
		narrativeUse: 'Weight a line of dialogue or sharpen an eyeline exchange.',
		tensionBias: 0.55,
	},
	{
		id: 'CU',
		name: 'Close-Up',
		abbr: 'CU',
		fieldDescription: 'The face fills the frame.',
		narrativeUse: 'Carry emotion and interiority; the reader reads the expression.',
		tensionBias: 0.7,
	},
	{
		id: 'ECU',
		name: 'Extreme Close-Up',
		abbr: 'ECU',
		fieldDescription: 'A single feature: an eye, a mouth, a trembling hand.',
		narrativeUse: 'Peak intensity or a decisive micro-detail reveal.',
		tensionBias: 0.85,
	},
	{
		id: 'insert',
		name: 'Insert / Cut-In',
		abbr: 'INS',
		fieldDescription: 'A detached detail of an object or text the character sees.',
		narrativeUse: 'Show the evidence, the clock, the message; pure information.',
		tensionBias: 0.5,
	},
]

export type ShotAngleId = 'eye' | 'high' | 'low' | 'bird' | 'worm' | 'dutch'

export interface ShotAngle {
	id: ShotAngleId
	name: string
	description: string
	psychology: string
}

export const SHOT_ANGLES: ShotAngle[] = [
	{ id: 'eye', name: 'Eye Level', description: 'Camera level with the subject.', psychology: 'Neutral, equal, observational.' },
	{
		id: 'high',
		name: 'High Angle',
		description: 'Camera looks down on the subject.',
		psychology: 'Diminishment, vulnerability, surveillance.',
	},
	{
		id: 'low',
		name: 'Low Angle',
		description: 'Camera looks up at the subject.',
		psychology: 'Dominance, heroism, threat.',
	},
	{
		id: 'bird',
		name: "Bird's-Eye View",
		description: 'Near top-down overhead.',
		psychology: 'Tactical overview, fate, detachment.',
	},
	{
		id: 'worm',
		name: "Worm's-Eye View",
		description: 'Extreme upward from the ground.',
		psychology: 'Overwhelming scale, awe, oppression.',
	},
	{
		id: 'dutch',
		name: 'Dutch Angle',
		description: 'Canted horizon.',
		psychology: 'Instability, unease, disorientation.',
	},
]

export type LensId = 'lens-14' | 'lens-24' | 'lens-35' | 'lens-50' | 'lens-85' | 'lens-135'

export interface LensPreset {
	id: LensId
	focalMm: number
	name: string
	mangaEffect: string
	/** Suggested shot sizes this focal length flatters. */
	pairsWith: ShotSizeId[]
}

export const LENS_PRESETS: LensPreset[] = [
	{
		id: 'lens-14',
		focalMm: 14,
		name: '14mm Ultra-Wide',
		mangaEffect: 'Extreme foreshortening and warped perspective; fists and faces lunge at the reader.',
		pairsWith: ['EWS', 'WS'],
	},
	{
		id: 'lens-24',
		focalMm: 24,
		name: '24mm Wide',
		mangaEffect: 'Exaggerated depth and speed; ideal for impact panels and speed lines.',
		pairsWith: ['WS', 'MS'],
	},
	{
		id: 'lens-35',
		focalMm: 35,
		name: '35mm Reportage',
		mangaEffect: 'Humanist wide-normal; keeps the figure in a legible, grounded environment.',
		pairsWith: ['MS', 'MCU'],
	},
	{
		id: 'lens-50',
		focalMm: 50,
		name: '50mm Normal',
		mangaEffect: 'Natural, undistorted perspective; the steady lens for dialogue duels.',
		pairsWith: ['MS', 'MCU', 'CU'],
	},
	{
		id: 'lens-85',
		focalMm: 85,
		name: '85mm Portrait',
		mangaEffect: 'Compresses the background and flatters the face; isolates micro-expression.',
		pairsWith: ['CU', 'MCU'],
	},
	{
		id: 'lens-135',
		focalMm: 135,
		name: '135mm Telephoto',
		mangaEffect: 'Strong compression stacks planes flat; strips noise, homes in on pressure.',
		pairsWith: ['ECU', 'CU', 'insert'],
	},
]

export type CameraMoveId = 'speed-lines' | 'motion-blur' | 'multi-image-sequence' | 'rack-focus' | 'whip-pan'

export interface CameraMoveTranslation {
	id: CameraMoveId
	name: string
	/** The live-action move this static technique stands in for. */
	cinematicEquivalent: string
	staticTranslation: string
	promptTokens: string[]
}

export const CAMERA_MOVES: CameraMoveTranslation[] = [
	{
		id: 'speed-lines',
		name: 'Speed Lines',
		cinematicEquivalent: 'fast dolly or whip movement',
		staticTranslation: 'Radial or parallel line hatching converging on the subject or along motion.',
		promptTokens: ['dynamic speed lines', 'motion streak hatching', 'converging action lines'],
	},
	{
		id: 'motion-blur',
		name: 'Motion Blur / Smear',
		cinematicEquivalent: 'slow shutter during movement',
		staticTranslation: 'Streaked or multiplied contours trailing a fast-moving limb or object.',
		promptTokens: ['motion blur smear', 'trailing afterimage', 'streaked contour'],
	},
	{
		id: 'multi-image-sequence',
		name: 'Multi-Image Sequence',
		cinematicEquivalent: 'continuous motion in one shot',
		staticTranslation: 'Several overlapping instances of one subject within a single panel.',
		promptTokens: ['repeated overlapping figures', 'multiplicity motion sequence', 'strobe repetition'],
	},
	{
		id: 'rack-focus',
		name: 'Rack Focus',
		cinematicEquivalent: 'shifting focal plane',
		staticTranslation: 'Shallow depth of field with the sharp plane snapped to the new subject.',
		promptTokens: ['shallow depth of field', 'foreground bokeh', 'focal plane on key subject'],
	},
	{
		id: 'whip-pan',
		name: 'Whip Pan',
		cinematicEquivalent: 'rapid horizontal pan',
		staticTranslation: 'Horizontally smeared background with a steadier subject, cut across two panels.',
		promptTokens: ['horizontal smear background', 'whip transition streak'],
	},
]

/**
 * Eyeline and 180-degree-rule guidance. Static reference notes used by the
 * storyboard stage and the Inspector; the axis audit itself lives in optics.
 */
export const EYELINE_RULES = {
	axis180:
		'Keep the camera on one side of the line connecting two conversing subjects so their left/right screen positions stay consistent across cuts.',
	eyelineMatch:
		'A character looking off-panel should be answered by the next panel showing what they see, with gaze vectors that meet.',
	neutralBridge:
		"Use a head-on, bird's-eye, or extreme-wide panel as a neutral bridge when you must legitimately cross the axis.",
} as const

export const SHOT_SIZE_IDS = SHOT_SIZES.map((shot) => shot.id)
export const SHOT_ANGLE_IDS = SHOT_ANGLES.map((angle) => angle.id)
export const LENS_IDS = LENS_PRESETS.map((lens) => lens.id)
export const CAMERA_MOVE_IDS = CAMERA_MOVES.map((move) => move.id)

export function getShotSize(id: ShotSizeId): ShotSize | undefined {
	return SHOT_SIZES.find((shot) => shot.id === id)
}

export function getLensPreset(id: LensId): LensPreset | undefined {
	return LENS_PRESETS.find((lens) => lens.id === id)
}
