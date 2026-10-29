// =============================================================================
// chrome.tsx — the app-level chrome that is not the left source list or the
// right Inspector: the unified TopBar, the tldraw canvas chrome overrides, and
// the modal surfaces (Compare, Reader, model Settings). The page pipeline now
// lives in the left source list and every per-selection control lives in the
// Inspector (src/studio/ui/inspector/*), so this file no longer hosts the drawer.
// =============================================================================

import { useEffect, useState } from 'react'
import { DefaultStylePanel, useEditor, useValue, type Editor } from 'tldraw'
import { applyProviderPreset, loadSettings, PROVIDER_PRESETS, saveSettings, type ApiSettings, type ProviderId } from '../ai/settings'
import { ANGLE_LABELS, SCENARIO_LABELS, SHOT_LABELS } from '../demo/book'
import { applyLayoutChoice, selectedPages } from '../editor/pipeline'
import { downloadBlob, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import { configFor, generate, sanitize, type Genome } from '../layout/engine'
import { asScenario, pickLayoutBundle } from '../layout/score'
import { readJson, readPageParams, type PanelMeta } from '../model'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { CARD, CONTAINER, BUBBLE, PROMPT } from '../shapes/schema'
import { type CompiledBook } from '../spec/compile'
import { IconAuto, IconBook, IconClose, IconDownload, IconGrid, IconLayers, IconMoon, IconSettings, IconSliders, IconSun } from './icons'
import { themeLabel, type ThemePref } from './theme'

// Our own shape types never expose tldraw style props (color/fill/etc.), so the
// default Style Panel has nothing useful to show for them. Keep it hidden unless
// the selection (or active tool) is a native tldraw shape/tool, e.g. draw or geo.
const MANGA_SHAPE_TYPES = new Set<string>([CONTAINER, CARD, BUBBLE, PROMPT])

export function ConditionalStylePanel() {
	const editor = useEditor()
	const showStylePanel = useValue(
		'show-style-panel',
		() => {
			const selected = editor.getSelectedShapes()
			if (selected.length > 0) return selected.some((shape) => !MANGA_SHAPE_TYPES.has(shape.type))
			const toolId = editor.getCurrentToolId()
			return toolId !== 'select' && !MANGA_SHAPE_TYPES.has(toolId)
		},
		[editor],
	)
	if (!showStylePanel) return null
	return <DefaultStylePanel />
}

export function TopBar({
	status,
	themePref,
	onToggleTheme,
	leftOpen,
	onToggleLeft,
	rightOpen,
	onToggleRight,
	onOpenReader,
	onExport,
	onOpenSettings,
	onOpenPalette,
	pageLabel,
}: {
	status: string
	themePref: ThemePref
	onToggleTheme: () => void
	leftOpen: boolean
	onToggleLeft: () => void
	rightOpen: boolean
	onToggleRight: () => void
	onOpenReader: () => void
	onExport: () => void
	onOpenSettings: () => void
	onOpenPalette: () => void
	/** Short label of the active page, e.g. "P2 · Rising Action". */
	pageLabel?: string
}) {
	const settings = loadSettings()
	const modelOnline = settings.useApi
	const modelTitle = modelOnline
		? `Models online · ${settings.model} / ${settings.imageModel} · click for settings (⌘,)`
		: `Offline engine · click to configure models (⌘,)`

	return (
		<header className="topbar apple-clean-topbar">
			<div className="brand-cluster">
				<button
					type="button"
					className={`drawer-toggle-btn icon-only ${leftOpen ? 'active' : ''}`}
					onClick={onToggleLeft}
					title={leftOpen ? 'Hide the source list (⌘1)' : 'Show the source list (⌘1)'}
					aria-label="Toggle source list"
				>
					<IconLayers />
				</button>
				<div className="doc-title">
					<strong>Manga Studio</strong>
					{pageLabel ? <span className="doc-page">{pageLabel}</span> : null}
				</div>
			</div>

			<button type="button" className="topbar-search" onClick={onOpenPalette} title="Open the command palette" aria-label="Open command palette">
				<svg className="tl-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
					<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
					<line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
				<span>Search commands</span>
				<kbd>⌘K</kbd>
			</button>

			<div className="status-pill" title={status}>
				{status}
			</div>

			<div className="topbar-right-actions">
				<button type="button" onClick={onOpenReader} title="Open the book reader (⌘R)">
					<IconBook /> Reader
				</button>
				<button type="button" onClick={onExport} title="Export a standalone HTML reader (⌘⇧E)">
					<IconDownload /> Export
				</button>
				<button
					type="button"
					className="model-status"
					onClick={onOpenSettings}
					title={modelTitle}
					aria-label={modelOnline ? 'Model settings, online' : 'Model settings, offline engine'}
				>
					<span className={`model-dot ${modelOnline ? 'online' : 'offline'}`} aria-hidden="true" />
				</button>
				<button
					type="button"
					className="theme-toggle-btn"
					onClick={onToggleTheme}
					title={`Appearance: ${themeLabel(themePref)} · click to cycle Light / Dark / Auto`}
					aria-label={`Appearance ${themePref}, cycle light, dark or auto`}
				>
					{themePref === 'auto' ? <IconAuto /> : themePref === 'light' ? <IconSun /> : <IconMoon />}
				</button>
				<button
					type="button"
					className={`drawer-toggle-btn icon-only ${rightOpen ? 'active' : ''}`}
					onClick={onToggleRight}
					title={rightOpen ? 'Hide the Inspector (⌘2)' : 'Show the Inspector (⌘2)'}
					aria-label="Toggle Inspector"
				>
					<IconSliders />
				</button>
			</div>
		</header>
	)
}

export function CompareModal({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
	const [mode, setMode] = useState<'roll' | 'mutate'>('roll')
	const [strength, setStrength] = useState(0.45)

	if (!editor) return null
	const page = selectedPages(editor)[0]
	if (!page) return null
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const baseGenome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const { top, ms } = pickLayoutBundle(page.props.seed, config, page.props.targetPanels, asScenario(page.props.scenario), {
		count: 8,
		poolSize: 36,
		mode,
		baseGenome,
		mutationStrength: strength,
	})
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box wide" onClick={(event) => event.stopPropagation()}>
				<header>
					<div className="modal-title-row">
						<h3>
							<IconGrid /> Layout Candidates · {page.props.title} ({SCENARIO_LABELS[page.props.scenario] ?? page.props.scenario} · {ms}ms)
						</h3>
						<div className="tabs">
							<button type="button" className={mode === 'roll' ? 'on' : ''} onClick={() => setMode('roll')}>
								Sample 8
							</button>
							<button type="button" className={mode === 'mutate' ? 'on' : ''} onClick={() => setMode('mutate')}>
								Derive Variants
							</button>
						</div>
						{mode === 'mutate' ? (
							<label className="inline-slider">
								Mutation {Math.round(strength * 100)}%
								<input type="range" min={0.15} max={0.95} step={0.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
							</label>
						) : null}
					</div>
					<button type="button" onClick={onClose}>
						<IconClose /> Close
					</button>
				</header>
				<div className="compare-grid eight-grid">
					{top.map((candidate, rank) => {
						const panels = candidate.layout.panels.map((panel, index) => ({
							pts: panel.pts,
							meta: metas[index] ?? {
								imageSeed: `${candidate.seed}-p${index}`,
								imageOffsetX: 0,
								imageOffsetY: 0,
								imageScale: 1,
								imageRotation: 0,
								aspect: '1:1',
								shot: 'MS' as const,
								angle: 'eye' as const,
								focal: '50mm' as const,
								beat: '',
								who: ['kanta'],
								fries: 'none' as const,
								eyeline: [8, -4] as [number, number],
								imageDataUrl: '',
								environment: page.props.environment,
							},
							environment: page.props.environment,
							lighting: page.props.lighting,
							energy: page.props.scenario === 'action' ? ('burst' as const) : ('calm' as const),
						}))
						const svg = renderPageSvg({
							uid: candidate.seed.replace(/[^a-zA-Z0-9]/g, ''),
							title: candidate.seed,
							width: candidate.layout.width,
							height: candidate.layout.height,
							inner: candidate.layout.inner,
							panels,
							bubbles: [],
							numbers: 'badge',
							director: false,
							lineWidth: overrides.lineW,
						})
						return (
							<div
								key={candidate.seed}
								className="candidate"
								onClick={() => {
									applyLayoutChoice(editor, page, { seed: candidate.seed, genome: candidate.layout.genome, score: candidate.score, reasons: candidate.reasons })
									onClose()
								}}
							>
								<div className="cand-svg" dangerouslySetInnerHTML={{ __html: svg }} />
								<div className="cand-foot">
									<strong>
										#{rank + 1} · Total {Math.round(candidate.score * 100)} · {candidate.layout.panels.length} panels
									</strong>
									<span>{candidate.reasons.slice(0, 2).join(' · ')}</span>
									<small>Optimize: {candidate.mutations[0]}</small>
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export function ReaderModal({ book, onClose }: { book: CompiledBook; onClose: () => void }) {
	const [mode, setMode] = useState<'spread' | 'webtoon' | 'panel' | 'bible'>('spread')
	const [spreadIdx, setSpreadIdx] = useState(0)
	const [panelStep, setPanelStep] = useState(0)
	const spreads: CompiledBook['pages'][] = []
	for (let index = 0; index < book.pages.length; index += 2) spreads.push(book.pages.slice(index, index + 2))
	const flatPanels = book.pages.flatMap((page, pagePosition) =>
		page.panels.map((panel) => ({
			pagePosition,
			pageTitle: `${page.chapterTitle} · ${page.specTitle}`,
			svg: page.svg,
			width: page.width,
			height: page.height,
			panel,
			model: page.model,
		})),
	)
	const activeSpread = spreads[Math.min(spreadIdx, Math.max(0, spreads.length - 1))] ?? []
	const activePanel = flatPanels[Math.min(panelStep, Math.max(0, flatPanels.length - 1))]
	const firstPageModel: PageRenderModel | undefined = activeSpread[0]?.model ?? book.pages[0]?.model

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box reader" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>
						<IconBook /> {book.spec.title} · Book Reader Preview & Print Export
					</h3>
					<div className="tabs">
						<button type="button" className={mode === 'spread' ? 'on' : ''} onClick={() => setMode('spread')}>
							Right-to-Left Two-Page Spread
						</button>
						<button type="button" className={mode === 'webtoon' ? 'on' : ''} onClick={() => setMode('webtoon')}>
							Vertical Webtoon Scroll
						</button>
						<button type="button" className={mode === 'panel' ? 'on' : ''} onClick={() => setMode('panel')}>
							Guided Panel-by-Panel View
						</button>
						<button type="button" className={mode === 'bible' ? 'on' : ''} onClick={() => setMode('bible')}>
							Character & World Appendix
						</button>
					</div>
					<div className="tabs">
						{firstPageModel ? (
							<>
								<button type="button" onClick={() => exportPageSvgFile(firstPageModel, `${book.spec.title}-P1.svg`)}>
									<IconDownload /> Export Page SVG
								</button>
								<button
									type="button"
									onClick={async () => {
										const blob = await exportPagePng2400(firstPageModel, 2400)
										downloadBlob(`${book.spec.title}-P1-2400px.png`, blob, 'image/png')
									}}
								>
									<IconDownload /> Export 2400px PNG
								</button>
							</>
						) : null}
						<button type="button" onClick={onClose}>
							<IconClose /> Close
						</button>
					</div>
				</header>
				{mode === 'spread' ? (
					<div className="spread-body">
						<div className="spread-stage">
							{activeSpread.map((page) => (
								<div key={page.id} className="spread-leaf" dangerouslySetInnerHTML={{ __html: page.svg }} />
							))}
						</div>
						<div className="pager">
							<button type="button" onClick={() => setSpreadIdx(Math.min(spreads.length - 1, spreadIdx + 1))}>
								← Next Page (Left)
							</button>
							<span>
								#{spreadIdx + 1} / {spreads.length} Spread
							</span>
							<button type="button" onClick={() => setSpreadIdx(Math.max(0, spreadIdx - 1))}>
								Prev Page (Right) →
							</button>
						</div>
					</div>
				) : null}
				{mode === 'webtoon' ? (
					<div className="webtoon-body">
						{book.pages.map((page) => (
							<div key={page.id} className="webtoon-leaf" dangerouslySetInnerHTML={{ __html: page.svg }} />
						))}
					</div>
				) : null}
				{mode === 'panel' && activePanel ? (
					<div className="spread-body">
						<div
							className="panel-stage"
							dangerouslySetInnerHTML={{
								__html: activePanel.svg.replace(
									/viewBox="[^"]*"/,
									`viewBox="${activePanel.panel.minX - 18} ${activePanel.panel.minY - 18} ${activePanel.panel.maxX - activePanel.panel.minX + 36} ${activePanel.panel.maxY - activePanel.panel.minY + 36}"`,
								),
							}}
						/>
						<div className="pager">
							<button type="button" onClick={() => setPanelStep(Math.max(0, panelStep - 1))}>
								Prev Panel
							</button>
							<span>
								{activePanel.pageTitle} · #{activePanel.panel.n} ({SHOT_LABELS[activePanel.panel.shot] ?? activePanel.panel.shot} /{' '}
								{ANGLE_LABELS[activePanel.panel.angle] ?? activePanel.panel.angle} / {activePanel.panel.focal})
							</span>
							<button type="button" onClick={() => setPanelStep(Math.min(flatPanels.length - 1, panelStep + 1))}>
								Next Panel
							</button>
						</div>
					</div>
				) : null}
				{mode === 'bible' ? (
					<div className="bible-body">
						<p>{book.spec.bible.story}</p>
						<p>{book.spec.bible.worldRules}</p>
						<div className="bible-chars">
							{book.spec.bible.characters.map((char, index) => (
								<div key={char.tag} className="bible-char">
									<strong>
										{char.name} ({char.tag})
									</strong>
									<p>{char.appearance}</p>
									<div dangerouslySetInnerHTML={{ __html: book.sheets[index] ?? '' }} />
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>
		</div>
	)
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const [form, setForm] = useState<ApiSettings>(() => loadSettings())
	const [health, setHealth] = useState<string>('Checking local proxy and offline engine status...')
	useEffect(() => {
		fetch('/api/health')
			.then((res) => res.json())
			.then((data: { ok?: boolean; capabilities?: string[]; env?: Record<string, boolean> }) => {
				const envKeys = Object.entries(data.env ?? {})
					.filter(([, on]) => on)
					.map(([key]) => key)
				setHealth(
					data.ok
						? `Multimodal proxy ready (supports ${data.capabilities?.join(' / ') || 'text / vision / image'}${envKeys.length ? `; detected env keys ${envKeys.join(', ')}` : '; missing key falls back to built-in offline engine'})`
						: 'Offline engine only',
				)
			})
			.catch(() => setHealth('Built-in offline model and screentone engine ready'))
	}, [])

	const selectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setForm(next)
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box settings-modal" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>
						<IconSettings /> Multimodal Model Settings (Text · Vision · Image)
					</h3>
					<button type="button" onClick={onClose}>
						<IconClose /> Close
					</button>
				</header>
				<div className="settings-form">
					<p className="health-banner">{health}</p>
					<div className="preset-bar">
						{PROVIDER_PRESETS.map((preset) => (
							<button key={preset.id} type="button" className={form.provider === preset.id ? 'preset-pill active' : 'preset-pill'} onClick={() => selectPreset(preset.id)}>
								{preset.label}
							</button>
						))}
					</div>
					<label className="row">
						<input type="checkbox" checked={form.useApi} onChange={(event) => setForm({ ...form, useApi: event.target.checked })} />
						Enable online LLM APIs (when off, uses the zero-config built-in offline engine and screentone renderer)
					</label>
					<div className="settings-grid-2">
						<label>
							Text Provider
							<select value={form.provider} onChange={(event) => selectPreset(event.target.value as ProviderId)}>
								{PROVIDER_PRESETS.map((preset) => (
									<option key={preset.id} value={preset.id}>
										{preset.label}
									</option>
								))}
							</select>
						</label>
						<label>
							Endpoint Base URL
							<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
						</label>
						<label>
							API Key
							<input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="sk-... / AIza..." />
						</label>
						<label>
							Text Model
							<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="gpt-4o-mini / gemini-2.5-flash" />
						</label>
						<label>
							Vision Model
							<input value={form.visionModel} onChange={(event) => setForm({ ...form, visionModel: event.target.value })} placeholder="gpt-4o / gemini-2.5-flash" />
						</label>
						<label>
							Image Model
							<input value={form.imageModel} onChange={(event) => setForm({ ...form, imageModel: event.target.value })} placeholder="gpt-image-1 / flux-1.1-pro" />
						</label>
					</div>
					<div className="actions">
						<button
							type="button"
							className="primary"
							onClick={() => {
								saveSettings(form)
								onClose()
							}}
						>
							Save AI Settings
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
