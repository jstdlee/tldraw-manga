// =============================================================================
// TheoryTab.tsx — Inspector "Theory" tab (comics-theory checklists + engine
// constraints). Frameworks are disclosure groups; each checklist item is scoped
// to page / panel / balloon and filtered by the current scope control. Every
// item shows an auto status glyph (pass / warn / info from evaluateTheoryChecklists
// over a spec built from the page's panels), a manual tick persisted in the page
// meta, and — for items with an engine hook — a "Use as constraint" toggle that
// folds the item's weight effect into the layout/JEV bias and marks dependents
// stale.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { type Editor } from 'tldraw'
import {
	evaluateTheoryChecklists,
	type TheoryEvalSpec,
	type TheoryStatus,
} from '../../library/blend'
import {
	isChecklistTicked,
	isConstrainableChecklistId,
	isConstraintEnabled,
	readPageStyleFromMeta,
	setTheoryTick,
	toggleTheoryConstraint,
} from '../../library/pageStyle'
import { THEORY_ITEMS, type TheoryFramework, type TheoryScope } from '../../library/theory'
import { readJson, type PanelMeta } from '../../model'
import { writePageStyleAndMarkStale, writePageStyleOnly } from '../../pipeline/pageMeta'
import type { FactorId } from '../../pipeline/factorGraph'
import { resolveTheoryScope, type CanvasSelectionKind } from '../inspectorModel'
import { type MangaContainer } from '../../shapes/schema'
import { IconCheck } from '../icons'
import { TheoryStatusGlyph } from './factorWidgets'

// A promoted theory constraint only biases the layout score, so re-propagation
// of the layout (and everything downstream of it) is what goes stale.
const CONSTRAINT_STALE_FACTORS: FactorId[] = ['panelLayout']

const FRAMEWORK_LABELS: Record<TheoryFramework, string> = {
	mccloud: 'McCloud · Understanding Comics',
	eisner: 'Eisner · Sequential Art',
	kishotenketsu: 'Kishotenketsu · Four-Act Structure',
	ma: 'Ma · The Pause Between',
	flow: 'Reading Flow & Gaze',
	composition: 'Composition & Staging',
	montage: 'Montage & Juxtaposition',
}

const FRAMEWORK_ORDER: TheoryFramework[] = ['mccloud', 'eisner', 'kishotenketsu', 'ma', 'montage', 'flow', 'composition']

const SCOPES: TheoryScope[] = ['page', 'panel', 'balloon']
const SCOPE_LABEL: Record<TheoryScope, string> = { page: 'Page', panel: 'Panel', balloon: 'Balloon' }

/** Build a best-effort theory-eval spec from the page's storyboard panels. */
function buildTheoryEvalSpec(metas: PanelMeta[]): TheoryEvalSpec {
	if (!metas.length) return {}
	const transitions = metas.map((m) => m.mccloudTransition).filter(Boolean)
	const tensions = metas.map((m) => (typeof m.tension === 'number' ? m.tension : 0))
	const peakIdx = tensions.reduce((best, t, idx) => (t > tensions[best] ? idx : best), 0)
	const silentIdxs = metas.map((m, idx) => (m.silent ? idx : -1)).filter((idx) => idx >= 0)
	const firstShot = metas[0]?.shot
	return {
		allCutsIntentional: metas.every((m) => Boolean(m.mccloudTransition)),
		transitionsVaried: new Set(transitions).size > 1,
		allPanelsHaveWordPictureMode: metas.every((m) => Boolean(m.wordPictureMode)),
		hasEstablishingShot: firstShot === 'EWS' || firstShot === 'WS',
		hasSilentBeatBeforePeak: silentIdxs.some((idx) => idx < peakIdx),
		// Silent (Ma) panels suppress balloons by construction in spawnPageBubbles.
		silentBeatHasNoBalloon: silentIdxs.length > 0 ? true : undefined,
		allPanelsHaveSingleFocal: metas.every((m) => Array.isArray(m.focalPointRel)),
		hasTurnBeat: tensions.length >= 3 && Math.max(...tensions) - Math.min(...tensions) > 0.2,
	}
}

export function TheoryTab({
	editor,
	page,
	setStatus,
	selectionKind = 'none',
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
	/** The current canvas selection kind, so the scope follows the selection. */
	selectionKind?: CanvasSelectionKind
}) {
	const selectedPanel = page?.props.selectedPanel ?? -1
	const autoScope = resolveTheoryScope({ kind: selectionKind, selectedPanel })
	const [scope, setScope] = useState<TheoryScope>(autoScope)
	// Re-drive the scope only when the selection itself changes, so a manual scope
	// pick sticks until the user selects something else on the canvas.
	const selectionSig = `${selectionKind}:${selectedPanel >= 0 ? `p${selectedPanel}` : 'none'}`
	const lastSig = useRef(selectionSig)
	useEffect(() => {
		if (lastSig.current !== selectionSig) {
			lastSig.current = selectionSig
			setScope(autoScope)
		}
	}, [selectionSig, autoScope])

	const style = readPageStyleFromMeta(page?.meta)
	const metas = page ? readJson<PanelMeta[]>(page.props.panelsJson, []) : []
	const spec = buildTheoryEvalSpec(metas)
	const statusById = new Map<string, TheoryStatus>()
	for (const result of evaluateTheoryChecklists(spec)) statusById.set(result.checklistId, result.status)

	const frameworks = FRAMEWORK_ORDER.filter((fw) => THEORY_ITEMS.some((item) => item.framework === fw))

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Comics Theory</h3>
					<span>{THEORY_ITEMS.length} principles</span>
				</div>
				<p className="side-hint">
					Checklists from McCloud, Eisner, kishotenketsu, Ma, montage and reading-flow theory, evaluated against
					this page. Tick items as you clear them; promote an item to a live engine constraint to bias the layout.
				</p>
				<div className="segmented" role="tablist" aria-label="Checklist scope">
					{SCOPES.map((s) => (
						<button key={s} type="button" className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
							{SCOPE_LABEL[s]}
						</button>
					))}
				</div>
			</section>

			{frameworks.map((framework) => {
				const items = THEORY_ITEMS.filter((item) => item.framework === framework)
				const checks = items.flatMap((item) => item.checklist.filter((c) => c.scope === scope).map((c) => ({ item, c })))
				if (!checks.length) return null
				return (
					<details key={framework} className="theory-group" open={framework === 'mccloud'}>
						<summary>
							<span>{FRAMEWORK_LABELS[framework]}</span>
							<span className="theory-count">{checks.length}</span>
						</summary>
						<div className="theory-check-list">
							{checks.map(({ item, c }) => {
								const autoStatus = statusById.get(c.id) ?? 'info'
								const ticked = isChecklistTicked(style, c.id)
								const constrainable = isConstrainableChecklistId(c.id)
								const constrained = isConstraintEnabled(style, c.id)
								return (
									<div key={c.id} className="theory-check">
										<div className="theory-check-head">
											<TheoryStatusGlyph status={autoStatus} />
											<button
												type="button"
												className={ticked ? 'check-box on' : 'check-box'}
												aria-pressed={ticked}
												aria-label={ticked ? 'Untick' : 'Tick'}
												disabled={!editor || !page}
												onClick={() => {
													if (!editor || !page) return
													writePageStyleOnly(editor, page, setTheoryTick(style, c.id, !ticked))
												}}
											>
												{ticked ? <IconCheck /> : null}
											</button>
											<span className="theory-check-text">{c.text}</span>
										</div>
										<div className="theory-check-foot">
											<span className="theory-check-src">{item.title}</span>
											{constrainable ? (
												<button
													type="button"
													className={constrained ? 'constraint-toggle on' : 'constraint-toggle'}
													aria-pressed={constrained}
													disabled={!editor || !page}
													onClick={() => {
														if (!editor || !page) return
														const next = toggleTheoryConstraint(style, c.id)
														writePageStyleAndMarkStale(editor, page, next, CONSTRAINT_STALE_FACTORS)
														setStatus(
															constrained
																? `Dropped "${c.text}" as an engine constraint`
																: `Using "${c.text}" as a layout constraint — layout marked stale`,
														)
													}}
												>
													{constrained ? 'Constraint on' : 'Use as constraint'}
												</button>
											) : null}
										</div>
									</div>
								)
							})}
						</div>
					</details>
				)
			})}
		</div>
	)
}
