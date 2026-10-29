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

/**
 * Optional additive deltas on a scenario's layout-scoring weights. Produced by the
 * style-master blend layer (see src/studio/library/blend.ts). When omitted, layout
 * scoring is byte-identical to the unbiased path, so existing output never changes.
 */
export interface ScenarioWeightBias {
	big?: number
	diag?: number
	bleed?: number
	cv?: number
	rhythm?: number
	aspect?: number
}

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
		title: 'Opening Setup · Establish Space',
		subtitle: 'Large opening panel sets tone, followed by steady character reaction cuts',
		rhythm: 'Front-heavy rhythm (Panel 1 takes 30%+ to anchor world coordinates, then smooth MS/MCU transitions)',
		camera: 'Recommended 18mm–28mm wide high/eye-level (EWS → MS → MCU)',
		bleedTip: 'Enable top/right bleed on Panel 1 to expand spatial breathing room',
		silentTip: 'Keep Panel 1 or transition panel light on text so the eye enters the scene first',
		recommendedPreset: 'std',
		recommendedTilt: 0.18,
		recommendedBleed: 0.25,
		recommendedBig: 0.35,
		silentPanelOffset: 0,
	},
	tension: {
		scenario: 'tension',
		title: 'Suspense & Pressure · Closing In',
		subtitle: 'Dense narrow panels compress breathing room and sharpen eyeline clashes',
		rhythm: 'Tighter panel count (4–6 panels) with narrow slices for countdown urgency',
		camera: 'Recommended 50mm–85mm telephoto compression + low/dutch angles (MCU → CU → ECU)',
		bleedTip: 'Keep early panels enclosed in tight borders; break frame only on the final beat',
		silentTip: 'Set the pre-climax panel as a silent Ma beat focusing on eyes or micro-action',
		recommendedPreset: 'seizen',
		recommendedTilt: 0.28,
		recommendedBleed: 0.12,
		recommendedBig: 0.18,
		silentPanelOffset: -2,
	},
	intimacy: {
		scenario: 'intimacy',
		title: 'Intimate Quiet · Emotional Negative Space',
		subtitle: 'Orthogonal calm borders with generous negative space for subtext',
		rhythm: 'Low slant (Tilt <= 10%), unhurried pacing, wide negative space carrying subtext',
		camera: 'Recommended 35mm–50mm eye-level standard lens with shallow DOF (MS ↔ CU)',
		bleedTip: 'Single-edge bleed on memory or resonance panels creates lingering aftertaste',
		silentTip: 'Insert a wordless pillow shot after key dialogue (wind, hem, or shadow)',
		recommendedPreset: 'seizen',
		recommendedTilt: 0.06,
		recommendedBleed: 0.15,
		recommendedBig: 0.22,
		silentPanelOffset: -2,
	},
	action: {
		scenario: 'action',
		title: 'Kinetic Action · Frame-Breaking Speed',
		subtitle: 'Sharp diagonal gutters and bold bleed amplify kinetic flow',
		rhythm: 'High size contrast (CV >= 0.45) with diagonal cuts guiding rapid eye descent',
		camera: 'Recommended 18mm ultra-wide foreshortening + low/dutch angles (rapid WS ↔ CU cuts)',
		bleedTip: 'Enable 2- or 3-edge bleed on the impact panel to shatter the safe margin',
		silentTip: 'Drop dialogue on the impact frame; leave pure visual force or a single SFX',
		recommendedPreset: 'action',
		recommendedTilt: 0.62,
		recommendedBleed: 0.5,
		recommendedBig: 0.42,
		silentPanelOffset: -2,
	},
	reveal: {
		scenario: 'reveal',
		title: 'Dramatic Reveal · Page-Turn Hook',
		subtitle: 'Restrained setup in early panels, landing the reveal in a dominant hero frame',
		rhythm: '2–3 compact setup panels before expanding into a 38%+ reveal frame',
		camera: 'Early occluded close-ups (CU) cutting to a wide reveal or impact MCU',
		bleedTip: 'Open left/bottom bleed on the reveal panel to pull the eye toward the page turn',
		silentTip: 'Keep the panel right before the reveal completely silent to maximize tension',
		recommendedPreset: 'tobira',
		recommendedTilt: 0.35,
		recommendedBleed: 0.6,
		recommendedBig: 0.62,
		silentPanelOffset: -2,
	},
	climax: {
		scenario: 'climax',
		title: 'Climax Impact · Finale Freeze',
		subtitle: 'Concentrated visual gravity across the page with a silent pause before impact',
		rhythm: 'Extreme hierarchy contrast (hero panel 42%+), backed by 2–3 rapid cuts',
		camera: '18mm extreme low angle or 85mm eye ECU (ECU → EWS epic freeze)',
		bleedTip: 'Wide bleed on hero panel (>= 65%) releasing peak emotional tension',
		silentTip: 'Force a silent Ma panel right before the burst for quiet-to-explosive contrast',
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

export function layoutScore(
	features: LayoutFeatures,
	targetPanels: number,
	scenario: Scenario,
	styleBias?: ScenarioWeightBias,
): EditorialScoreResult {
	const baseW = WEIGHTS[scenario] ?? WEIGHTS.establishing
	// Applying a style bias only ever adds deltas to the numeric weights; the hero
	// placement rule is untouched. With no bias the object is the base weights
	// verbatim, preserving identical scoring.
	const w = styleBias
		? {
				...baseW,
				big: baseW.big + (styleBias.big ?? 0),
				diag: baseW.diag + (styleBias.diag ?? 0),
				bleed: baseW.bleed + (styleBias.bleed ?? 0),
				cv: baseW.cv + (styleBias.cv ?? 0),
				rhythm: baseW.rhythm + (styleBias.rhythm ?? 0),
				aspect: baseW.aspect + (styleBias.aspect ?? 0),
			}
		: baseW
	const reasons: string[] = []
	const deficits: string[] = []
	const mutations: string[] = []
	const remedies: EditorialRemedy[] = []

	const countDiff = Math.abs(features.n - targetPanels)
	const countScore = Math.max(0, 1 - countDiff * 0.28)
	if (countDiff === 0) reasons.push(`Exact panel count (${features.n})`)
	else if (countDiff === 1) reasons.push(`Near target count (${features.n}/${targetPanels})`)
	else {
		deficits.push(`Panel count (${features.n}) deviates from target script beats (${targetPanels})`)
		mutations.push(`Adjust row count or subsplit rate to align with ${targetPanels} panels`)
		remedies.push({
			actionLabel: '', description: '',
			id: 'split-dense',
			label: 'Calibrate Panel Count',
			detail: `Align panel density to target ${targetPanels} panels`,
		})
	}

	let heroBonus = 0.55
	if (w.heroWhere === 'first' && features.bigIdx === 0) {
		heroBonus = 1
		reasons.push('Strong opening anchor')
	} else if (w.heroWhere === 'last' && features.bigIdx >= features.n - 2) {
		heroBonus = 1
		reasons.push('Strong final-panel hook')
	} else if (w.heroWhere === 'mid' && features.bigIdx > 0 && features.bigIdx < features.n - 1) {
		heroBonus = 1
		reasons.push('Balanced mid-page anchor')
	} else if (w.heroWhere === 'any' && features.bigShare > 0.28) {
		heroBonus = 1
		reasons.push(`Hero panel dominance (${Math.round(features.bigShare * 100)}%)`)
	}

	if (features.bigShare < 0.24 && (scenario === 'climax' || scenario === 'reveal' || scenario === 'action')) {
		deficits.push(`Hero panel share is low (${Math.round(features.bigShare * 100)}%), lacking visual dominance`)
		mutations.push('Increase Hero Weight (Big >= 40%) to widen visual hierarchy')
		remedies.push({
			actionLabel: '', description: '',
			id: 'expand-hero',
			label: 'Amplify Hero Panel',
			detail: 'Boost hero row/column weights to emphasize the key dramatic beat',
		})
	}

	if (features.lastShare < 0.14 && features.n >= 4) {
		deficits.push(`Final panel share is small (${Math.round(features.lastShare * 100)}%), weakening the page-turn hook`)
		mutations.push('Enlarge final panel and enable left/bottom bleed to strengthen the page-turn pull')
		remedies.push({
			actionLabel: '', description: '',
			id: 'bleed-last-hook',
			label: 'Boost Page-Turn Hook',
			detail: 'Enable bottom-left bleed on the final panel and expand bottom row height',
		})
	}

	const bigNorm = Math.min(1, features.bigShare / 0.42)
	const cvNorm = Math.min(1, features.cv / 0.55)
	const rhythmNorm = Math.min(1, features.vRhythm / 0.45)
	const aspectNorm = Math.min(1, features.aspectSpread / 0.65)
	const diagTerm =
		w.diag >= 0 ? features.diagRatio * w.diag : (1 - features.diagRatio) * -w.diag * 0.8 + (features.diagRatio === 0 ? 0.08 : 0)

	if (w.diag > 0.15 && features.diagRatio > 0.35) {
		reasons.push(`Diagonal tension (${Math.round(features.diagRatio * 100)}%)`)
	} else if (w.diag > 0.18 && features.diagRatio < 0.18) {
		deficits.push('Dividers are too orthogonal; action/conflict scene lacks kinetic speed')
		mutations.push('Increase Tilt to 40%–60% for kinetic diagonal gutters')
		remedies.push({
			actionLabel: '', description: '',
			id: 'boost-tilt',
			label: 'Inject Diagonal Kinetic Cut',
			detail: 'Add diagonal slant to row/column gutters for visual velocity',
		})
	}

	if (w.diag < 0 && features.diagRatio < 0.15) {
		reasons.push('Calm orthogonal framing')
	} else if (w.diag < -0.1 && features.diagRatio > 0.35) {
		deficits.push('Excessive diagonal cuts disrupt the calm rhythm of an intimate/setup scene')
		mutations.push('Reduce Tilt (<= 15%) to restore orthogonal panel framing')
		remedies.push({
			actionLabel: '', description: '',
			id: 'calm-tilt',
			label: 'Restore Orthogonal Framing',
			detail: 'Reduce divider slant for composed orthogonal storytelling',
		})
	}

	if (features.bleedRatio > 0.22 && w.bleed > 0.2) {
		reasons.push('Frame-breaking bleed')
	} else if (w.bleed >= 0.28 && features.bleedRatio < 0.15) {
		deficits.push('All edges are boxed in; lacks spatial release from full-bleed panels')
		mutations.push('Enable edge bleed on the hero or final panel to break the trim margin')
		if (!remedies.some((r) => r.id === 'bleed-last-hook')) {
			remedies.push({
				id: 'bleed-last-hook',
				label: 'Enable Hero/Final Bleed',
				detail: 'Open outer bleed on key panels to expand spatial impact',
			})
		}
	}

	if (features.cv > 0.38) reasons.push('Clear size hierarchy')

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
		deficits.push('Layout topology is balanced with clear reading flow')
	}
	if (mutations.length === 0) {
		mutations.push('Try fine-tuning per-panel edge bleed or inserting a silent Ma beat before the climax')
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
	styleBias?: ScenarioWeightBias,
): { top: ScoredLayout[]; ms: number } {
	const t0 = performance.now()
	const candidates: ScoredLayout[] = []
	for (let i = 0; i < count; i += 1) {
		const candidateSeed = i === 0 ? baseSeed : `${baseSeed}~${i}`
		const layout = generate(candidateSeed, config)
		const features = layoutFeatures(layout)
		const judged = layoutScore(features, targetPanels, scenario, styleBias)
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
			warnings.push(`Panel ${i + 1}→${i + 2} violates right-to-left reading order`)
		}
		if (curr.row < next.row && b.y < a.y - 18) {
			warnings.push(`Panel ${i + 1}→${i + 2} jumps upward against reading flow`)
		}
	}
	return { hops, warnings }
}

export function asScenario(value: string): Scenario {
	return (SCENARIOS.includes(value as Scenario) ? value : 'establishing') as Scenario
}
