import { boundsOf, clamp, pagePixelSize, type Layout } from '../layout/engine'
import {
	solveAntiOcclusionBubblePlacement,
	solveOnDemandBubbleAndSfxGates,
	type NormalizedBox,
} from '../jev/fiveStageEngine'
import type { Beat, PanelMeta } from '../model'
import { inferProsodyStyleFromText, type BubbleDraw } from '../render/bubbles'
import type { PageBubble, PagePanel, PageRenderModel } from '../render/pageSvg'

const ANCHORS: Record<string, [number, number]> = {
	'top-left': [0.28, 0.22],
	'top-right': [0.72, 0.2],
	center: [0.5, 0.4],
	'bottom-left': [0.3, 0.76],
	'bottom-right': [0.7, 0.74],
}

export interface PlannedBubble extends BubbleDraw {
	panelIndex: number
	x: number
	y: number
}

export function planBubbles(layout: Layout, beats: Beat[], pageW = pagePixelSize().w, pageH = pagePixelSize().h): PlannedBubble[] {
	const sx = pageW / layout.width
	const sy = pageH / layout.height
	const planned: PlannedBubble[] = []
	layout.panels.forEach((panel, panelIndex) => {
		const beat = beats[panelIndex]
		if (!beat) return
		const gates = solveOnDemandBubbleAndSfxGates({
			silent: beat.silent,
			wordPictureMode: beat.wordPictureMode,
			transition: beat.mccloudTransition,
			tension: beat.tension ?? 0.5,
			lines: beat.lines,
		})
		if (!gates.hasBubble && !gates.hasSfx) return
		const box = boundsOf(panel.pts)
		const boxW = box.maxX - box.minX
		const boxH = box.maxY - box.minY
		const focalRel = beat.focalPointRel ?? [0.5, 0.58]
		const subjectBoxesRel: NormalizedBox[] = beat.subjectBoxesRel ?? [
			[
				clamp(focalRel[0] - 0.24, 0, 1),
				clamp(focalRel[1] - 0.34, 0, 1),
				clamp(focalRel[0] + 0.24, 0, 1),
				clamp(focalRel[1] + 0.34, 0, 1),
			],
		]
		gates.filteredLines.forEach((line, lineIndex) => {
			const placement =
				line.placement ??
				(line.type === 'sfx' ? 'bottom-right' : line.type === 'caption' ? 'top-right' : lineIndex % 2 ? 'top-left' : 'top-right')
			const candidateRel = ANCHORS[placement] ?? ANCHORS['top-right']
			const w = (line.type === 'sfx' ? 156 : 188) * sx
			const h = (line.type === 'sfx' ? 64 : 96) * sy
			const wRel = clamp(w / sx / boxW, 0.05, 0.9)
			const hRel = clamp(h / sy / boxH, 0.05, 0.9)
			const solved =
				line.type === 'caption' || line.type === 'sfx'
					? { centerRel: candidateRel }
					: solveAntiOcclusionBubblePlacement(panel.pts, subjectBoxesRel, candidateRel, wRel, hRel)
			const [px, py] = solved.centerRel
			const cx = (box.minX + boxW * px) * sx
			const cy = (box.minY + boxH * py) * sy
			const x = cx - w / 2
			const y = cy - h / 2
			const mouthX = (box.minX + boxW * focalRel[0]) * sx
			const mouthY = (box.minY + boxH * focalRel[1]) * sy
			let dx = mouthX - cx
			let dy = mouthY - cy
			const len = Math.hypot(dx, dy) || 1
			const max = 92
			if (len > max) {
				dx = (dx / len) * max
				dy = (dy / len) * max
			}
			const tailless = line.type === 'caption' || line.type === 'broadcast' || line.type === 'sfx'
			const prosody = line.prosody ?? ''
			const prosodyStyle = inferProsodyStyleFromText(prosody, line.prosodyStyle)
			planned.push({
				style: line.type,
				text: line.text,
				prosody,
				prosodyStyle,
				prosodyOffsetX: line.prosodyOffsetX ?? 0,
				prosodyOffsetY: line.prosodyOffsetY ?? 0,
				prosodyScale: line.prosodyScale ?? 1,
				prosodyColor: line.prosodyColor ?? '',
				fillColor: '#fffefb',
				fontWeight: line.type === 'shout' || line.type === 'sfx' ? 800 : 600,
				emphasis: line.type === 'shout' || line.type === 'sfx' ? 1.3 : prosody === '低语' ? 0.85 : 1,
				panelIndex,
				x,
				y,
				w,
				h,
				tailX: tailless ? w / 2 : w / 2 + dx,
				tailY: tailless ? h / 2 : h / 2 + dy,
				spin: line.type === 'sfx' ? -8 : 0,
			})
		})
	})
	return planned
}

export function toLayoutBubbles(bubbles: PlannedBubble[], pageW: number, pageH: number, layoutW: number, layoutH: number): PageBubble[] {
	const sx = layoutW / pageW
	const sy = layoutH / pageH
	return bubbles.map((bubble) => ({
		...bubble,
		x: bubble.x * sx,
		y: bubble.y * sy,
		w: bubble.w * sx,
		h: bubble.h * sy,
		tailX: bubble.tailX * sx,
		tailY: bubble.tailY * sy,
		prosodyOffsetX: (bubble.prosodyOffsetX ?? 0) * sx,
		prosodyOffsetY: (bubble.prosodyOffsetY ?? 0) * sy,
	}))
}

export function energyFor(scenario: string, fries: string): string {
	if (fries === 'air') return 'impact'
	if (scenario === 'action' || scenario === 'climax') return 'action'
	return 'calm'
}

export function pageModel(input: {
	uid: string
	title: string
	width: number
	height: number
	inner: PageRenderModel['inner']
	panels: { pts: PagePanel['pts']; meta: PanelMeta }[]
	environment: string
	lighting: string
	scenario: string
	bubbles: PlannedBubble[]
	pageW: number
	pageH: number
	numbers: PageRenderModel['numbers']
	director: boolean
	lineWidth?: number
	showInnerFrame?: boolean
	showRuleOfThirds?: boolean
	showAxis180?: boolean
	selectedPanel?: number
	part?: PageRenderModel['part']
}): PageRenderModel {
	return {
		uid: input.uid,
		title: input.title,
		width: input.width,
		height: input.height,
		inner: input.inner,
		panels: input.panels.map((panel) => ({
			pts: panel.pts,
			meta: panel.meta,
			environment: panel.meta.environment || input.environment,
			lighting: input.lighting,
			energy: energyFor(input.scenario, panel.meta.fries),
		})),
		bubbles: toLayoutBubbles(input.bubbles, input.pageW, input.pageH, input.width, input.height),
		numbers: input.numbers,
		director: input.director,
		lineWidth: input.lineWidth,
		showInnerFrame: input.showInnerFrame,
		showRuleOfThirds: input.showRuleOfThirds,
		showAxis180: input.showAxis180,
		selectedPanel: input.selectedPanel,
		part: input.part,
	}
}
