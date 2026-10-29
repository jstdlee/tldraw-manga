// =============================================================================
// Genre convention library. Each genre states its layout, pacing, tone, lettering
// and shot preferences by referencing ids from the other library modules, so the
// whole set stays cross-consistent and story-agnostic.
// =============================================================================

import type { ReadingDirection, PanelLayoutId } from './panelLayouts'
import type { PacingId } from './pacing'
import type { ToneStyleId } from './tones'
import type { BalloonTypeId, SfxStyleId } from './lettering'
import type { ShotSizeId } from './shots'

export type GenreId =
	| 'shonen'
	| 'seinen'
	| 'shojo'
	| 'josei'
	| 'gekiga'
	| 'horror-manga'
	| 'sports-manga'
	| 'bande-dessinee'
	| 'american-superhero'
	| 'alt-indie'
	| 'webtoon-vertical'
	| 'lianhuanhua'
	| 'shuimo-ink'

export interface GenreConvention {
	id: GenreId
	name: string
	tradition: string
	readingDirection: ReadingDirection
	preferredLayouts: PanelLayoutId[]
	pacing: PacingId[]
	tones: ToneStyleId[]
	balloons: BalloonTypeId[]
	sfx: SfxStyleId[]
	shots: ShotSizeId[]
	conventions: string[]
}

export const GENRES: GenreConvention[] = [
	{
		id: 'shonen',
		name: 'Shonen',
		tradition: 'Japanese boys-manga action / adventure',
		readingDirection: 'rtl',
		preferredLayouts: ['kakekomi-irregular', 'diagonal-action-cut', 'splash', 'inset-panel'],
		pacing: ['action-rhythm', 'crescendo', 'reveal-page-turn'],
		tones: ['dot-tone', 'speed-lines', 'focus-lines', 'beta-flat'],
		balloons: ['speech', 'shout-burst', 'thought-cloud'],
		sfx: ['integrated-hand-lettered'],
		shots: ['WS', 'MS', 'CU', 'ECU'],
		conventions: [
			'Irregular, frame-breaking panels maximize dynamism.',
			'Big hero panels and page-turn cliffhangers drive momentum.',
			'Speed and focus lines carry impact and emotional spikes.',
		],
	},
	{
		id: 'seinen',
		name: 'Seinen',
		tradition: 'Japanese adult-men manga, grounded and dramatic',
		readingDirection: 'rtl',
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'borderless-bleed', 'inset-panel'],
		pacing: ['decompression', 'ma-silent-beat', 'crescendo'],
		tones: ['dot-tone', 'gradient-tone', 'cross-hatching', 'gekiga-heavy-blacks'],
		balloons: ['speech', 'narration-caption', 'monologue-box', 'whisper-dashed'],
		sfx: ['integrated-hand-lettered', 'ink-brush'],
		shots: ['WS', 'MS', 'MCU', 'CU'],
		conventions: [
			'Restrained, realistic framing with controlled value.',
			'Silent Ma beats and decompression carry psychological weight.',
			'Detailed backgrounds ground the drama in a real world.',
		],
	},
	{
		id: 'shojo',
		name: 'Shojo',
		tradition: 'Japanese girls-manga, emotion-forward',
		readingDirection: 'rtl',
		preferredLayouts: ['broken-border', 'borderless-bleed', 'inset-panel', 'splash'],
		pacing: ['decompression', 'ma-silent-beat', 'reveal-page-turn'],
		tones: ['gradient-tone', 'feathered-hatching', 'dot-tone'],
		balloons: ['speech', 'thought-cloud', 'whisper-dashed', 'monologue-box'],
		sfx: ['ink-brush', 'integrated-hand-lettered'],
		shots: ['MCU', 'CU', 'WS', 'insert'],
		conventions: [
			'Overlapping, borderless panels dissolve into emotional flow.',
			'Floral and gradient tones externalize inner feeling.',
			'Faces and eyes dominate; interiority over action.',
		],
	},
	{
		id: 'josei',
		name: 'Josei',
		tradition: 'Japanese adult-women manga, intimate realism',
		readingDirection: 'rtl',
		preferredLayouts: ['three-tier-grid', 'widescreen-strip', 'borderless-bleed'],
		pacing: ['decompression', 'ma-silent-beat', 'cooldown'],
		tones: ['feathered-hatching', 'gradient-tone', 'dot-tone', 'ink-wash'],
		balloons: ['speech', 'monologue-box', 'narration-caption', 'whisper-dashed'],
		sfx: ['ink-brush'],
		shots: ['MS', 'MCU', 'CU', 'insert'],
		conventions: [
			'Quiet, grounded pacing favouring subtext over spectacle.',
			'Soft line and tone render adult, everyday emotional texture.',
			'Negative space and pillow shots pace reflection.',
		],
	},
	{
		id: 'gekiga',
		name: 'Gekiga',
		tradition: 'Japanese dramatic-pictures, gritty and cinematic',
		readingDirection: 'rtl',
		preferredLayouts: ['three-tier-grid', 'diagonal-action-cut', 'widescreen-strip'],
		pacing: ['crescendo', 'action-rhythm', 'ma-silent-beat'],
		tones: ['gekiga-heavy-blacks', 'cross-hatching', 'beta-flat', 'speed-lines'],
		balloons: ['speech', 'shout-burst', 'narration-caption'],
		sfx: ['ink-brush', 'integrated-hand-lettered'],
		shots: ['WS', 'MS', 'CU', 'ECU'],
		conventions: [
			'Heavy spotted blacks and stark contrast set a grave mood.',
			'Cinematic staging with hard cuts and strong silhouettes.',
			'Realistic adult subject matter over genre fantasy.',
		],
	},
	{
		id: 'horror-manga',
		name: 'Horror Manga',
		tradition: 'Japanese horror, dread and the uncanny',
		readingDirection: 'rtl',
		preferredLayouts: ['inset-panel', 'broken-border', 'splash', 'kakekomi-irregular'],
		pacing: ['ma-silent-beat', 'reveal-page-turn', 'crescendo'],
		tones: ['cross-hatching', 'gekiga-heavy-blacks', 'beta-flat', 'ink-wash'],
		balloons: ['speech', 'whisper-dashed', 'shout-burst', 'narration-caption'],
		sfx: ['ink-brush', 'integrated-hand-lettered'],
		shots: ['ECU', 'CU', 'WS', 'insert'],
		conventions: [
			'Dense obsessive hatching makes the uncanny crawl.',
			'Silent beats then a page-turn shock weaponize pacing.',
			'Extreme close-ups on eyes and wrong details breed dread.',
		],
	},
	{
		id: 'sports-manga',
		name: 'Sports Manga',
		tradition: 'Japanese competitive-sports drama',
		readingDirection: 'rtl',
		preferredLayouts: ['diagonal-action-cut', 'staircase', 'splash', 'inset-panel'],
		pacing: ['action-rhythm', 'crescendo', 'ma-silent-beat'],
		tones: ['speed-lines', 'focus-lines', 'dot-tone', 'beta-flat'],
		balloons: ['speech', 'shout-burst', 'thought-cloud'],
		sfx: ['integrated-hand-lettered'],
		shots: ['WS', 'MS', 'CU', 'ECU'],
		conventions: [
			'Alternating wide geography and tight impact keeps plays legible.',
			'Speed lines and a silent pre-serve beat control match tempo.',
			'Big decisive moments earn splash or diagonal climaxes.',
		],
	},
	{
		id: 'bande-dessinee',
		name: 'Franco-Belgian Bande Dessinee',
		tradition: 'European album comics',
		readingDirection: 'ltr',
		preferredLayouts: ['three-tier-grid', 'eisner-open-panel', 'widescreen-strip'],
		pacing: ['compression', 'decompression', 'cooldown'],
		tones: ['ligne-claire', 'feathered-hatching', 'gradient-tone'],
		balloons: ['speech', 'narration-caption', 'thought-cloud'],
		sfx: ['western-block'],
		shots: ['WS', 'MS', 'MCU', 'EWS'],
		conventions: [
			'Regular tiers (the gaufrier grid) and clear line keep pages calm.',
			'Rich flat color and architecture over screentone.',
			'Album format favours measured, even pacing.',
		],
	},
	{
		id: 'american-superhero',
		name: 'American Superhero',
		tradition: 'US mainstream action comics',
		readingDirection: 'ltr',
		preferredLayouts: ['splash', 'diagonal-action-cut', 'double-page-spread', 'inset-panel'],
		pacing: ['crescendo', 'action-rhythm', 'reveal-page-turn'],
		tones: ['beta-flat', 'speed-lines', 'cross-hatching'],
		balloons: ['speech', 'shout-burst', 'narration-caption', 'electronic-radio'],
		sfx: ['western-block'],
		shots: ['WS', 'MS', 'CU', 'ECU'],
		conventions: [
			'Dynamic figure work and splash pages sell power.',
			'Rendered full color with bold holding lines.',
			'Caption boxes and block SFX letter the action.',
		],
	},
	{
		id: 'alt-indie',
		name: 'Alternative / Indie Comics',
		tradition: 'Western literary and experimental comics',
		readingDirection: 'ltr',
		preferredLayouts: ['six-panel-grid', 'three-tier-grid', 'eisner-open-panel', 'widescreen-strip'],
		pacing: ['decompression', 'compression', 'ma-silent-beat'],
		tones: ['ligne-claire', 'cross-hatching', 'beta-flat'],
		balloons: ['speech', 'narration-caption', 'monologue-box'],
		sfx: ['western-block'],
		shots: ['MS', 'WS', 'insert', 'MCU'],
		conventions: [
			'Rigid grids become formal, diagrammatic storytelling.',
			'Restrained line and color serve introspective subject matter.',
			'Repetition and small panels control literary rhythm.',
		],
	},
	{
		id: 'webtoon-vertical',
		name: 'Webtoon Vertical Scroll',
		tradition: 'Korean-origin vertical digital comics',
		readingDirection: 'vertical',
		preferredLayouts: ['vertical-webtoon-stack', 'borderless-bleed', 'splash'],
		pacing: ['decompression', 'reveal-page-turn', 'ma-silent-beat'],
		tones: ['gradient-tone', 'dot-tone', 'beta-flat'],
		balloons: ['speech', 'thought-cloud', 'narration-caption', 'electronic-radio'],
		sfx: ['western-block', 'integrated-hand-lettered'],
		shots: ['WS', 'MS', 'CU', 'insert'],
		conventions: [
			'Long gutters become scroll-time for timing reveals.',
			'Full color optimized for the smartphone portrait viewport.',
			'Vertical staging and generous whitespace pace the descent.',
		],
	},
	{
		id: 'lianhuanhua',
		name: 'Chinese Lianhuanhua',
		tradition: 'Chinese palm-sized picture-story booklets',
		readingDirection: 'ltr',
		preferredLayouts: ['splash', 'widescreen-strip'],
		pacing: ['compression', 'decompression'],
		tones: ['ligne-claire', 'cross-hatching', 'feathered-hatching'],
		balloons: ['narration-caption'],
		sfx: ['western-block'],
		shots: ['WS', 'MS', 'EWS'],
		conventions: [
			'One image per page with a caption strip beneath it.',
			'Fine traditional line illustration over tone.',
			'Narration-led sequencing rather than in-panel dialogue.',
		],
	},
	{
		id: 'shuimo-ink',
		name: 'Chinese Ink Wash (Shuimo) Comics',
		tradition: 'Chinese brush-and-ink painterly comics',
		readingDirection: 'ltr',
		preferredLayouts: ['borderless-bleed', 'eisner-open-panel', 'splash', 'widescreen-strip'],
		pacing: ['ma-silent-beat', 'decompression', 'cooldown'],
		tones: ['ink-wash', 'beta-flat', 'feathered-hatching'],
		balloons: ['narration-caption', 'speech', 'monologue-box'],
		sfx: ['ink-brush'],
		shots: ['EWS', 'WS', 'MS', 'insert'],
		conventions: [
			'Vast negative space and ink wash carry mood and distance.',
			'Borderless compositions suspend time like a hanging scroll.',
			'Brush economy over detail; a few strokes imply the whole.',
		],
	},
]

export const GENRE_IDS = GENRES.map((genre) => genre.id)

export function getGenre(id: GenreId): GenreConvention | undefined {
	return GENRES.find((genre) => genre.id === id)
}
