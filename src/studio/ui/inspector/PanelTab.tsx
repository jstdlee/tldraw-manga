// =============================================================================
// PanelTab.tsx — Inspector "Panel" tab (Stage 2 beats + Stage 4 optics).
// Per-panel action beat, silent-Ma toggle, the optical lens lab (sensor, angle,
// focal length, aperture, subject distance), panel framing (zoom / pan /
// rotation), per-edge bleed, subsplit and the composition / axis guides.
// Moved out of the legacy left drawer's Optics and Script sections.
// =============================================================================

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
import { configFor, generate, locatePanelGene, sanitize, type Genome } from '../../layout/engine'
import { readJson, readPageParams, type PanelMeta } from '../../model'
import { auditCameraAxis, computeOptics, defaultOpticsForMeta, SENSORS, type SensorId } from '../../optics/shotLab'
import { ANGLES } from '../../prompts/library'
import { CONTAINER, type MangaContainer } from '../../shapes/schema'
import { IconImage, IconSparkles } from '../icons'

export function PanelTab({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	// Re-read the selected panel reactively so the lab follows the canvas.
	const panelIdx = useValue(
		'inspector-panel-idx',
		() => (page ? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0) : 0),
		[page],
	)

	if (!editor || !page) {
		return (
			<div className="inspector-body">
				<section className="side-section">
					<div className="sec-head">
						<h3>Panel Optics & Framing</h3>
						<span>Select a panel</span>
					</div>
					<p className="side-hint">Select any panel cell on a page to adjust its beat, focal length, aperture, framing and edge bleed.</p>
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
						<h3>Panel Optics & Framing</h3>
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

	const selectPanel = (idx: number) => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })
	const updateMeta = (patch: Partial<PanelMeta>) => {
		const next = metas.map((item, idx) => (idx === panelIdx ? { ...item, ...patch } : item))
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Panel #{panelIdx + 1} · {page.props.title}</h3>
					<span>{meta.silent ? 'Silent Ma' : 'Dialogue'}</span>
				</div>
				<div className="panel-pill-selector">
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
						onChange={(event) => updateMeta({ beat: event.target.value })}
					/>
				</div>
				<div className="quick-ai-grid">
					<button
						type="button"
						className={meta.silent ? 'active-toggle-btn' : ''}
						onClick={() => setStatus(toggleSilentPanelOnPage(editor, page, panelIdx))}
					>
						{meta.silent ? 'Silent Ma Active' : 'Set Silent Ma'}
					</button>
					<button type="button" onClick={() => setStatus(fillRealInterrogationArtworkOnPage(editor, page))}>
						<IconImage /> Fill Panel Art
					</button>
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
					<label>
						Angle
						<select
							aria-label="Camera Angle"
							value={meta.angle}
							onChange={(event) => setStatus(applyOpticsToPanel(editor, page, panelIdx, { angle: event.target.value as PanelMeta['angle'] }))}
						>
							{ANGLES.map((a) => (
								<option key={a} value={a}>
									{ANGLE_LABELS[a] ?? a}
								</option>
							))}
						</select>
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
