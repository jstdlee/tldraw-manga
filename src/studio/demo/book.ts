import { mulberry32, strHash } from '../layout/engine'
import type { Beat, BookDraft, BubbleLine, ChapterDraft, PageDraft } from '../model'
import { asScenario, type Scenario } from '../layout/score'

const speech = (text: string, prosody?: BubbleLine['prosody'], placement?: BubbleLine['placement']): BubbleLine => ({
	type: 'speech',
	text,
	prosody,
	placement,
})

export const SEAGULL_TEXT = `勘太在靠海的板道上买了最后一盒薯条。风从画面右侧吹来。一只带着红疤的海鸥头目俯冲而下，把盒子叫成“海的税”。摊主芽衣早准备了第二盒。两人后来在屋顶放了一只税罐子，第二天罐子里只剩一根羽毛。`

export function isSeagullStory(text: string): boolean {
	const value = text.toLowerCase()
	return value.includes('海鸥') || value.includes('薯条') || value.includes('seagull') || value.includes('fries')
}

function page(
	scenario: Scenario,
	preset: string,
	density: number,
	seed: string,
	showFlow: boolean,
	beats: Beat[],
): PageDraft {
	return {
		scenario,
		layoutPreset: preset,
		dialogueDensity: density,
		targetPanels: beats.length,
		seed,
		showFlow,
		beats,
	}
}

export function seagullBook(): BookDraft {
	const chapter1: ChapterDraft = {
		title: '第1话 盐风',
		mood: '盐风、明亮、压迫',
		environment: 'boardwalk',
		lighting: 'hard-noon',
		pages: [
			page('establishing', 'seizen', 40, 'seagull-c1-p1', true, [
				{ shot: 'EWS', angle: 'eye', focal: '18mm', beat: '板道尽头，红白棚在风里鼓起来。', who: [], fries: 'none', lines: [{ type: 'caption', text: '风从海面来。', placement: 'top-right' }], eyeline: [20, 0] },
				{ shot: 'WS', angle: 'eye', focal: '35mm', beat: '勘太拎着最后一盒薯条，影子比人长。', who: ['kanta'], fries: 'kanta', lines: [speech('就这一盒。', '停顿', 'top-right')], eyeline: [18, -6] },
				{ shot: 'CU', angle: 'high', focal: '85mm', beat: '翅膀的影子盖住薯条。', who: ['boss'], fries: 'kanta', lines: [{ type: 'sfx', text: 'パサ…', placement: 'bottom-right' }], eyeline: [-10, 16] },
				{ shot: 'MCU', angle: 'low', focal: '35mm', beat: '勘太抬头，刘海被风掀开。', who: ['kanta'], fries: 'kanta', lines: [speech('别想。', '冷笑', 'top-left')], eyeline: [8, -24] },
			]),
			page('action', 'action', 62, 'seagull-c1-p2', false, [
				{ shot: 'MS', angle: 'low', focal: '18mm', beat: '头目鸥贴着棚子俯冲。', who: ['boss'], fries: 'gull', lines: [{ type: 'sfx', text: 'シュッ', placement: 'top-right' }], eyeline: [-20, 18] },
				{ shot: 'CU', angle: 'eye', focal: '85mm', beat: '勘太的眼睛瞪圆。', who: ['kanta'], fries: 'kanta', lines: [{ type: 'shout', text: '喂！', prosody: '怒吼', placement: 'center' }], eyeline: [6, -8] },
				{ shot: 'ECU', angle: 'low', focal: '18mm', beat: '喙和纸盒撞在一起。', who: ['boss'], fries: 'gull', lines: [{ type: 'sfx', text: 'バサッ', placement: 'bottom-left' }], eyeline: [14, 4] },
				{ shot: 'MS', angle: 'dutch', focal: '18mm', beat: '薯条整盒腾空。', who: ['kanta', 'boss'], fries: 'air', lines: [{ type: 'sfx', text: 'ドン!!', placement: 'center' }], eyeline: [22, -12] },
				{ shot: 'WS', angle: 'eye', focal: '35mm', beat: '芽衣从摊后冲出来，勘太沿栏杆追。', who: ['kanta', 'mei'], fries: 'gull', lines: [speech('那是最后一筐！', '颤抖', 'top-left')], eyeline: [16, -4] },
				{ shot: 'MCU', angle: 'eye', focal: '85mm', beat: '勘太的手抓空。', who: ['kanta'], fries: 'none', lines: [], eyeline: [4, 10] },
			]),
			page('climax', 'std', 48, 'seagull-c1-p3', false, [
				{ shot: 'WS', angle: 'low', focal: '18mm', beat: '头目鸥落在灯柱上，盒子扣在爪里。', who: ['boss'], fries: 'gull', lines: [{ type: 'shout', text: '这是海的税。', placement: 'top-right' }], eyeline: [0, 20] },
				{ shot: 'MS', angle: 'eye', focal: '50mm', beat: '芽衣抱着胳膊，并不提高音量。', who: ['mei'], fries: 'none', lines: [speech('你每天都来。', '', 'top-left')], eyeline: [-12, -2] },
				{ shot: 'CU', angle: 'eye', focal: '85mm', beat: '勘太拈起一根薯条。', who: ['kanta'], fries: 'kanta', lines: [speech('一根。讲和。', '停顿', 'bottom-right')], eyeline: [10, -6] },
				{ shot: 'ECU', angle: 'eye', focal: '85mm', beat: '一根薯条停在风里，谁都没接话。', who: [], fries: 'air', lines: [], eyeline: [0, -4] },
				{ shot: 'WS', angle: 'high', focal: '35mm', beat: '芽衣从柜台下又托出一盒。', who: ['mei'], fries: 'kanta', lines: [{ type: 'caption', text: '她早就准备了第二盒。', placement: 'top-right' }, speech('屋顶见。', '', 'bottom-left')], eyeline: [12, 8] },
			]),
		],
	}
	const chapter2: ChapterDraft = {
		title: '第2话 屋顶',
		mood: '夕照，转暴风雨',
		environment: 'sunset-roof',
		lighting: 'rim',
		pages: [
			page('intimacy', 'seizen', 42, 'seagull-c2-p1', false, [
				{ shot: 'EWS', angle: 'eye', focal: '85mm', beat: '夕阳把两个人压成屋顶上的剪影。', who: ['kanta', 'mei'], fries: 'none', lines: [{ type: 'caption', text: '夕阳把两个人压成剪影。', placement: 'top-right' }], eyeline: [18, 0] },
				{ shot: 'MS', angle: 'eye', focal: '50mm', beat: '他们分着第二盒薯条。', who: ['mei', 'kanta'], fries: 'kanta', lines: [speech('海鸥工会没有发票。', '', 'top-left')], eyeline: [-8, -4] },
				{ shot: 'CU', angle: 'eye', focal: '85mm', beat: '勘太笑了一下，不像在开玩笑。', who: ['kanta'], fries: 'none', lines: [speech('那就收会员费。', '冷笑', 'top-right')], eyeline: [8, -6] },
				{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: '一只空罐子放在两人之间。', who: ['kanta', 'mei'], fries: 'jar', lines: [{ type: 'caption', text: '他们决定设一个海鸥税罐子。', placement: 'bottom-left' }], eyeline: [0, 12] },
			]),
			page('climax', 'action', 58, 'seagull-c2-p2', true, [
				{ shot: 'EWS', angle: 'high', focal: '18mm', beat: '天边站满了海鸥。', who: ['boss'], fries: 'none', lines: [{ type: 'caption', text: '第二天，天边站满了海鸥。', placement: 'top-right' }], eyeline: [0, 16] },
				{ shot: 'MS', angle: 'low', focal: '35mm', beat: '勘太把罐子举到风口。', who: ['kanta'], fries: 'jar', lines: [speech('罐子在这儿。', '', 'top-left')], eyeline: [6, -20] },
				{ shot: 'CU', angle: 'high', focal: '85mm', beat: '罐子是空的，只剩一根羽毛。', who: [], fries: 'feather', lines: [{ type: 'sfx', text: 'ポカーン!', placement: 'center' }], eyeline: [0, 14] },
				{ shot: 'MCU', angle: 'eye', focal: '50mm', beat: '芽衣看着羽毛，声音放得很低。', who: ['mei'], fries: 'feather', lines: [{ type: 'whisper', text: '它来过了。', prosody: '低语', placement: 'bottom-left' }], eyeline: [-6, 4] },
				{ shot: 'WS', angle: 'dutch', focal: '18mm', beat: '羽毛吹向画外，鸥群压下来。', who: ['kanta', 'mei', 'boss'], fries: 'feather', lines: [{ type: 'caption', text: '税，已经收走了。', placement: 'top-right' }, { type: 'sfx', text: 'ゴゴゴ…', placement: 'bottom-left' }], eyeline: [20, -10] },
			]),
		],
	}
	return {
		title: '海鸥抢薯条',
		subtitle: 'Seagull Fries Heist',
		story: SEAGULL_TEXT,
		world: '靠海的板道镇。海鸥组成了没有发票的工会，炸薯条摊是中立地带。风从画面右侧吹向左侧，阅读从右上开始。',
		stylePreset: '少年网点',
		characters: [
			{ tag: '@kanta', name: '勘太', appearance: '17岁，乱黑发，红防风外套，白T恤，深蓝裤，左耳一枚银钉。三视图锁定发型轮廓。', voice: '短句，嘴硬，停顿多。', locked: true },
			{ tag: '@mei', name: '芽衣', appearance: '齐肩黑褐波波头，蓝衬衫，红白条纹围裙，眼下一颗小痣。', voice: '干、轻，不抬高音量。', locked: true },
			{ tag: '@boss', name: '头目鸥', appearance: '白羽海鸥，黄喙，左眼上一道红疤，翼展夸张。', voice: '舞台腔，把抢东西说成收税。', locked: true },
		],
		chapters: [chapter1, chapter2],
	}
}

const SHOTS = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU'] as const
const ANGLES = ['eye', 'low', 'high', 'dutch', 'bird'] as const
const FOCALS = ['18mm', '35mm', '50mm', '85mm'] as const
const SCENES: Scenario[] = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax']
const PRESETS = ['seizen', 'std', 'action', 'tobira']
const ENVS = ['dawn-beach', 'boardwalk', 'neon-rain', 'sunset-roof', 'noir', 'konbini', 'platform', 'shrine', 'classroom', 'storm-pier']
const LIGHTS = ['hard-noon', 'rim', 'backlight', 'underlight', 'neon-bounce', 'screentone']

function sentencesOf(text: string): string[] {
	const parts = text
		.split(/[。！？\n]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 1)
	return parts.length ? parts : ['有人推开了门。']
}

export function bookFromText(text: string): BookDraft {
	const source = text.trim()
	if (!source || isSeagullStory(source)) return { ...seagullBook(), story: source || SEAGULL_TEXT }
	const random = mulberry32(strHash(source))
	const lines = sentencesOf(source)
	const tags = Array.from(source.matchAll(/@([a-zA-Z0-9_\u4e00-\u9fff]+)/g)).map((match) => match[1])
	const cast = tags.length ? tags.slice(0, 3) : ['kanta', 'mei']
	const characters = cast.map((tag, index) => ({
		tag: `@${tag}`,
		name: tag,
		appearance: index === 0 ? '黑发，外套轮廓锁定，三视图不变。' : '配角，服装与发型锁定。',
		voice: index === 0 ? '短句。' : '压低声音。',
		locked: true,
	}))
	const chapterCount = lines.length > 8 ? 2 : 1
	const perChapter = Math.ceil(lines.length / chapterCount)
	const chapters: ChapterDraft[] = []
	for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex += 1) {
		const slice = lines.slice(chapterIndex * perChapter, (chapterIndex + 1) * perChapter)
		const pageCount = Math.max(1, Math.min(3, Math.ceil(slice.length / 3)))
		const pages: PageDraft[] = []
		for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
			const beatsSrc = slice.slice(
				Math.floor((pageIndex * slice.length) / pageCount),
				Math.floor(((pageIndex + 1) * slice.length) / pageCount),
			)
			const scenario = SCENES[(chapterIndex * 2 + pageIndex) % SCENES.length]
			const count = Math.max(3, Math.min(6, beatsSrc.length + 2))
			const beats: Beat[] = Array.from({ length: count }, (_, index) => {
				const sentence = beatsSrc[index] ?? beatsSrc[beatsSrc.length - 1] ?? '风停了一下。'
				const last = index === count - 1
				const silent = index === count - 2
				const linesForBeat: BubbleLine[] = []
				if (last) linesForBeat.push({ type: 'caption', text: sentence.slice(0, 18), placement: 'bottom-left' })
				else if (!silent && sentence.length < 16) linesForBeat.push(speech(sentence, index % 2 ? '低语' : '', index % 2 ? 'top-right' : 'top-left'))
				else if (!silent) linesForBeat.push({ type: 'caption', text: sentence.slice(0, 20), placement: 'top-right' })
				return {
					shot: SHOTS[Math.min(SHOTS.length - 1, index === 0 ? 0 : index === count - 1 ? 1 : 2 + (index % 3))],
					angle: ANGLES[index % ANGLES.length],
					focal: last || index === 0 ? '18mm' : FOCALS[(index + 1) % FOCALS.length],
					beat: sentence,
					who: silent ? [] : [cast[index % cast.length]],
					fries: 'none',
					lines: linesForBeat,
					eyeline: [12, index % 2 ? -8 : 6],
				}
			})
			pages.push(
				page(asScenario(scenario), PRESETS[pageIndex % PRESETS.length], 40 + Math.floor(random() * 30), `story-c${chapterIndex + 1}-p${pageIndex + 1}-${strHash(source).toString(16)}`, pageIndex === 0, beats),
			)
		}
		chapters.push({
			title: `第${chapterIndex + 1}话`,
			mood: chapterIndex === 0 ? '开场' : '收束',
			environment: ENVS[Math.floor(random() * ENVS.length)],
			lighting: LIGHTS[Math.floor(random() * LIGHTS.length)],
			pages,
		})
	}
	return {
		title: lines[0]?.slice(0, 12) || '未命名漫画',
		subtitle: 'Local draft',
		story: source,
		world: lines.slice(0, 2).join('。'),
		stylePreset: '少年网点',
		characters,
		chapters,
	}
}

export const ENV_LABELS: Record<string, string> = {
	boardwalk: '盐风板道',
	'dawn-beach': '黎明海滩',
	'neon-rain': '霓虹雨巷',
	'sunset-roof': '夕照屋顶',
	noir: '高反差黑白',
	konbini: '便利店冷光',
	platform: '黄昏月台',
	shrine: '雾中鸟居',
	classroom: '午后教室',
	'storm-pier': '暴风雨码头',
}

export const LIGHT_LABELS: Record<string, string> = {
	'hard-noon': '正午硬光',
	rim: '轮廓光',
	backlight: '逆光',
	underlight: '底光',
	'neon-bounce': '霓虹反光',
	screentone: '网点渐变',
}

export const ENV_IDS = Object.keys(ENV_LABELS)
export const LIGHT_IDS = Object.keys(LIGHT_LABELS)
