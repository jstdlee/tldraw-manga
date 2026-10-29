// =============================================================================
// Master style library. Each master carries factual biographical/craft metadata,
// a McCloud mapping (normalized transition and word-picture weight vectors, plus
// abstraction and closure intensity), references into the panel-layout and shot
// libraries, descriptive prompt tokens (never the artist's name), and an explicit
// jevBias (additive layout-score deltas) consumed by the JEV engine via blend.ts.
//
// Prompt tokens are pure style descriptors so generated image prompts never rely
// on naming a living or historical artist.
// =============================================================================

import type { McCloudTransition, WordPictureMode } from '../jev/fiveStageEngine'
import type { ScenarioWeightBias } from '../layout/score'
import type { Focal } from '../model'
import type { PanelLayoutId } from './panelLayouts'
import type { ShotSizeId } from './shots'

export type MasterId =
	| 'tezuka'
	| 'toriyama'
	| 'inoue'
	| 'otomo'
	| 'urasawa'
	| 'miura'
	| 'araki'
	| 'oda'
	| 'takahashi'
	| 'moebius'
	| 'herge'
	| 'miller'
	| 'kirby'
	| 'eisner'
	| 'ware'
	| 'matsumoto'
	| 'asano'
	| 'nihei'
	| 'junji-ito'
	| 'miyazaki'
	| 'he-youzhi'
	| 'kojima'
	| 'samura'
	| 'togashi'

export interface MasterMcCloudMapping {
	/** Preferred panel-to-panel transitions; weights sum to 1. */
	transitions: Partial<Record<McCloudTransition, number>>
	/** Preferred word-picture combinations; weights sum to 1. */
	wordPicture: Partial<Record<WordPictureMode, number>>
	/** 0 = photoreal rendering, 1 = fully iconic abstraction. */
	abstraction: number
	/** 0 = explicit, low-closure cuts, 1 = demanding high-closure leaps. */
	closureIntensity: number
}

export interface Master {
	id: MasterId
	name: string
	era: string
	region: string
	keyWorks: string[]
	signatureTraits: string[]
	lineInkRules: string[]
	toneBlackRules: string[]
	compositionRules: string[]
	pacingHabits: string[]
	preferredLayouts: PanelLayoutId[]
	shotVocabulary: ShotSizeId[]
	/**
	 * Optional explicit focal-length (lens) preference as relative weights over the
	 * four Beat-holdable focal lengths. When omitted, blend.ts derives one from the
	 * master's dynamism bias and shot vocabulary. Pure style data, never a name.
	 */
	lensPreference?: Partial<Record<Focal, number>>
	mccloud: MasterMcCloudMapping
	promptStyleTokens: string[]
	/** Additive layout-score weight deltas this master biases the engine toward. */
	jevBias: ScenarioWeightBias
	checklist: string[]
}

export const MASTERS: Master[] = [
	{
		id: 'tezuka',
		name: 'Osamu Tezuka',
		era: '1946-1989',
		region: 'Japan',
		keyWorks: ['Astro Boy', 'Phoenix', 'Buddha', 'Black Jack'],
		signatureTraits: [
			'Cinematic panel grammar borrowed from film',
			'Rounded iconic character design with a deep "star system" cast',
			'Expansive page counts that let scenes breathe',
		],
		lineInkRules: ['Clean confident contour with minimal hatching', 'Expressive rounded forms over anatomical realism'],
		toneBlackRules: ['Economical blacks reserved for hair and accents', 'Light overall value for an open, readable page'],
		compositionRules: ['Treat the page like a film reel with cut-ins and pull-backs', 'Vary shot scale freely within a scene'],
		pacingHabits: ['Generous decompression for emotional scenes', 'Frequent establishing shots to orient the reader'],
		preferredLayouts: ['three-tier-grid', 'splash', 'widescreen-strip'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'CU'],
		mccloud: {
			transitions: { action_to_action: 0.4, scene_to_scene: 0.3, subject_to_subject: 0.2, moment_to_moment: 0.1 },
			wordPicture: { interdependent: 0.4, additive: 0.3, duo_specific: 0.2, word_specific: 0.1 },
			abstraction: 0.75,
			closureIntensity: 0.45,
		},
		promptStyleTokens: ['rounded iconic character design', 'clean confident contour line', 'cinematic classic manga staging', 'light open value'],
		jevBias: { rhythm: 0.04, big: 0.03 },
		checklist: [
			'Does each scene open with a clear establishing shot?',
			'Is shot scale varied like a film edit?',
			'Are character designs iconic and instantly recognizable?',
			'Are blacks economical, keeping the page open?',
			'Does emotional material get room to breathe?',
		],
	},
	{
		id: 'toriyama',
		name: 'Akira Toriyama',
		era: '1980-2024',
		region: 'Japan',
		keyWorks: ['Dragon Ball', 'Dr. Slump'],
		signatureTraits: [
			'Supremely legible, clean action staging',
			'Playful rounded mechanical and character design',
			'Clear spatial geography even in fast fights',
		],
		lineInkRules: ['Crisp even line weight', 'Minimal interior rendering for maximum clarity'],
		toneBlackRules: ['Sparing tone, lots of white', 'Speed lines over heavy blacks for motion'],
		compositionRules: ['Keep the reader oriented in 3D space at all times', 'Stage action wide, then punctuate with impact close-ups'],
		pacingHabits: ['Clean action rhythm alternating wide and tight', 'Quick, punchy comedic timing'],
		preferredLayouts: ['diagonal-action-cut', 'three-tier-grid', 'splash'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.5, moment_to_moment: 0.2, subject_to_subject: 0.2, scene_to_scene: 0.1 },
			wordPicture: { duo_specific: 0.4, additive: 0.3, interdependent: 0.2, picture_specific: 0.1 },
			abstraction: 0.8,
			closureIntensity: 0.35,
		},
		promptStyleTokens: ['ultra-clean action line art', 'legible spatial staging', 'rounded playful design', 'bright minimal shading'],
		jevBias: { diag: 0.05, cv: 0.03 },
		checklist: [
			'Can the reader always tell where everyone is in space?',
			'Is the line weight crisp and even?',
			'Does action stage wide before cutting tight?',
			'Is the page kept bright with lots of white?',
			'Do speed lines, not heavy blacks, carry motion?',
		],
	},
	{
		id: 'inoue',
		name: 'Takehiko Inoue',
		era: '1990-present',
		region: 'Japan',
		keyWorks: ['Slam Dunk', 'Vagabond', 'Real'],
		signatureTraits: [
			'Athletic, anatomically grounded figures',
			'Brush-driven expressive line in later work',
			'Silent decompressed beats at emotional peaks',
		],
		lineInkRules: ['Confident brush line with dry-brush texture', 'Anatomy-first construction'],
		toneBlackRules: ['Rich brushed blacks and ink wash', 'Negative space as emotional weight'],
		compositionRules: ['Hold on a moment across several panels', 'Use wide silent beats before a decisive action'],
		pacingHabits: ['Decompression at climaxes', 'Ma silence before the key shot'],
		preferredLayouts: ['widescreen-strip', 'splash', 'borderless-bleed', 'inset-panel'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { moment_to_moment: 0.4, action_to_action: 0.3, aspect_to_aspect: 0.2, subject_to_subject: 0.1 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, additive: 0.2, parallel: 0.1 },
			abstraction: 0.25,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['expressive brush ink line', 'grounded athletic anatomy', 'dry-brush texture', 'negative-space emotional weight'],
		jevBias: { big: 0.05, rhythm: 0.03 },
		checklist: [
			'Is a silent beat placed before the decisive moment?',
			'Does the brush line stay expressive, not mechanical?',
			'Is anatomy grounded and athletic?',
			'Does negative space carry emotional weight?',
			'Are climaxes decompressed across panels?',
		],
	},
	{
		id: 'otomo',
		name: 'Katsuhiro Otomo',
		era: '1973-present',
		region: 'Japan',
		keyWorks: ['Akira', 'Domu'],
		signatureTraits: [
			'Hyper-detailed mechanical and architectural realism',
			'Precise perspective and scale',
			'Explosive full-bleed destruction spreads',
		],
		lineInkRules: ['Fine even technical line', 'Dense accurate detail rendering'],
		toneBlackRules: ['Controlled tone for realistic value', 'Hard blacks on impact and shadow'],
		compositionRules: ['Exact perspective with strong vanishing points', 'Scale contrast between figure and environment'],
		pacingHabits: ['Decompressed build to an explosive bleed', 'Precise action geography'],
		preferredLayouts: ['double-page-spread', 'diagonal-action-cut', 'borderless-bleed', 'three-tier-grid'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'ECU'],
		lensPreference: { '18mm': 1, '35mm': 0.6, '50mm': 0.4, '85mm': 0.25 },
		mccloud: {
			transitions: { action_to_action: 0.4, moment_to_moment: 0.3, scene_to_scene: 0.2, aspect_to_aspect: 0.1 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, additive: 0.2, parallel: 0.1 },
			abstraction: 0.2,
			closureIntensity: 0.4,
		},
		promptStyleTokens: ['hyper-detailed mechanical realism', 'precise architectural perspective', 'fine technical line', 'explosive full-bleed scale'],
		jevBias: { bleed: 0.08, big: 0.05, diag: 0.03 },
		checklist: [
			'Is perspective exact with controlled vanishing points?',
			'Is mechanical and architectural detail accurate?',
			'Do destruction beats earn a full bleed?',
			'Is scale contrast between figure and world strong?',
			'Does tone render believable realistic value?',
		],
	},
	{
		id: 'urasawa',
		name: 'Naoki Urasawa',
		era: '1983-present',
		region: 'Japan',
		keyWorks: ['Monster', '20th Century Boys', 'Pluto'],
		signatureTraits: [
			'Cinematic suspense built from ordinary faces',
			'Subtle acting and micro-expression',
			'Meticulous real-world staging',
		],
		lineInkRules: ['Restrained naturalistic line', 'Expression carried by small facial shifts'],
		toneBlackRules: ['Even realistic tone', 'Shadow used for suspense, not spectacle'],
		compositionRules: ['Eye-level naturalism with occasional pressure angles', 'Reaction shots drive tension'],
		pacingHabits: ['Slow-burn decompression', 'Page-turn reveals on quiet discoveries'],
		preferredLayouts: ['three-tier-grid', 'inset-panel', 'widescreen-strip'],
		shotVocabulary: ['MS', 'MCU', 'CU', 'WS'],
		lensPreference: { '18mm': 0.2, '35mm': 0.7, '50mm': 1, '85mm': 0.9 },
		mccloud: {
			transitions: { subject_to_subject: 0.4, action_to_action: 0.3, scene_to_scene: 0.2, moment_to_moment: 0.1 },
			wordPicture: { interdependent: 0.4, duo_specific: 0.3, additive: 0.2, word_specific: 0.1 },
			abstraction: 0.2,
			closureIntensity: 0.55,
		},
		promptStyleTokens: ['naturalistic restrained line', 'subtle micro-expression acting', 'cinematic suspense staging', 'ordinary believable faces'],
		jevBias: { rhythm: 0.04 },
		checklist: [
			'Is suspense built from ordinary faces and reactions?',
			'Are micro-expressions doing the acting?',
			'Is staging grounded in a believable real world?',
			'Do quiet discoveries land on the page turn?',
			'Is shadow used for tension, not spectacle?',
		],
	},
	{
		id: 'miura',
		name: 'Kentaro Miura',
		era: '1989-2021',
		region: 'Japan',
		keyWorks: ['Berserk'],
		signatureTraits: [
			'Overwhelming rendering density and texture',
			'Baroque dark-fantasy horror detail',
			'Monumental hero compositions',
		],
		lineInkRules: ['Dense cross-hatching and feathering', 'Immense interior detail'],
		toneBlackRules: ['Deep spotted blacks', 'High-contrast chiaroscuro dread'],
		compositionRules: ['Low heroic and worm angles for scale', 'Crowded apocalyptic environments'],
		pacingHabits: ['Crescendo to a monumental hero panel', 'Horror beats with silent dread'],
		preferredLayouts: ['splash', 'kakekomi-irregular', 'diagonal-action-cut', 'double-page-spread'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.4, moment_to_moment: 0.3, aspect_to_aspect: 0.2, subject_to_subject: 0.1 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, duo_specific: 0.2, parallel: 0.1 },
			abstraction: 0.15,
			closureIntensity: 0.45,
		},
		promptStyleTokens: ['dense baroque cross-hatching', 'dark-fantasy horror detail', 'deep spotted blacks', 'monumental heroic scale'],
		jevBias: { bleed: 0.07, big: 0.06, diag: 0.04 },
		checklist: [
			'Is rendering density overwhelming yet readable?',
			'Do low and worm angles maximize scale?',
			'Are blacks deep and high-contrast?',
			'Does the sequence crescendo to a monumental panel?',
			'Do horror beats use silent dread?',
		],
	},
	{
		id: 'araki',
		name: 'Hirohiko Araki',
		era: '1980-present',
		region: 'Japan',
		keyWorks: ["JoJo's Bizarre Adventure"],
		signatureTraits: [
			'Fashion-plate posing and bold poses (jojo-dachi)',
			'Baroque sound-effect integration',
			'Unconventional, confident panel breaks',
		],
		lineInkRules: ['Bold sculptural contour', 'Decorative detailed rendering'],
		toneBlackRules: ['Graphic high-contrast blacks', 'Patterned tone as design'],
		compositionRules: ['Dynamic diagonal posing', 'SFX lettering as compositional element'],
		pacingHabits: ['Action rhythm with dramatic posing beats', 'Reveal beats of new abilities'],
		preferredLayouts: ['kakekomi-irregular', 'diagonal-action-cut', 'broken-border', 'splash'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.4, subject_to_subject: 0.3, moment_to_moment: 0.2, non_sequitur: 0.1 },
			wordPicture: { duo_specific: 0.4, interdependent: 0.3, additive: 0.2, montage: 0.1 },
			abstraction: 0.45,
			closureIntensity: 0.45,
		},
		promptStyleTokens: ['bold sculptural posing', 'fashion-plate dynamism', 'graphic high-contrast ink', 'integrated decorative sound shapes'],
		jevBias: { diag: 0.06, bleed: 0.04 },
		checklist: [
			'Do figures strike bold, sculptural poses?',
			'Is SFX lettering part of the composition?',
			'Are panel breaks confident and unconventional?',
			'Is contrast graphic and high?',
			'Do ability reveals get dedicated beats?',
		],
	},
	{
		id: 'oda',
		name: 'Eiichiro Oda',
		era: '1997-present',
		region: 'Japan',
		keyWorks: ['One Piece'],
		signatureTraits: [
			'Dense joyful crowd compositions',
			'Exaggerated rubbery cartoon design',
			'Information-rich panels that still read clearly',
		],
		lineInkRules: ['Rubbery expressive contour', 'Busy but organized detail'],
		toneBlackRules: ['Moderate tone with strong whites', 'Blacks for depth in crowds'],
		compositionRules: ['Pack panels with incident yet guide the eye', 'Big emotional hero beats'],
		pacingHabits: ['Crescendo emotional climaxes', 'Comedic beats between action'],
		preferredLayouts: ['kakekomi-irregular', 'splash', 'diagonal-action-cut', 'inset-panel'],
		shotVocabulary: ['WS', 'MS', 'CU', 'EWS'],
		mccloud: {
			transitions: { action_to_action: 0.4, subject_to_subject: 0.3, scene_to_scene: 0.2, moment_to_moment: 0.1 },
			wordPicture: { duo_specific: 0.4, additive: 0.3, interdependent: 0.2, montage: 0.1 },
			abstraction: 0.7,
			closureIntensity: 0.4,
		},
		promptStyleTokens: ['rubbery exaggerated cartoon design', 'dense joyful crowd staging', 'organized busy detail', 'strong whites with depth blacks'],
		jevBias: { big: 0.05, cv: 0.04 },
		checklist: [
			'Do busy panels still guide the eye cleanly?',
			'Is character design exaggerated and expressive?',
			'Do emotional climaxes get big hero beats?',
			'Are comedic beats spaced between action?',
			'Is the page kept readable despite density?',
		],
	},
	{
		id: 'takahashi',
		name: 'Rumiko Takahashi',
		era: '1978-present',
		region: 'Japan',
		keyWorks: ['Urusei Yatsura', 'Ranma 1/2', 'Inuyasha'],
		signatureTraits: [
			'Impeccable comedic timing',
			'Clean legible character acting',
			'Efficient economical storytelling',
		],
		lineInkRules: ['Clean even line', 'Expressive but economical faces'],
		toneBlackRules: ['Light tone, open pages', 'Blacks for hair and accents'],
		compositionRules: ['Clear two-shot staging for comedy', 'Reaction beats sell the joke'],
		pacingHabits: ['Precise comedic beat timing', 'Quick scene-to-scene economy'],
		preferredLayouts: ['three-tier-grid', 'four-koma', 'six-panel-grid'],
		shotVocabulary: ['MS', 'MCU', 'CU', 'WS'],
		mccloud: {
			transitions: { action_to_action: 0.4, subject_to_subject: 0.3, scene_to_scene: 0.2, moment_to_moment: 0.1 },
			wordPicture: { duo_specific: 0.4, interdependent: 0.3, word_specific: 0.2, additive: 0.1 },
			abstraction: 0.6,
			closureIntensity: 0.35,
		},
		promptStyleTokens: ['clean even comedic line', 'expressive economical faces', 'light open value', 'legible two-shot staging'],
		jevBias: { rhythm: 0.03 },
		checklist: [
			'Is the comedic beat timing precise?',
			'Does the reaction panel sell the joke?',
			'Is character acting clean and legible?',
			'Is storytelling economical with no wasted panels?',
			'Are pages kept light and open?',
		],
	},
	{
		id: 'moebius',
		name: 'Moebius (Jean Giraud)',
		era: '1963-2012',
		region: 'France',
		keyWorks: ['Arzach', 'The Incal', 'Blueberry'],
		signatureTraits: [
			'Fine ligne-claire line with surreal vistas',
			'Dreamlike decompressed science-fantasy',
			'Luminous flat color',
		],
		lineInkRules: ['Fine uniform clear line', 'Intricate organic detail without hatching weight'],
		toneBlackRules: ['Flat luminous color over tone', 'Restrained blacks'],
		compositionRules: ['Vast landscapes dwarfing figures', 'Open, meditative panel sequences'],
		pacingHabits: ['Decompressed wandering pace', 'Silent aspect-to-aspect vistas'],
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'splash', 'eisner-open-panel'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'insert'],
		mccloud: {
			transitions: { aspect_to_aspect: 0.4, scene_to_scene: 0.3, subject_to_subject: 0.2, moment_to_moment: 0.1 },
			wordPicture: { picture_specific: 0.4, parallel: 0.3, additive: 0.2, interdependent: 0.1 },
			abstraction: 0.4,
			closureIntensity: 0.6,
		},
		promptStyleTokens: ['fine clear-line detail', 'surreal luminous science-fantasy vista', 'flat luminous color', 'dreamlike open composition'],
		jevBias: { aspect: 0.05, rhythm: 0.03, diag: -0.03 },
		checklist: [
			'Is the line a fine, uniform clear line?',
			'Do vistas dwarf the figures?',
			'Is color flat and luminous?',
			'Is pacing decompressed and meditative?',
			'Are aspect-to-aspect cuts used for mood?',
		],
	},
	{
		id: 'herge',
		name: 'Herge',
		era: '1929-1983',
		region: 'Belgium',
		keyWorks: ['The Adventures of Tintin'],
		signatureTraits: [
			'The archetypal ligne claire',
			'Flat uniform color and clear staging',
			'Iconic simplified characters in detailed settings',
		],
		lineInkRules: ['Perfectly even clear line', 'No hatching; form by line and flat color'],
		toneBlackRules: ['Flat color, almost no screentone', 'Blacks only as local color'],
		compositionRules: ['Clear, stage-like blocking', 'Even regular tiers'],
		pacingHabits: ['Measured compression', 'Clear cause-and-effect sequencing'],
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'eisner-open-panel'],
		shotVocabulary: ['WS', 'MS', 'MCU', 'EWS'],
		mccloud: {
			transitions: { action_to_action: 0.4, scene_to_scene: 0.3, subject_to_subject: 0.2, moment_to_moment: 0.1 },
			wordPicture: { additive: 0.4, interdependent: 0.3, duo_specific: 0.2, word_specific: 0.1 },
			abstraction: 0.7,
			closureIntensity: 0.35,
		},
		promptStyleTokens: ['archetypal ligne claire', 'flat uniform color', 'iconic simple characters', 'detailed believable settings'],
		jevBias: { rhythm: 0.04, diag: -0.04 },
		checklist: [
			'Is the line a perfectly even clear line?',
			'Is color flat and uniform?',
			'Are characters iconic in detailed settings?',
			'Are tiers even and regular?',
			'Is cause and effect sequenced clearly?',
		],
	},
	{
		id: 'miller',
		name: 'Frank Miller',
		era: '1978-present',
		region: 'United States',
		keyWorks: ['Sin City', 'The Dark Knight Returns', 'Daredevil: Born Again'],
		signatureTraits: [
			'Stark high-contrast black-and-white noir',
			'Silhouette and negative-space drama',
			'Hard-boiled staccato pacing',
		],
		lineInkRules: ['Bold brush and spotted blacks', 'Minimal line, maximal shape'],
		toneBlackRules: ['Pure black and white, no grey', 'Negative space as light'],
		compositionRules: ['Silhouette-first composition', 'Aggressive crops and tilts'],
		pacingHabits: ['Staccato action rhythm', 'Hard cuts and bold bleeds'],
		preferredLayouts: ['diagonal-action-cut', 'splash', 'broken-border', 'borderless-bleed'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.4, moment_to_moment: 0.3, subject_to_subject: 0.2, aspect_to_aspect: 0.1 },
			wordPicture: { parallel: 0.4, picture_specific: 0.3, interdependent: 0.2, word_specific: 0.1 },
			abstraction: 0.35,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['stark high-contrast noir ink', 'silhouette-driven composition', 'pure black and white no grey', 'negative space as light'],
		jevBias: { bleed: 0.08, diag: 0.06, cv: 0.04 },
		checklist: [
			'Is value pure black and white with no grey?',
			'Does silhouette drive the composition?',
			'Is negative space used as light?',
			'Are crops aggressive and tilted?',
			'Is pacing hard-boiled and staccato?',
		],
	},
	{
		id: 'kirby',
		name: 'Jack Kirby',
		era: '1937-1994',
		region: 'United States',
		keyWorks: ['Fantastic Four', 'New Gods', 'Captain America'],
		signatureTraits: [
			'Explosive dynamic figure energy',
			'Foreshortened fists-at-camera power',
			'Cosmic machinery ("Kirby krackle")',
		],
		lineInkRules: ['Bold blocky powerful contour', 'Dense black krackle energy dots'],
		toneBlackRules: ['Heavy graphic blacks', 'High-energy contrast'],
		compositionRules: ['Extreme foreshortening toward the reader', 'Figures breaking the panel'],
		pacingHabits: ['Crescendo power beats', 'Splash-page spectacle'],
		preferredLayouts: ['splash', 'double-page-spread', 'diagonal-action-cut', 'kakekomi-irregular'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.5, moment_to_moment: 0.2, subject_to_subject: 0.2, scene_to_scene: 0.1 },
			wordPicture: { duo_specific: 0.4, additive: 0.3, interdependent: 0.2, parallel: 0.1 },
			abstraction: 0.4,
			closureIntensity: 0.4,
		},
		promptStyleTokens: ['explosive dynamic figure energy', 'extreme foreshortening toward viewer', 'cosmic energy crackle dots', 'bold blocky power contour'],
		jevBias: { bleed: 0.07, big: 0.06, diag: 0.05 },
		checklist: [
			'Do figures explode with dynamic energy?',
			'Is foreshortening pushed toward the reader?',
			'Do figures break the panel border?',
			'Is cosmic energy rendered with krackle?',
			'Do power beats get splash spectacle?',
		],
	},
	{
		id: 'eisner',
		name: 'Will Eisner',
		era: '1936-2005',
		region: 'United States',
		keyWorks: ['The Spirit', 'A Contract with God'],
		signatureTraits: [
			'Environment-as-frame storytelling',
			'Expressive theatrical body language',
			'Title-integrated splash pages',
		],
		lineInkRules: ['Loose expressive brush line', 'Atmospheric hatching'],
		toneBlackRules: ['Moody spotted blacks', 'Rain and shadow as mood'],
		compositionRules: ['Let architecture and props frame panels', 'Theatrical staging and gesture'],
		pacingHabits: ['Decompressed character moments', 'Environmental establishing openers'],
		preferredLayouts: ['eisner-open-panel', 'splash', 'three-tier-grid', 'broken-border'],
		shotVocabulary: ['WS', 'MS', 'MCU', 'EWS'],
		mccloud: {
			transitions: { scene_to_scene: 0.4, action_to_action: 0.3, subject_to_subject: 0.2, aspect_to_aspect: 0.1 },
			wordPicture: { interdependent: 0.4, additive: 0.3, duo_specific: 0.2, parallel: 0.1 },
			abstraction: 0.45,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['environment-as-frame staging', 'expressive theatrical body language', 'moody atmospheric hatching', 'rain and shadow mood'],
		jevBias: { bleed: 0.04, rhythm: 0.03 },
		checklist: [
			'Does the environment itself frame the sequence?',
			'Is body language theatrical and expressive?',
			'Do openers establish place atmospherically?',
			'Are blacks moody and spotted?',
			'Is the title integrated into the splash?',
		],
	},
	{
		id: 'ware',
		name: 'Chris Ware',
		era: '1991-present',
		region: 'United States',
		keyWorks: ['Jimmy Corrigan', 'Building Stories'],
		signatureTraits: [
			'Diagrammatic architectural precision',
			'Tiny modular panels and intricate page design',
			'Emotionally cool, formally rigorous',
		],
		lineInkRules: ['Precise ruled uniform line', 'Geometric flat forms'],
		toneBlackRules: ['Muted designed flat color', 'Minimal blacks'],
		compositionRules: ['Treat the page as an information diagram', 'Rigid modular grids with nonlinear paths'],
		pacingHabits: ['Micro-panel decompression', 'Repetition as rhythm'],
		preferredLayouts: ['six-panel-grid', 'three-tier-grid', 'inset-panel', 'eisner-open-panel'],
		shotVocabulary: ['WS', 'MS', 'insert', 'EWS'],
		mccloud: {
			transitions: { moment_to_moment: 0.4, aspect_to_aspect: 0.3, subject_to_subject: 0.2, scene_to_scene: 0.1 },
			wordPicture: { parallel: 0.4, interdependent: 0.3, additive: 0.2, montage: 0.1 },
			abstraction: 0.85,
			closureIntensity: 0.65,
		},
		promptStyleTokens: ['diagrammatic architectural precision', 'geometric flat forms', 'muted designed palette', 'ruled uniform line'],
		jevBias: { rhythm: 0.05, diag: -0.05, cv: -0.03 },
		checklist: [
			'Does the page read as a designed information diagram?',
			'Is the line precise and ruled?',
			'Are grids rigid and modular?',
			'Is color muted and deliberately designed?',
			'Does repetition create rhythm?',
		],
	},
	{
		id: 'matsumoto',
		name: 'Taiyo Matsumoto',
		era: '1987-present',
		region: 'Japan',
		keyWorks: ['Tekkonkinkreet', 'Ping Pong', 'Sunny'],
		signatureTraits: [
			'Warped childlike perspective',
			'Loose energetic sketch line',
			'Playful unconventional layouts',
		],
		lineInkRules: ['Loose scratchy energetic line', 'Deliberately naive forms'],
		toneBlackRules: ['Textured spotted blacks', 'Hand-drawn imperfect tone'],
		compositionRules: ['Bent, warped perspective for feeling', 'Unexpected framing and tilts'],
		pacingHabits: ['Decompressed atmospheric wandering', 'Sudden kinetic bursts'],
		preferredLayouts: ['broken-border', 'kakekomi-irregular', 'inset-panel', 'widescreen-strip'],
		shotVocabulary: ['WS', 'MS', 'CU', 'EWS'],
		mccloud: {
			transitions: { aspect_to_aspect: 0.4, moment_to_moment: 0.3, action_to_action: 0.2, non_sequitur: 0.1 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, parallel: 0.2, montage: 0.1 },
			abstraction: 0.55,
			closureIntensity: 0.6,
		},
		promptStyleTokens: ['loose scratchy energetic line', 'warped childlike perspective', 'textured hand-drawn tone', 'playful unconventional framing'],
		jevBias: { diag: 0.04, bleed: 0.03 },
		checklist: [
			'Does perspective warp to convey feeling?',
			'Is the line loose and energetic?',
			'Are layouts playful and unexpected?',
			'Is tone textured and hand-made?',
			'Do kinetic bursts punctuate atmosphere?',
		],
	},
	{
		id: 'asano',
		name: 'Inio Asano',
		era: '1998-present',
		region: 'Japan',
		keyWorks: ['Solanin', 'Oyasumi Punpun', 'Goodnight Punpun'],
		signatureTraits: [
			'Photoreal backgrounds against simplified figures',
			'Melancholic contemporary realism',
			'Masking effect for reader identification',
		],
		lineInkRules: ['Precise fine line on backgrounds', 'Simplified iconic figures'],
		toneBlackRules: ['Photographic tone on environments', 'Clean value control'],
		compositionRules: ['Realistic environment, iconic character (masking)', 'Quiet eye-level framing'],
		pacingHabits: ['Decompressed everyday beats', 'Ma silence for malaise'],
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'borderless-bleed', 'inset-panel'],
		shotVocabulary: ['WS', 'MS', 'MCU', 'insert'],
		mccloud: {
			transitions: { moment_to_moment: 0.3, aspect_to_aspect: 0.3, subject_to_subject: 0.2, scene_to_scene: 0.2 },
			wordPicture: { interdependent: 0.4, picture_specific: 0.3, parallel: 0.2, additive: 0.1 },
			abstraction: 0.5,
			closureIntensity: 0.55,
		},
		promptStyleTokens: ['photoreal detailed backgrounds', 'simplified iconic figures', 'melancholic contemporary realism', 'masking-effect identification'],
		jevBias: { rhythm: 0.04, diag: -0.03 },
		checklist: [
			'Are photoreal backgrounds paired with simplified figures?',
			'Is the mood grounded, contemporary, melancholic?',
			'Does masking invite reader identification?',
			'Are everyday beats decompressed?',
			'Is silence used to convey malaise?',
		],
	},
	{
		id: 'nihei',
		name: 'Tsutomu Nihei',
		era: '1995-present',
		region: 'Japan',
		keyWorks: ['Blame!', 'Biomega', 'Knights of Sidonia'],
		signatureTraits: [
			'Vast silent megastructure architecture',
			'Overwhelming scale and emptiness',
			'Sparse dialogue, image-led storytelling',
		],
		lineInkRules: ['Fine technical architectural line', 'Dense structural detail'],
		toneBlackRules: ['Deep blacks for cavernous depth', 'High-contrast void'],
		compositionRules: ['Tiny figures lost in colossal structures', 'Extreme scale and perspective'],
		pacingHabits: ['Silent decompressed exploration', 'Sudden brutal action'],
		preferredLayouts: ['splash', 'double-page-spread', 'borderless-bleed', 'three-tier-grid'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'ECU'],
		lensPreference: { '18mm': 1, '35mm': 0.55, '50mm': 0.35, '85mm': 0.2 },
		mccloud: {
			transitions: { aspect_to_aspect: 0.4, scene_to_scene: 0.3, moment_to_moment: 0.2, action_to_action: 0.1 },
			wordPicture: { picture_specific: 0.5, parallel: 0.2, interdependent: 0.2, montage: 0.1 },
			abstraction: 0.2,
			closureIntensity: 0.7,
		},
		promptStyleTokens: ['vast silent megastructure architecture', 'overwhelming scale and emptiness', 'fine technical structural line', 'cavernous deep blacks'],
		jevBias: { bleed: 0.06, big: 0.05, aspect: 0.04 },
		checklist: [
			'Are figures tiny against colossal structures?',
			'Is dialogue sparse and image-led?',
			'Is scale overwhelming and empty?',
			'Are blacks deep and cavernous?',
			'Do silent beats dominate before brutal action?',
		],
	},
	{
		id: 'junji-ito',
		name: 'Junji Ito',
		era: '1987-present',
		region: 'Japan',
		keyWorks: ['Uzumaki', 'Tomie', 'Gyo'],
		signatureTraits: [
			'Obsessive fine-line body horror',
			'Uncanny spirals and wrong detail',
			'Slow dread then grotesque reveal',
		],
		lineInkRules: ['Dense obsessive fine hatching', 'Meticulous horror detail'],
		toneBlackRules: ['Controlled tone with grotesque highlights', 'Shadow for creeping dread'],
		compositionRules: ['Normal framing that curdles into wrongness', 'Extreme close-ups on uncanny detail'],
		pacingHabits: ['Ma dread then page-turn grotesque reveal', 'Slow escalation'],
		preferredLayouts: ['inset-panel', 'broken-border', 'splash', 'three-tier-grid'],
		shotVocabulary: ['MS', 'CU', 'ECU', 'insert'],
		mccloud: {
			transitions: { subject_to_subject: 0.3, moment_to_moment: 0.3, aspect_to_aspect: 0.2, scene_to_scene: 0.2 },
			wordPicture: { interdependent: 0.4, picture_specific: 0.3, additive: 0.2, word_specific: 0.1 },
			abstraction: 0.25,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['obsessive fine-line body horror', 'uncanny spiral detail', 'meticulous grotesque rendering', 'creeping shadow dread'],
		jevBias: { big: 0.04, bleed: 0.03 },
		checklist: [
			'Does normal framing curdle into wrongness?',
			'Is fine-line detail obsessive and meticulous?',
			'Do extreme close-ups reveal uncanny detail?',
			'Does dread build before a grotesque reveal?',
			'Does the reveal land on the page turn?',
		],
	},
	{
		id: 'miyazaki',
		name: 'Hayao Miyazaki',
		era: '1982-1994',
		region: 'Japan',
		keyWorks: ['Nausicaa of the Valley of the Wind (manga)'],
		signatureTraits: [
			'Dense delicate fine-line ecology and machinery',
			'Sweeping environmental vistas',
			'Humanist decompressed storytelling',
		],
		lineInkRules: ['Delicate dense fine line', 'Intricate organic and mechanical detail'],
		toneBlackRules: ['Fine hatching for value', 'Light airy overall tone'],
		compositionRules: ['Vast wind-swept landscapes', 'Figures integrated into living environments'],
		pacingHabits: ['Decompressed humanist pacing', 'Quiet beats amid epic scope'],
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'splash', 'borderless-bleed'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'CU'],
		mccloud: {
			transitions: { scene_to_scene: 0.3, aspect_to_aspect: 0.3, action_to_action: 0.2, moment_to_moment: 0.2 },
			wordPicture: { interdependent: 0.4, additive: 0.3, picture_specific: 0.2, parallel: 0.1 },
			abstraction: 0.35,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['delicate dense fine-line detail', 'sweeping wind-swept ecology', 'intricate organic and mechanical detail', 'light airy hatching'],
		jevBias: { aspect: 0.05, rhythm: 0.03 },
		checklist: [
			'Are landscapes vast and wind-swept?',
			'Is fine-line detail delicate and dense?',
			'Are figures integrated into living environments?',
			'Is pacing humanist and decompressed?',
			'Do quiet beats punctuate the epic scope?',
		],
	},
	{
		id: 'he-youzhi',
		name: 'He Youzhi',
		era: '1950-2016',
		region: 'China',
		keyWorks: ['Lu Xun short-story lianhuanhua', 'White-Haired Girl'],
		signatureTraits: [
			'Masterful traditional Chinese line illustration',
			'Lianhuanhua single-image-per-page sequencing',
			'Precise period and folk detail',
		],
		lineInkRules: ['Refined traditional brush-pen line', 'Baimiao fine-outline technique'],
		toneBlackRules: ['Line-driven value, minimal fill', 'Selective blacks for depth'],
		compositionRules: ['One composed illustration per page', 'Classical balance and perspective'],
		pacingHabits: ['Caption-led narration pacing', 'Measured scene-to-scene progression'],
		preferredLayouts: ['splash', 'widescreen-strip'],
		shotVocabulary: ['WS', 'MS', 'EWS'],
		mccloud: {
			transitions: { scene_to_scene: 0.5, subject_to_subject: 0.3, action_to_action: 0.2 },
			wordPicture: { word_specific: 0.4, additive: 0.3, interdependent: 0.2, parallel: 0.1 },
			abstraction: 0.3,
			closureIntensity: 0.6,
		},
		promptStyleTokens: ['refined traditional brush-pen line', 'baimiao fine-outline illustration', 'classical balanced composition', 'precise period folk detail'],
		jevBias: { rhythm: 0.03, diag: -0.04 },
		checklist: [
			'Is there one composed illustration per page?',
			'Is the line refined traditional brush-pen work?',
			'Is composition classically balanced?',
			'Is narration carried by captions?',
			'Is period and folk detail precise?',
		],
	},
	{
		id: 'kojima',
		name: 'Goseki Kojima',
		era: '1958-2000',
		region: 'Japan',
		keyWorks: ['Lone Wolf and Cub', 'Samurai Executioner'],
		signatureTraits: [
			'Brush-ink period realism',
			'Cinematic silent action and landscape',
			'Negative space and stillness before violence',
		],
		lineInkRules: ['Expressive sumi brush line', 'Dry-brush texture for period grit'],
		toneBlackRules: ['Ink-wash value', 'Spotted blacks for drama'],
		compositionRules: ['Cinematic wide staging', 'Long silent landscape beats'],
		pacingHabits: ['Ma stillness before sudden violence', 'Decompressed landscape interludes'],
		preferredLayouts: ['widescreen-strip', 'splash', 'three-tier-grid', 'borderless-bleed'],
		shotVocabulary: ['EWS', 'WS', 'MS', 'CU'],
		mccloud: {
			transitions: { aspect_to_aspect: 0.3, moment_to_moment: 0.3, action_to_action: 0.2, scene_to_scene: 0.2 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, parallel: 0.2, additive: 0.1 },
			abstraction: 0.3,
			closureIntensity: 0.55,
		},
		promptStyleTokens: ['expressive sumi brush line', 'period samurai realism', 'ink-wash value', 'cinematic silent landscape staging'],
		jevBias: { big: 0.04, aspect: 0.04 },
		checklist: [
			'Is stillness held before sudden violence?',
			'Is the brush line expressive and period-accurate?',
			'Are landscapes given long silent beats?',
			'Is value carried by ink wash?',
			'Is action staged cinematically wide?',
		],
	},
	{
		id: 'samura',
		name: 'Hiroaki Samura',
		era: '1993-present',
		region: 'Japan',
		keyWorks: ['Blade of the Immortal'],
		signatureTraits: [
			'Pencil-textured fine-art line',
			'Visceral kinetic swordplay',
			'Mixed media rendering',
		],
		lineInkRules: ['Graphite-textured expressive line', 'Fine-art draftsmanship'],
		toneBlackRules: ['Smudged graphite value', 'Dramatic contrast on impact'],
		compositionRules: ['Fluid motion across panels', 'Brutal impact close-ups'],
		pacingHabits: ['Action rhythm with visceral peaks', 'Quiet character beats between'],
		preferredLayouts: ['diagonal-action-cut', 'kakekomi-irregular', 'inset-panel', 'widescreen-strip'],
		shotVocabulary: ['WS', 'MS', 'CU', 'ECU'],
		mccloud: {
			transitions: { action_to_action: 0.4, moment_to_moment: 0.3, subject_to_subject: 0.2, aspect_to_aspect: 0.1 },
			wordPicture: { picture_specific: 0.4, interdependent: 0.3, duo_specific: 0.2, parallel: 0.1 },
			abstraction: 0.2,
			closureIntensity: 0.45,
		},
		promptStyleTokens: ['graphite-textured fine-art line', 'visceral kinetic swordplay', 'smudged pencil value', 'mixed-media rendering'],
		jevBias: { diag: 0.05, bleed: 0.04 },
		checklist: [
			'Is the line graphite-textured and fine-art?',
			'Is swordplay visceral and kinetic?',
			'Does motion flow fluidly across panels?',
			'Do impact close-ups hit hard?',
			'Are quiet beats placed between the violence?',
		],
	},
	{
		id: 'togashi',
		name: 'Yoshihiro Togashi',
		era: '1986-present',
		region: 'Japan',
		keyWorks: ['Yu Yu Hakusho', 'Hunter x Hunter'],
		signatureTraits: [
			'Strategic information-dense storytelling',
			'Shifts between clean and rough rendering',
			'Text-heavy tactical reveals',
		],
		lineInkRules: ['Variable line from clean to rough sketch', 'Economy when pacing demands speed'],
		toneBlackRules: ['Moderate tone', 'Blacks for emphasis and depth'],
		compositionRules: ['Diagram-like tactical panels', 'Clear staging for complex rules'],
		pacingHabits: ['Compression for exposition', 'Crescendo reveals of strategy'],
		preferredLayouts: ['three-tier-grid', 'six-panel-grid', 'inset-panel', 'splash'],
		shotVocabulary: ['MS', 'MCU', 'CU', 'insert'],
		mccloud: {
			transitions: { subject_to_subject: 0.4, action_to_action: 0.3, moment_to_moment: 0.2, scene_to_scene: 0.1 },
			wordPicture: { word_specific: 0.4, interdependent: 0.3, duo_specific: 0.2, montage: 0.1 },
			abstraction: 0.5,
			closureIntensity: 0.5,
		},
		promptStyleTokens: ['variable clean-to-rough line', 'tactical diagrammatic staging', 'information-dense composition', 'emphasis blacks'],
		jevBias: { rhythm: 0.03, cv: 0.03 },
		checklist: [
			'Is complex strategy staged clearly?',
			'Does line economy shift with pacing?',
			'Are tactical reveals built as a crescendo?',
			'Is exposition compressed efficiently?',
			'Do emphasis blacks mark key beats?',
		],
	},
]

export const MASTER_IDS = MASTERS.map((master) => master.id)

export function getMaster(id: MasterId): Master | undefined {
	return MASTERS.find((master) => master.id === id)
}
