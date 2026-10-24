import type { Beat, BookDraft, CharacterDraft, PageDraft } from '../model'
import type { Scenario } from '../layout/score'

export const ENV_IDS = ['boardwalk', 'rooftop', 'neon-rain', 'shrine', 'subway'] as const
export const LIGHT_IDS = ['hard-noon', 'golden-dusk', 'neon-bounce', 'overcast'] as const

export const ENV_LABELS: Record<string, string> = {
	boardwalk: '海岸防波堤',
	rooftop: '夕照屋顶',
	'neon-rain': '雨夜霓虹巷',
	shrine: '山道石阶',
	subway: '末班月台',
}

export const LIGHT_LABELS: Record<string, string> = {
	'hard-noon': '正午硬光',
	'golden-dusk': '暮色逆光',
	'neon-bounce': '霓虹反光',
	overcast: '阴云漫射',
}

export const SCENARIO_LABELS: Record<string, string> = {
	establishing: '开场铺垫',
	tension: '悬念蓄力',
	intimacy: '人物文戏',
	action: '动作爆发',
	reveal: '真相揭晓',
	climax: '高潮决战',
}

export const PRESET_LABELS: Record<string, string> = {
	seizen: '规整叙事',
	std: '标准日漫',
	action: '斜切动作',
	tobira: '大跨页扉页',
}

export const BUBBLE_LABELS: Record<string, string> = {
	speech: '普通对白',
	thought: '内心独白',
	caption: '旁白方框',
	whisper: '虚线低语',
	shout: '炸裂呐喊',
	broadcast: '广播折线',
	sfx: '拟声音效',
}

export const SHOT_LABELS: Record<string, string> = {
	EWS: '大远景 (EWS)',
	WS: '远景 (WS)',
	MS: '中景 (MS)',
	MCU: '中近景 (MCU)',
	CU: '特写 (CU)',
	ECU: '大特写 (ECU)',
}

export const ANGLE_LABELS: Record<string, string> = {
	eye: '平视',
	low: '仰拍',
	high: '俯拍',
	dutch: '倾斜镜头',
	bird: '鸟瞰',
}

export const FOCAL_LABELS: Record<string, string> = {
	'18mm': '18mm 广角张力',
	'35mm': '35mm 人文叙事',
	'50mm': '50mm 标准视角',
	'85mm': '85mm 压缩特写',
}

export const SEAGULL_STORY =
	'海边防波堤的正午，少年勘太护着最后一盒热薯条，少女芽衣举着旧相机等风。独眼海鸥头目从护栏上方俯冲下来，一场围绕咸香薯条与屋顶落日的两话短篇就此展开。'

const CHARACTERS: CharacterDraft[] = [
	{
		tag: '@kanta',
		name: '勘太',
		appearance: '凌乱黑发，深蓝连帽卫衣，领口挂旧护目镜，右颊一贴创可贴',
		voice: '嘴硬心软，护食如命，句尾常带感叹号',
		locked: true,
	},
	{
		tag: '@mei',
		name: '芽衣',
		appearance: '利落短发配发卡，浅色长风衣，斜挎老胶片相机，眼神冷静',
		voice: '冷幽默旁观者，说话简短，总在关键帧按快门',
		locked: true,
	},
	{
		tag: '@boss',
		name: '头目鸥',
		appearance: '体型硕大的银背海鸥，左眼一道旧疤，左脚套着金属环，翼展极宽',
		voice: '不发人言，只用短促鸣叫和压迫感控场',
		locked: true,
	},
]

const C1_P1: Beat[] = [
	{ shot: 'EWS', angle: 'high', focal: '35mm', beat: '海风吹过防波堤，勘太捧着刚出锅的薯条，芽衣在旁边调焦。', who: ['kanta', 'mei'], fries: 'kanta', lines: [{ type: 'caption', text: '正午 · 盐风防波堤', placement: 'top-right' }, { type: 'speech', text: '最后一份现炸薯条，谁也别想碰。', placement: 'bottom-left' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: '芽衣举起相机对准海面护栏，提醒勘太头顶有动静。', who: ['mei'], fries: 'none', lines: [{ type: 'speech', text: '别立旗。上面那位已经盯你三分钟了。', placement: 'top-right' }] },
	{ shot: 'CU', angle: 'low', focal: '85mm', beat: '独眼头目鸥立在灯柱顶端，阴影压下来。', who: ['boss'], fries: 'none', lines: [{ type: 'sfx', text: '扑棱…', placement: 'top-left' }], eyeline: [-18, 22] },
	{ shot: 'MCU', angle: 'eye', focal: '35mm', beat: '勘太把薯条盒往怀里一护，抬头迎视。', who: ['kanta'], fries: 'kanta', lines: [{ type: 'thought', text: '这眼神……是老手。', placement: 'top-right' }] },
]

const C1_P2: Beat[] = [
	{ shot: 'WS', angle: 'low', focal: '18mm', beat: '头目鸥收拢双翼垂直俯冲，速度线撕开海空。', who: ['boss'], fries: 'none', lines: [{ type: 'sfx', text: '唰——！', placement: 'top-right' }] },
	{ shot: 'MCU', angle: 'dutch', focal: '35mm', beat: '勘太侧身急退，薯条高高抛起。', who: ['kanta'], fries: 'air', lines: [{ type: 'shout', text: '休想得逞！', prosody: '怒吼', placement: 'top-left' }] },
	{ shot: 'ECU', angle: 'eye', focal: '85mm', beat: '芽衣食指压下快门，取景框锁死一人一鸟。', who: ['mei'], fries: 'none', lines: [{ type: 'sfx', text: '咔嚓！', placement: 'bottom-right' }] },
	{ shot: 'CU', angle: 'low', focal: '18mm', beat: '鸥喙在半空精准叼走最长的那根薯条。', who: ['boss', 'kanta'], fries: 'gull', lines: [{ type: 'sfx', text: '轰——！！', placement: 'top-right' }, { type: 'shout', text: '最脆的那根——！', prosody: '颤抖', placement: 'bottom-left' }] },
	{ shot: 'MS', angle: 'high', focal: '35mm', beat: '头目鸥掠过护栏扬长而去，只留下一片白羽。', who: ['kanta', 'mei'], fries: 'feather', lines: [{ type: 'speech', text: '构图满分。谢谢你的诱饵。', prosody: '冷笑', placement: 'top-right' }] },
]

const C2_P1: Beat[] = [
	{ shot: 'WS', angle: 'eye', focal: '35mm', beat: '傍晚的旧商店街屋顶，两人顺着铁梯爬上来。', who: ['kanta', 'mei'], fries: 'none', lines: [{ type: 'caption', text: '同日傍晚 · 商店街屋顶', placement: 'top-right' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: '勘太把一个装满脆薯条的玻璃罐拍在通风箱上。', who: ['kanta'], fries: 'jar', lines: [{ type: 'speech', text: '看好了，这叫密封防空罐。', placement: 'top-left' }] },
	{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: '芽衣翻看刚冲出来的黑白照片，嘴角微扬。', who: ['mei'], fries: 'none', lines: [{ type: 'whisper', text: '它左脚有编号环，住在这片屋顶。', prosody: '低语', placement: 'top-right' }] },
	{ shot: 'CU', angle: 'low', focal: '85mm', beat: '水塔高处，三只海鸥并排投下长影。', who: ['boss'], fries: 'none', lines: [] },
]

const C2_P2: Beat[] = [
	{ shot: 'EWS', angle: 'low', focal: '18mm', beat: '暮色逆光里，头目鸥落在通风箱正对面，气场全开。', who: ['boss', 'kanta', 'mei'], fries: 'jar', lines: [{ type: 'broadcast', text: '夕阳广播：海风七级，注意高空掠食者。', placement: 'top-right' }] },
	{ shot: 'CU', angle: 'eye', focal: '85mm', beat: '勘太与头目鸥四目相对，谁也不退。', who: ['kanta', 'boss'], fries: 'none', lines: [] },
	{ shot: 'MCU', angle: 'high', focal: '35mm', beat: '头目鸥低头，把一枚亮闪闪的汽水瓶盖推到玻璃罐前。', who: ['boss'], fries: 'jar', lines: [{ type: 'speech', text: '……它是来以物易物的？', prosody: '停顿', placement: 'top-right' }] },
	{ shot: 'MS', angle: 'eye', focal: '50mm', beat: '勘太拧开罐盖递出一根薯条，芽衣在夕照里按下最后一张快门。', who: ['kanta', 'mei', 'boss'], fries: 'kanta', lines: [{ type: 'speech', text: '行吧，下不为例。', placement: 'bottom-left' }, { type: 'caption', text: '——完——', placement: 'bottom-right' }] },
]

export function defaultBook(): BookDraft {
	return {
		title: '海鸥抢薯条',
		subtitle: '海岸防波堤 · 双话完稿演示',
		story: SEAGULL_STORY,
		world: '近海小城，防波堤与旧商店街相连；黑白网点画风，保留局部朱红作重点色；分镜严格按日漫右起左读。',
		stylePreset: '少年网点',
		characters: structuredClone(CHARACTERS),
		chapters: [
			{
				title: '第一话：防波堤的俯冲',
				mood: '盐风 · 喜剧交锋',
				environment: 'boardwalk',
				lighting: 'hard-noon',
				pages: [
					{ scenario: 'establishing', layoutPreset: 'std', dialogueDensity: 0.45, targetPanels: 4, seed: 'seagull-c1-p1', showFlow: false, beats: structuredClone(C1_P1) },
					{ scenario: 'action', layoutPreset: 'action', dialogueDensity: 0.35, targetPanels: 5, seed: 'seagull-c1-p2', showFlow: false, beats: structuredClone(C1_P2) },
				],
			},
			{
				title: '第二话：屋顶的赎金',
				mood: '夕照 · 和解',
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
	if (!text || text.includes('海鸥') || text.includes('薯条')) return defaultBook()
	const sentences = text
		.split(/[。！？!?\n]+/)
		.map((line) => line.trim())
		.filter(Boolean)
	const chunks = sentences.length >= 4 ? sentences : [text, '风声忽然收紧。', '两人同时回头。', '巷口亮起一盏红灯。']
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
			lines: index === slice.length - 1 ? [{ type: 'sfx', text: '盯——！', placement: 'top-right' }] : [{ type: 'speech', text: line.slice(0, 26), placement: index % 2 ? 'top-left' : 'top-right' }],
		})),
	})
	const half = Math.ceil(chunks.length / 2)
	const first = chunks.slice(0, half)
	const second = chunks.slice(half)
	return {
		title: text.slice(0, 10),
		subtitle: 'AI 智能拆解漫剧分镜稿',
		story: text,
		world: '黑白墨线 + 灰网点 + 局部朱红；右起左读；气泡尾尖指向说话人。',
		stylePreset: '青年写实',
		characters: structuredClone(CHARACTERS),
		chapters: [
			{
				title: '第一话：起风',
				mood: '悬念铺垫',
				environment: 'neon-rain',
				lighting: 'neon-bounce',
				pages: [
					makePage(first.slice(0, Math.ceil(first.length / 2)), 'establishing', 'std', 'custom-c1-p1'),
					makePage(first.slice(Math.ceil(first.length / 2)), 'action', 'action', 'custom-c1-p2'),
				],
			},
			{
				title: '第二话：回响',
				mood: '真相揭晓',
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
	{ label: '海鸥抢薯条（默认双话）', text: SEAGULL_STORY },
	{
		label: '雨夜的伞（双话悬疑）',
		text: '末班电车到站时下起暴雨。勘太在站台捡到一把写着旧屋顶坐标的透明伞。芽衣认出那是三年前失踪社团留下的暗记。两人顺着霓虹雨巷追到天台，推门却看见一只戴脚环的海鸥守着录音机。',
	},
]
