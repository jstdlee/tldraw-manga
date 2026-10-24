import type { TLShape, TLShapeId } from 'tldraw'
import { BUBBLE, CARD, CONTAINER, PROMPT, type MangaBubble, type MangaCard, type MangaContainer, type MangaPrompt } from './schema'

export function isContainer(shape: TLShape | undefined): shape is MangaContainer {
	return shape?.type === CONTAINER
}

export function isCard(shape: TLShape | undefined): shape is MangaCard {
	return shape?.type === CARD
}

export function isBubble(shape: TLShape | undefined): shape is MangaBubble {
	return shape?.type === BUBBLE
}

export function isPrompt(shape: TLShape | undefined): shape is MangaPrompt {
	return shape?.type === PROMPT
}

export function isPage(shape: TLShape | undefined): shape is MangaContainer {
	return isContainer(shape) && shape.props.role === 'page'
}

export function isChapter(shape: TLShape | undefined): shape is MangaContainer {
	return isContainer(shape) && shape.props.role === 'chapter'
}

export type { TLShapeId }
