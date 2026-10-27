import type { Beat, BookDraft, CharacterDraft, PageDraft } from '../model'
import type { Scenario } from '../layout/score'

export const ENV_IDS = ['boardwalk', 'rooftop', 'neon-rain', 'shrine', 'subway'] as const
export const LIGHT_IDS = ['hard-noon', 'golden-dusk', 'neon-bounce', 'overcast'] as const

export const ENV_LABELS: Record<string, string> = {
	boardwalk: 'Seaside Breakwater',
	rooftop: 'Sunset Rooftop',
	'neon-rain': 'Neon Rain Alley',
	shrine: 'Mountain Shrine Steps',
	subway: 'Last-Train Platform',
}

export const LIGHT_LABELS: Record<string, string> = {
	'hard-noon': 'Hard Noon Light',
	'golden-dusk': 'Golden Dusk Backlight',
	'neon-bounce': 'Neon Bounce',
	overcast: 'Overcast Diffusion',
}

export const SCENARIO_LABELS: Record<string, string> = {
	establishing: 'Establishing',
	tension: 'Tension Buildup',
	intimacy: 'Character Drama',
	action: 'Action Burst',
	reveal: 'Reveal',
	climax: 'Climactic Showdown',
}

export const PRESET_LABELS: Record<string, string> = {
	seizen: 'Ordered Narrative (seizen)',
	std: 'Standard Shonen',
	action: 'Diagonal Action',
	tobira: 'Splash Page (tobira)',
}

export const BUBBLE_LABELS: Record<string, string> = {
	speech: 'Plain Speech',
	thought: 'Inner Monologue',
	caption: 'Caption Box',
	whisper: 'Dashed Whisper',
	shout: 'Bursting Shout',
	broadcast: 'Zigzag Broadcast',
	sfx: 'Sound Effect',
}

export const SHOT_LABELS: Record<string, string> = {
	EWS: 'Extreme Wide (EWS)',
	WS: 'Wide (WS)',
	MS: 'Medium (MS)',
	MCU: 'Medium Close (MCU)',
	CU: 'Close-up (CU)',
	ECU: 'Extreme Close-up (ECU)',
}

export const ANGLE_LABELS: Record<string, string> = {
	eye: 'Eye Level',
	low: 'Low Angle',
	high: 'High Angle',
	dutch: 'Dutch Tilt',
	bird: "Bird's-Eye",
}

export const FOCAL_LABELS: Record<string, string> = {
	'18mm': '18mm Wide Tension',
	'35mm': '35mm Narrative',
	'50mm': '50mm Standard',
	'85mm': '85mm Compressed Close-up',
}

export const SEAGULL_STORY =
	'At high noon on the seaside breakwater, Kanta guards the last box of hot fries while Mei waits for the wind with her old camera. A one-eyed seagull boss dives down from the guardrail, and a two-chapter tale of salty fries and rooftop sunsets begins.'

const CHARACTERS: CharacterDraft[] = [
	{
		tag: '@kanta',
		name: 'Kanta',
		appearance: 'Messy black hair, deep-blue hoodie, worn goggles at the collar, a bandage on his right cheek',
		voice: 'Sharp tongue, soft heart; guards his food like his life depends on it and usually ends sentences with an exclamation mark',
		locked: true,
	},
	{
		tag: '@mei',
		name: 'Mei',
		appearance: 'Neat short hair with a hairpin, pale long trench coat, a film camera slung across her body, calm gaze',
		voice: 'Deadpan observer; speaks briefly and always fires the shutter on the decisive frame',
		locked: true,
	},
	{
		tag: '@boss',
		name: 'Boss Gull',
		appearance: 'A huge silver-backed gull, an old scar over its left eye, a metal band on its left foot, enormous wingspan',
		voice: 'Never speaks human; controls the scene with short cries and sheer presence',
		locked: true,
	},
]

const C1_P1: Beat[] = [
	{ shot: 'EWS', angle: 'high', focal: '35mm', beat: 'Sea wind sweeps the breakwater; Kanta cradles a fresh box of fries while Mei focuses her camera beside him.', who: ['kanta', 'mei'], fries: 'kanta', lines: [{ type: 'caption', text: 'Noon · Salt-Wind Breakwater', placement: 'top-right' }, { type: 'speech', text: 'The last order of hot fries. Nobody touches them.', placement: 'bottom-left' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'Mei lifts her camera toward the sea rail and warns Kanta of movement overhead.', who: ['mei'], fries: 'none', lines: [{ type: 'speech', text: "Don't jinx it. That one above has been eyeing you for three minutes.", placement: 'top-right' }] },
	{ shot: 'CU', angle: 'low', focal: '85mm', beat: 'The one-eyed gull boss perches atop the lamppost, its shadow pressing down.', who: ['boss'], fries: 'none', lines: [{ type: 'sfx', text: 'FLAP…', placement: 'top-left' }], eyeline: [-18, 22] },
	{ shot: 'MCU', angle: 'eye', focal: '35mm', beat: 'Kanta tucks the fry box against his chest and looks up to meet its gaze.', who: ['kanta'], fries: 'kanta', lines: [{ type: 'thought', text: 'That look… it is a veteran.', placement: 'top-right' }] },
]

const C1_P2: Beat[] = [
	{ shot: 'WS', angle: 'low', focal: '18mm', beat: 'The gull boss folds its wings and dives straight down, speed lines tearing open sea and sky.', who: ['boss'], fries: 'none', lines: [{ type: 'sfx', text: 'WHOOSH—!', placement: 'top-right' }] },
	{ shot: 'MCU', angle: 'dutch', focal: '35mm', beat: 'Kanta twists aside in a hurry, the fries tossed high into the air.', who: ['kanta'], fries: 'air', lines: [{ type: 'shout', text: 'Not a chance!', prosody: 'shout', placement: 'top-left' }] },
	{ shot: 'ECU', angle: 'eye', focal: '85mm', beat: "Mei's finger presses the shutter, the viewfinder locking on one boy and one bird.", who: ['mei'], fries: 'none', lines: [{ type: 'sfx', text: 'CLICK!', placement: 'bottom-right' }] },
	{ shot: 'CU', angle: 'low', focal: '18mm', beat: "The gull's beak plucks the longest fry out of midair with pinpoint precision.", who: ['boss', 'kanta'], fries: 'gull', lines: [{ type: 'sfx', text: 'BOOM—!!', placement: 'top-right' }, { type: 'shout', text: 'The crispiest one—!', prosody: 'tremble', placement: 'bottom-left' }] },
	{ shot: 'MS', angle: 'high', focal: '35mm', beat: 'The gull boss sweeps over the guardrail and away, leaving a single white feather behind.', who: ['kanta', 'mei'], fries: 'feather', lines: [{ type: 'speech', text: 'Perfect composition. Thanks for the bait.', prosody: 'sneer', placement: 'top-right' }] },
]

const C2_P1: Beat[] = [
	{ shot: 'WS', angle: 'eye', focal: '35mm', beat: 'At dusk on the old shopping-street rooftop, the two climb up the iron ladder.', who: ['kanta', 'mei'], fries: 'none', lines: [{ type: 'caption', text: 'Same Day, Dusk · Shopping-Street Rooftop', placement: 'top-right' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'Kanta slams a glass jar packed with crispy fries onto the vent box.', who: ['kanta'], fries: 'jar', lines: [{ type: 'speech', text: 'Watch and learn — this is a sealed anti-gull jar.', placement: 'top-left' }] },
	{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: 'Mei flips through the freshly developed black-and-white photos, the corner of her mouth lifting.', who: ['mei'], fries: 'none', lines: [{ type: 'whisper', text: 'Its left foot carries a numbered band. It lives on this block of rooftops.', prosody: 'whisper', placement: 'top-right' }] },
	{ shot: 'CU', angle: 'low', focal: '85mm', beat: 'High on the water tower, three gulls in a row cast long shadows.', who: ['boss'], fries: 'none', lines: [] },
]

const C2_P2: Beat[] = [
	{ shot: 'EWS', angle: 'low', focal: '18mm', beat: 'Backlit by dusk, the gull boss lands directly across the vent box, its presence at full blast.', who: ['boss', 'kanta', 'mei'], fries: 'jar', lines: [{ type: 'broadcast', text: 'Sunset broadcast: force-seven sea wind, beware of aerial predators.', placement: 'top-right' }] },
	{ shot: 'CU', angle: 'eye', focal: '85mm', beat: 'Kanta and the gull boss lock eyes, neither backing down.', who: ['kanta', 'boss'], fries: 'none', lines: [] },
	{ shot: 'MCU', angle: 'high', focal: '35mm', beat: 'The gull boss lowers its head and pushes a shiny soda-bottle cap up to the glass jar.', who: ['boss'], fries: 'jar', lines: [{ type: 'speech', text: '…Is it here to barter?', prosody: 'pause', placement: 'top-right' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'Kanta unscrews the jar lid and holds out a fry while Mei fires the last frame in the sunset.', who: ['kanta', 'mei', 'boss'], fries: 'kanta', lines: [{ type: 'speech', text: 'Fine. Just this once.', placement: 'bottom-left' }, { type: 'caption', text: '—The End—', placement: 'bottom-right' }] },
]

export function defaultBook(): BookDraft {
	return {
		title: 'The Seagull Fries Heist',
		subtitle: 'Seaside Breakwater · Two-Chapter Finished Demo',
		story: SEAGULL_STORY,
		world: 'A small coastal town where the breakwater meets an old shopping street; black-and-white screentone art with spot vermilion accents; panels read strictly right to left, manga style.',
		stylePreset: 'Shonen Screentone',
		characters: structuredClone(CHARACTERS),
		chapters: [
			{
				title: 'Chapter 1: Breakwater Dive',
				mood: 'Salt Wind · Comic Clash',
				environment: 'boardwalk',
				lighting: 'hard-noon',
				pages: [
					{ scenario: 'establishing', layoutPreset: 'std', dialogueDensity: 0.45, targetPanels: 4, seed: 'seagull-c1-p1', showFlow: false, beats: structuredClone(C1_P1) },
					{ scenario: 'action', layoutPreset: 'action', dialogueDensity: 0.35, targetPanels: 5, seed: 'seagull-c1-p2', showFlow: false, beats: structuredClone(C1_P2) },
				],
			},
			{
				title: 'Chapter 2: Rooftop Ransom',
				mood: 'Golden Dusk · Reconciliation',
				environment: 'rooftop',
				lighting: 'golden-dusk',
				pages: [
					{ scenario: 'tension', layoutPreset: 'std', dialogueDensity: 0.5, targetPanels: 4, seed: 'seagull-c2-p1', showFlow: false, beats: structuredClone(C2_P1) },
					{ scenario: 'climax', layoutPreset: 'tobira', dialogueDensity: 0.4, targetPanels: 4, seed: 'seagull-c2-p2', showFlow: false, beats: structuredClone(C2_P2) },
				],
			},
		],
	}
}

export function bookFromText(raw: string): BookDraft {
	const text = raw.trim()
	if (!text || text.includes('seagull') || text.includes('fries')) return defaultBook()
	const sentences = text
		.split(/[.。！？!?\n]+/)
		.map((line) => line.trim())
		.filter(Boolean)
	const chunks = sentences.length >= 4 ? sentences : [text, 'The wind suddenly tightens.', 'The two turn their heads at once.', 'A red lamp lights up at the mouth of the alley.']
	const makePage = (slice: string[], scenario: Scenario, preset: string, seed: string): PageDraft => ({
		scenario,
		layoutPreset: preset,
		dialogueDensity: 0.45,
		targetPanels: Math.min(6, Math.max(3, slice.length)),
		seed,
		showFlow: false,
		beats: slice.map((line, index) => ({
			shot: (['WS', 'MS', 'CU', 'ECU'] as const)[index % 4],
			angle: (['eye', 'low', 'high', 'dutch'] as const)[index % 4],
			focal: (['35mm', '50mm', '85mm', '18mm'] as const)[index % 4],
			beat: line,
			who: index % 2 === 0 ? ['kanta'] : ['mei'],
			fries: 'none',
			lines: index === slice.length - 1 ? [{ type: 'sfx', text: 'GLARE—!', placement: 'top-right' }] : [{ type: 'speech', text: line.slice(0, 26), placement: index % 2 ? 'top-left' : 'top-right' }],
		})),
	})
	const half = Math.ceil(chunks.length / 2)
	const first = chunks.slice(0, half)
	const second = chunks.slice(half)
	return {
		title: text.slice(0, 10),
		subtitle: 'AI-Parsed Manga Storyboard Draft',
		story: text,
		world: 'Black-and-white ink lines + gray screentone + spot vermilion; reads right to left; bubble tails point at the speaker.',
		stylePreset: 'Seinen Realism',
		characters: structuredClone(CHARACTERS),
		chapters: [
			{
				title: 'Chapter 1: The Wind Rises',
				mood: 'Suspense Buildup',
				environment: 'neon-rain',
				lighting: 'neon-bounce',
				pages: [
					makePage(first.slice(0, Math.ceil(first.length / 2)), 'establishing', 'std', 'custom-c1-p1'),
					makePage(first.slice(Math.ceil(first.length / 2)), 'action', 'action', 'custom-c1-p2'),
				],
			},
			{
				title: 'Chapter 2: Echoes',
				mood: 'Reveal',
				environment: 'rooftop',
				lighting: 'golden-dusk',
				pages: [
					makePage(second.slice(0, Math.max(1, Math.ceil(second.length / 2))), 'tension', 'std', 'custom-c2-p1'),
					makePage(second.slice(Math.max(1, Math.ceil(second.length / 2))), 'climax', 'tobira', 'custom-c2-p2'),
				],
			},
		],
	}
}

export const SAMPLE_STORIES: Array<{ label: string; text: string }> = [
	{ label: 'The Seagull Fries Heist (default two-chapter)', text: SEAGULL_STORY },
	{
		label: 'The Rainy-Night Umbrella (two-chapter suspense)',
		text: 'A downpour breaks just as the last train pulls in. Kanta finds a transparent umbrella at the platform, inscribed with coordinates of an old rooftop. Mei recognizes it as a cipher left by a club that vanished three years ago. The two chase through the neon rain alleys to the rooftop, push the door open, and find a banded gull standing guard over a tape recorder.',
	},
]
