import { polygonArea, type Genome, type Layout, type LayoutConfig, generate } from './engine'

export type Scenario = 'establishing' | 'tension' | 'intimacy' | 'action' | 'reveal' | 'climax'

export const SCENARIOS: Scenario[] = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax']

export interface LayoutFeatures {
	panelCount: number
	largestPanelShare: number
	smallestPanelShare: number
	firstPanelShare: number
	lastPanelShare: number
	hierarchy: number
	tilt: number
	nestedPanels: number
	bleedEdges: number
}

const PROFILES: Record<Scenario | 'default', { idealPanels: [number, number]; hierarchy: number; tilt: number }> = {
	tension: { idealPanels: [6, 10], hierarchy: 0.7, tilt: 0.55 },
	intimacy: { idealPanels: [4, 8], hierarchy: 0.25, tilt: 0.1 },
	action: { idealPanels: [6, 12], hierarchy: 0.65, tilt: 0.8 },
	reveal: { idealPanels: [5, 9], hierarchy: 0.9, tilt: 0.45 },
	establishing: { idealPanels: [4, 7], hierarchy: 0.65, tilt: 0.15 },
	climax: { idealPanels: [5, 9], hierarchy: 0.95, tilt: 0.5 },
	default: { idealPanels: [5, 8], hierarchy: 0.55, tilt: 0.35 },
}

export function asScenario(value: string): Scenario {
	if (
		value === 'establishing' ||
		value === 'tension' ||
		value === 'intimacy' ||
		value === 'action' ||
		value === 'reveal' ||
		value === 'climax'
	) {
		return value
	}
	return 'tension'
}

export function layoutFeatures(layout: { genome: Genome; panels: { pts: [number, number][] }[] }): LayoutFeatures {
	const areas = layout.panels.map((panel) => polygonArea(panel.pts))
	const total = areas.reduce((sum, area) => sum + area, 0) || 1
	const shares = areas.map((area) => area / total)
	const tilts = [
		...(layout.genome.rowTilt || []),
		...layout.genome.rows.flatMap((row) => row.colTilt || []),
	]
	const nestedPanels = layout.genome.rows.reduce((sum, row) => sum + row.panels.filter((panel) => panel.nest).length, 0)
	const bleedEdges = layout.genome.rows.reduce(
		(sum, row) => sum + row.panels.reduce((panelSum, panel) => panelSum + ['bT', 'bB', 'bR', 'bL'].filter((edge) => panel[edge as 'bT']).length, 0),
		0,
	)
	return {
		panelCount: layout.panels.length,
		largestPanelShare: Math.max(...shares, 0),
		smallestPanelShare: shares.length ? Math.min(...shares) : 0,
		firstPanelShare: shares[0] || 0,
		lastPanelShare: shares[shares.length - 1] || 0,
		hierarchy: (shares.length ? Math.max(...shares) : 0) - (shares.length ? Math.min(...shares) : 0),
		tilt: Math.min(1, tilts.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, tilts.length)),
		nestedPanels,
		bleedEdges,
	}
}

function rangeFit(value: number, range: [number, number]): number {
	if (value >= range[0] && value <= range[1]) return 1
	const distance = value < range[0] ? range[0] - value : value - range[1]
	return Math.max(0, 1 - distance / Math.max(1, range[1] - range[0] + 2))
}

export function layoutScore(features: LayoutFeatures, desiredPanels: number, scenario: Scenario): { score: number; reasons: string[] } {
	const profile = PROFILES[scenario] ?? PROFILES.default
	const panelFit = 1 - Math.min(1, Math.abs(features.panelCount - desiredPanels) / Math.max(3, desiredPanels))
	const scenarioPanelFit = rangeFit(features.panelCount, profile.idealPanels)
	const hierarchyFit = 1 - Math.min(1, Math.abs(features.hierarchy - profile.hierarchy))
	const tiltFit = 1 - Math.min(1, Math.abs(features.tilt - profile.tilt))
	const readability = Math.max(0, 1 - Math.max(0, features.panelCount - 12) * 0.055 - Math.max(0, 0.025 - features.smallestPanelShare) * 8)
	const focus =
		scenario === 'reveal' || scenario === 'climax'
			? Math.min(1, features.lastPanelShare * 1.8 + features.largestPanelShare * 0.55)
			: scenario === 'establishing'
				? Math.min(1, features.firstPanelShare * 1.7 + features.largestPanelShare * 0.45)
				: 1
	const rhythm =
		scenario === 'intimacy'
			? Math.max(0, 1 - features.hierarchy * 0.7 - features.tilt * 0.5)
			: Math.min(1, features.hierarchy * 0.7 + features.tilt * 0.4 + (features.nestedPanels > 0 ? 0.12 : 0))
	const score =
		Math.round((panelFit * 0.28 + scenarioPanelFit * 0.18 + hierarchyFit * 0.18 + tiltFit * 0.12 + readability * 0.12 + focus * 0.07 + rhythm * 0.05) * 1000) / 1000
	const reasons: string[] = []
	if (panelFit >= 0.8) reasons.push('格数贴近目标')
	if (profile.hierarchy >= 0.7 && features.hierarchy >= 0.45) reasons.push('大小层次清楚')
	if (profile.hierarchy <= 0.35 && features.hierarchy <= 0.55) reasons.push('尺度平静，适合对话')
	if (profile.tilt >= 0.6 && features.tilt >= 0.2) reasons.push('斜切带有动势')
	if (profile.tilt <= 0.2 && features.tilt <= 0.45) reasons.push('倾斜克制，阅读稳定')
	if (focus >= 0.7) reasons.push('入口或落幅有焦点')
	if (reasons.length === 0) reasons.push('节奏与可读性平衡')
	return { score, reasons: reasons.slice(0, 3) }
}

export interface RankedLayout {
	seed: string
	layout: Layout
	score: number
	reasons: string[]
}

export function pickTopLayouts(
	baseSeed: string,
	config: LayoutConfig,
	desiredPanels: number,
	scenario: Scenario,
	count = 36,
): { top: RankedLayout[]; ms: number } {
	const started = performance.now()
	const ranked: RankedLayout[] = []
	for (let index = 0; index < count; index += 1) {
		const seed = `${baseSeed}#${index}`
		const layout = generate(seed, config)
		const judged = layoutScore(layoutFeatures(layout), desiredPanels, scenario)
		ranked.push({ seed, layout, score: judged.score, reasons: judged.reasons })
	}
	ranked.sort((a, b) => b.score - a.score || Math.abs(a.layout.panels.length - desiredPanels) - Math.abs(b.layout.panels.length - desiredPanels))
	return { top: ranked.slice(0, 4), ms: performance.now() - started }
}
