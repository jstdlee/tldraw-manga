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
		title: '⚡ 设定集提炼',
		summary: '故事笔记 → @角色 + 三视图 + 世界与画风',
		template:
			'阅读故事，抽出角色 @tag、锁定外形、声音潜台词、三视图提示，以及世界规则和画风预设。不要写分镜。输出 JSON：characters[], world, stylePreset。',
	},
	{
		id: 'chapterize',
		title: '📚 自动分章分页',
		summary: '故事 + 设定集 → 话数与每页节拍',
		template:
			'把故事切成话。每话 2 到 3 页，每页 3 到 9 格。标出本章情绪和场景覆盖。最后一页留翻页钩子。输出 chapters[].pages[].beats[]。',
	},
	{
		id: 'name',
		title: '🎬 分镜脚本+机位+台词',
		summary: '右到左节奏、高潮前静帧、左下钩子',
		template:
			'按右到左、上到下写分镜。高潮前留一格无对白。每页最后一格（阅读顺序的末格，通常靠左下）写翻页钩子。台词只说角色不肯直接说的那半句。同时给出景别、机位、焦段。',
	},
	{
		id: 'camera',
		title: '🎥 镜头景别与透视',
		summary: 'EWS/WS/MS/MCU/CU/ECU · 18mm 张力 / 85mm 压缩',
		template:
			'景别：EWS WS MS MCU CU ECU。机位：Low High Eye Bird Dutch。18mm 夸张透视和速度线，85mm 压缩背景、脸部变大。网点用于阴影，不画文字。',
	},
	{
		id: 'random',
		title: '🎲 随机环境与张力',
		summary: '一键抽场景、光位和机位',
		template:
			'从环境池抽一处（黎明海滩、霓虹雨巷、夕照屋顶、高反差黑白、盐风板道……），再抽光位和机位。只改氛围，不改角色锁定外形。',
	},
	{
		id: 'render',
		title: '🖋️ 无字纯净渲染',
		summary: '@tag 锁定 + 景别 + 安全留白 + 禁止文字',
		template:
			'把角色锁定、景别、机位、焦段、画幅和气泡安全区合成一条画面提示。必须写明 NO text, NO letters, NO speech bubbles，漫画墨线与网点。气泡区域只留天空或背景。',
	},
]

export const SHOTS = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU'] as const
export const ANGLES = ['low', 'high', 'eye', 'bird', 'dutch'] as const
export const FOCALS = ['18mm', '35mm', '50mm', '85mm'] as const
export const STYLE_PRESETS = ['少年网点', '少女淡彩', '硬诺瓦尔', '港风水墨'] as const

export function defaultParams(id: BlockId): Record<string, string | number | boolean> {
	if (id === 'extract') return { stylePreset: '少年网点' }
	if (id === 'chapterize') return { chapters: 2, pages: 2 }
	if (id === 'name') return { density: 48, silent: true, hook: true }
	if (id === 'camera') return { shot: 'MS', angle: 'low', focal: '18mm', tone: 'speedlines' }
	if (id === 'random') return { environment: 'neon-rain', lighting: 'neon-bounce', shot: 'MCU', angle: 'dutch', focal: '18mm' }
	return { clean: true }
}

export function blockTitle(id: string): string {
	return PROMPT_BLOCKS.find((block) => block.id === id)?.title ?? id
}
