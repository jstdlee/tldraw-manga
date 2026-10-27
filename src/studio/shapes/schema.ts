import type { TLBaseShape } from 'tldraw'
import type { BubbleStyle, ProsodyStyle } from '../model'
import type { BlockId } from '../prompts/library'

export const CONTAINER = 'manga-container' as const
export const CARD = 'manga-card' as const
export const PROMPT = 'manga-prompt' as const
export const BUBBLE = 'manga-bubble' as const

export type ContainerRole = 'bible' | 'chapter' | 'page'
export type CardKind = 'character' | 'story' | 'world' | 'environment' | 'note' | 'image'

export type MangaContainer = TLBaseShape<
	typeof CONTAINER,
	{
		w: number
		h: number
		role: ContainerRole
		title: string
		subtitle: string
		story: string
		worldRules: string
		stylePreset: string
		mood: string
		environment: string
		lighting: string
		chapterIndex: number
		pageIndex: number
		scenario: string
		layoutPreset: string
		dialogueDensity: number
		targetPanels: number
		seed: string
		genomeJson: string
		panelsJson: string
		scriptJson: string
		score: number
		reasonsJson: string
		showFlow: boolean
		selectedPanel: number
		showBubblesLayer?: boolean
		showProsodyLayer?: boolean
		showSfxLayer?: boolean
		contextJson?: string
	}
>

export type MangaCard = TLBaseShape<
	typeof CARD,
	{
		w: number
		h: number
		kind: CardKind
		title: string
		tag: string
		body: string
		voice: string
		locked: boolean
		imageDataUrl: string
		customPrompt: string
		aiStatus: string
	}
>

export type MangaPrompt = TLBaseShape<
	typeof PROMPT,
	{
		w: number
		h: number
		block: BlockId
		title: string
		paramsJson: string
		preview: string
	}
>

export type MangaBubble = TLBaseShape<
	typeof BUBBLE,
	{
		w: number
		h: number
		bubble: BubbleStyle
		text: string
		prosody: string
		emphasis: number
		tailX: number
		tailY: number
		panelIndex: number
		spin: number
		prosodyStyle?: ProsodyStyle | string
		prosodyOffsetX?: number
		prosodyOffsetY?: number
		prosodyScale?: number
		prosodyColor?: string
		fillColor?: string
		fontWeight?: number
	}
>

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CONTAINER]: MangaContainer['props']
		[CARD]: MangaCard['props']
		[PROMPT]: MangaPrompt['props']
		[BUBBLE]: MangaBubble['props']
	}
}
