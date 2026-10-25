import {
	boundsOf,
	centroid,
	generate,
	mulberry32,
	mutate,
	polyArea,
	realize,
	sanitize,
	strHash,
	type Genome,
	type Layout,
	type LayoutConfig,
} from './engine'

export interface LayoutFeatures {
	n: number
	rows: number
	bigShare: number
	bigIdx: number
	diagRatio: number
	bleedRatio: number
	cv: number
	vRhythm: number
	aspectSpread: number
	lastShare: number
}

export type Scenario = 'establishing' | 'tension' | 'intimacy' | 'action' | 'reveal' | 'climax'

export const SCENARIOS: Scenario[] = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax']

export interface EditorialAxes {
	narrative: number
	pacing: number
	readingFlow: number
	hierarchy: number
	emotion: number
	production: number
	flow: number
	tension: number
	bleedHook: number
	balance: number
}

export type RemedyActionId = 'expand-hero' | 'bleed-last-hook' | 'boost-tilt' | 'calm-tilt' | 'split-dense'

export interface EditorialRemedy {
	id: RemedyActionId
	label: string
	detail: string
	actionLabel?: string
	description?: string
}

export interface EditorialScoreResult {
	score: number
	reasons: string[]
	axes: EditorialAxes
	deficits: string[]
	mutations: string[]
	remedies: EditorialRemedy[]
}

export interface EmotionDirectionTip {
	scenario: Scenario
	title: string
	label: string
	subtitle: string
	rhythm: string
	layoutRule: string
	camera: string
	beatRule: string
	bleedTip: string
	silentTip: string
	recommendedPreset: 'seizen' | 'std' | 'action' | 'tobira'
	recommendedTilt: number
	recommendedBleed: number
	recommendedBig: number
	silentPanelOffset: number
}

const RAW_TIPS = {
	establishing: {
		scenario: 'establishing',
		title: '开场铺垫 · 建立空间',
		subtitle: '首格大景定调，后续稳步切入人物反应',
		rhythm: '前大后稳（首格占 30%+ 建立世界坐标，后续中近景自然过渡）',
		camera: '推荐 18mm–28mm 广角俯拍/平视（EWS → MS → MCU）',
		bleedTip: '首格可开启上/右出血，增强开篇空间呼吸感',
		silentTip: '首格或环境转场格可留白少字，让读者视线先落入场景',
		recommendedPreset: 'std',
		recommendedTilt: 0.18,
		recommendedBleed: 0.25,
		recommendedBig: 0.35,
		silentPanelOffset: 0,
	},
	tension: {
		scenario: 'tension',
		title: '悬疑压迫 · 步步逼近',
		subtitle: '密集窄格压缩呼吸，视线冷峻交锋',
		rhythm: '格数偏密（4–6 格），面积均等偏窄，制造倒计时般的紧迫感',
		camera: '推荐 50mm–85mm 中长焦压缩空间 + 低机位/斜角（MCU → CU → ECU）',
		bleedTip: '前段保持内框封闭压抑感，仅在末格局部破框',
		silentTip: '高潮前一格设为「无声静帧」特写眼神或局部动作',
		recommendedPreset: 'seizen',
		recommendedTilt: 0.28,
		recommendedBleed: 0.12,
		recommendedBig: 0.18,
		silentPanelOffset: -2,
	},
	intimacy: {
		scenario: 'intimacy',
		title: '亲密喘息 · 情感留白',
		subtitle: '正交平稳框线，留出充足对白与空气感',
		rhythm: '正交低斜切（Tilt ≤ 10%），节奏舒缓，大面积留白承载情绪潜台词',
		camera: '推荐 35mm–50mm 平视标准镜头，浅景深柔化背景杂讯（MS ↔ CU）',
		bleedTip: '回忆或情绪共鸣格可开启单侧出血，营造余韵',
		silentTip: '在关键台词后插入一格无对白空镜（海风、衣角或光影）',
		recommendedPreset: 'seizen',
		recommendedTilt: 0.06,
		recommendedBleed: 0.15,
		recommendedBig: 0.22,
		silentPanelOffset: -2,
	},
	action: {
		scenario: 'action',
		title: '动作冲击 · 破框速度',
		subtitle: '锐利斜切刀口与大比例出血，强化动势连贯',
		rhythm: '大小格强烈对比（CV ≥ 0.45），斜切分割线引导视线高速滑落',
		camera: '推荐 18mm 超广角近迫透视 + 仰拍/荷兰斜角（WS ↔ CU 急促切换）',
		bleedTip: '主打击格开启双边或三边出血，冲破版心束缚',
		silentTip: '重击命中瞬间可不放对白，仅留视觉冲击或精炼拟声词',
		recommendedPreset: 'action',
		recommendedTilt: 0.62,
		recommendedBleed: 0.5,
		recommendedBig: 0.42,
		silentPanelOffset: -2,
	},
	reveal: {
		scenario: 'reveal',
		title: '戏剧揭晓 · 翻页惊奇',
		subtitle: '前段克制铺垫，真相落于主视觉大格',
		rhythm: '前 2–3 格紧凑收敛，随后突然展开占页 38%+ 的揭晓主格',
		camera: '前段遮挡局部特写（CU），揭晓格切广角全景或冲击近景（WS / MCU）',
		bleedTip: '揭晓格开启左/下出血，将读者视线直接牵引至翻页处',
		silentTip: '揭晓前一格保持绝对静默，拉满期待值',
		recommendedPreset: 'tobira',
		recommendedTilt: 0.35,
		recommendedBleed: 0.6,
		recommendedBig: 0.62,
		silentPanelOffset: -2,
	},
	climax: {
		scenario: 'climax',
		title: '高潮爆发 · 终局定格',
		subtitle: '全页视觉重心集中，高潮前留白一拍',
		rhythm: '极高主次反差（主格占 42%+），辅以 2–3 格急促切镜烘托顶点',
		camera: '18mm 极端仰拍或 85mm 极致眼神大特写（ECU → EWS 史诗定格）',
		bleedTip: '主格大面积出血（≥ 65%），释放全书最高情绪张力',
		silentTip: '爆发前一格强制留空无声格，形成「静→爆」反差',
		recommendedPreset: 'tobira',
		recommendedTilt: 0.48,
		recommendedBleed: 0.72,
		recommendedBig: 0.68,
		silentPanelOffset: -2,
	},
}

export const EMOTION_DIRECTION_TIPS: Record<Scenario, EmotionDirectionTip> = Object.fromEntries(
	Object.entries(RAW_TIPS).map(([k, v]) => [
		k,
		{
			...v,
			label: v.title,
			layoutRule: v.rhythm,
			beatRule: `${v.camera} · ${v.silentTip}`,
		},
	]),
) as unknown as Record<Scenario, EmotionDirectionTip>

const WEIGHTS: Record<
	Scenario,
	{
		big: number
		diag: number
		bleed: number
		cv: number
		rhythm: number
		aspect: number
		heroWhere: 'first' | 'last' | 'mid' | 'any'
	}
> = {
	establishing: { big: 0.25, diag: -0.08, bleed: 0.16, cv: 0.14, rhythm: 0.16, aspect: 0.12, heroWhere: 'first' },
	tension: { big: 0.08, diag: 0.22, bleed: 0.06, cv: 0.16, rhythm: 0.18, aspect: 0.18, heroWhere: 'last' },
	intimacy: { big: 0.14, diag: -0.18, bleed: 0.14, cv: 0.12, rhythm: 0.18, aspect: 0.12, heroWhere: 'mid' },
	action: { big: 0.22, diag: 0.32, bleed: 0.28, cv: 0.2, rhythm: 0.16, aspect: 0.14, heroWhere: 'any' },
	reveal: { big: 0.34, diag: 0.14, bleed: 0.3, cv: 0.24, rhythm: 0.14, aspect: 0.1, heroWhere: 'last' },
	climax: { big: 0.36, diag: 0.26, bleed: 0.34, cv: 0.24, rhythm: 0.14, aspect: 0.1, heroWhere: 'any' },
}

function clamp100(val: number): number {
	return Math.max(38, Math.min(99, Math.round(val)))
}

export function layoutFeatures(layout: Omit<Layout, 'seed'>): LayoutFeatures {
	const panels = layout.panels
	const n = panels.length || 1
	const areas = panels.map((panel) => polyArea(panel.pts))
	const total = areas.reduce((a, b) => a + b, 0) || 1
	const shares = areas.map((area) => area / total)
	const bigShare = Math.max(...shares)
	const bigIdx = shares.indexOf(bigShare)
	const mean = 1 / n
	const std = Math.sqrt(shares.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n)
	const cv = mean > 0 ? std / mean : 0
	const genome = layout.genome
	let diag = 0
	let cuts = 0
	let bleeds = 0
	let cells = 0
	genome.rows.forEach((row, index) => {
		if (index < genome.rows.length - 1) {
			cuts += 1
			if (Math.abs(row.s) > 0.025) diag += 1
		}
		row.vs.forEach((v) => {
			cuts += 1
			if (Math.abs(v.s) > 0.025) diag += 1
		})
		row.p.forEach((p) => {
			cells += 1
			if (p.bT || p.bB || p.bL || p.bR) bleeds += 1
			if (p.nest) {
				cuts += 1
				if (Math.abs(p.nest.s) > 0.025) diag += 1
			}
		})
	})
	const diagRatio = cuts ? diag / cuts : 0
	const bleedRatio = cells ? bleeds / cells : 0
	const rowH = genome.rows.map((row) => row.h)
	const hMean = 1 / rowH.length
	const vRhythm = rowH.length > 1 ? Math.sqrt(rowH.reduce((acc, h) => acc + (h - hMean) ** 2, 0) / rowH.length) / hMean : 0
	const ratios = panels.map((panel) => {
		const b = boundsOf(panel.pts)
		return Math.log(b.w / b.h)
	})
	const rMean = ratios.reduce((a, b) => a + b, 0) / n
	const aspectSpread = Math.sqrt(ratios.reduce((acc, r) => acc + (r - rMean) ** 2, 0) / n)
	return {
		n,
		rows: genome.rows.length,
		bigShare,
		bigIdx,
		diagRatio,
		bleedRatio,
		cv,
		vRhythm,
		aspectSpread,
		lastShare: shares[n - 1] ?? 0,
	}
}

export function layoutScore(features: LayoutFeatures, targetPanels: number, scenario: Scenario): EditorialScoreResult {
	const w = WEIGHTS[scenario] ?? WEIGHTS.establishing
	const reasons: string[] = []
	const deficits: string[] = []
	const mutations: string[] = []
	const remedies: EditorialRemedy[] = []

	const countDiff = Math.abs(features.n - targetPanels)
	const countScore = Math.max(0, 1 - countDiff * 0.28)
	if (countDiff === 0) reasons.push(`格数精准 (${features.n}格)`)
	else if (countDiff === 1) reasons.push(`格数接近 (${features.n}/${targetPanels})`)
	else {
		deficits.push(`当前格数 (${features.n}格) 偏离目标剧本节拍 (${targetPanels}格)`)
		mutations.push(`建议调整段数或嵌套拆格率，使格数回归 ${targetPanels} 格`)
		remedies.push({
			actionLabel: '', description: '',
			id: 'split-dense',
			label: '校准格数密度',
			detail: `将分格密度向目标 ${targetPanels} 格对齐`,
		})
	}

	let heroBonus = 0.55
	if (w.heroWhere === 'first' && features.bigIdx === 0) {
		heroBonus = 1
		reasons.push('首格主视觉定调')
	} else if (w.heroWhere === 'last' && features.bigIdx >= features.n - 2) {
		heroBonus = 1
		reasons.push('末段视觉落点强')
	} else if (w.heroWhere === 'mid' && features.bigIdx > 0 && features.bigIdx < features.n - 1) {
		heroBonus = 1
		reasons.push('中段情绪重心稳')
	} else if (w.heroWhere === 'any' && features.bigShare > 0.28) {
		heroBonus = 1
		reasons.push(`主格突出 (${Math.round(features.bigShare * 100)}%)`)
	}

	if (features.bigShare < 0.24 && (scenario === 'climax' || scenario === 'reveal' || scenario === 'action')) {
		deficits.push(`主格面积占比偏小 (${Math.round(features.bigShare * 100)}%)，缺乏视觉统治力`)
		mutations.push('建议提升「大格权重 (Big ≥ 40%)」拉开主次层级对比')
		remedies.push({
			actionLabel: '', description: '',
			id: 'expand-hero',
			label: '放大主视觉格',
			detail: '拉高主格行高与列宽权重，强化核心戏剧镜头',
		})
	}

	if (features.lastShare < 0.14 && features.n >= 4) {
		deficits.push(`末格面积偏小 (${Math.round(features.lastShare * 100)}%)，左下角翻页悬念钩子偏弱`)
		mutations.push('建议扩大末格面积并开启左/下出血，强化翻页牵引力')
		remedies.push({
			actionLabel: '', description: '',
			id: 'bleed-last-hook',
			label: '强化末格翻页钩子',
			detail: '开启末格左下出血并扩大末段行高',
		})
	}

	const bigNorm = Math.min(1, features.bigShare / 0.42)
	const cvNorm = Math.min(1, features.cv / 0.55)
	const rhythmNorm = Math.min(1, features.vRhythm / 0.45)
	const aspectNorm = Math.min(1, features.aspectSpread / 0.65)
	const diagTerm =
		w.diag >= 0 ? features.diagRatio * w.diag : (1 - features.diagRatio) * -w.diag * 0.8 + (features.diagRatio === 0 ? 0.08 : 0)

	if (w.diag > 0.15 && features.diagRatio > 0.35) {
		reasons.push(`斜切张力 (${Math.round(features.diagRatio * 100)}%)`)
	} else if (w.diag > 0.18 && features.diagRatio < 0.18) {
		deficits.push('分割线过于平直，动作/冲突场景的速度感不足')
		mutations.push('建议将「斜切度 (Tilt)」提升至 40%–60% 制造动势切线')
		remedies.push({
			actionLabel: '', description: '',
			id: 'boost-tilt',
			label: '注入斜切动势',
			detail: '为行/列分割线注入漫画斜切角度，强化视觉速度感',
		})
	}

	if (w.diag < 0 && features.diagRatio < 0.15) {
		reasons.push('正交沉稳叙事')
	} else if (w.diag < -0.1 && features.diagRatio > 0.35) {
		deficits.push('斜切线过多，破坏了亲密/铺垫场景的平稳呼吸感')
		mutations.push('建议降低「斜切度 (Tilt ≤ 15%)」恢复正交框线')
		remedies.push({
			actionLabel: '', description: '',
			id: 'calm-tilt',
			label: '收敛正交框线',
			detail: '降低分割线斜率，恢复沉稳正交的叙事画框',
		})
	}

	if (features.bleedRatio > 0.22 && w.bleed > 0.2) {
		reasons.push('破框出血释放空间')
	} else if (w.bleed >= 0.28 && features.bleedRatio < 0.15) {
		deficits.push('四边均受内框束缚，缺少破框出血带来的空间冲击')
		mutations.push('建议开启主格或末格的「边缘出血 (Bleed)」打破版心边界')
		if (!remedies.some((r) => r.id === 'bleed-last-hook')) {
			remedies.push({
				id: 'bleed-last-hook',
				label: '开启主格/末格出血',
				detail: '打开关键分镜格的外缘出血，释放画面空间感',
			})
		}
	}

	if (features.cv > 0.38) reasons.push('大小格主次分明')

	const raw =
		countScore * 0.34 +
		heroBonus * 0.16 +
		bigNorm * w.big +
		diagTerm +
		features.bleedRatio * w.bleed +
		cvNorm * w.cv +
		rhythmNorm * w.rhythm +
		aspectNorm * w.aspect

	const score = Math.max(0.1, Math.min(0.99, raw))

	const narrative100 = clamp100(countScore * 62 + heroBonus * 36)
	const pacing100 = clamp100(48 + rhythmNorm * 28 + cvNorm * 22)
	const flow100 = clamp100(68 + (features.rows >= 2 && features.rows <= 4 ? 18 : 4) + (features.lastShare >= 0.14 ? 11 : 0))
	const hierarchy100 = clamp100(44 + bigNorm * 34 + cvNorm * 20)
	const emotion100 = clamp100(50 + Math.max(0, diagTerm) * 95 + features.bleedRatio * 32)
	const production100 = clamp100(64 + aspectNorm * 18 + (features.n <= 7 ? 15 : 2))
	const axes: EditorialAxes = {
		narrative: narrative100,
		pacing: pacing100 / 100,
		readingFlow: flow100,
		hierarchy: hierarchy100 / 100,
		emotion: emotion100,
		production: production100,
		flow: flow100 / 100,
		tension: emotion100 / 100,
		bleedHook: clamp100(52 + features.lastShare * 140 + features.bleedRatio * 28) / 100,
		balance: production100 / 100,
	}

	if (deficits.length === 0) {
		deficits.push('当前版式结构均衡，无明显叙事或动线硬伤')
	}
	if (mutations.length === 0) {
		mutations.push('可尝试微调单格四边出血或在高潮前插入一格「无声静帧」')
	}

	return {
		score,
		reasons: reasons.slice(0, 3),
		axes,
		deficits: deficits.slice(0, 3),
		mutations: mutations.slice(0, 3),
		remedies: remedies.slice(0, 2).map((r) => ({
			...r,
			actionLabel: r.label,
			description: r.detail,
		})),
	}
}

export function applyRemedyToGenome(raw: Genome, remedyId: RemedyActionId): Genome {
	const g = sanitize(raw)
	const rows = g.rows
	if (!rows.length) return g

	if (remedyId === 'expand-hero') {
		let maxRow = 0
		rows.forEach((r, idx) => {
			if (r.h > rows[maxRow].h) maxRow = idx
		})
		rows[maxRow].h *= 1.55
		if (rows[maxRow].w.length > 1) {
			rows[maxRow].w[0] *= 1.5
		}
		if (rows[maxRow].p[0]) {
			rows[maxRow].p[0].bR = true
		}
		return sanitize(g)
	}

	if (remedyId === 'bleed-last-hook') {
		const lastRow = rows[rows.length - 1]
		lastRow.h *= 1.38
		const lastCol = lastRow.p.length - 1
		if (lastRow.p[lastCol]) {
			lastRow.p[lastCol].bB = true
			lastRow.p[lastCol].bL = true
		}
		if (lastRow.w.length > 1) {
			lastRow.w[lastCol] *= 1.4
		}
		return sanitize(g)
	}

	if (remedyId === 'boost-tilt') {
		rows.forEach((row, rIdx) => {
			if (rIdx < rows.length - 1) {
				row.s = rIdx % 2 === 0 ? 0.14 : -0.12
			}
			row.vs.forEach((v, vIdx) => {
				v.s = vIdx % 2 === 0 ? -0.13 : 0.13
			})
		})
		return sanitize(g)
	}

	if (remedyId === 'calm-tilt') {
		rows.forEach((row) => {
			row.s = 0
			row.vs.forEach((v) => {
				v.s = 0
			})
			row.p.forEach((cell) => {
				if (cell.nest) cell.nest.s = 0
			})
		})
		return sanitize(g)
	}

	if (remedyId === 'split-dense') {
		const targetRow = rows[Math.min(1, rows.length - 1)]
		if (targetRow.p[0] && !targetRow.p[0].nest) {
			targetRow.p[0].nest = { t: 0.5, s: 0.04, g: 10 }
		} else if (targetRow.p[0]?.nest) {
			targetRow.p[0].nest = null
		}
		return sanitize(g)
	}

	return sanitize(g)
}

export interface ScoredLayout {
	seed: string
	layout: Layout
	features: LayoutFeatures
	score: number
	reasons: string[]
	axes: EditorialAxes
	deficits: string[]
	mutations: string[]
	remedies: EditorialRemedy[]
}

export function pickTopLayouts(
	baseSeed: string,
	config: LayoutConfig,
	targetPanels: number,
	scenario: Scenario,
	count = 36,
): { top: ScoredLayout[]; ms: number } {
	const t0 = performance.now()
	const candidates: ScoredLayout[] = []
	for (let i = 0; i < count; i += 1) {
		const candidateSeed = i === 0 ? baseSeed : `${baseSeed}~${i}`
		const layout = generate(candidateSeed, config)
		const features = layoutFeatures(layout)
		const judged = layoutScore(features, targetPanels, scenario)
		candidates.push({ seed: candidateSeed, layout, features, ...judged })
	}
	candidates.sort((a, b) => b.score - a.score)
	const picked: ScoredLayout[] = []
	const seen = new Set<string>()
	for (const candidate of candidates) {
		const sig = `${candidate.features.rows}-${candidate.features.n}-${candidate.features.bigIdx}-${Math.round(candidate.features.diagRatio * 3)}`
		if (!seen.has(sig) || picked.length < 4) {
			picked.push(candidate)
			seen.add(sig)
		}
		if (picked.length >= 4) break
	}
	return { top: picked, ms: Math.max(1, Math.round(performance.now() - t0)) }
}

export function pickLayoutBundle(
	baseSeed: string,
	config: LayoutConfig,
	targetPanels: number,
	scenario: Scenario,
	options?: {
		mode?: 'roll' | 'mutate'
		baseGenome?: Genome
		mutationStrength?: number
		poolSize?: number
		returnCount?: number
		count?: number
	},
): { top: ScoredLayout[]; ms: number } {
	const t0 = performance.now()
	const mode = options?.mode ?? 'roll'
	const poolSize = options?.poolSize ?? 36
	const returnCount = options?.returnCount ?? options?.count ?? 8
	const strength = options?.mutationStrength ?? 0.45
	const candidates: ScoredLayout[] = []

	for (let i = 0; i < poolSize; i += 1) {
		const candidateSeed = i === 0 ? baseSeed : `${baseSeed}~${mode === 'mutate' ? 'm' : 'r'}${i}`
		let layout: Layout
		if (mode === 'mutate' && options?.baseGenome) {
			const rand = mulberry32(strHash(candidateSeed))
			const genome = i === 0 ? sanitize(options.baseGenome) : mutate(options.baseGenome, rand, strength)
			layout = { ...realize(genome, config), seed: candidateSeed }
		} else {
			layout = generate(candidateSeed, config)
		}
		const features = layoutFeatures(layout)
		const judged = layoutScore(features, targetPanels, scenario)
		candidates.push({ seed: candidateSeed, layout, features, ...judged })
	}

	candidates.sort((a, b) => b.score - a.score)
	const picked: ScoredLayout[] = []
	const seen = new Set<string>()
	for (const candidate of candidates) {
		const sig = `${candidate.features.rows}-${candidate.features.n}-${candidate.features.bigIdx}-${Math.round(candidate.features.diagRatio * 4)}-${Math.round(candidate.features.bleedRatio * 4)}`
		if (!seen.has(sig) || picked.length < returnCount) {
			picked.push(candidate)
			seen.add(sig)
		}
		if (picked.length >= returnCount) break
	}
	return { top: picked.slice(0, returnCount), ms: Math.max(1, Math.round(performance.now() - t0)) }
}

export interface FlowHop {
	index: number
	x: number
	y: number
}

export function readingOrderAudit(layout: Omit<Layout, 'seed'>): { hops: FlowHop[]; warnings: string[] } {
	const hops = layout.panels.map((panel, index) => {
		const [x, y] = centroid(panel.pts)
		return { index: index + 1, x, y }
	})
	const warnings: string[] = []
	for (let i = 0; i < layout.panels.length - 1; i += 1) {
		const curr = layout.panels[i]
		const next = layout.panels[i + 1]
		const a = hops[i]
		const b = hops[i + 1]
		if (curr.row === next.row && curr.sub === next.sub && b.x > a.x + 12) {
			warnings.push(`第 ${i + 1}→${i + 2} 格违反右起阅读顺序`)
		}
		if (curr.row < next.row && b.y < a.y - 18) {
			warnings.push(`第 ${i + 1}→${i + 2} 格出现向上逆跳`)
		}
	}
	return { hops, warnings }
}

export function asScenario(value: string): Scenario {
	return (SCENARIOS.includes(value as Scenario) ? value : 'establishing') as Scenario
}
