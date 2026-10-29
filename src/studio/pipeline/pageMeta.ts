// =============================================================================
// pageMeta.ts — the thin editor-coupled bridge between the pure pipeline stores
// (dirtyStore, pageStyle, panelFactors) and a tldraw page shape's `meta` record.
// Every write funnels through a single `editor.updateShape({ meta })` so the
// three independent stores never clobber one another, and staleness marking is
// combined with style / factor writes in the same update. Re-propagation is
// orchestrated here over an injected per-stage runner map (built in the shell
// from the live pipeline functions), so this module stays free of stage logic
// and never regenerates images.
// =============================================================================

import { type Editor } from 'tldraw'
import type { AppStage } from '../library/productionStages'
import { CONTAINER, type MangaContainer } from '../shapes/schema'
import {
	clearPageRunning,
	markPageFactorDirty,
	markPageFactorsClean,
	markPageStagesRunning,
	planPageRepropagation,
	readDirtyStateFromMeta,
	writeDirtyStateToMeta,
	type MarkPageDirtyResult,
	type PageDirtyState,
} from './dirtyStore'
import { FACTOR_DEFS, type FactorId } from './factorGraph'
import {
	executeRepropagation,
	executeRepropagationAsync,
	type AsyncRepropagationHooks,
	type RepropagationRun,
	type StageRunners,
} from './repropagate'
import { writePageStyleToMeta, type PageStyleState } from '../library/pageStyle'
import { writePanelFactorsToMeta, type PanelFactorsState } from './panelFactors'

function applyMeta(editor: Editor, page: MangaContainer, meta: Record<string, unknown>): void {
	editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, meta: meta as MangaContainer['meta'] })
}

export function readPageDirty(page: MangaContainer): PageDirtyState {
	return readDirtyStateFromMeta(page.meta)
}

/** Fold a list of edited factors into one accumulated dirty state + stale summary. */
function accumulateDirty(base: PageDirtyState, factorIds: FactorId[]): MarkPageDirtyResult {
	let state = base
	const staleFactors = new Set<FactorId>()
	const staleStages = new Set<AppStage>()
	for (const factorId of factorIds) {
		const res = markPageFactorDirty(state, factorId)
		state = res.state
		res.staleFactors.forEach((f) => staleFactors.add(f))
		res.staleStages.forEach((s) => staleStages.add(s))
	}
	return {
		state,
		staleFactors: [...staleFactors],
		staleStages: [...staleStages].sort((a, b) => a - b),
	}
}

/** Mark one or more factors (and their downstream closure) stale; writes meta once. */
export function markPageFactorsStale(editor: Editor, page: MangaContainer, factorIds: FactorId[]): MarkPageDirtyResult {
	const result = accumulateDirty(readDirtyStateFromMeta(page.meta), factorIds)
	applyMeta(editor, page, writeDirtyStateToMeta(page.meta, result.state))
	return result
}

/** Persist a page's master-style blend and mark the given factors stale in one update. */
export function writePageStyleAndMarkStale(
	editor: Editor,
	page: MangaContainer,
	style: PageStyleState,
	factorIds: FactorId[],
): MarkPageDirtyResult {
	const result = accumulateDirty(readDirtyStateFromMeta(page.meta), factorIds)
	let meta = writePageStyleToMeta(page.meta, style)
	meta = writeDirtyStateToMeta(meta, result.state)
	applyMeta(editor, page, meta)
	return result
}

/** Persist the master-style blend without marking anything stale (ticks, locks). */
export function writePageStyleOnly(editor: Editor, page: MangaContainer, style: PageStyleState): void {
	applyMeta(editor, page, writePageStyleToMeta(page.meta, style))
}

/** Persist the per-panel factor source/lock state (optionally marking factors stale). */
export function writePanelFactorsAndMarkStale(
	editor: Editor,
	page: MangaContainer,
	factors: PanelFactorsState,
	factorIds: FactorId[],
): MarkPageDirtyResult {
	const result = accumulateDirty(readDirtyStateFromMeta(page.meta), factorIds)
	let meta = writePanelFactorsToMeta(page.meta, factors)
	meta = writeDirtyStateToMeta(meta, result.state)
	applyMeta(editor, page, meta)
	return result
}

export function writePanelFactorsOnly(editor: Editor, page: MangaContainer, factors: PanelFactorsState): void {
	applyMeta(editor, page, writePanelFactorsToMeta(page.meta, factors))
}

export interface RepropagationOutcome {
	message: string
	run: RepropagationRun
	stages: AppStage[]
	factors: FactorId[]
}

/**
 * Run a page's pending re-propagation: plan the stale factors topologically, flag
 * the touched stages as running, execute the supplied per-stage runners in order,
 * then clear the dirty set and the running flags. Returns null when nothing is
 * stale. Image regeneration is never part of this — only derivable Stage 3-5
 * recompute runners are expected in `runners`.
 */
export function repropagatePage(editor: Editor, page: MangaContainer, runners: StageRunners): RepropagationOutcome | null {
	const state = readDirtyStateFromMeta(page.meta)
	if (!state.dirty.length) return null
	const plan = planPageRepropagation(state)

	// Flag running first so the stage bar can reflect it, then execute.
	applyMeta(editor, page, writeDirtyStateToMeta(page.meta, markPageStagesRunning(state, plan.stages)))

	let ok = false
	let run: RepropagationRun = { order: [], ran: [], skipped: [] }
	try {
		run = executeRepropagation(plan, runners)
		ok = true
	} finally {
		// Always clear the running flags; clear the dirty set only on a completed
		// pass, so a runner that throws leaves the page marked stale for a retry.
		const latest = editor.getShape<MangaContainer>(page.id)
		const meta = latest?.meta ?? page.meta
		const base = readDirtyStateFromMeta(meta)
		const cleaned = clearPageRunning(ok ? markPageFactorsClean(base, plan.factors) : base)
		applyMeta(editor, page, writeDirtyStateToMeta(meta, cleaned))
	}

	const ranLabel = run.ran.length ? `Stage ${run.ran.join(' → ')}` : 'inputs only'
	return {
		message: `Re-propagated ${ranLabel} · cleared ${plan.factors.length} stale factor${plan.factors.length === 1 ? '' : 's'} · images untouched`,
		run,
		stages: plan.stages,
		factors: plan.factors,
	}
}

export interface AsyncRepropagationOptions {
	/** Minimum visible running duration per stage (ms); 0 disables the hold. */
	minVisibleMs?: number
	/** Injectable delay so tests run instantly and reduced-motion can skip the hold. */
	delay?: AsyncRepropagationHooks['delay']
}

/**
 * Async sibling of {@link repropagatePage}: it runs each stale stage one at a
 * time so the stage bar can show a live, per-stage `running` indicator. Each
 * stage is flagged running (and only that stage), held for a minimum visible
 * duration, executed, then flipped to done by clearing its factors. If a stage
 * runner throws, the pass stops, running flags clear, and the remaining factors
 * stay stale for a retry. Image regeneration is never part of this.
 */
export async function repropagatePageAsync(
	editor: Editor,
	page: MangaContainer,
	runners: StageRunners,
	options: AsyncRepropagationOptions = {},
): Promise<RepropagationOutcome | null> {
	const state = readDirtyStateFromMeta(page.meta)
	if (!state.dirty.length) return null
	const plan = planPageRepropagation(state)
	const pageId = page.id

	const current = (): MangaContainer | undefined => editor.getShape<MangaContainer>(pageId)
	const writeDirty = (next: PageDirtyState): void => {
		const latest = current()
		if (!latest) return
		applyMeta(editor, latest, writeDirtyStateToMeta(latest.meta, next))
	}

	let run: RepropagationRun = { order: [], ran: [], skipped: [] }
	try {
		run = await executeRepropagationAsync(plan, runners, {
			minVisibleMs: options.minVisibleMs,
			delay: options.delay,
			// Flag only this stage running so its chip pulses in isolation.
			onStageStart: (stage) => {
				const base = readDirtyStateFromMeta(current()?.meta ?? page.meta)
				writeDirty(markPageStagesRunning({ dirty: base.dirty, running: [] }, [stage]))
			},
			// Clear this stage's factors + its running flag → the chip flips to done.
			onStageDone: (stage) => {
				const base = readDirtyStateFromMeta(current()?.meta ?? page.meta)
				const stageFactors = plan.factors.filter((id) => FACTOR_DEFS[id].stage === stage)
				writeDirty(clearPageRunning(markPageFactorsClean(base, stageFactors)))
			},
		})
	} finally {
		// Belt-and-suspenders: never leave a running flag set, and clear any dirty
		// factors whose stage actually ran (a thrown runner leaves the rest stale).
		const base = readDirtyStateFromMeta(current()?.meta ?? page.meta)
		const ranFactors = plan.factors.filter((id) => run.ran.includes(FACTOR_DEFS[id].stage))
		writeDirty(clearPageRunning(markPageFactorsClean(base, ranFactors)))
	}

	const ranLabel = run.ran.length ? `Stage ${run.ran.join(' → ')}` : 'inputs only'
	return {
		message: `Re-propagated ${ranLabel} · cleared ${plan.factors.length} stale factor${plan.factors.length === 1 ? '' : 's'} · images untouched`,
		run,
		stages: plan.stages,
		factors: plan.factors,
	}
}
