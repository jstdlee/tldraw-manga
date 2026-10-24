import { useSyncExternalStore } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { SEAGULL_TEXT } from '../demo/book'

export interface LayoutChoice {
	score: number
	reasons: string
	genomeJson: string
	width: number
	height: number
	panels: Array<{ pts: [number, number][] }>
}

export type StudioModal =
	| null
	| { kind: 'reader'; title: string; html: string }
	| { kind: 'json'; title: string; text: string }
	| { kind: 'settings' }
	| { kind: 'layouts'; pageId: TLShapeId; title: string; choices: LayoutChoice[] }

export interface StudioState {
	editor: Editor | null
	story: string
	toast: string
	modal: StudioModal
	wiringFrom: TLShapeId | null
	crop: { pageId: TLShapeId; panel: number } | null
	busy: string
}

let state: StudioState = {
	editor: null,
	story: SEAGULL_TEXT,
	toast: '',
	modal: null,
	wiringFrom: null,
	crop: null,
	busy: '',
}

const listeners = new Set<() => void>()
let toastTimer = 0

function emit() {
	for (const listener of listeners) listener()
}

export function getState(): StudioState {
	return state
}

export function patch(partial: Partial<StudioState>) {
	state = { ...state, ...partial }
	emit()
}

export function notify(message: string) {
	clearTimeout(toastTimer)
	patch({ toast: message })
	toastTimer = setTimeout(() => {
		if (getState().toast === message) patch({ toast: '' })
	}, 4600) as unknown as number
}

export function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useStudio() {
	return useSyncExternalStore(subscribe, getState, getState)
}
