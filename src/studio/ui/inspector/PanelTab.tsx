// =============================================================================
// PanelTab.tsx — Inspector "Panel" tab (Stage 2 beats + factor-level editing +
// Stage 4 optics). The JEV Factors block exposes every per-panel decision inline
// (McCloud transition, shot size, angle, lens, word-picture mode, tension, eyeline
// side, silent Ma, bound asset refs, master override), each with its resolved
// source (auto / master / manual) and a lock toggle; locked factors survive
// re-runs. Editing a factor writes through both the beat and the meta (so the
// value survives a layout recompute) and marks only the dependent downstream
// stages stale via the dirty store. Below it sit the optical lens lab and the
// framing / bleed controls.
// =============================================================================

import { type ReactNode } from 'react'
import { useValue, type Editor } from 'tldraw'
import { ANGLE_LABELS } from '../../demo/book'
import {
	applyOpticsToPanel,
	fillRealInterrogationArtworkOnPage,
	togglePanelBleedOnPage,
	togglePanelNestOnPage,
	toggleSilentPanelOnPage,
	updatePageParametric,
} from '../../editor/pipeline'
import type { McCloudTransition, WordPictureMode } from '../../jev/fiveStageEngine'
import { configFor, generate, locatePanelGene, sanitize, type Genome } from '../../layout/engine'
import { resolveWeightedMasters } from '../../library/blend'
import { MASTERS } from '../../library/masters'
import { applyMasterToPanel, clearPanelMaster, readPageStyleFromMeta } from '../../library/pageStyle'
import { beatsFromMetas, readJson, readPageParams, type Beat, type PanelMeta, type Shot } from '../../model'
import { auditCameraAxis, computeOptics, defaultOpticsForMeta, SENSORS, type SensorId } from '../../optics/shotLab'
import {
	PANEL_FACTOR_TO_GRAPH,
	isLocked,
	readPanelFactorsFromMeta,
	resolvePanelFactorSource,
	setManual,
	toggleLocked,
	type PanelFactorKey,
} from '../../pipeline/panelFactors'
import { readPageDirty, writePageStyleAndMarkStale, writePanelFactorsAndMarkStale, writePanelFactorsOnly } from '../../pipeline/pageMeta'
import { ANGLES } from '../../prompts/library'
import { LENS_PRESETS } from '../../library/shots'
import { CARD, CONTAINER, type MangaCard, type MangaContainer } from '../../shapes/schema'
import { IconClose, IconImage, IconSparkles } from '../icons'
import { LockToggle, SourceBadge } from './factorWidgets'

const TRANSITIONS: Array<{ id: McCloudTransition; label: string }> = [
	{ id: 'moment_to_moment', label: 'Moment → Moment' },
	{ id: 'action_to_action', label: 'Action → Action' },
	{ id: 'subject_to_subject', label: 'Subject → Subject' },
	{ id: 'scene_to_scene', label: 'Scene → Scene' },
	{ id: 'aspect_to_aspect', label: 'Aspect → Aspect' },
	{ id: 'non_sequitur', label: 'Non-sequitur' },
]

const WORD_PICTURE: Array<{ id: WordPictureMode; label: string }> = [
	{ id: 'word_specific', label: 'Word-specific' },
	{ id: 'picture_specific', label: 'Picture-specific' },
	{ id: 'duo_specific', label: 'Duo-specific' },
	{ id: 'additive', label: 'Additive' },
	{ id: 'parallel', label: 'Parallel' },
	{ id: 'montage', label: 'Montage' },
	{ id: 'interdependent', label: 'Interdependent' },
]

const SHOTS: Shot[] = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU']

export function PanelTab({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	const panelIdx = useValue(
		'inspector-panel-idx',
		() => (page ? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0) : 0),
		[page],
	)
	const cardTags = useValue<string[]>(
		'inspector-card-tags',
		() =>
			editor
				? editor
						.getCurrentPageShapes()
						.filter((s): s is MangaCard => s.type === CARD && Boolean(s.props.tag))
						.map((c) => c.props.tag.trim())
						.filter(Boolean)
				: [],
		[editor],
	)

	if (!editor || !page) {
		return (
			<div className="inspector-body">
				<section className="side-section">
					<div className="sec-head">
						<h3>Panel Factors & Optics</h3>
						<span>Select a panel</span>
					</div>
					<p className="side-hint">Select any panel cell on a page to adjust its JEV factors, focal length, aperture, framing and edge bleed.</p>
				</section>
			</div>
		)
	}

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const meta = metas[panelIdx] ?? metas[0]
	if (!meta) {
		return (
			<div className="inspector-body">
				<section className="side-section">
					<div className="sec-head">
						<h3>Panel Factors & Optics</h3>
						<span>No panels</span>
					</div>
					<p className="side-hint">This page has no storyboard panels yet. Run the layout stage from the Page tab first.</p>
				</section>
			</div>
		)
	}

	const optParams = defaultOpticsForMeta(meta)
	const computed = computeOptics(optParams)
	const geneHit = locatePanelGene(genome, panelIdx)
	const axisAudit = auditCameraAxis(metas)
	const style = readPageStyleFromMeta(page.meta)
	const pf = readPanelFactorsFromMeta(page.meta)
	const panelProfile = style.panelProfiles[panelIdx]
	const panelMasterId = panelProfile ? Object.keys(panelProfile.masterWeights)[0] ?? '' : ''
	const panelHasMaster = resolveWeightedMasters(style.profile).length > 0 || Boolean(panelProfile)
	const dirty = readPageDirty(page)
	const currentRefs = meta.assetRefs ?? []
	const ctx = readJson<{ lockedAssetTags?: string[] }>(page.props.contextJson ?? '{}', {})
	const availableTags = Array.from(new Set([...(ctx.lockedAssetTags ?? []), ...cardTags]))
		.map((t) => (t.startsWith('@') || t.startsWith('#') ? t : `@${t}`))
		.filter((t) => !currentRefs.includes(t))

	const selectPanel = (idx: number) => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })

	const updateMeta = (patch: Partial<PanelMeta>) => {
		const next = metas.map((item, idx) => (idx === panelIdx ? { ...item, ...patch } : item))
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}

	// Commit a factor edit through BOTH the beat and the meta so it survives a
	// layout recompute, then mark it manual and flag only the dependent stages.
	const commitFactor = (key: PanelFactorKey, patch: { beat?: Partial<Beat>; meta?: Partial<PanelMeta> }, message?: string) => {
		const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
		const base = rawBeats.length === metas.length ? rawBeats : beatsFromMetas(metas)
		const nextBeats = base.map((b, idx) => (idx === panelIdx ? { ...b, ...(patch.beat ?? {}) } : b))
		const nextMetas = metas.map((m, idx) => (idx === panelIdx ? { ...m, ...(patch.meta ?? {}) } : m))
		editor.updateShape<MangaContainer>({
			id: page.id,
			type: CONTAINER,
			props: { scriptJson: JSON.stringify(nextBeats), panelsJson: JSON.stringify(nextMetas) },
		})
		const result = writePanelFactorsAndMarkStale(editor, page, setManual(pf, panelIdx, key, true), [PANEL_FACTOR_TO_GRAPH[key]])
		if (message) setStatus(`${message} · ${result.staleFactors.length} downstream factor(s) stale`)
	}

	const factorRow = (key: PanelFactorKey, label: string, control: ReactNode) => {
		const source = resolvePanelFactorSource(pf, panelIdx, key, panelHasMaster)
		const locked = isLocked(pf, panelIdx, key)
		return (
			<div className="factor-row" key={key}>
				<div className="factor-row-head">
					<span className="factor-label">{label}</span>
					<SourceBadge source={source} />
					<LockToggle locked={locked} label={label} onToggle={() => writePanelFactorsOnly(editor, page, toggleLocked(pf, panelIdx, key))} />
				</div>
				<div className="factor-control">{control}</div>
			</div>
		)
	}

	const eyelineX = meta.eyeline?.[0] ?? 0
	const eyelineSide = eyelineX < -5 ? 'left' : eyelineX > 5 ? 'right' : 'neutral'
	const setEyelineSide = (side: 'left' | 'neutral' | 'right') => {
		const y = meta.eyeline?.[1] ?? 0
		const x = side === 'left' ? -22 : side === 'right' ? 22 : 0
		commitFactor('eyeline', { beat: { eyeline: [x, y] }, meta: { eyeline: [x, y] } }, `Set eyeline ${side}`)
	}

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Panel #{panelIdx + 1} · {page.props.title}</h3>
					{dirty.dirty.length ? <span className="stale-chip">{dirty.dirty.length} stale</span> : <span>{meta.silent ? 'Silent Ma' : 'Dialogue'}</span>}
				</div>
				<div className={dirty.dirty.length ? 'panel-pill-selector stale' : 'panel-pill-selector'}>
					{metas.map((m, idx) => (
						<button
							key={idx}
							type="button"
							className={idx === panelIdx ? 'preset-pill active' : 'preset-pill'}
							onClick={() => selectPanel(idx)}
						>
							#{idx + 1}{m.silent ? '·S' : ''}
						</button>
					))}
				</div>
				<div className="form-row stacked">
					<label>Action beat</label>
					<textarea
						rows={2}
						aria-label="Panel staging and action beat"
						value={meta.beat}
						onChange={(event) => commitFactor('transition', { beat: { beat: event.target.value }, meta: { beat: event.target.value } })}
					/>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>JEV Factors</h3>
					{dirty.dirty.length ? <span className="stale-chip">downstream stale</span> : <span>Source · Lock</span>}
				</div>

				{factorRow(
					'transition',
					'McCloud Transition',
					<select
						aria-label="Panel-to-panel transition"
						value={meta.mccloudTransition ?? ''}
						onChange={(event) => commitFactor('transition', { beat: { mccloudTransition: event.target.value as McCloudTransition }, meta: { mccloudTransition: event.target.value as McCloudTransition } }, 'Set transition')}
					>
						<option value="">Auto</option>
						{TRANSITIONS.map((t) => (
							<option key={t.id} value={t.id}>{t.label}</option>
						))}
					</select>,
				)}

				<div className="factor-pair">
					{factorRow(
						'shot',
						'Shot Size',
						<select
							aria-label="Shot size"
							value={meta.shot}
							onChange={(event) => commitFactor('shot', { beat: { shot: event.target.value as Shot }, meta: { shot: event.target.value as Shot } }, 'Set shot size')}
						>
							{SHOTS.map((s) => (
								<option key={s} value={s}>{s}</option>
							))}
						</select>,
					)}
					{factorRow(
						'angle',
						'Camera Angle',
						<select
							aria-label="Camera angle"
							value={meta.angle}
							onChange={(event) => {
								applyOpticsToPanel(editor, page, panelIdx, { angle: event.target.value as PanelMeta['angle'] })
								commitFactor('angle', { beat: { angle: event.target.value as PanelMeta['angle'] }, meta: { angle: event.target.value as PanelMeta['angle'] } }, 'Set camera angle')
							}}
						>
							{ANGLES.map((a) => (
								<option key={a} value={a}>{ANGLE_LABELS[a] ?? a}</option>
							))}
						</select>,
					)}
				</div>

				{factorRow(
					'lens',
					'Lens',
					<select
						aria-label="Lens preset"
						value={LENS_PRESETS.find((l) => l.focalMm === (meta.focalMm ?? 50))?.id ?? ''}
						onChange={(event) => {
							const lens = LENS_PRESETS.find((l) => l.id === event.target.value)
							if (!lens) return
							applyOpticsToPanel(editor, page, panelIdx, { focalMm: lens.focalMm })
							commitFactor('lens', { beat: { focalMm: lens.focalMm }, meta: { focalMm: lens.focalMm } }, `Set ${lens.name}`)
						}}
					>
						<option value="">Custom {meta.focalMm ?? 50}mm</option>
						{LENS_PRESETS.map((l) => (
							<option key={l.id} value={l.id}>{l.name}</option>
						))}
					</select>,
				)}

				{factorRow(
					'wordPicture',
					'Word-Picture',
					<select
						aria-label="Word-picture combination"
						value={meta.wordPictureMode ?? ''}
						onChange={(event) => commitFactor('wordPicture', { beat: { wordPictureMode: event.target.value as WordPictureMode }, meta: { wordPictureMode: event.target.value as WordPictureMode } }, 'Set word-picture mode')}
					>
						<option value="">Auto</option>
						{WORD_PICTURE.map((w) => (
							<option key={w.id} value={w.id}>{w.label}</option>
						))}
					</select>,
				)}

				{factorRow(
					'tension',
					'Tension',
					<label className="slider-row inline">
						<input
							type="range"
							aria-label="Panel tension"
							min={0}
							max={100}
							step={1}
							value={Math.round((meta.tension ?? 0.5) * 100)}
							onChange={(event) => {
								const value = Number(event.target.value) / 100
								commitFactor('tension', { beat: { tension: value }, meta: { tension: value } })
							}}
						/>
						<code>{Math.round((meta.tension ?? 0.5) * 100)}</code>
					</label>,
				)}

				{factorRow(
					'eyeline',
					'Eyeline / 180° Side',
					<div className="segmented compact">
						{(['left', 'neutral', 'right'] as const).map((side) => (
							<button key={side} type="button" className={eyelineSide === side ? 'active' : ''} onClick={() => setEyelineSide(side)}>
								{side === 'left' ? 'Left' : side === 'right' ? 'Right' : 'Neutral'}
							</button>
						))}
					</div>,
				)}

				{factorRow(
					'silent',
					'Silent Ma Beat',
					<button
						type="button"
						className={meta.silent ? 'inspector-toggle active' : 'inspector-toggle'}
						onClick={() => {
							toggleSilentPanelOnPage(editor, page, panelIdx)
							const result = writePanelFactorsAndMarkStale(editor, page, setManual(pf, panelIdx, 'silent', true), [PANEL_FACTOR_TO_GRAPH.silent])
							setStatus(`${meta.silent ? 'Cleared' : 'Set'} silent Ma on panel #${panelIdx + 1} · ${result.staleFactors.length} downstream factor(s) stale`)
						}}
					>
						{meta.silent ? 'Silent (no balloon)' : 'Set Silent Ma'}
					</button>,
				)}

				{factorRow(
					'masterStyle',
					'Master Override',
					<select
						aria-label="Panel master style override"
						value={panelMasterId}
						onChange={(event) => {
							const nextStyle = event.target.value
								? applyMasterToPanel(style, panelIdx, event.target.value as (typeof MASTERS)[number]['id'])
								: clearPanelMaster(style, panelIdx)
							writePageStyleAndMarkStale(editor, page, nextStyle, ['styleBible', 'panelLayout'])
							setStatus(event.target.value ? `Panel #${panelIdx + 1} overridden to a master style` : `Panel #${panelIdx + 1} inherits the page style`)
						}}
					>
						<option value="">Inherit page</option>
						{MASTERS.map((m) => (
							<option key={m.id} value={m.id}>{m.name}</option>
						))}
					</select>,
				)}

				<div className="factor-row">
					<div className="factor-row-head">
						<span className="factor-label">Bound Asset Refs</span>
						<SourceBadge source={resolvePanelFactorSource(pf, panelIdx, 'assetRefs', panelHasMaster)} />
						<LockToggle locked={isLocked(pf, panelIdx, 'assetRefs')} label="Bound Asset Refs" onToggle={() => writePanelFactorsOnly(editor, page, toggleLocked(pf, panelIdx, 'assetRefs'))} />
					</div>
					<div className="token-chip-row">
						{currentRefs.length === 0 ? <span className="side-hint inline">No bound refs</span> : null}
						{currentRefs.map((tag) => (
							<span key={tag} className="token-chip">
								{tag}
								<button
									type="button"
									aria-label={`Remove ${tag}`}
									onClick={() => commitFactor('assetRefs', { beat: { assetRefs: currentRefs.filter((t) => t !== tag) }, meta: { assetRefs: currentRefs.filter((t) => t !== tag) } }, `Unbound ${tag}`)}
								>
									<IconClose />
								</button>
							</span>
						))}
					</div>
					{availableTags.length ? (
						<select
							aria-label="Bind an asset reference"
							value=""
							onChange={(event) => {
								if (!event.target.value) return
								const next = Array.from(new Set([...currentRefs, event.target.value]))
								commitFactor('assetRefs', { beat: { assetRefs: next }, meta: { assetRefs: next } }, `Bound ${event.target.value}`)
							}}
						>
							<option value="">Bind asset…</option>
							{availableTags.map((tag) => (
								<option key={tag} value={tag}>{tag}</option>
							))}
						</select>
					) : null}
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Optical Lens Lab</h3>
					<span>Live sync</span>
				</div>
				<div className="optics-readout-card">
					<div className="optics-stat">
						<small>Eq. Focal</small>
						<strong>{computed.eqFocalMm}mm</strong>
					</div>
					<div className="optics-stat">
						<small>FOV</small>
						<strong>{computed.hFovDeg}°</strong>
					</div>
					<div className="optics-stat">
						<small>Shot</small>
						<strong>{computed.shotLabelZh}</strong>
					</div>
					<div className="optics-stat">
						<small>DOF</small>
						<strong>{computed.dofLabelZh}</strong>
					</div>
				</div>
				<div className="param-grid-2" style={{ marginTop: 8 }}>
					<label>
						Sensor
						<select
							aria-label="Sensor Format"
							value={optParams.sensor}
							onChange={(event) => setStatus(applyOpticsToPanel(editor, page, panelIdx, { sensor: event.target.value as SensorId }))}
						>
							{SENSORS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</label>
					<label className="optics-angle-readout">
						Angle
						<code>{ANGLE_LABELS[meta.angle] ?? meta.angle}</code>
					</label>
				</div>
				<div className="slider-stack" style={{ marginTop: 8 }}>
					<label className="slider-row">
						<span>Focal</span>
						<code>{optParams.focalMm}mm</code>
						<input type="range" aria-label="Focal Length" min={12} max={200} step={1} value={optParams.focalMm} onChange={(event) => setStatus(applyOpticsToPanel(editor, page, panelIdx, { focalMm: Number(event.target.value) }))} />
					</label>
					<label className="slider-row">
						<span>Aperture</span>
						<code>f/{optParams.fStop.toFixed(1)}</code>
						<input type="range" aria-label="Aperture" min={1.4} max={22} step={0.2} value={optParams.fStop} onChange={(event) => setStatus(applyOpticsToPanel(editor, page, panelIdx, { fStop: Number(event.target.value) }))} />
					</label>
					<label className="slider-row">
						<span>Distance</span>
						<code>{optParams.subjectDistM.toFixed(1)}m</code>
						<input type="range" aria-label="Subject Distance" min={0.5} max={20} step={0.5} value={optParams.subjectDistM} onChange={(event) => setStatus(applyOpticsToPanel(editor, page, panelIdx, { subjectDistM: Number(event.target.value) }))} />
					</label>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Framing & Bleed</h3>
					<span>#{panelIdx + 1}</span>
				</div>
				<div className="slider-stack">
					<label className="slider-row">
						<span>Zoom</span>
						<code>{(meta.imageScale || 1).toFixed(2)}×</code>
						<input type="range" aria-label="Panel Zoom" min={0.5} max={2.8} step={0.05} value={meta.imageScale || 1} onChange={(event) => updateMeta({ imageScale: Number(event.target.value) })} />
					</label>
					<label className="slider-row">
						<span>Pan X</span>
						<code>{Math.round(meta.imageOffsetX || 0)}px</code>
						<input type="range" aria-label="Horizontal Pan" min={-180} max={180} step={2} value={meta.imageOffsetX || 0} onChange={(event) => updateMeta({ imageOffsetX: Number(event.target.value) })} />
					</label>
					<label className="slider-row">
						<span>Pan Y</span>
						<code>{Math.round(meta.imageOffsetY || 0)}px</code>
						<input type="range" aria-label="Vertical Pan" min={-180} max={180} step={2} value={meta.imageOffsetY || 0} onChange={(event) => updateMeta({ imageOffsetY: Number(event.target.value) })} />
					</label>
					<label className="slider-row">
						<span>Rotation</span>
						<code>{Math.round(meta.imageRotation || 0)}°</code>
						<input type="range" aria-label="Artwork Rotation" min={-25} max={25} step={1} value={meta.imageRotation || 0} onChange={(event) => updateMeta({ imageRotation: Number(event.target.value) })} />
					</label>
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 6 }}>
					<label className="remedy-btn" style={{ cursor: 'pointer', justifyContent: 'center', margin: 0 }}>
						<IconImage /> Upload Artwork
						<input
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={(event) => {
								const file = event.target.files?.[0]
								if (!file) return
								const reader = new FileReader()
								reader.onload = () => {
									const dataUrl = typeof reader.result === 'string' ? reader.result : ''
									if (dataUrl) {
										updateMeta({ imageDataUrl: dataUrl, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })
										setStatus(`Loaded "${file.name}" into panel #${panelIdx + 1} (drag to pan, scroll to zoom)`)
									}
								}
								reader.readAsDataURL(file)
								event.target.value = ''
							}}
						/>
					</label>
					<button type="button" onClick={() => setStatus(fillRealInterrogationArtworkOnPage(editor, page))}>
						<IconSparkles /> Fill Page Art
					</button>
				</div>
				<div className="bleed-grid-row" style={{ marginTop: 8 }}>
					{(['bT', 'bB', 'bL', 'bR'] as const).map((edge) => {
						const active = Boolean(geneHit?.gene[edge])
						const label = { bT: 'Top Bleed', bB: 'Bottom Bleed', bL: 'Left Bleed', bR: 'Right Bleed' }[edge]
						return (
							<button key={edge} type="button" className={active ? 'preset-pill active' : 'preset-pill'} onClick={() => setStatus(togglePanelBleedOnPage(editor, page, panelIdx, edge))}>
								{label}
							</button>
						)
					})}
					<button type="button" className={geneHit?.gene.nest ? 'preset-pill active' : 'preset-pill'} onClick={() => setStatus(togglePanelNestOnPage(editor, page, panelIdx))}>
						Subsplit
					</button>
					<button type="button" className="preset-pill" onClick={() => updateMeta({ imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })}>
						Reset View
					</button>
				</div>
				<div className="guide-toggles" style={{ marginTop: 10 }}>
					<label className="check-row">
						<input type="checkbox" checked={Boolean(overrides.showInnerFrame)} onChange={(event) => setStatus(updatePageParametric(editor, page, { showInnerFrame: event.target.checked }, false))} />
						<span>Show B4 safe trim margin and crop marks</span>
					</label>
					<label className="check-row">
						<input type="checkbox" checked={Boolean(overrides.showRuleOfThirds)} onChange={(event) => setStatus(updatePageParametric(editor, page, { showRuleOfThirds: event.target.checked }, false))} />
						<span>Show rule-of-thirds composition grid</span>
					</label>
					<label className="check-row">
						<input type="checkbox" checked={Boolean(overrides.showAxis180)} onChange={(event) => setStatus(updatePageParametric(editor, page, { showAxis180: event.target.checked }, false))} />
						<span>Enable 180° camera axis check ({axisAudit.summary})</span>
					</label>
				</div>
			</section>
		</div>
	)
}
