// =============================================================================
// MastersTab.tsx — Inspector "Masters" tab (style-master library + blend engine).
// Searchable, region-filtered master list → a detail view (signature traits,
// line/tone/composition rules, pacing, layout + shot vocabulary, McCloud mapping
// as monochrome bar charts, prompt tokens and a tickable decision checklist).
// Actions apply or blend a master onto the current page (updating the style
// bible + factor weights and marking dependents stale) or scope it to the
// selected panel. The live blend list supports removable entries and per-factor
// locks (transitions · word-picture · shots · angles · layout · pacing).
// =============================================================================

import { useState } from 'react'
import { type Editor } from 'tldraw'
import type { McCloudTransition, WordPictureMode } from '../../jev/fiveStageEngine'
import { blendFactorVectors, resolveWeightedMasters, type FactorKind } from '../../library/blend'
import { MASTERS, type MasterId } from '../../library/masters'
import {
	FACTOR_KINDS,
	applyMasterToPage,
	applyMasterToPanel,
	blendMasterIntoPage,
	isFactorLocked,
	isMasterChecklistTicked,
	readPageStyleFromMeta,
	removeMasterFromPage,
	setMasterChecklistTick,
	toggleFactorLock,
} from '../../library/pageStyle'
import { writePageStyleAndMarkStale, writePageStyleOnly } from '../../pipeline/pageMeta'
import type { FactorId } from '../../pipeline/factorGraph'
import { type MangaContainer } from '../../shapes/schema'
import { IconCheck, IconClose, IconLock, IconUnlock } from '../icons'
import { MonoBarChart, type BarDatum } from './factorWidgets'

// Applying or blending a master touches the style bible (Stage 4 art prompt) and
// the layout-score bias (Stage 3 layout); those are the factors we mark stale.
const MASTER_STALE_FACTORS: FactorId[] = ['styleBible', 'panelLayout']

const TRANSITION_LABEL: Record<McCloudTransition, string> = {
	moment_to_moment: 'Moment',
	action_to_action: 'Action',
	subject_to_subject: 'Subject',
	scene_to_scene: 'Scene',
	aspect_to_aspect: 'Aspect',
	non_sequitur: 'Non-seq.',
}

const WORD_PICTURE_LABEL: Record<WordPictureMode, string> = {
	word_specific: 'Word',
	picture_specific: 'Picture',
	duo_specific: 'Duo',
	additive: 'Additive',
	parallel: 'Parallel',
	montage: 'Montage',
	interdependent: 'Interdep.',
}

const FACTOR_KIND_LABEL: Record<FactorKind, string> = {
	transitions: 'Transitions',
	wordPicture: 'Word-Picture',
	shots: 'Shots',
	angles: 'Angles',
	layouts: 'Layout',
	pacing: 'Pacing',
}

const REGIONS = Array.from(new Set(MASTERS.map((m) => m.region)))

function toBars<T extends string>(map: Partial<Record<T, number>>, labels: Record<T, string>): BarDatum[] {
	return Object.entries(map).map(([key, value]) => ({ label: labels[key as T] ?? key, value: Number(value) }))
}

export function MastersTab({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	const [query, setQuery] = useState('')
	const [region, setRegion] = useState<string>('all')
	const [selectedId, setSelectedId] = useState<MasterId | null>(null)
	const [blendWeight, setBlendWeight] = useState(0.5)

	const style = readPageStyleFromMeta(page?.meta)
	const blend = resolveWeightedMasters(style.profile)
	const vectors = blendFactorVectors(style.profile)
	const selectedPanel = page ? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0) : 0

	const normalizedQuery = query.trim().toLowerCase()
	const filtered = MASTERS.filter((master) => {
		if (region !== 'all' && master.region !== region) return false
		if (!normalizedQuery) return true
		const haystack = `${master.name} ${master.region} ${master.era} ${master.signatureTraits.join(' ')}`.toLowerCase()
		return haystack.includes(normalizedQuery)
	})
	const selected = selectedId ? MASTERS.find((m) => m.id === selectedId) ?? null : null

	const persist = (next: ReturnType<typeof readPageStyleFromMeta>, message: string) => {
		if (!editor || !page) return
		writePageStyleAndMarkStale(editor, page, next, MASTER_STALE_FACTORS)
		setStatus(message)
	}

	if (!page) {
		return (
			<div className="inspector-body">
				<section className="side-section">
					<div className="sec-head">
						<h3>Master Style Library</h3>
						<span>{MASTERS.length} masters</span>
					</div>
					<p className="side-hint">Select a page on the canvas to apply or blend a master style into its pipeline.</p>
				</section>
			</div>
		)
	}

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Master Style Library</h3>
					<span>{filtered.length}/{MASTERS.length}</span>
				</div>
				<input
					type="search"
					className="inspector-search"
					placeholder="Search masters, traits, region…"
					aria-label="Search masters"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div className="segmented" role="tablist" aria-label="Filter masters by region">
					<button type="button" className={region === 'all' ? 'active' : ''} onClick={() => setRegion('all')}>
						All
					</button>
					{REGIONS.map((r) => (
						<button key={r} type="button" className={region === r ? 'active' : ''} onClick={() => setRegion(r)}>
							{r}
						</button>
					))}
				</div>
			</section>

			{blend.length ? (
				<section className="side-section">
					<div className="sec-head">
						<h3>Page Blend</h3>
						<span>{blend.length} master{blend.length === 1 ? '' : 's'}</span>
					</div>
					<div className="blend-list">
						{blend.map(({ master, weight }) => (
							<div key={master.id} className="blend-row">
								<span className="blend-name">{master.name}</span>
								<span className="blend-weight">{Math.round(weight * 100)}%</span>
								<button
									type="button"
									className="blend-remove"
									aria-label={`Remove ${master.name} from blend`}
									onClick={() => persist(removeMasterFromPage(style, master.id), `Removed ${master.name} from the page blend`)}
								>
									<IconClose />
								</button>
							</div>
						))}
					</div>
					<div className="factor-lock-list">
						{FACTOR_KINDS.map((kind) => {
							const locked = isFactorLocked(style, kind)
							return (
								<div key={kind} className={locked ? 'factor-lock-row locked' : 'factor-lock-row'}>
									<span>{FACTOR_KIND_LABEL[kind]}</span>
									<button
										type="button"
										className="factor-lock"
										aria-pressed={locked}
										aria-label={locked ? `Unlock ${FACTOR_KIND_LABEL[kind]}` : `Lock ${FACTOR_KIND_LABEL[kind]} to the dominant master`}
										title={locked ? 'Pinned to the dominant master' : 'Blend across all masters'}
										onClick={() => {
											if (!editor) return
											writePageStyleOnly(editor, page, toggleFactorLock(style, kind))
											setStatus(`${locked ? 'Unlocked' : 'Locked'} ${FACTOR_KIND_LABEL[kind]} in the master blend`)
										}}
									>
										{locked ? <IconLock /> : <IconUnlock />}
									</button>
								</div>
							)
						})}
					</div>
					<div className="mc-chart-pair">
						<div>
							<small className="chart-caption">Blended transitions</small>
							<MonoBarChart data={toBars(vectors.transitions, TRANSITION_LABEL)} />
						</div>
						<div>
							<small className="chart-caption">Blended word-picture</small>
							<MonoBarChart data={toBars(vectors.wordPicture, WORD_PICTURE_LABEL)} />
						</div>
					</div>
				</section>
			) : null}

			{selected ? (
				<section className="side-section">
					<div className="sec-head">
						<h3>{selected.name}</h3>
						<span>{selected.region} · {selected.era}</span>
					</div>
					<p className="side-hint">{selected.keyWorks.join(' · ')}</p>

					<div className="master-detail-group">
						<h4>Signature</h4>
						<ul className="detail-list">
							{selected.signatureTraits.map((trait) => (
								<li key={trait}>{trait}</li>
							))}
						</ul>
					</div>

					<div className="mc-chart-pair">
						<div>
							<small className="chart-caption">Transitions</small>
							<MonoBarChart data={toBars(selected.mccloud.transitions, TRANSITION_LABEL)} />
						</div>
						<div>
							<small className="chart-caption">Word-Picture</small>
							<MonoBarChart data={toBars(selected.mccloud.wordPicture, WORD_PICTURE_LABEL)} />
						</div>
					</div>
					<div className="meter-pair">
						<div className="meter-row">
							<span>Abstraction</span>
							<span className="meter-track"><span className="meter-fill" style={{ width: `${Math.round(selected.mccloud.abstraction * 100)}%` }} /></span>
							<code>{Math.round(selected.mccloud.abstraction * 100)}</code>
						</div>
						<div className="meter-row">
							<span>Closure</span>
							<span className="meter-track"><span className="meter-fill" style={{ width: `${Math.round(selected.mccloud.closureIntensity * 100)}%` }} /></span>
							<code>{Math.round(selected.mccloud.closureIntensity * 100)}</code>
						</div>
					</div>

					<div className="master-detail-group">
						<h4>Craft Rules</h4>
						<ul className="detail-list">
							{selected.lineInkRules.map((rule) => <li key={rule}>{rule}</li>)}
							{selected.toneBlackRules.map((rule) => <li key={rule}>{rule}</li>)}
							{selected.compositionRules.map((rule) => <li key={rule}>{rule}</li>)}
						</ul>
					</div>
					<div className="master-detail-group">
						<h4>Pacing & Layout</h4>
						<ul className="detail-list">
							{selected.pacingHabits.map((habit) => <li key={habit}>{habit}</li>)}
						</ul>
						<div className="chip-row">
							{selected.preferredLayouts.map((layout) => <span key={layout} className="inspector-chip">{layout}</span>)}
						</div>
						<div className="chip-row">
							{selected.shotVocabulary.map((shot) => <span key={shot} className="inspector-chip">{shot}</span>)}
						</div>
					</div>
					<div className="master-detail-group">
						<h4>Prompt Style Tokens</h4>
						<div className="chip-row">
							{selected.promptStyleTokens.map((token) => <span key={token} className="inspector-chip">{token}</span>)}
						</div>
					</div>
					<div className="master-detail-group">
						<h4>Decision Checklist</h4>
						<div className="checklist">
							{selected.checklist.map((item, idx) => {
								const ticked = isMasterChecklistTicked(style, selected.id, idx)
								return (
									<label key={item} className={ticked ? 'checklist-row ticked' : 'checklist-row'}>
										<button
											type="button"
											className={ticked ? 'check-box on' : 'check-box'}
											aria-pressed={ticked}
											aria-label={ticked ? 'Untick' : 'Tick'}
											onClick={() => {
												if (!editor) return
												writePageStyleOnly(editor, page, setMasterChecklistTick(style, selected.id, idx, !ticked))
											}}
										>
											{ticked ? <IconCheck /> : null}
										</button>
										<span>{item}</span>
									</label>
								)
							})}
						</div>
					</div>

					<div className="master-actions">
						<button
							type="button"
							className="primary-btn"
							onClick={() => persist(applyMasterToPage(style, selected.id), `Applied ${selected.name} to the page style bible`)}
						>
							Apply to Page
						</button>
						<div className="blend-apply-row">
							<input
								type="range"
								min={0.1}
								max={1}
								step={0.05}
								value={blendWeight}
								aria-label="Blend weight"
								onChange={(event) => setBlendWeight(Number(event.target.value))}
							/>
							<code>{Math.round(blendWeight * 100)}%</code>
							<button
								type="button"
								onClick={() => persist(blendMasterIntoPage(style, selected.id, blendWeight), `Blended ${selected.name} into the page at ${Math.round(blendWeight * 100)}%`)}
							>
								Blend
							</button>
						</div>
						<button
							type="button"
							className="inspector-row-btn"
							onClick={() => persist(applyMasterToPanel(style, selectedPanel, selected.id), `Applied ${selected.name} to panel #${selectedPanel + 1} only`)}
						>
							Apply to Panel #{selectedPanel + 1} Only
						</button>
					</div>
				</section>
			) : null}

			<section className="side-section">
				<div className="sec-head">
					<h3>{selected ? 'Switch Master' : 'Choose a Master'}</h3>
					<span>Reference</span>
				</div>
				<div className="master-list">
					{filtered.map((master) => (
						<button
							key={master.id}
							type="button"
							className={master.id === selectedId ? 'master-row selectable active' : 'master-row selectable'}
							onClick={() => setSelectedId(master.id)}
						>
							<span className="master-row-head">
								<strong>{master.name}</strong>
								<span className="master-meta">{master.region} · {master.era}</span>
							</span>
							<span className="master-trait">{master.signatureTraits[0]}</span>
						</button>
					))}
					{filtered.length === 0 ? <p className="side-hint">No masters match the filter.</p> : null}
				</div>
			</section>
		</div>
	)
}
