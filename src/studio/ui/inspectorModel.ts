// =============================================================================
// inspectorModel.ts — pure mapping from the current canvas selection to the
// contextual Inspector tab. The Inspector never stacks panels: a single
// selection reducer picks exactly one tab. Masters and Theory are reference
// tabs the user opens explicitly; they are never derived from a shape selection.
// =============================================================================

/** Inspector tab identifiers. The first five are selection-driven; the last two
 * are reference libraries opened from the source list or command palette. */
export type InspectorTab = 'cards' | 'layout' | 'story' | 'camera' | 'llm' | 'masters' | 'theory'

/** What kind of shape (if any) the canvas selection resolves to. */
export type CanvasSelectionKind = 'none' | 'page' | 'panel' | 'bubble' | 'card'

/** Tabs that are driven by the canvas selection (as opposed to reference tabs). */
export const SELECTION_DRIVEN_TABS: readonly InspectorTab[] = ['cards', 'layout', 'story', 'camera', 'llm']

/**
 * Resolve which Inspector tab a selection should surface.
 * - A reference/asset card -> Assets (card editing + binding live there).
 * - A balloon -> Script (balloon + prosody editing live in the Script tab).
 * - A panel cell -> Optics (per-panel camera/framing).
 * - A page frame (or nothing) -> Layout (page settings, pacing, scoring).
 */
export function resolveInspectorTab(kind: CanvasSelectionKind): InspectorTab {
	switch (kind) {
		case 'card':
			return 'cards'
		case 'bubble':
			return 'story'
		case 'panel':
			return 'camera'
		case 'page':
			return 'layout'
		case 'none':
		default:
			return 'layout'
	}
}

/** Whether switching the active selection should re-drive the Inspector tab.
 * Reference tabs (Masters/Theory) are sticky: a passive re-selection of the same
 * kind should not yank the user out of a library they deliberately opened. */
export function shouldAutoSwitchTab(current: InspectorTab, nextKind: CanvasSelectionKind): boolean {
	if (nextKind === 'none') return false
	// An explicit shape selection always re-drives, even away from a reference tab.
	return resolveInspectorTab(nextKind) !== current
}

/** The scope the Theory tab checklists filter to: page / panel / balloon. */
export type TheoryScopeKind = 'page' | 'panel' | 'balloon'

export interface TheorySelection {
	/** The resolved canvas selection kind. */
	kind: CanvasSelectionKind
	/** The page's active panel index (-1 / null when no panel is selected). */
	selectedPanel?: number | null
}

/**
 * Resolve the Theory tab scope from the canvas selection. A selected balloon →
 * 'balloon'; a selected panel (either a dedicated panel selection or a page with
 * an active panel index) → 'panel'; a page / card / empty selection → 'page'.
 * This is the automatic scope; the TheoryTab lets the user override it until the
 * selection changes again.
 */
export function resolveTheoryScope(selection: TheorySelection): TheoryScopeKind {
	if (selection.kind === 'bubble') return 'balloon'
	if (selection.kind === 'panel') return 'panel'
	const panel = selection.selectedPanel
	if (typeof panel === 'number' && panel >= 0) return 'panel'
	return 'page'
}
