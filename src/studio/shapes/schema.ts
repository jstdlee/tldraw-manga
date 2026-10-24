import type { TLShape } from 'tldraw'

export const CONTAINER = 'manga-container'
export const CARD = 'manga-card'
export const BUBBLE = 'manga-bubble'
export const PROMPT = 'manga-prompt-block'

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		[CONTAINER]: {
			w: number
			h: number
			role: 'bible' | 'chapter' | 'page'
			title: string
			subtitle: string
			story: string
			worldRules: string
			stylePreset: string
			mood: string
			environment: string
			lighting: string
			scenario: string
			targetPanels: number
			layoutPreset: string
			dialogueDensity: number
			seed: string
			variant: number
			mutation: number
			showFlow: boolean
			score: number
			chapterIndex: number
			pageIndex: number
			genomeJson: string
			panelsJson: string
			scriptJson: string
		}
		[CARD]: {
			w: number
			h: number
			kind: 'character' | 'story' | 'world' | 'environment' | 'note'
			tag: string
			title: string
			body: string
			voice: string
			locked: boolean
			imageSeed: string
		}
		[BUBBLE]: {
			w: number
			h: number
			bubble: 'speech' | 'thought' | 'caption' | 'whisper' | 'shout' | 'broadcast' | 'sfx'
			text: string
			prosody: string
			emphasis: number
			tailX: number
			tailY: number
			panelIndex: number
			spin: number
		}
		[PROMPT]: {
			w: number
			h: number
			block: 'extract' | 'chapterize' | 'name' | 'camera' | 'random' | 'render'
			title: string
			paramsJson: string
			preview: string
		}
	}
}

export type MangaContainer = TLShape<typeof CONTAINER>
export type MangaCard = TLShape<typeof CARD>
export type MangaBubble = TLShape<typeof BUBBLE>
export type MangaPrompt = TLShape<typeof PROMPT>
