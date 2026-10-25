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
		title: '设定集提炼',
		summary: '故事原稿 → @角色锚点 + 三视图 + 世界规范',
		template:
			'阅读故事，抽出角色 @tag、锁定外形、声音潜台词、三视图提示，以及世界规则和画风预设。不要写分镜。输出 JSON：characters[], world, stylePreset。',
	},
	{
		id: 'chapterize',
		title: '自动分章分页',
		summary: '故事 + 设定集 → 话数切分与每页节拍',
		template:
			'把故事切成话。每话 2 到 3 页，每页 3 到 9 格。标出本章情绪和场景覆盖。最后一页留翻页钩子。输出 chapters[].pages[].beats[]。',
	},
	{
		id: 'name',
		title: '分镜节拍与静帧',
		summary: '右→左动线、高潮前无声格、末格翻页钩子',
		template:
			'按右到左、上到下写分镜。高潮前留一格无对白静帧。每页最后一格（左下角）写翻页钩子。台词精炼，同时给出景别、机位、焦段。',
	},
	{
		id: 'camera',
		title: '光学镜头与透视',
		summary: 'EWS/WS/MS/MCU/CU/ECU · 18mm 张力 / 85mm 压缩',
		template:
			'景别：EWS WS MS MCU CU ECU。机位：Low High Eye Bird Dutch。18mm 夸张透视和速度线，85mm 压缩背景聚焦表情。网点用于阴影，不画文字。',
	},
	{
		id: 'random',
		title: '环境光影变奏',
		summary: '切换场景、光位与镜头张力组合',
		template:
			'从环境池抽取场景（海岸防波堤、夕照屋顶、霓虹雨巷、暴风栈桥……），再组合光位和机位。只改氛围，不改角色锁定外形。',
	},
	{
		id: 'render',
		title: '无字纯净成稿渲染',
		summary: '@tag 锁定 + 光学参数 + 留白区 + 禁文字伪影',
		template:
			'把角色锁定、光学焦段景深、机位、画幅和气泡安全区合成画面提示。写明 NO text, NO letters, NO speech bubbles，漫画墨线与网点。',
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
