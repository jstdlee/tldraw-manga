// =============================================================================
// Comics theory library. Encodes Scott McCloud, Will Eisner, kishotenketsu, Ma,
// the 180-degree rule, reading flow, juxtaposition, the page-turn reveal, gutter-
// as-time and focal hierarchy as evaluable checklists. Each checklist item has a
// scope and an optional engine hook (a factor id and/or a layout weight effect)
// so the JEV engine and Inspector can act on it.
// =============================================================================

import type { ScenarioWeightBias } from '../layout/score'

export type TheoryFramework =
	| 'mccloud'
	| 'eisner'
	| 'kishotenketsu'
	| 'ma'
	| 'flow'
	| 'composition'
	| 'montage'

export type TheoryScope = 'page' | 'panel' | 'balloon'

export interface TheoryChecklistItem {
	id: string
	text: string
	scope: TheoryScope
	/** Optional engine hook: a factor this check touches and/or a layout bias. */
	hook?: {
		factorId?: string
		weightEffect?: ScenarioWeightBias
		condition?: string
	}
}

export interface TheoryItem {
	id: string
	framework: TheoryFramework
	title: string
	explanation: string
	/** How to evaluate whether the work honours this principle. */
	evaluation: string
	checklist: TheoryChecklistItem[]
}

export const THEORY_ITEMS: TheoryItem[] = [
	{
		id: 'mccloud-closure',
		framework: 'mccloud',
		title: 'Closure',
		explanation:
			'Comics ask the reader to mentally complete action across the gutter. The invisible leap between panels is where the reader becomes a participant.',
		evaluation: 'Check that each panel-to-panel gap leaves enough, but not too much, for the reader to infer.',
		checklist: [
			{ id: 'closure-gap-readable', text: 'Each gutter leap is inferable from the two panels it joins.', scope: 'page', hook: { factorId: 'transition' } },
			{ id: 'closure-not-redundant', text: 'Panels do not over-explain what closure already supplies.', scope: 'panel', hook: { factorId: 'wordPictureMode' } },
		],
	},
	{
		id: 'mccloud-transitions',
		framework: 'mccloud',
		title: 'Six Panel-to-Panel Transitions',
		explanation:
			'Moment-to-moment, action-to-action, subject-to-subject, scene-to-scene, aspect-to-aspect, and non-sequitur transitions each demand a different amount of closure and set a different rhythm.',
		evaluation: 'Audit the transition type on each cut and confirm it matches the intended pacing.',
		checklist: [
			{ id: 'transition-intentional', text: 'Every cut uses a deliberate transition type, not a default.', scope: 'page', hook: { factorId: 'transition' } },
			{ id: 'transition-variety', text: 'Transition types vary to avoid a monotonous read.', scope: 'page', hook: { factorId: 'transition' } },
			{ id: 'transition-aspect-for-mood', text: 'Aspect-to-aspect cuts are used to build place and mood, not to advance plot.', scope: 'panel', hook: { factorId: 'transition' } },
		],
	},
	{
		id: 'mccloud-word-picture',
		framework: 'mccloud',
		title: 'Seven Word-Picture Combinations',
		explanation:
			'Word-specific, picture-specific, duo-specific, additive, parallel, montage, and interdependent combinations govern how text and image share the load in a panel.',
		evaluation: 'For each panel, name the word-picture mode and confirm words and picture are not merely repeating each other.',
		checklist: [
			{ id: 'wp-mode-named', text: 'Each panel declares a word-picture mode.', scope: 'panel', hook: { factorId: 'wordPictureMode' } },
			{ id: 'wp-no-redundancy', text: 'Picture-specific panels suppress redundant dialogue.', scope: 'panel', hook: { factorId: 'wordPictureMode' } },
			{ id: 'wp-interdependent-balance', text: 'Interdependent panels need both words and picture to make sense.', scope: 'panel', hook: { factorId: 'lettering' } },
		],
	},
	{
		id: 'mccloud-amplification',
		framework: 'mccloud',
		title: 'Amplification Through Simplification',
		explanation:
			'Iconic abstraction strips detail to amplify meaning and identification. The picture-plane triangle runs from realistic, to iconic, to abstract.',
		evaluation: 'Judge whether the abstraction level matches the intended reader identification and focus.',
		checklist: [
			{ id: 'abstraction-consistent', text: 'Abstraction level is consistent within a sequence.', scope: 'page', hook: { factorId: 'styleBible' } },
			{ id: 'abstraction-focus', text: 'Simplified faces invite identification where the reader should inhabit a character.', scope: 'panel', hook: { factorId: 'styleBible' } },
		],
	},
	{
		id: 'mccloud-five-choices',
		framework: 'mccloud',
		title: 'Five Choices of Making Comics',
		explanation:
			'Moment, frame, image, word, and flow are the five decisions behind every panel: which moment to show, how to frame it, how to draw it, what words to add, and how to guide the eye.',
		evaluation: 'Verify each panel makes a deliberate choice at all five levels.',
		checklist: [
			{ id: 'choice-moment', text: 'The chosen moment is the most telling one available.', scope: 'panel', hook: { factorId: 'transition' } },
			{ id: 'choice-frame', text: 'The frame (shot and crop) serves the moment.', scope: 'panel', hook: { factorId: 'cameraFraming' } },
			{ id: 'choice-flow', text: 'The eye path through and out of the panel is controlled.', scope: 'panel', hook: { factorId: 'gazeTrajectory' } },
		],
	},
	{
		id: 'mccloud-time-as-space',
		framework: 'mccloud',
		title: 'Time as Space',
		explanation:
			'On the page, space is time. Panel width, gutter width, and distance between balloons all encode duration.',
		evaluation: 'Check that wider gutters and panels read as longer pauses where a beat is intended.',
		checklist: [
			{ id: 'time-gutter-pause', text: 'Wider gutters are used where a longer pause is intended.', scope: 'page', hook: { factorId: 'panelLayout', weightEffect: { rhythm: 0.04 } } },
			{ id: 'time-panel-width', text: 'Panel width tracks the duration of its moment.', scope: 'page', hook: { factorId: 'panelLayout' } },
		],
	},
	{
		id: 'mccloud-infinite-canvas',
		framework: 'mccloud',
		title: 'Infinite Canvas',
		explanation:
			'Digital reading frees comics from the fixed page; vertical scroll turns the canvas into a continuous ribbon where layout itself paces time.',
		evaluation: 'For vertical formats, confirm scroll distance is used deliberately as timing.',
		checklist: [
			{ id: 'canvas-scroll-timing', text: 'Scroll gaps are sized as deliberate timing beats.', scope: 'page', hook: { factorId: 'readingDirection' } },
			{ id: 'canvas-seam-safe', text: 'No critical art or balloon straddles a viewport seam.', scope: 'page', hook: { factorId: 'panelRects' } },
		],
	},
	{
		id: 'mccloud-masking',
		framework: 'mccloud',
		title: 'Masking Effect',
		explanation:
			'A simplified character against a realistic background lets the reader wear the character as a mask while still inhabiting a believable world.',
		evaluation: 'Check whether character abstraction and background realism are intentionally mismatched for identification.',
		checklist: [
			{ id: 'masking-bg-realism', text: 'Background realism supports immersion without competing with the figure.', scope: 'panel', hook: { factorId: 'styleBible' } },
		],
	},
	{
		id: 'eisner-sequential-art',
		framework: 'eisner',
		title: 'Sequential Art',
		explanation:
			'Eisner framed comics as sequential art: the arrangement of images in deliberate sequence to narrate and express.',
		evaluation: 'Confirm the sequence, not any single image, carries the meaning.',
		checklist: [
			{ id: 'seq-reads-as-sequence', text: 'The page reads as a sequence, not a gallery of unrelated images.', scope: 'page', hook: { factorId: 'transition' } },
		],
	},
	{
		id: 'eisner-timing',
		framework: 'eisner',
		title: 'Timing',
		explanation:
			'Panel size and count control the reader-perceived duration of events; Eisner used the panel as a unit of time.',
		evaluation: 'Check that panel sizing matches the felt timing of the beat.',
		checklist: [
			{ id: 'timing-size-matches-beat', text: 'A held moment gets a larger or isolated panel.', scope: 'page', hook: { factorId: 'panelLayout', weightEffect: { big: 0.03 } } },
		],
	},
	{
		id: 'eisner-frame-device',
		framework: 'eisner',
		title: 'Panel as Container / Frame as Device',
		explanation:
			'The panel border is a storytelling device: it can contain, imply, or be broken to express emotion and time.',
		evaluation: 'Check whether border choices (closed, open, broken, bled) are expressive, not accidental.',
		checklist: [
			{ id: 'frame-expressive-border', text: 'Border treatment (closed/open/broken/bleed) is chosen for effect.', scope: 'panel', hook: { factorId: 'panelLayout', weightEffect: { bleed: 0.04 } } },
		],
	},
	{
		id: 'kishotenketsu',
		framework: 'kishotenketsu',
		title: 'Kishotenketsu',
		explanation:
			'A four-part structure, introduction (ki), development (sho), twist (ten), and reconciliation (ketsu), that builds narrative through a turn rather than conflict.',
		evaluation: 'Check the sequence has a genuine turn in the third beat and a reconciling fourth.',
		checklist: [
			{ id: 'kst-turn-present', text: 'The third beat introduces a genuine turn or new element.', scope: 'page', hook: { factorId: 'tension' } },
			{ id: 'kst-reconcile', text: 'The final beat reconciles the turn with what preceded it.', scope: 'page', hook: { factorId: 'tension' } },
		],
	},
	{
		id: 'ma-silent-beat',
		framework: 'ma',
		title: 'Ma (Negative-Space Beat)',
		explanation:
			'The Japanese concept of meaningful emptiness: a silent, often wordless panel that lets a moment breathe and resonate.',
		evaluation: 'Check for at least one intentional silent beat before a major emotional or dramatic shift.',
		checklist: [
			{ id: 'ma-silent-before-peak', text: 'A silent Ma beat precedes a major reveal or climax.', scope: 'page', hook: { factorId: 'tension' } },
			{ id: 'ma-no-balloon', text: 'The Ma panel carries no dialogue balloon.', scope: 'panel', hook: { factorId: 'wordPictureMode' } },
		],
	},
	{
		id: 'axis-180',
		framework: 'flow',
		title: '180-Degree Rule',
		explanation:
			'Keeping the camera on one side of the action axis preserves consistent left/right screen positions and spatial continuity across cuts.',
		evaluation: 'Audit eyeline directions between consecutive panels for unintended axis crossings.',
		checklist: [
			{ id: 'axis-no-cross', text: 'No unintended 180-degree axis crossing between consecutive panels.', scope: 'page', hook: { factorId: 'eyeline' } },
			{ id: 'axis-neutral-bridge', text: 'Any deliberate axis cross is bridged by a neutral head-on or wide panel.', scope: 'page', hook: { factorId: 'eyeline' } },
		],
	},
	{
		id: 'reading-flow-z-path',
		framework: 'flow',
		title: 'Reading Flow (Z-Path)',
		explanation:
			'The eye follows a predictable path, right-to-left top-to-bottom for manga, left-to-right for Western comics, top-to-bottom for vertical scroll. Layout must reinforce it.',
		evaluation: 'Trace the eye path and confirm panels never force an upstream jump.',
		checklist: [
			{ id: 'flow-entry-corner', text: 'The eye enters each page at the correct reading-entry corner.', scope: 'page', hook: { factorId: 'readingDirection' } },
			{ id: 'flow-no-upstream', text: 'No panel sequence forces the eye to jump against reading flow.', scope: 'page', hook: { factorId: 'panelRects' } },
		],
	},
	{
		id: 'kuleshov-juxtaposition',
		framework: 'montage',
		title: 'Juxtaposition (Kuleshov-like)',
		explanation:
			'Meaning emerges from the collision of two adjacent panels; the same face reads differently depending on what precedes it.',
		evaluation: 'Check that adjacent panels are ordered so their juxtaposition produces the intended meaning.',
		checklist: [
			{ id: 'juxt-order-meaning', text: 'Adjacent panels are ordered so their collision carries the intended meaning.', scope: 'page', hook: { factorId: 'transition' } },
		],
	},
	{
		id: 'page-turn-reveal',
		framework: 'flow',
		title: 'Page-Turn Reveal',
		explanation:
			'The physical turn of the page hides what comes next, making it the strongest tool for surprise and cliffhanger.',
		evaluation: 'Check that surprises land on the first panel after a turn and the prior page ends on a hook.',
		checklist: [
			{ id: 'turn-hook-last-panel', text: 'The final panel of a page pulls toward the turn.', scope: 'page', hook: { factorId: 'panelLayout', weightEffect: { bleed: 0.04, big: 0.03 } } },
			{ id: 'turn-reveal-first', text: 'A planned surprise lands on the first panel after the turn.', scope: 'page', hook: { factorId: 'tension' } },
		],
	},
	{
		id: 'gutter-as-time',
		framework: 'flow',
		title: 'Gutter Width as Time',
		explanation:
			'The blank gutter between panels is felt duration; wider gutters read as longer elapsed time or a heavier pause.',
		evaluation: 'Confirm gutter widths vary to encode pacing rather than staying uniform by default.',
		checklist: [
			{ id: 'gutter-varies', text: 'Gutter width is varied to encode pacing where needed.', scope: 'page', hook: { factorId: 'panelLayout', weightEffect: { rhythm: 0.03 } } },
		],
	},
	{
		id: 'establishing-shot',
		framework: 'composition',
		title: 'Establishing Shot',
		explanation:
			'A wide opening panel orients the reader in space before the scene cuts in closer; without it, closer panels float without context.',
		evaluation: 'Check that new scenes open with, or quickly supply, a spatial anchor.',
		checklist: [
			{ id: 'estab-opens-scene', text: 'Each new scene opens with or soon provides a spatial anchor.', scope: 'page', hook: { factorId: 'cameraFraming', weightEffect: { big: 0.03 } } },
		],
	},
	{
		id: 'rule-of-thirds-focal',
		framework: 'composition',
		title: 'Rule of Thirds / Focal Hierarchy',
		explanation:
			'Placing the focal subject off-center on a thirds intersection, and ranking competing elements, keeps composition dynamic and legible.',
		evaluation: 'Check each panel has one dominant focal point with a clear visual hierarchy.',
		checklist: [
			{ id: 'focal-single', text: 'Each panel has one clear dominant focal point.', scope: 'panel', hook: { factorId: 'cameraFraming' } },
			{ id: 'focal-off-center', text: 'The focal subject is placed deliberately, often off-center.', scope: 'panel', hook: { factorId: 'cameraFraming' } },
		],
	},
]

export const THEORY_IDS = THEORY_ITEMS.map((item) => item.id)

export function getTheoryItem(id: string): TheoryItem | undefined {
	return THEORY_ITEMS.find((item) => item.id === id)
}

export function theoryItemsByFramework(framework: TheoryFramework): TheoryItem[] {
	return THEORY_ITEMS.filter((item) => item.framework === framework)
}

/** Flattened list of every checklist item across all theory entries. */
export function allTheoryChecklistItems(): Array<TheoryChecklistItem & { theoryId: string }> {
	return THEORY_ITEMS.flatMap((item) => item.checklist.map((check) => ({ ...check, theoryId: item.id })))
}
