// =============================================================================
// stageOps.ts — the per-page "operator actions" that fold the useful parts of
// the retired Pipeline Operator Nodes grid into the new shell. Each of the five
// stages exposes one idempotent, one-click action that runs for a single page,
// plus a "run from here forward" helper. These are surfaced in the Page
// Inspector's Pipeline disclosure and mirrored in the Cmd-K palette. None of
// them regenerate images — Stage 4 only recompiles the pure-art prompt.
// =============================================================================

import { type Editor, type TLShapeId } from 'tldraw'
import type { AppStage } from '../library/productionStages'
import { CONTAINER, type MangaContainer } from '../shapes/schema'
import {
	recompilePromptsStage4,
	relayoutLetteringStage5,
	relayoutPageStage3,
	runJevFiveStageCompile,
	spawnStage1AssetSheetCardsOnCanvas,
} from './pipeline'

export interface StageOpDef {
	stage: AppStage
	/** Short imperative label for the button / command title. */
	title: string
	/** One-line description for the tooltip and palette subtitle. */
	summary: string
}

/** The one canonical operator action per stage, in pipeline order. */
export const STAGE_OPS: readonly StageOpDef[] = [
	{ stage: 1, title: 'Materialize Asset Sheets', summary: 'Place this page’s Stage 1 reference asset sheets on the canvas' },
	{ stage: 2, title: 'Compile Storyboard', summary: 'Run the JEV decision: beats → camera lock → layout → lettering' },
	{ stage: 3, title: 'Recompute Layout', summary: 'Re-solve the tension-coupled panel layout · artwork untouched' },
	{ stage: 4, title: 'Recompile Art Prompts', summary: 'Rebuild the asset-locked pure-art prompt per panel · artwork untouched' },
	{ stage: 5, title: 'Relayout Lettering', summary: 'Re-place balloons and reading flow for the current layout' },
]

/** Resolve the active page to operate on: the given one, else the first page. */
function resolvePage(editor: Editor, pageId?: TLShapeId): MangaContainer | null {
	if (pageId) {
		const shape = editor.getShape<MangaContainer>(pageId)
		if (shape && shape.type === CONTAINER && shape.props.role === 'page') return shape
	}
	return (
		editor
			.getCurrentPageShapes()
			.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
			.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))[0] ?? null
	)
}

/**
 * Run a single stage's operator action for one page. The page is selected first
 * so the stage runners (which operate on the selection) target it deterministically.
 * Returns a human-readable status string.
 */
export async function runStageOpForPage(editor: Editor, pageId: TLShapeId | undefined, stage: AppStage): Promise<string> {
	const page = resolvePage(editor, pageId)
	if (!page) return 'Add a page first to run the pipeline'
	editor.select(page.id)
	const label = page.props.title
	switch (stage) {
		case 1:
			return spawnStage1AssetSheetCardsOnCanvas(editor, page)
		case 2:
			return runJevFiveStageCompile(editor)
		case 3:
			relayoutPageStage3(editor, page.id)
			return `Stage 3 · recomputed layout for ${label}`
		case 4:
			recompilePromptsStage4(editor, page.id)
			return `Stage 4 · recompiled art prompts for ${label}`
		case 5:
			relayoutLetteringStage5(editor, page.id)
			return `Stage 5 · re-placed lettering for ${label}`
		default:
			return 'Unknown stage'
	}
}

/**
 * Run `fromStage` and every downstream stage for one page. Stage 2's JEV compile
 * already cascades into layout + lettering, so the sweep stops after stage 2 to
 * avoid redundant recomputation; from stage 3 onward it runs each runner in turn.
 */
export async function runStagesFromForPage(editor: Editor, pageId: TLShapeId | undefined, fromStage: AppStage): Promise<string> {
	const page = resolvePage(editor, pageId)
	if (!page) return 'Add a page first to run the pipeline'
	const ran: AppStage[] = []
	for (const op of STAGE_OPS) {
		if (op.stage < fromStage) continue
		await runStageOpForPage(editor, page.id, op.stage)
		ran.push(op.stage)
		// The JEV compile already produces layout + lettering, so stop after it.
		if (op.stage === 2) break
	}
	return `Ran Stage ${ran.join(' → ')} for ${page.props.title}`
}
