// =============================================================================
// Real-world manga / comics production workflow library.
//
// Each entry describes one deliverable in the professional production chain, from
// concept through export, and maps it onto the app's internal JEV Stage 1-5 model.
// Story-agnostic and style-agnostic: this is process knowledge, not content.
// =============================================================================

/** The app's internal five-stage pipeline (Stage 1 context .. Stage 5 lettering). */
export type AppStage = 1 | 2 | 3 | 4 | 5

export type ProductionStageId =
	| 'concept-name'
	| 'script'
	| 'thumbnails-nemu'
	| 'storyboard'
	| 'layout-pencils'
	| 'inks'
	| 'screentone'
	| 'flats-coloring'
	| 'lettering'
	| 'finishing-qa'
	| 'export'

export interface ProductionStage {
	id: ProductionStageId
	name: string
	/** Original Japanese studio term, where one exists, for domain fidelity. */
	alias?: string
	purpose: string
	inputs: string[]
	outputs: string[]
	keyDecisions: string[]
	commonMistakes: string[]
	checklist: string[]
	/** Which of the app's Stage 1-5 this deliverable primarily feeds. */
	mapsToAppStages: AppStage[]
}

export const PRODUCTION_STAGES: ProductionStage[] = [
	{
		id: 'concept-name',
		name: 'Concept & Name (Plot Draft)',
		alias: 'name',
		purpose:
			'Fix the premise, cast, world rules and the rough page-by-page plot before any drawing, so later stages inherit a single source of truth.',
		inputs: ['logline', 'character roster', 'world rules', 'target page count'],
		outputs: ['premise statement', 'character sheet shortlist', 'rough plot beats per page'],
		keyDecisions: [
			'reading direction (right-to-left manga vs left-to-right comics vs vertical scroll)',
			'tone and genre register',
			'who carries the viewpoint in each scene',
		],
		commonMistakes: [
			'writing dialogue before the plot skeleton exists',
			'introducing characters with no visual anchor',
			'no page-turn hooks planned',
		],
		checklist: [
			'Every named character has a one-line visual anchor.',
			'The plot has a clear turn (ten) and resolution (ketsu).',
			'Each page ends on a reason to turn the page.',
		],
		mapsToAppStages: [1, 2],
	},
	{
		id: 'script',
		name: 'Script',
		purpose:
			'Turn the plot into panel-level description: what each panel shows, who speaks, and the intended beat, without locking final framing.',
		inputs: ['concept and plot beats', 'character voices'],
		outputs: ['per-panel action lines', 'dialogue and captions', 'SFX call-outs'],
		keyDecisions: [
			'panel count per page and density of dialogue',
			'which beats are silent (Ma) vs spoken',
			'word-picture relationship per panel',
		],
		commonMistakes: [
			'wall-of-text balloons with no breathing beats',
			'describing camera the artist cannot stage',
			'redundant words that only repeat the picture',
		],
		checklist: [
			'No balloon exceeds a comfortable single-breath read.',
			'At least one silent beat precedes a major reveal.',
			'Each panel states an intended word-picture mode.',
		],
		mapsToAppStages: [2],
	},
	{
		id: 'thumbnails-nemu',
		name: 'Thumbnails (Nemu)',
		alias: 'nemu',
		purpose:
			'Tiny rough sketches that test reading flow, panel sizes and page rhythm fast and disposably.',
		inputs: ['script', 'reading direction'],
		outputs: ['thumbnail page roughs', 'panel-size hierarchy', 'eye-path notes'],
		keyDecisions: [
			'hero-panel placement and relative size',
			'gutter width as pacing (time-as-space)',
			'page-turn reveal staging',
		],
		commonMistakes: [
			'uniform panel sizes that flatten pacing',
			'reading-order traps where the eye jumps wrong',
			'over-rendering a thumbnail instead of iterating',
		],
		checklist: [
			'The eye enters each page at the correct corner.',
			'Panel sizes encode narrative weight.',
			'The final panel pulls toward the page turn.',
		],
		mapsToAppStages: [2, 3],
	},
	{
		id: 'storyboard',
		name: 'Storyboard',
		purpose:
			'Resolve each panel into definite camera framing, staging and composition, locking the 180-degree axis and eyeline continuity.',
		inputs: ['thumbnails', 'script', 'shot and angle vocabulary'],
		outputs: ['per-panel shot/angle/lens', 'staging and eyeline', 'focal-point plan'],
		keyDecisions: [
			'shot size and angle per beat',
			'lens choice and depth of field',
			'transition type between consecutive panels',
		],
		commonMistakes: [
			'crossing the 180-degree axis between cuts',
			'monotonous shot scale with no variety',
			'focal point competing with the balloon entry corner',
		],
		checklist: [
			'No unintended 180-degree axis crossing.',
			'Shot scale varies with narrative tension.',
			'Each panel has a single clear focal point.',
		],
		mapsToAppStages: [2, 3, 4],
	},
	{
		id: 'layout-pencils',
		name: 'Layout & Pencils',
		alias: 'shitagaki / genga',
		purpose:
			'Draw the full-resolution pencil construction: perspective, figures and props placed accurately inside the final panel geometry.',
		inputs: ['storyboard', 'panel layout template', 'character reference sheets'],
		outputs: ['pencilled panels', 'perspective guides', 'balloon safe zones'],
		keyDecisions: [
			'perspective and horizon per panel',
			'figure placement relative to negative space',
			'reserved balloon areas',
		],
		commonMistakes: [
			'figures tangent to panel borders',
			'no reserved negative space for lettering',
			'inconsistent character proportions vs the reference sheet',
		],
		checklist: [
			'Perspective is consistent within each panel.',
			'Balloon safe zones are reserved before inking.',
			'Characters match their locked reference sheets.',
		],
		mapsToAppStages: [3, 4],
	},
	{
		id: 'inks',
		name: 'Inks',
		alias: 'pen-ire',
		purpose:
			'Commit the line art. Pen-nib choice sets line character: G-pen for dynamic swelling contours, maru-pen for fine detail, saji-pen for even mid lines, brush for organic blacks.',
		inputs: ['pencils', 'line-weight style'],
		outputs: ['clean black line art', 'variable contour weights'],
		keyDecisions: [
			'nib per element (G-pen, maru-pen, saji-pen, brush)',
			'contour vs interior line-weight contrast',
			'line economy vs detail density',
		],
		commonMistakes: [
			'uniform line weight that reads flat',
			'overworked interiors that muddy silhouettes',
			'inking before perspective errors are fixed',
		],
		checklist: [
			'Contours carry heavier weight than interior detail.',
			'Silhouettes read clearly at thumbnail size.',
			'Line economy matches the chosen style.',
		],
		mapsToAppStages: [4],
	},
	{
		id: 'screentone',
		name: 'Screentone',
		alias: 'tone',
		purpose:
			'Apply adhesive or digital tone for value, texture and atmosphere: numbered dot tones, gradients, sand/etching texture, and scratched highlights.',
		inputs: ['inked line art', 'tone and value plan'],
		outputs: ['toned values', 'gradients and textures', 'scratched highlights'],
		keyDecisions: [
			'tone number (dot density / lines-per-inch) per value',
			'gradient vs flat tone',
			'where to scratch highlights or etch texture',
		],
		commonMistakes: [
			'moire from overlapping mismatched tones',
			'flat grey everywhere with no black anchor',
			'tone covering areas that should stay white',
		],
		checklist: [
			'A true black anchors the value range.',
			'Tones avoid moire at print resolution.',
			'White space is intentional, not accidental.',
		],
		mapsToAppStages: [4],
	},
	{
		id: 'flats-coloring',
		name: 'Flats & Coloring',
		purpose:
			'For color work: lay flat color regions, then render light, shadow and ambient grade. Skipped in pure monochrome tone pipelines.',
		inputs: ['line art', 'palette / style bible'],
		outputs: ['flat color regions', 'rendered lighting', 'color grade'],
		keyDecisions: [
			'palette and spot-accent discipline',
			'light direction consistent with the storyboard',
			'local vs ambient color balance',
		],
		commonMistakes: [
			'palette drift between panels and pages',
			'lighting that contradicts the staged key light',
			'over-saturation that kills focal hierarchy',
		],
		checklist: [
			'Palette matches the locked style bible.',
			'Light direction is continuous across the page.',
			'Spot accents guide, not scatter, the eye.',
		],
		mapsToAppStages: [1, 4],
	},
	{
		id: 'lettering',
		name: 'Lettering',
		purpose:
			'Place balloons, captions and SFX; set reading order; integrate hand-lettered onomatopoeia. Text must never occlude the focal subject.',
		inputs: ['final art', 'dialogue and SFX', 'reading direction'],
		outputs: ['placed balloons and tails', 'caption boxes', 'SFX lettering'],
		keyDecisions: [
			'balloon type per line (speech, thought, whisper, shout, broadcast)',
			'placement and tail direction',
			'SFX style (integrated hand-lettered vs block)',
		],
		commonMistakes: [
			'tails pointing at the wrong speaker',
			'balloons breaking right-to-left reading order',
			'text covering eyes or key props',
		],
		checklist: [
			'Balloon order follows the page reading flow.',
			'No balloon occludes a focal face or prop.',
			'Tails unambiguously identify each speaker.',
		],
		mapsToAppStages: [5],
	},
	{
		id: 'finishing-qa',
		name: 'Finishing & QA',
		purpose:
			'Final cleanup and quality pass: spot blacks, white chip corrections, continuity and typo checks before output.',
		inputs: ['lettered pages'],
		outputs: ['corrected final pages', 'QA sign-off notes'],
		keyDecisions: [
			'last value and contrast adjustments',
			'continuity fixes across pages',
			'typo and name-consistency sweep',
		],
		commonMistakes: [
			'leaving stray marks or open line gaps',
			'inconsistent character details across pages',
			'shipping with untranslated or misspelled text',
		],
		checklist: [
			'No stray marks or unintended gaps remain.',
			'Character and prop continuity holds across pages.',
			'All text is spell-checked and consistent.',
		],
		mapsToAppStages: [5],
	},
	{
		id: 'export',
		name: 'Export & Delivery',
		purpose:
			'Produce the final deliverable for the target medium: print with bleed/trim/safe margins, or webtoon vertical slices, or a packaged reader.',
		inputs: ['approved final pages', 'target medium spec'],
		outputs: ['print-ready files with bleed', 'webtoon slices', 'packaged reader / archive'],
		keyDecisions: [
			'print bleed, trim and safe-area margins',
			'webtoon slice height and seam placement',
			'color profile and resolution',
		],
		commonMistakes: [
			'art in the trim margin getting cut',
			'webtoon seams splitting a balloon or face',
			'wrong resolution or color profile for the medium',
		],
		checklist: [
			'Bleed and trim margins meet the print spec.',
			'Webtoon seams fall in safe gutters.',
			'Resolution and color profile match the target.',
		],
		mapsToAppStages: [5],
	},
]

export const PRODUCTION_STAGE_IDS = PRODUCTION_STAGES.map((stage) => stage.id)

export function getProductionStage(id: ProductionStageId): ProductionStage | undefined {
	return PRODUCTION_STAGES.find((stage) => stage.id === id)
}

/** All production deliverables that feed a given app stage (1-5). */
export function productionStagesForAppStage(stage: AppStage): ProductionStage[] {
	return PRODUCTION_STAGES.filter((item) => item.mapsToAppStages.includes(stage))
}
