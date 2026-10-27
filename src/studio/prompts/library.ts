export type BlockId = 'extract' | 'chapterize' | 'name' | 'camera' | 'random' | 'render'

export interface PromptBlock {
	id: BlockId
	title: string
	summary: string
	template: string
}

export const PROMPT_BLOCKS: PromptBlock[] = [
	{
		id: 'extract',
		title: 'Setting Bible Extraction',
		summary: 'Story draft → @character anchors + three-view refs + world rules',
		template:
			'Read the story and extract character @tags, locked appearances, vocal subtext, three-view hints, plus world rules and a style preset. Do not write panels. Output JSON: characters[], world, stylePreset.',
	},
	{
		id: 'chapterize',
		title: 'Auto Chaptering & Paging',
		summary: 'Story + setting bible → chapter splits and per-page beats',
		template:
			'Split the story into chapters. Give each chapter 2 to 3 pages with 3 to 9 panels per page. Mark each chapter\'s mood and scene coverage. Leave a page-turn hook on the final page. Output chapters[].pages[].beats[].',
	},
	{
		id: 'name',
		title: 'Panel Beats & Still Frames',
		summary: 'Right→left flow, silent beat before the climax, page-turn hook on the last panel',
		template:
			'Write the panels right to left, top to bottom. Reserve one wordless still panel before the climax. Give the final panel of each page (bottom-left corner) a page-turn hook. Keep dialogue terse; include shot scale, camera angle, and focal length.',
	},
	{
		id: 'camera',
		title: 'Optical Lens & Perspective',
		summary: 'EWS/WS/MS/MCU/CU/ECU · 18mm tension / 85mm compression',
		template:
			'Shot scale: EWS WS MS MCU CU ECU. Camera angle: Low High Eye Bird Dutch. 18mm for exaggerated perspective and speed lines; 85mm to compress the background and focus on expression. Screentone is for shadows; no lettering.',
	},
	{
		id: 'random',
		title: 'Environment & Light Variations',
		summary: 'Shuffle scene, light position, and lens-tension combos',
		template:
			'Draw scenes from the environment pool (seaside breakwater, sunset rooftop, neon rain alley, storm pier, ...), then combine lighting position and camera angle. Change the mood only, never the locked character designs.',
	},
	{
		id: 'render',
		title: 'Wordless Clean Render',
		summary: '@tag locks + optical params + negative space + no lettering artifacts',
		template:
			'Merge character locks, optical focal length and depth of field, camera angle, aspect ratio, and balloon safe zones into the image prompt. State NO text, NO letters, NO speech bubbles; manga ink lines and screentone.',
	},
]

export const SHOTS = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU'] as const
export const ANGLES = ['low', 'high', 'eye', 'bird', 'dutch'] as const
export const FOCALS = ['18mm', '35mm', '50mm', '85mm'] as const
export const STYLE_PRESETS = ['Shonen Screentone', 'Shojo Pastel', 'Hard Noir', 'HK Ink Wash'] as const

export function defaultParams(id: BlockId): Record<string, string | number | boolean> {
	if (id === 'extract') return { stylePreset: 'Shonen Screentone' }
	if (id === 'chapterize') return { chapters: 2, pages: 2 }
	if (id === 'name') return { density: 48, silent: true, hook: true }
	if (id === 'camera') return { shot: 'MS', angle: 'low', focal: '18mm', tone: 'speedlines' }
	if (id === 'random') return { environment: 'neon-rain', lighting: 'neon-bounce', shot: 'MCU', angle: 'dutch', focal: '18mm' }
	return { clean: true }
}

export function blockTitle(id: string): string {
	return PROMPT_BLOCKS.find((block) => block.id === id)?.title ?? id
}
