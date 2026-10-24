import { configFor, pagePixelSize, type Genome, type Layout } from '../layout/engine'
import { asScenario, pickTopLayouts, type RankedLayout } from '../layout/score'
import { fitBeats, metaFromBeat, silentBeat, type Beat, type PageDraft, type PanelMeta } from '../model'
import type { MangaContainer } from '../shapes/schema'

export interface BuiltPage {
	layout: Layout
	beats: Beat[]
	metas: PanelMeta[]
	score: number
	reasons: string
	top: RankedLayout[]
}

export function buildPage(draft: PageDraft, variant = 0): BuiltPage {
	const config = configFor(draft.layoutPreset, draft.beats.length || draft.targetPanels)
	const { top } = pickTopLayouts(draft.seed, config, draft.beats.length || draft.targetPanels, asScenario(draft.scenario), 36)
	const chosen = top[Math.abs(variant) % Math.max(1, top.length)] ?? top[0]
	const beats = fitBeats(draft.beats.length ? draft.beats : [silentBeat(0), silentBeat(1), silentBeat(2)], chosen.layout.panels.length)
	const metas = chosen.layout.panels.map((panel, index) => metaFromBeat(beats[index] ?? silentBeat(index), panel, draft.seed, index))
	return { layout: chosen.layout, beats, metas, score: chosen.score, reasons: chosen.reasons, top }
}

export function emptyContainer(role: MangaContainer['props']['role']): MangaContainer['props'] {
	const size = role === 'page' ? pagePixelSize() : role === 'bible' ? { w: 500, h: 820 } : { w: 380, h: 300 }
	const props: MangaContainer['props'] = {
		w: size.w,
		h: size.h,
		role,
		title: role === 'bible' ? '设定' : role === 'chapter' ? '第1话' : 'P1',
		subtitle: '',
		story: '',
		worldRules: '',
		stylePreset: '少年网点',
		mood: '',
		environment: 'boardwalk',
		lighting: 'hard-noon',
		scenario: role === 'page' ? 'tension' : '',
		targetPanels: 4,
		layoutPreset: 'std',
		dialogueDensity: 40,
		seed: 'page',
		variant: 0,
		mutation: 0,
		showFlow: false,
		score: 0,
		chapterIndex: role === 'chapter' ? 1 : 0,
		pageIndex: role === 'page' ? 1 : 0,
		genomeJson: '{}',
		panelsJson: '[]',
		scriptJson: '[]',
	}
	if (role === 'page') {
		const built = buildPage({
			scenario: 'tension',
			layoutPreset: 'std',
			dialogueDensity: 40,
			targetPanels: 4,
			seed: 'blank-page',
			showFlow: false,
			beats: [silentBeat(0), silentBeat(1), silentBeat(2), silentBeat(3)],
		})
		props.genomeJson = JSON.stringify(built.layout.genome)
		props.panelsJson = JSON.stringify(built.metas)
		props.scriptJson = JSON.stringify(built.beats)
		props.score = built.score
	}
	return props
}

export function genomeOf(raw: string): Genome {
	try {
		return JSON.parse(raw) as Genome
	} catch {
		return { rowW: [1], rowTilt: [], rows: [] }
	}
}
