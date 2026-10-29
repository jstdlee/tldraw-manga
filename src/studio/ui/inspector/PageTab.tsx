// =============================================================================
// PageTab.tsx — Inspector "Page" tab (Stage 2 pacing + Stage 3 layout).
// Pacing strategy, the JEV procedural layout + 14-factor camera lock, layout
// presets and geometry, the six-axis editorial score with one-click remedies,
// and the story script with LLM rewrite / rebuild. This is the default tab when
// a page (or nothing) is selected. Moved out of the legacy left drawer.
// =============================================================================

import { useState } from 'react'
import { type Editor } from 'tldraw'
import { STAGE_OPS } from '../../editor/stageOps'
import type { AppStage } from '../../library/productionStages'
import type { StageStatus } from '../stageStatus'
import { bookFromText, PRESET_LABELS, SAMPLE_STORIES } from '../../demo/book'
import {
	applyEditorialRemedyOnPage,
	applyEmotionStrategyOnPage,
	applyLayoutChoice,
	fillRealInterrogationArtworkOnPage,
	mutateSelectedPages,
	rewriteStoryWithLlm,
	runJevFiveStageCompile,
	spawnBook,
	updatePageParametric,
} from '../../editor/pipeline'
import { compileProgrammaticLayoutGenome } from '../../jev/fiveStageEngine'
import { configFor, generate, PAGE_RATIOS, realize, ROW_RANGES, sanitize, type Genome } from '../../layout/engine'
import { asScenario, EMOTION_DIRECTION_TIPS, layoutFeatures, layoutScore, pickLayoutBundle, SCENARIOS } from '../../layout/score'
import { readJson, readPageParams, type Beat } from '../../model'
import { CONTAINER, type MangaContainer } from '../../shapes/schema'
import { IconGrid, IconImage, IconPlay, IconSliders, IconSparkles } from '../icons'

const PRESETS = ['seizen', 'std', 'action', 'tobira'] as const

/** Operator actions + live stage status, injected from the shell. */
export interface PipelineInspectorOps {
	statuses: Record<AppStage, StageStatus>
	/** Run a single stage for the active page. */
	runStage: (stage: AppStage) => void
	/** Run a stage and everything downstream of it for the active page. */
	runFrom: (stage: AppStage) => void
}

const STATUS_WORD: Record<StageStatus, string> = {
	idle: 'Not started',
	done: 'Up to date',
	stale: 'Needs re-propagate',
	running: 'Running',
}

/**
 * Compact "Pipeline" disclosure: one row per stage with a live status dot (from
 * the factor-graph dirty store), a one-click run of that stage, and a "run from
 * here forward" action. Folds the useful part of the retired operator-node grid
 * into the Page inspector. Status / re-propagate live in the bottom StageBar, so
 * this group only adds the explicit run operators.
 */
function PipelineGroup({ ops, hasPage }: { ops: PipelineInspectorOps; hasPage: boolean }) {
	const [open, setOpen] = useState(true)
	return (
		<section className="side-section pipeline-ops">
			<div className="sec-head">
				<button type="button" className="disclosure-toggle" aria-expanded={open} onClick={() => setOpen((prev) => !prev)}>
					<span className={`disclosure-caret ${open ? 'open' : ''}`} aria-hidden="true">▸</span> Pipeline
				</button>
				<button type="button" className="link-btn" disabled={!hasPage} onClick={() => ops.runFrom(1)} title="Run every stage for this page">
					Run All
				</button>
			</div>
			{open ? (
				<div className="pipe-op-list" role="group" aria-label="Pipeline stage operators">
					{STAGE_OPS.map((op) => {
						const status = ops.statuses[op.stage]
						return (
							<div key={op.stage} className="pipe-op-row" title={`Stage ${op.stage} · ${STATUS_WORD[status]}`}>
								<span className={`pipe-op-dot dot-${status}`} aria-hidden="true" />
								<span className="pipe-op-num">{op.stage}</span>
								<button type="button" className="pipe-op-run" disabled={!hasPage} onClick={() => ops.runStage(op.stage)} title={op.summary}>
									{op.title}
								</button>
								<button
									type="button"
									className="pipe-op-from"
									disabled={!hasPage}
									onClick={() => ops.runFrom(op.stage)}
									title={`Run Stage ${op.stage} and everything downstream`}
									aria-label={`Run Stage ${op.stage} and downstream`}
								>
									→
								</button>
							</div>
						)
					})}
				</div>
			) : null}
		</section>
	)
}

export function PageTab({
	editor,
	page,
	story,
	setStory,
	setStatus,
	onOpenCompare,
	pipeline,
}: {
	editor: Editor | null
	page: MangaContainer | null
	story: string
	setStory: (value: string) => void
	setStatus: (value: string) => void
	onOpenCompare?: () => void
	pipeline?: PipelineInspectorOps
}) {
	const [directive, setDirective] = useState('Heighten contrast and action staging with a pre-climax silent beat')

	return (
		<div className="inspector-body">
			{pipeline ? <PipelineGroup ops={pipeline} hasPage={Boolean(editor)} /> : null}
			{editor && page ? <PageSettings editor={editor} page={page} setStatus={setStatus} onOpenCompare={onOpenCompare} /> : (
				<section className="side-section">
					<div className="sec-head">
						<h3>Page Settings</h3>
						<span>Select a page</span>
					</div>
					<p className="side-hint">Select a page container on the canvas to adjust pacing, layout geometry and the editorial score.</p>
				</section>
			)}

			<section className="side-section">
				<div className="sec-head">
					<h3>Story Script</h3>
					<button
						type="button"
						className="link-btn"
						onClick={() => {
							const pick = SAMPLE_STORIES[Math.floor(Math.random() * SAMPLE_STORIES.length)]
							setStory(pick.text)
							setStatus(`Loaded sample script "${pick.label}"`)
						}}
					>
						Sample
					</button>
				</div>
				<textarea rows={5} value={story} onChange={(event) => setStory(event.target.value)} placeholder="Enter episode synopsis, character dynamics, or scene script..." />
				<input type="text" value={directive} onChange={(event) => setDirective(event.target.value)} placeholder="Director rewrite directive..." style={{ marginTop: 6 }} />
				<div className="story-actions" style={{ marginTop: 6 }}>
					<button
						type="button"
						className="primary-full"
						onClick={async () => {
							setStatus('Calling text LLM to rewrite the script...')
							const rewritten = await rewriteStoryWithLlm(story, directive)
							setStory(rewritten)
							setStatus('Text LLM script rewrite complete')
						}}
					>
						<IconSparkles /> Rewrite Script with LLM
					</button>
					<button
						type="button"
						className="primary-full"
						onClick={() => {
							if (!editor) return
							spawnBook(editor, bookFromText(story))
							setStatus('Rebuilt reference cards and storyboard pages from script')
						}}
					>
						<IconPlay /> Rebuild Pages from Script
					</button>
				</div>
			</section>
		</div>
	)
}

function PageSettings({
	editor,
	page,
	setStatus,
	onOpenCompare,
}: {
	editor: Editor
	page: MangaContainer
	setStatus: (value: string) => void
	onOpenCompare?: () => void
}) {
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const layout = realize(genome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))
	const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
	const progDecision = compileProgrammaticLayoutGenome(rawBeats, asScenario(page.props.scenario), page.props.seed)
	const currentScenario = asScenario(page.props.scenario)
	const tip = EMOTION_DIRECTION_TIPS[currentScenario]

	return (
		<>
			<section className="side-section">
				<div className="sec-head">
					<h3>Pacing Strategy · {page.props.title}</h3>
					<span>Staging</span>
				</div>
				<div className="preset-pill-row" role="group" aria-label="Pacing strategy presets">
					{SCENARIOS.map((sc) => (
						<button
							key={sc}
							type="button"
							className={currentScenario === sc ? 'preset-pill active' : 'preset-pill'}
							onClick={() => setStatus(applyEmotionStrategyOnPage(editor, page, sc))}
						>
							{EMOTION_DIRECTION_TIPS[sc].label.split(' ')[0]}
						</button>
					))}
				</div>
				<div className="emotion-tip-card">
					<strong>{tip.label}</strong>
					<p>Layout rule: {tip.layoutRule}</p>
					<p>Camera rhythm: {tip.beatRule}</p>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>JEV Procedural Layout</h3>
					<span>Stage 2 → 3</span>
				</div>
				<p className="side-hint">Tension curve → 14-factor camera + polygon row heights, diagonal slant and column widths.</p>
				<div className="jev-trace">
					{progDecision.decisionTrace.map((line, i) => (
						<div key={i} className="jev-trace-line">
							{line}
						</div>
					))}
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 6 }}>
					<button type="button" className="primary-full" title="Run JEV 5-stage layout compile" onClick={() => setStatus(runJevFiveStageCompile(editor))}>
						<IconSparkles /> Run Layout
					</button>
					<button type="button" onClick={() => setStatus(fillRealInterrogationArtworkOnPage(editor, page))}>
						<IconImage /> Fill Panel Art
					</button>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Layout & Geometry</h3>
					<span>{layout.panels.length} panels</span>
				</div>
				<div className="preset-pill-row" role="group" aria-label="Layout presets">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							className={page.props.layoutPreset === preset ? 'preset-pill active' : 'preset-pill'}
							onClick={() => {
								const nextConfig = configFor(preset, page.props.targetPanels)
								const best = pickLayoutBundle(page.props.seed, nextConfig, page.props.targetPanels, asScenario(page.props.scenario), { count: 8 }).top[0]
								editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { layoutPreset: preset, mood: '' } })
								const refreshed = editor.getShape<MangaContainer>(page.id) ?? page
								applyLayoutChoice(editor, refreshed, { seed: best.seed, genome: best.layout.genome, score: best.score, reasons: best.reasons })
								setStatus(`Switched layout preset to "${PRESET_LABELS[preset] ?? preset}"`)
							}}
						>
							{(PRESET_LABELS[preset] ?? preset).split(' ')[0]}
						</button>
					))}
				</div>
				<div className="param-grid-2">
					<label>
						Aspect
						<select aria-label="Aspect Ratio" value={String(overrides.ratio)} onChange={(event) => setStatus(updatePageParametric(editor, page, { ratio: Number(event.target.value) }, true))}>
							{PAGE_RATIOS.map((r) => (
								<option key={r.id} value={String(r.ratio)}>
									{r.label}
								</option>
							))}
						</select>
					</label>
					<label>
						Rows
						<select aria-label="Row Range" value={overrides.rowRange} onChange={(event) => setStatus(updatePageParametric(editor, page, { rowRange: event.target.value as '1-3' | '2-3' | '2-4' | '3-4' }, true))}>
							{ROW_RANGES.map((r) => (
								<option key={r.id} value={r.id}>
									{r.label}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="slider-stack">
					<label className="slider-row">
						<span>Slant</span>
						<code>{Math.round((overrides.tilt ?? 0.25) * 100)}%</code>
						<input type="range" aria-label="Diagonal Slant" min={0} max={1} step={0.05} value={overrides.tilt ?? 0.25} onChange={(event) => setStatus(updatePageParametric(editor, page, { tilt: Number(event.target.value) }, true))} />
					</label>
					<label className="slider-row">
						<span>Bleed</span>
						<code>{Math.round((overrides.bleed ?? 0.2) * 100)}%</code>
						<input type="range" aria-label="Bleed Ratio" min={0} max={1} step={0.05} value={overrides.bleed ?? 0.2} onChange={(event) => setStatus(updatePageParametric(editor, page, { bleed: Number(event.target.value) }, true))} />
					</label>
					<label className="slider-row">
						<span>Subsplit</span>
						<code>{Math.round((overrides.nest ?? 0.2) * 100)}%</code>
						<input type="range" aria-label="Subsplit Rate" min={0} max={1} step={0.05} value={overrides.nest ?? 0.2} onChange={(event) => setStatus(updatePageParametric(editor, page, { nest: Number(event.target.value) }, true))} />
					</label>
					<label className="slider-row">
						<span>Hero</span>
						<code>{Math.round((overrides.big ?? 0.2) * 100)}%</code>
						<input type="range" aria-label="Hero Weight" min={0} max={1} step={0.05} value={overrides.big ?? 0.2} onChange={(event) => setStatus(updatePageParametric(editor, page, { big: Number(event.target.value) }, true))} />
					</label>
					<label className="slider-row">
						<span>Line</span>
						<code>{(overrides.lineW ?? 3.2).toFixed(1)}px</code>
						<input type="range" aria-label="Border Width" min={1.8} max={7.5} step={0.2} value={overrides.lineW ?? 3.2} onChange={(event) => setStatus(updatePageParametric(editor, page, { lineW: Number(event.target.value) }, false))} />
					</label>
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 8 }}>
					<button
						type="button"
						onClick={() => {
							mutateSelectedPages(editor, overrides.mutationStrength)
							setStatus(`Derived layout variant (mutation ${Math.round((overrides.mutationStrength ?? 0.45) * 100)}%)`)
						}}
					>
						<IconSliders /> Derive Variant
					</button>
					{onOpenCompare ? (
						<button type="button" onClick={onOpenCompare}>
							<IconGrid /> Compare Candidates
						</button>
					) : null}
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Editorial Score</h3>
					<span>{Math.round(judged.score * 100)}</span>
				</div>
				<div className="rubric-bars">
					{[
						{ key: 'pacing', label: 'Pacing Fit', val: judged.axes.pacing },
						{ key: 'hierarchy', label: 'Hierarchy', val: judged.axes.hierarchy },
						{ key: 'flow', label: 'Reading Flow', val: judged.axes.flow },
						{ key: 'tension', label: 'Slant Tension', val: judged.axes.tension },
						{ key: 'bleedHook', label: 'Page-Turn Hook', val: judged.axes.bleedHook },
						{ key: 'balance', label: 'Balance', val: judged.axes.balance },
					].map((item) => (
						<div key={item.key} className="rubric-row">
							<span>{item.label}</span>
							<div className="rubric-track">
								<div className="rubric-fill" style={{ width: `${Math.round(item.val * 100)}%` }} />
							</div>
							<code>{Math.round(item.val * 100)}</code>
						</div>
					))}
				</div>
				<div className="remedy-box">
					<div className="remedy-head">
						<span>Diagnostics: {judged.deficits[0]}</span>
					</div>
					<div className="remedy-list">
						{judged.remedies.map((rem) => (
							<button key={rem.id} type="button" className="remedy-btn" onClick={() => setStatus(applyEditorialRemedyOnPage(editor, page, rem))} title={rem.description}>
								{rem.actionLabel}
							</button>
						))}
					</div>
				</div>
			</section>
		</>
	)
}
