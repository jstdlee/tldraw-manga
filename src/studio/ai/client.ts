import { loadSettings } from './settings'

export async function askText(system: string, user: string, fallback: () => string): Promise<string> {
	const settings = loadSettings()
	if (!settings.useApi) return fallback()
	const fullSystem = settings.systemAppendix ? `${system}\n补充指令：${settings.systemAppendix}` : system
	try {
		const response = await fetch('/api/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...settings, system: fullSystem, user }),
		})
		if (!response.ok) return fallback()
		const data = (await response.json()) as { text?: string }
		return data.text?.trim() || fallback()
	} catch {
		return fallback()
	}
}

export async function askVision(input: {
	imageDataUrl?: string
	title: string
	tag?: string
	body?: string
	customPrompt?: string
}): Promise<{ analysis: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Vision (${settings.visionModel})` : `内置 Vision 视觉引擎 (${settings.visionModel})`
	const prompt = [
		'你是漫画视觉总监与人设反推专家。请用简明专业的中文解析这张参考图/角色设定图，输出：',
		'1) 角色/场景外观锚点（发色、服饰、道具、轮廓特征）',
		'2) 镜头景别与构图张力（视角、焦段、留白区）',
		'3) 网点墨线与生图提示词建议',
		input.customPrompt ? `用户重点指令：${input.customPrompt}` : '',
		`卡片标题：${input.title} ${input.tag ?? ''}；已有描述：${input.body ?? ''}`,
	]
		.filter(Boolean)
		.join('\n')

	const offlineVisionFallback = () => {
		const focus = input.customPrompt ? `（结合指令「${input.customPrompt}」）` : ''
		if (input.tag?.includes('kanta') || input.title.includes('勘太')) {
			return `【Vision 识图反推${focus}】\n• 外观锚点：@kanta 凌乱黑发、深蓝连帽卫衣、领口护目镜、右侧脸颊贴创可贴，手握红白条纹薯条纸盒。\n• 构图与光影：中近景仰拍 (MCU / 35mm)，正午防波堤硬光，右上角留出 22% 空白供对白气泡落位。\n• 墨线网点：主轮廓粗G笔墨线，阴影处 40% 灰网点，朱红重点色仅用于薯条盒与护目镜反光。`
		}
		if (input.tag?.includes('mei') || input.title.includes('芽衣')) {
			return `【Vision 识图反推${focus}】\n• 外观锚点：@mei 利落短发配发卡、浅色风衣随海风扬起、斜挎胶片相机、眼神冷静克制。\n• 构图与光影：平视中景 (MS / 50mm)，海面逆光勾出风衣与发丝高光边，左上角留出安全气泡区。\n• 墨线网点：细腻丸笔发丝线条，风衣采用 25% 渐变网点，强化冷幽默静帧对比。`
		}
		if (input.tag?.includes('boss') || input.title.includes('鸥')) {
			return `【Vision 识图反推${focus}】\n• 外观锚点：@boss 巨型银背海鸥、左眼十字旧疤、左脚套金属环、双翼展开占满上沿出血位。\n• 构图与光影：18mm 广角极限仰拍 (low angle)，强烈放射速度线聚焦鹰钩喙，压迫感拉满。\n• 墨线网点：荒木飞吕彦式硬朗排线阴影 + 爆发拟声词「轰——！！」留白区。`
		}
		return `【Vision 识图反推 · ${input.title}${focus}】\n• 视觉主体：${input.body ? input.body.slice(0, 64) : '高对比度黑白漫剧参考画面，主次剪影分明'}。\n• 镜头语言：35mm 叙事中景，前景引导线汇聚于视觉中心，右上侧预留对白气泡负空间。\n• 画风锁定：黑白墨线 + 双层灰网点 + 局部朱红点缀，严禁画面内出现AI乱码文字。`
	}

	if (!settings.useApi) {
		return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
	}
	try {
		const response = await fetch('/api/vision', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				provider: settings.visionProvider || settings.provider,
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl,
				visionModel: settings.visionModel,
				imageDataUrl: input.imageDataUrl || '',
				prompt,
			}),
		})
		if (!response.ok) return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
		const data = (await response.json()) as { text?: string }
		return {
			analysis: data.text?.trim() || offlineVisionFallback(),
			modelUsed: modelLabel,
		}
	} catch {
		return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
	}
}

export async function polishCardText(input: {
	kind: string
	title: string
	body: string
	tag?: string
	customPrompt?: string
}): Promise<{ text: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `内置文本模型 (${settings.model})`
	const system = '你是资深中文漫画编剧与分镜设定顾问。请将用户的卡片内容润色得更具画面感、镜头张力与角色辨识度，直接输出润色后的中文正文，不要客套。'
	const user = [
		`卡片类型：${input.kind}，标题：${input.title} ${input.tag ?? ''}`,
		`原文内容：${input.body}`,
		input.customPrompt ? `用户自定义改写指令：${input.customPrompt}` : '请强化视觉细节、动作神态、网点光影与漫画分镜表现力。',
	].join('\n')

	const fallback = () => {
		const customNote = input.customPrompt ? `｜按指令「${input.customPrompt}」定向强化` : ''
		if (input.kind === 'character') {
			return `${input.body.replace(/\n*【AI 润色.*$/s, '')}\n【AI 润色设定${customNote}】锁定三视图锚点：动态衣褶随风向偏转，特写格强调眼神高光与嘴角微表情，跨格出场保持配饰与发型 100% 一致。`
		}
		if (input.kind === 'world' || input.kind === 'environment') {
			return `${input.body.replace(/\n*【AI 场景深化.*$/s, '')}\n【AI 场景深化${customNote}】远景强化空气透视与海雾网点层次，近景突出地面阴影切割线，右上角预留 20% 负空间安放对白气泡。`
		}
		if (input.kind === 'image') {
			return `${input.body.replace(/\n*【AI 生图词美化.*$/s, '')}\n【AI 生图词美化${customNote}】日式黑白漫画原稿，G笔凌厉墨线，60L灰网点过渡，局部朱红点睛，戏剧性逆光剪影，12%出血留白，无文字无气泡。`
		}
		return `${input.body.replace(/\n*【AI 剧本精修.*$/s, '')}\n【AI 剧本精修${customNote}】节奏由静入动：先以 35mm 平视建立日常松弛感，再用 18mm 极限仰拍切入冲突瞬间，高潮格前插入 1 格无台词静帧拉满张力。`
	}

	const text = await askText(system, user, fallback)
	return { text, modelUsed: modelLabel }
}

export async function regenerateCardText(input: {
	kind: string
	title: string
	body: string
	tag?: string
	customPrompt?: string
	variantSeed?: number
}): Promise<{ text: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `内置文本模型 (${settings.model})`
	const variants = [
		'版本A（热血张力风）：强化广角透视、放射速度线与极具冲击力的动作定格，台词短促有力。',
		'版本B（冷峻悬疑风）：采用高反差黑影与斜切构图 (Dutch angle)，通过眼神特写与环境静帧烘托压迫感。',
		'版本C（冷幽默剧场风）：先用严肃分镜铺垫史诗感，下一格突然切回荒诞日常反应，反差感拉满。',
	]
	const chosen = variants[(input.variantSeed ?? Math.floor(Date.now() / 1000)) % variants.length]
	const system = '你是中文漫画分镜主笔。请为该卡片重新生成一版富有创意的设定或分镜描述，直接输出中文正文。'
	const user = `标题：${input.title}\n原内容：${input.body}\n重生成方向：${input.customPrompt || chosen}`

	const fallback = () => {
		const direction = input.customPrompt ? `自定义方向「${input.customPrompt}」` : chosen.split('：')[0]
		if (input.kind === 'character') {
			return `${input.title}（${direction}重生成）：外轮廓鲜明，标志性特征在远景剪影中一眼可辨；动作戏采用夸张透视 foreshortening，静止格保留细腻睫毛与发丝高光。`
		}
		if (input.kind === 'image') {
			return `【AI 重生成视觉参考 · ${direction}】黑白漫画精修设定图，墨线干净利落，主光源从左上方 45° 投射，背景留白干净，突出角色与核心道具的戏剧冲突。`
		}
		return `【AI 重新生成 · ${direction}】\n${input.body.split('\n')[0]}\n新分镜走向：第一拍远景交代环境气压，第二拍特写锁定视线交锋，第三拍斜切大格引爆核心冲突，尾格留悬念钩子。`
	}

	const text = await askText(system, user, fallback)
	return { text, modelUsed: modelLabel }
}

export async function cardToPanelPrompt(input: {
	title: string
	body: string
	tag?: string
	customPrompt?: string
}): Promise<{ prompt: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `内置分镜编译器 (${settings.model})`
	const system = '请将卡片内容转化为结构化中文漫画生图与分镜提示词（包含：景别机位、焦段、角色外观锁定、光影网点、安全留白区、负面约束）。'
	const user = `标题：${input.title}\n内容：${input.body}\n附加要求：${input.customPrompt || '标准日漫右翻分镜'}`
	const fallback = () =>
		[
			`【分镜生图提示词 · ${input.title}】`,
			`• 镜头机位：中近景 (MCU) · 18mm 广角仰拍 · 视线引导朝左下方`,
			`• 角色与画面：${input.tag ? `${input.tag} 外观锁定，` : ''}${input.body.slice(0, 72)}`,
			input.customPrompt ? `• 自定义风格指令：${input.customPrompt}` : `• 画风墨线：黑白G笔浓墨线 + 45%灰网点 + 局部朱红高光`,
			`• 构图留白：含 12% 裁切出血位，右上角预留 20% 纯净负空间放对白气泡，禁出文字与乱码符号`,
		].join('\n')
	const prompt = await askText(system, user, fallback)
	return { prompt, modelUsed: modelLabel }
}

export async function askImage(prompt: string, aspect: string): Promise<string> {
	const settings = loadSettings()
	if (!settings.useApi) return ''
	try {
		const response = await fetch('/api/image', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...settings,
				provider: settings.imageProvider || settings.provider,
				imageModel: settings.imageModel,
				prompt,
				aspect,
			}),
		})
		if (!response.ok) return ''
		const data = (await response.json()) as { dataUrl?: string }
		return data.dataUrl || ''
	} catch {
		return ''
	}
}
