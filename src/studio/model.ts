import { boundsOf, closestAspect, type AspectId, type Pt, type RealizedPanel } from './layout/engine'
import type { Scenario } from './layout/score'

export type Shot = 'EWS' | 'WS' | 'MS' | 'MCU' | 'CU' | 'ECU'
export type Angle = 'low' | 'high' | 'eye' | 'bird' | 'dutch'
export type Focal = '18mm' | '35mm' | '50mm' | '85mm'
export type BubbleStyle = 'speech' | 'thought' | 'caption' | 'whisper' | 'shout' | 'broadcast' | 'sfx'
export type Prosody = '' | '冷笑' | '颤抖' | '怒吼' | '低语' | '停顿'
export type FriesProp = 'none' | 'kanta' | 'gull' | 'air' | 'jar' | 'feather'

export interface BubbleLine {
	type: BubbleStyle
	text: string
	prosody?: Prosody
	placement?: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right'
}

export interface Beat {
	shot: Shot
	angle: Angle
	focal: Focal
	beat: string
	who: string[]
	fries?: FriesProp
	lines: BubbleLine[]
	eyeline?: [number, number]
}

export interface PanelMeta {
	imageSeed: string
	imageOffsetX: number
	imageOffsetY: number
	imageScale: number
	imageRotation: number
	aspect: AspectId | string
	shot: Shot
	angle: Angle
	focal: Focal
	beat: string
	who: string[]
	fries: FriesProp
	eyeline: [number, number]
	imageDataUrl: string
	environment: string
}

export interface CharacterDraft {
	tag: string
	name: string
	appearance: string
	voice: string
	locked: boolean
}

export interface PageDraft {
	scenario: Scenario
	layoutPreset: string
	dialogueDensity: number
	targetPanels: number
	seed: string
	showFlow: boolean
	beats: Beat[]
}

export interface ChapterDraft {
	title: string
	mood: string
	environment: string
	lighting: string
	pages: PageDraft[]
}

export interface BookDraft {
	title: string
	subtitle: string
	story: string
	world: string
	stylePreset: string
	characters: CharacterDraft[]
	chapters: ChapterDraft[]
}

export function readJson<T>(raw: string, fallback: T): T {
	try {
		const value = JSON.parse(raw) as T
		return value ?? fallback
	} catch {
		return fallback
	}
}

export function silentBeat(index: number): Beat {
	return {
		shot: index % 2 ? 'CU' : 'MS',
		angle: 'eye',
		focal: '50mm',
		beat: '静帧。只留风声。',
		who: [],
		fries: 'none',
		lines: [],
		eyeline: [8, -6],
	}
}

function eyelineFor(angle: Angle): [number, number] {
	if (angle === 'low') return [6, -28]
	if (angle === 'high') return [4, 22]
	if (angle === 'bird') return [0, 18]
	if (angle === 'dutch') return [24, -8]
	return [16, -4]
}

export function metaFromBeat(beat: Beat, panel: RealizedPanel, seed: string, index: number): PanelMeta {
	const box = boundsOf(panel.pts)
	return {
		imageSeed: `${seed}-p${index}`,
		imageOffsetX: 0,
		imageOffsetY: 0,
		imageScale: 1,
		imageRotation: 0,
		aspect: closestAspect(box.maxX - box.minX, box.maxY - box.minY),
		shot: beat.shot,
		angle: beat.angle,
		focal: beat.focal,
		beat: beat.beat,
		who: beat.who,
		fries: beat.fries ?? 'none',
		eyeline: beat.eyeline ?? eyelineFor(beat.angle),
		imageDataUrl: '',
		environment: '',
	}
}

export function fitBeats(script: Beat[], count: number): Beat[] {
	if (count <= 0) return []
	if (script.length === 0) return Array.from({ length: count }, (_, index) => silentBeat(index))
	if (count === script.length) return script.map((beat) => structuredClone(beat))
	if (count > script.length) {
		const out = script.map((beat) => structuredClone(beat))
		for (let index = 0; index < count - script.length; index += 1) {
			const at = Math.max(0, out.length - 1)
			out.splice(at, 0, { ...silentBeat(index), who: out[Math.max(0, at - 1)]?.who ?? [] })
		}
		return out
	}
	if (count === 1) return [structuredClone(script[script.length - 1])]
	const middle = script.slice(0, -1)
	const step = middle.length / (count - 1)
	const picked: Beat[] = []
	for (let index = 0; index < count - 1; index += 1) picked.push(structuredClone(middle[Math.min(middle.length - 1, Math.floor(index * step))]))
	picked.push(structuredClone(script[script.length - 1]))
	return picked
}

export function refreshAspects(metas: PanelMeta[], panels: RealizedPanel[], seed: string): PanelMeta[] {
	return panels.map((panel, index) => {
		const box = boundsOf(panel.pts)
		const aspect = closestAspect(box.maxX - box.minX, box.maxY - box.minY)
		const prev = metas[index]
		if (!prev) return metaFromBeat(silentBeat(index), panel, seed, index)
		return { ...prev, aspect }
	})
}

export function safeCorner(placement: string | undefined): string {
	if (placement === 'top-left') return 'top-left'
	if (placement === 'bottom-left') return 'bottom-left'
	if (placement === 'bottom-right') return 'bottom-right'
	if (placement === 'center') return 'upper third'
	return 'top-right'
}

export function buildPanelPrompt(input: {
	environment: string
	lighting: string
	shot: string
	angle: string
	focal: string
	aspect: string
	beat: string
	locks: string
	corner: string
}): string {
	return [
		'Manga panel, black ink line art with screentone, spot red only',
		input.environment,
		input.lighting,
		`${input.shot} shot, ${input.angle} angle, ${input.focal}`,
		input.locks,
		input.beat,
		`native aspect ${input.aspect}, include 12% bleed past the panel, leave empty negative space in the ${input.corner} for a speech balloon, no face in that corner`,
		'NO text, NO letters, NO speech bubbles, NO captions, NO sound-effect lettering',
	]
		.filter(Boolean)
		.join('. ')
}

export type { Pt }
