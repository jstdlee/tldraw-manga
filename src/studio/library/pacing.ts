// =============================================================================
// Pacing / emotion strategy library.
//
// Each strategy recommends panel count, dominant shot sizes, favoured panel-to-
// panel transitions, and a normalized tension curve the page should trace. These
// are decision priors, not hardcoded content.
// =============================================================================

import type { McCloudTransition } from '../jev/fiveStageEngine'
import type { ShotSizeId } from './shots'

export type PacingId =
	| 'decompression'
	| 'compression'
	| 'ma-silent-beat'
	| 'reveal-page-turn'
	| 'crescendo'
	| 'cooldown'
	| 'comedic-beat'
	| 'action-rhythm'

export interface PacingStrategy {
	id: PacingId
	name: string
	intent: string
	/** Inclusive recommended panel-count range for one page. */
	panelCount: [number, number]
	dominantShots: ShotSizeId[]
	favouredTransitions: McCloudTransition[]
	/** Normalized 0..1 tension samples across the page, start to finish. */
	tensionCurve: number[]
	notes: string
}

export const PACING_STRATEGIES: PacingStrategy[] = [
	{
		id: 'decompression',
		name: 'Decompression',
		intent: 'Slow time down; spend many panels on a single moment to build mood and presence.',
		panelCount: [5, 8],
		dominantShots: ['WS', 'MS', 'MCU'],
		favouredTransitions: ['moment_to_moment', 'aspect_to_aspect'],
		tensionCurve: [0.3, 0.32, 0.35, 0.38, 0.42],
		notes: 'Pioneered in modern action manga; trades information density for atmosphere and weight.',
	},
	{
		id: 'compression',
		name: 'Compression',
		intent: 'Pack maximum story into minimum space; each panel jumps the action forward.',
		panelCount: [6, 9],
		dominantShots: ['MS', 'MCU', 'WS'],
		favouredTransitions: ['scene_to_scene', 'subject_to_subject'],
		tensionCurve: [0.4, 0.5, 0.55, 0.6, 0.62],
		notes: 'Classic Western newspaper-strip economy; keeps plot moving at the cost of breathing room.',
	},
	{
		id: 'ma-silent-beat',
		name: 'Ma (Silent Beat)',
		intent: 'Insert a wordless pause that lets a moment resonate before the next event.',
		panelCount: [3, 5],
		dominantShots: ['WS', 'CU', 'insert'],
		favouredTransitions: ['aspect_to_aspect', 'moment_to_moment'],
		tensionCurve: [0.45, 0.3, 0.28, 0.5],
		notes: 'The Japanese negative-space beat; silence itself carries the emotional charge.',
	},
	{
		id: 'reveal-page-turn',
		name: 'Reveal / Page-Turn',
		intent: 'Withhold, then land a surprise on the turn of the page for maximum shock.',
		panelCount: [3, 6],
		dominantShots: ['CU', 'ECU', 'WS'],
		favouredTransitions: ['subject_to_subject', 'scene_to_scene'],
		tensionCurve: [0.4, 0.5, 0.45, 0.9],
		notes: 'Setup panels stay tight and occluded; the reveal expands into a dominant frame.',
	},
	{
		id: 'crescendo',
		name: 'Crescendo',
		intent: 'Escalate steadily toward a climactic peak with rising panel size and tension.',
		panelCount: [4, 7],
		dominantShots: ['MS', 'MCU', 'CU', 'ECU'],
		favouredTransitions: ['action_to_action', 'subject_to_subject'],
		tensionCurve: [0.4, 0.55, 0.7, 0.85, 0.95],
		notes: 'Panels grow and gutters tighten as the page builds toward its hero beat.',
	},
	{
		id: 'cooldown',
		name: 'Cooldown',
		intent: 'Release tension after a peak; let the scene exhale and reset.',
		panelCount: [3, 5],
		dominantShots: ['WS', 'EWS', 'MS'],
		favouredTransitions: ['scene_to_scene', 'aspect_to_aspect'],
		tensionCurve: [0.8, 0.55, 0.4, 0.3],
		notes: 'Often a wide pull-back; widens framing and lowers tension to close a sequence.',
	},
	{
		id: 'comedic-beat',
		name: 'Comedic Beat Timing',
		intent: 'Time a joke: setup, straight beat, then the punchline panel lands the turn.',
		panelCount: [3, 4],
		dominantShots: ['MS', 'MCU', 'CU'],
		favouredTransitions: ['action_to_action', 'non_sequitur'],
		tensionCurve: [0.4, 0.45, 0.35, 0.7],
		notes: 'Kishotenketsu four-beat comedy; the penultimate panel sells the turn, the last the payoff.',
	},
	{
		id: 'action-rhythm',
		name: 'Action Rhythm',
		intent: 'Alternate wide staging and tight impact so fights stay legible and kinetic.',
		panelCount: [5, 8],
		dominantShots: ['WS', 'MS', 'CU', 'ECU'],
		favouredTransitions: ['action_to_action', 'moment_to_moment'],
		tensionCurve: [0.55, 0.7, 0.6, 0.8, 0.9],
		notes: 'Establish geography wide, then cut tight on the hit; repeat to keep clarity under speed.',
	},
]

export const PACING_IDS = PACING_STRATEGIES.map((strategy) => strategy.id)

export function getPacingStrategy(id: PacingId): PacingStrategy | undefined {
	return PACING_STRATEGIES.find((strategy) => strategy.id === id)
}
