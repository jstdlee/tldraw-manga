import { T } from '@tldraw/validate'
import type { MangaBubble, MangaCard, MangaContainer, MangaPrompt } from './schema'

export const containerProps: { [K in keyof MangaContainer['props']]: T.Validatable<MangaContainer['props'][K]> } = {
	w: T.number,
	h: T.number,
	role: T.literalEnum('bible', 'chapter', 'page'),
	title: T.string,
	subtitle: T.string,
	story: T.string,
	worldRules: T.string,
	stylePreset: T.string,
	mood: T.string,
	environment: T.string,
	lighting: T.string,
	scenario: T.string,
	targetPanels: T.number,
	layoutPreset: T.string,
	dialogueDensity: T.number,
	seed: T.string,
	variant: T.number,
	mutation: T.number,
	showFlow: T.boolean,
	score: T.number,
	chapterIndex: T.number,
	pageIndex: T.number,
	genomeJson: T.string,
	panelsJson: T.string,
	scriptJson: T.string,
}

export const cardProps: { [K in keyof MangaCard['props']]: T.Validatable<MangaCard['props'][K]> } = {
	w: T.number,
	h: T.number,
	kind: T.literalEnum('character', 'story', 'world', 'environment', 'note'),
	tag: T.string,
	title: T.string,
	body: T.string,
	voice: T.string,
	locked: T.boolean,
	imageSeed: T.string,
}

export const bubbleProps: { [K in keyof MangaBubble['props']]: T.Validatable<MangaBubble['props'][K]> } = {
	w: T.number,
	h: T.number,
	bubble: T.literalEnum('speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx'),
	text: T.string,
	prosody: T.string,
	emphasis: T.number,
	tailX: T.number,
	tailY: T.number,
	panelIndex: T.number,
	spin: T.number,
}

export const promptProps: { [K in keyof MangaPrompt['props']]: T.Validatable<MangaPrompt['props'][K]> } = {
	w: T.number,
	h: T.number,
	block: T.literalEnum('extract', 'chapterize', 'name', 'camera', 'random', 'render'),
	title: T.string,
	paramsJson: T.string,
	preview: T.string,
}
