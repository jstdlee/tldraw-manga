import { Fragment, useEffect, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { applyProviderPreset, loadSettings, PROVIDER_PRESETS, saveSettings, type ApiSettings, type ProviderId } from '../ai/settings'
import {
	ANGLE_LABELS,
	BUBBLE_LABELS,
	bookFromText,
	PRESET_LABELS,
	SAMPLE_STORIES,
	SCENARIO_LABELS,
	SHOT_LABELS,
} from '../demo/book'
import {
	addBubbleToPage,
	addStandaloneProsodyToPage,
	applyEditorialRemedyOnPage,
	fillRealInterrogationArtworkOnPage,
	applyEmotionStrategyOnPage,
	applyLayoutChoice,
	applyOpticsToPanel,
	applySelectedCardAiAction,
	applyUniversalFiveStagePreset,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	getPageDiff,
	mutateSelectedPages,
	polishPageWithAi,
	rerollSelectedPages,
	revertPageDiff,
	rewriteStoryWithLlm,
	runBlock,
	extendNextPageFromPage,
	runJevFiveStageCompile,
	selectedPages,
	spawnBook,
	spawnPromptBlock,
	togglePanelBleedOnPage,
	togglePanelNestOnPage,
	toggleSilentPanelOnPage,
	updatePageParametric,
} from '../editor/pipeline'
import { compileProgrammaticLayoutGenome, listUniversalPresets } from '../jev/fiveStageEngine'
import { readerHtml } from '../export/htmlReader'
import { downloadBlob, downloadText, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import {
	configFor,
	generate,
	locatePanelGene,
	PAGE_RATIOS,
	realize,
	ROW_RANGES,
	sanitize,
	type Genome,
} from '../layout/engine'
import {
	asScenario,
	EMOTION_DIRECTION_TIPS,
	layoutFeatures,
	layoutScore,
	pickLayoutBundle,
	SCENARIOS,
} from '../layout/score'
import {
	PROSODY_STYLE_LABELS,
	readJson,
	readPageParams,
	type Beat,
	type BubbleStyle,
	type PanelMeta,
	type ProsodyStyle,
} from '../model'
import { auditCameraAxis, computeOptics, defaultOpticsForMeta, SENSORS, type SensorId } from '../optics/shotLab'
import { ANGLES, PROMPT_BLOCKS } from '../prompts/library'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { BUBBLE, CARD, CONTAINER, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { compileBook, type CompiledBook } from '../spec/compile'
import { openPageContextInspector } from './contextMenu'
import {
	IconBolt,
	IconBook,
	IconBubble,
	IconCamera,
	IconCheck,
	IconClose,
	IconCompass,
	IconDownload,
	IconEye,
	IconFileText,
	IconGrid,
	IconImage,
	IconMoon,
	IconPlay,
	IconPlus,
	IconRefresh,
	IconSend,
	IconSettings,
	IconSliders,
	IconSparkles,
	IconSun,
	IconTag,
	IconUser,
	IconWand,
} from './icons'

const PRESETS = ['seizen', 'std', 'action', 'tobira'] as const
const BUBBLES: BubbleStyle[] = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']
const PROSODY_STYLES: ProsodyStyle[] = ['pill', 'seal', 'slant', 'burst', 'minimal', 'off']

// Display labels for the story-agnostic universal 5-stage presets.
const UNIVERSAL_PRESET_LABELS: Record<string, string> = {
	'wutai-lundao': 'Wutai Mountain Debate on the Dao · Song Shan-Shui Ink Wash',
	'seagull-fries': 'Two Gulls on the Pier · Coastal Watercolor',
	'noir-watchmaker': 'Rainy Interrogation · Stopped Watch (Seinen Noir)',
	'shonen-blade': 'Storm Shrine · Shonen Duel',
}

export type SidebarTab = 'cards' | 'layout' | 'story' | 'camera' | 'llm'

export function TopBar({
	editor,
	story: _story,
	status,
	setStatus,
	onOpenCompare,
	onOpenReader,
	onOpenSettings,
	onSwitchTab,
	theme,
	onToggleTheme,
	drawerOpen = true,
	onToggleDrawer,
}: {
	editor: Editor | null
	story: string
	status: string
	setStatus: (value: string) => void
	onOpenCompare: () => void
	onOpenReader: (book: CompiledBook) => void
	onOpenSettings: () => void
	onSwitchTab: (tab: SidebarTab) => void
	theme: 'light' | 'dark'
	onToggleTheme: () => void
	drawerOpen?: boolean
	onToggleDrawer?: () => void
}) {
	const settings = loadSettings()
	const run = async (label: string, fn: (ed: Editor) => Promise<string | void> | string | void) => {
		if (!editor) return
		setStatus(`Running: ${label}...`)
		const result = await fn(editor)
		setStatus(typeof result === 'string' && result ? result : `${label} done`)
	}

	const pages = useValue(
		'pipeline-pages',
		() => {
			if (!editor) return [] as MangaContainer[]
			return editor
				.getCurrentPageShapes()
				.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
				.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))
		},
		[editor],
	)
	const selectedPageId = useValue(
		'pipeline-selected-page',
		() => (editor ? selectedPages(editor)[0]?.id ?? null : null),
		[editor],
	)

	const focusPage = (page: MangaContainer) => {
		if (!editor) return
		editor.select(page.id)
		editor.zoomToSelection({ animation: { duration: 300 } })
		setStatus(`Focused ${page.props.title}`)
	}

	return (
		<header className="topbar apple-clean-topbar">
			<div className="brand-cluster">
				{onToggleDrawer ? (
					<button
						type="button"
						className={`drawer-toggle-btn ${drawerOpen ? 'active' : ''}`}
						onClick={onToggleDrawer}
						title={drawerOpen ? 'Hide the Inspector drawer (full-canvas mode)' : 'Show the Inspector drawer'}
					>
						<IconSliders /> Inspector
					</button>
				) : null}
				<div className="brand">
					<strong>Manga Studio</strong>
				</div>
				<select
					className="universal-preset-select"
					aria-label="Story Preset"
					title="Switch story and asset preset"
					value=""
					onChange={(event) => {
						const presetId = event.target.value
						if (!presetId) return
						void run('Switch preset', (ed) => applyUniversalFiveStagePreset(ed, presetId))
						event.currentTarget.value = ''
					}}
				>
					<option value="" disabled>
						Story Preset
					</option>
					{listUniversalPresets().map((preset) => (
						<option key={preset.id} value={preset.id}>
							{UNIVERSAL_PRESET_LABELS[preset.id] ?? preset.title}
						</option>
					))}
				</select>
			</div>

			<div className="pipeline-strip" role="group" aria-label="Page pipeline">
				{pages.map((page, idx) => (
					<Fragment key={page.id}>
						{idx > 0 ? (
							<span className="pipe-arrow" aria-hidden="true">
								›
							</span>
						) : null}
						<button
							type="button"
							className={`pipe-pill ${page.id === selectedPageId ? 'active' : ''}`}
							onClick={() => focusPage(page)}
							title={page.props.title}
						>
							P{page.props.pageIndex || idx + 1}
						</button>
					</Fragment>
				))}
				{pages.length ? (
					<span className="pipe-arrow" aria-hidden="true">
						›
					</span>
				) : null}
				<button
					type="button"
					className="pipe-extend"
					title="Extend the pipeline with a new page that inherits the current context"
					onClick={() =>
						void run('Extend next page', (ed) => {
							const active = selectedPages(ed)[0] ?? pages[pages.length - 1]
							return extendNextPageFromPage(ed, active?.id).message
						})
					}
				>
					<IconPlus /> Extend Page
				</button>
			</div>

			<div className="status-pill" title={status}>
				{status}
			</div>

			<div className="topbar-right-actions">
				<button
					type="button"
					title="Inspect inherited characters, props, 180-degree axis and script beats"
					onClick={() => {
						if (!editor) return
						const page = selectedPages(editor)[0] ?? pages[0]
						if (page) openPageContextInspector(page.id)
					}}
				>
					<IconCompass /> Page Context
				</button>
				<button type="button" onClick={onOpenCompare} title="Compare 8 candidate layouts">
					<IconGrid /> Compare (8)
				</button>
				<button
					type="button"
					onClick={() => {
						if (!editor) return
						onOpenReader(compileBook(editor))
					}}
					title="Open the book reader"
				>
					<IconBook /> Reader
				</button>
				<button
					type="button"
					onClick={() => {
						if (!editor) return
						const book = compileBook(editor)
						downloadText(`${book.spec.title}.html`, readerHtml(book), 'text/html;charset=utf-8')
						setStatus('Exported standalone HTML reader')
					}}
					title="Export a standalone HTML reader"
				>
					<IconDownload /> Export
				</button>
				<button
					type="button"
					className="llm-status-pill"
					onClick={() => {
						onSwitchTab('llm')
						onOpenSettings()
					}}
					title={`Model: ${settings.model} / ${settings.imageModel}`}
				>
					<span className="dot" />
					<span>
						<IconSettings /> Models
					</span>
				</button>
				<button type="button" onClick={onToggleTheme} title="Toggle light / dark theme">
					{theme === 'light' ? <IconMoon /> : <IconSun />}
				</button>
			</div>
		</header>
	)
}

export function LeftLibrary({
	editor,
	story,
	setStory,
	setStatus,
	activeTab,
	setActiveTab,
	onOpenCompare,
}: {
	editor: Editor | null
	story: string
	setStory: (value: string) => void
	setStatus: (value: string) => void
	activeTab: SidebarTab
	setActiveTab: (tab: SidebarTab) => void
	onOpenCompare?: () => void
}) {
	const [globalCustomPrompt, setGlobalCustomPrompt] = useState('Heighten noon contrast and action staging with a pre-climax silent beat')
	const [cardQuickPrompt, setCardQuickPrompt] = useState('')
	const [settings, setSettings] = useState<ApiSettings>(() => loadSettings())

	const activePage = useValue(
		'active-page',
		() => {
			if (!editor) return null
			return selectedPages(editor)[0] ?? null
		},
		[editor],
	)

	const updateSettings = (patch: Partial<ApiSettings>) => {
		const next = saveSettings(patch)
		setSettings(next)
	}

	const handleSelectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setSettings(next)
		setStatus(`Switched model preset to  ${PROVIDER_PRESETS.find((p) => p.id === provider)?.label ?? provider}`)
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-tabs" role="tablist" aria-label="Studio Inspector">
				<button type="button" className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>
					<IconFileText /> 1.Assets
				</button>
				<button type="button" className={activeTab === 'layout' ? 'active' : ''} onClick={() => setActiveTab('layout')}>
					<IconGrid /> 2.Layout
				</button>
				<button type="button" className={activeTab === 'story' ? 'active' : ''} onClick={() => setActiveTab('story')}>
					<IconBubble /> 3.Script
				</button>
				<button type="button" className={activeTab === 'camera' ? 'active' : ''} onClick={() => setActiveTab('camera')}>
					<IconCamera /> 4.Optics
				</button>
				<button type="button" className={activeTab === 'llm' ? 'active' : ''} onClick={() => setActiveTab('llm')}>
					<IconSettings /> 5.Nodes
				</button>
			</div>

			<div className="sidebar-body">
				{activeTab === 'cards' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>New Reference Card (Text / Visual Card)</h3>
								<span>Reference Cards</span>
							</div>
							<p className="side-hint">Place reference cards on the canvas and connect them to pages; supports AI Polish, Regenerate, Vision Vision Analysis & reversible diff: </p>
							<div className="card-spawn-grid">
								<button
									type="button"
									className="spawn-card-btn text-card-btn"
									onClick={() => {
										if (!editor) return
										createTextCardOnCanvas(
											editor,
											'note',
											'Scene Beat Reference Card',
											'Kanta backs to the breakwater edge guarding the last cone of fries as a giant shadow drops from above.',
										)
										setStatus('Created Text Reference Card on canvas')
									}}
								>
									<strong>
										<IconPlus /> Text Card
									</strong>
									<small>Character/Story/World · Text LLM Polish & Regenerate</small>
								</button>

								<button
									type="button"
									className="spawn-card-btn img-card-btn"
									onClick={() => {
										if (!editor) return
										createImageCardOnCanvas(
											editor,
											'image',
											'Scene Visual Reference Card',
											'@boardwalk',
											'Low-angle breakwater reference under noon sun, 18mm wide perspective, G-pen ink with grey screentone and top-right safe balloon zone.',
										)
										setStatus('Created Visual Reference Card on canvas with  Vision Vision Analysis &  AI Redraw')
									}}
								>
									<strong>
										<IconImage /> Image Card
									</strong>
									<small>Ref Art/Concept · Vision Analysis &  AI Render</small>
								</button>
							</div>

							<div className="char-row">
								{[
									{ tag: '@kanta', name: 'Kanta Turnaround Sheet', desc: 'Messy black hair, navy hoodie, vintage goggles at collar, bandage on right cheek' },
									{ tag: '@mei', name: 'Mei Turnaround Sheet', desc: 'Short bob with hairpin, light trench coat, vintage film camera strap, calm gaze' },
									{ tag: '@boss', name: 'Gull Boss Sheet', desc: 'Massive silver-backed gull, scar across left eye, metal leg ring, wide wingspan' },
								].map((char) => (
									<button
										key={char.tag}
										type="button"
										onClick={() => {
											if (!editor) return
											createImageCardOnCanvas(editor, 'character', char.name, char.tag, char.desc)
											setStatus(`Placed on canvas:  ${char.name}`)
										}}
									>
										<IconUser /> + {char.name}
									</button>
								))}
							</div>
						</section>

						<section className="side-section">
							<div className="sec-head">
								<h3>Selected Card / Storyboard AI Quick Actions</h3>
								<span>A/B Reversible Diff</span>
							</div>
							<div className="quick-ai-box">
								<div className="quick-ai-grid">
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'polish', cardQuickPrompt))
											} else {
												setStatus(await polishPageWithAi(editor, cardQuickPrompt))
											}
										}}
									>
										<IconSparkles /> AI AI Polish
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'regenerate', cardQuickPrompt))
											} else {
												rerollSelectedPages(editor)
												setStatus('Rerolled page panel topology')
											}
										}}
									>
										<IconRefresh /> AI Regenerate
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'vision', cardQuickPrompt))
											} else {
												const imgCard = editor
													.getCurrentPageShapes()
													.find((s): s is MangaCard => s.type === CARD && (s.props.kind === 'image' || s.props.kind === 'character'))
												if (imgCard) {
													editor.select(imgCard.id)
													setStatus(await applySelectedCardAiAction(editor, imgCard, 'vision', cardQuickPrompt))
												}
											}
										}}
									>
										<IconEye /> Vision Vision Analyze
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card && (card.props.kind === 'image' || card.props.kind === 'character')) {
												setStatus(await applySelectedCardAiAction(editor, card, 'redraw', cardQuickPrompt))
											} else {
												setStatus(await runBlock(editor, 'render'))
											}
										}}
									>
										<IconWand /> AI Redraw Art
									</button>
								</div>
								<div className="quick-prompt-row">
									<input
										type="text"
										value={cardQuickPrompt}
										onChange={(event) => setCardQuickPrompt(event.target.value)}
										placeholder="Enter custom directive (e.g., cyberpunk rain, heighten low-angle tension)..."
									/>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'polish', cardQuickPrompt || 'Heighten cinematic tension'))
											} else {
												setStatus(await polishPageWithAi(editor, cardQuickPrompt || 'Sharpen camera and dialogue tension'))
											}
										}}
									>
										<IconSend /> Run
									</button>
								</div>
							</div>
						</section>
					</>
				) : null}

				{activeTab === 'layout' ? (
					<LayoutWorkbenchSection
						editor={editor}
						page={activePage}
						setStatus={setStatus}
						onOpenCompare={onOpenCompare}
					/>
				) : null}

				{activeTab === 'story' ? (
					<StoryAndDialogueSection
						editor={editor}
						page={activePage}
						story={story}
						setStory={setStory}
						globalCustomPrompt={globalCustomPrompt}
						setGlobalCustomPrompt={setGlobalCustomPrompt}
						setStatus={setStatus}
					/>
				) : null}

				{activeTab === 'camera' ? (
					<CameraAndCompositionSection
						editor={editor}
						page={activePage}
						setStatus={setStatus}
					/>
				) : null}

				{activeTab === 'llm' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>Canvas AI Pipeline Operator Nodes</h3>
								<span>Drag onto canvas</span>
							</div>
							<div className="block-list">
								{PROMPT_BLOCKS.map((block) => (
									<div key={block.id} className="block-card">
										<div className="block-top">
											<strong>{block.title.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+\s*/, '')}</strong>
											<div className="block-btns">
												<button
													type="button"
													onClick={async () => {
														if (!editor) return
														setStatus(`Running  ${block.title}...`)
														const note = await runBlock(editor, block.id)
														setStatus(note)
													}}
												>
													Run
												</button>
												<button
													type="button"
													onClick={() => {
														if (!editor) return
														spawnPromptBlock(editor, block.id)
														setStatus(`Placed "${block.title}" node on canvas`)
													}}
												>
													+ Place
												</button>
											</div>
										</div>
										<p>{block.summary}</p>
									</div>
								))}
							</div>
						</section>

						<section className="side-section llm-config-panel">
							<div className="sec-head">
								<h3>Multimodal Model Settings</h3>
								<span>Text · Vision · Image</span>
							</div>
							<div className="preset-bar">
								{PROVIDER_PRESETS.map((preset) => (
									<button
										key={preset.id}
										type="button"
										className={settings.provider === preset.id ? 'preset-pill active' : 'preset-pill'}
										onClick={() => handleSelectPreset(preset.id)}
									>
										{preset.id.toUpperCase()}
									</button>
								))}
							</div>

							<label className="check-row">
								<input
									type="checkbox"
									checked={settings.useApi}
									onChange={(event) => updateSettings({ useApi: event.target.checked })}
								/>
								<span>Enable Online LLM APIs API (When off, uses zero-config built-in offline engine)</span>
							</label>

							<div className="model-group-card">
								<h4>1. Text LLM (Text LLM · Script/Polish/Prompt)</h4>
								<label>
									Provider (Provider)
									<select value={settings.provider} onChange={(event) => handleSelectPreset(event.target.value as ProviderId)}>
										{PROVIDER_PRESETS.map((preset) => (
											<option key={preset.id} value={preset.id}>
												{preset.label}
											</option>
										))}
									</select>
								</label>
								<label>
									Endpoint (Base URL)
									<input
										value={settings.baseUrl}
										onChange={(event) => updateSettings({ baseUrl: event.target.value })}
										placeholder="https://api.openai.com/v1"
									/>
								</label>
								<label>
									API Key
									<input
										type="password"
										value={settings.apiKey}
										onChange={(event) => updateSettings({ apiKey: event.target.value })}
										placeholder="sk-... / AIza..."
									/>
								</label>
								<label>
									Text Model (Text Model)
									<input
										value={settings.model}
										onChange={(event) => updateSettings({ model: event.target.value })}
										placeholder="gpt-4o-mini / gemini-2.5-flash"
									/>
								</label>
							</div>

							<div className="model-group-card">
								<h4>2. Vision & Image Models (Vision & Image LLM)</h4>
								<label>
									Vision Model (Vision Model)
									<input
										value={settings.visionModel}
										onChange={(event) => updateSettings({ visionModel: event.target.value })}
										placeholder="gpt-4o / gemini-2.5-flash"
									/>
								</label>
								<label>
									Image Model (Image Model)
									<input
										value={settings.imageModel}
										onChange={(event) => updateSettings({ imageModel: event.target.value })}
										placeholder="gpt-image-1 / flux-1.1-pro"
									/>
								</label>
							</div>
						</section>
					</>
				) : null}
			</div>
		</aside>
	)
}

function LayoutWorkbenchSection({
	editor,
	page,
	setStatus,
	onOpenCompare,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
	onOpenCompare?: () => void
}) {
	if (!editor || !page) {
		return (
			<section className="side-section">
				<div className="sec-head">
					<h3>Layout Topology & JEV Scoring</h3>
					<span>Select a Page</span>
				</div>
				<p className="side-hint">Select any page container on the canvas to adjust diagonal slant, bleed ratio, and  6 -Axis Editorial Score.</p>
			</section>
		)
	}

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const layout = realize(genome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))

	const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
	const progDecision = compileProgrammaticLayoutGenome(rawBeats, asScenario(page.props.scenario), page.props.seed)

	return (
		<>
			<section className="side-section">
				<div className="sec-head">
					<h3>0. JEV JEV 5-Stage Procedural Layout & Camera Lock</h3>
					<span>Stage 2 → 3 Deterministic</span>
				</div>
				<div className="emotion-tip-card" style={{ marginBottom: 8 }}>
					<strong>Tension Curve τ_t → 14-Factor Camera + Polygon row heights/diagonal slant/column widths procedural synthesis</strong>
					<div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5, marginTop: 4, maxHeight: 120, overflowY: 'auto', background: 'rgba(248,250,252,0.9)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)' }}>
						{progDecision.decisionTrace.map((line, i) => (
							<div key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5 }}>
								{line}
							</div>
						))}
					</div>
					<div className="quick-ai-grid" style={{ marginTop: 6 }}>
						<button
							type="button"
							className="primary-full"
							onClick={() => {
								setStatus(runJevFiveStageCompile(editor))
							}}
						>
							<IconSparkles /> Run  JEV Procedural Layout + 14-Factor Camera Lock
						</button>
						<button
							type="button"
							onClick={() => {
								setStatus(fillRealInterrogationArtworkOnPage(editor, page))
							}}
						>
							<IconImage /> Load Studio AIPanel Art
						</button>
					</div>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>1. Layout Presets & Geometry · {page.props.title}</h3>
					<span>{layout.panels.length} </span>
				</div>

				<div className="preset-pill-row" role="group" aria-label="4 Classic Layout Presets">
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
								applyLayoutChoice(editor, refreshed, {
									seed: best.seed,
									genome: best.layout.genome,
									score: best.score,
									reasons: best.reasons,
								})
								setStatus(`Switched layout preset to "${PRESET_LABELS[preset] ?? preset}"`)
							}}
						>
							{(PRESET_LABELS[preset] ?? preset).split(' ')[0]}
						</button>
					))}
				</div>

				<div className="param-grid-2">
					<label>
						Aspect Ratio
						<select
							aria-label="Aspect Ratio"
							value={String(overrides.ratio)}
							onChange={(event) => {
								setStatus(updatePageParametric(editor, page, { ratio: Number(event.target.value) }, true))
							}}
						>
							{PAGE_RATIOS.map((r) => (
								<option key={r.id} value={String(r.ratio)}>
									{r.label}
								</option>
							))}
						</select>
					</label>
					<label>
						Row Range (Row Range)
						<select
							aria-label="Row Range"
							value={overrides.rowRange}
							onChange={(event) => {
								setStatus(
									updatePageParametric(
										editor,
										page,
										{ rowRange: event.target.value as '1-3' | '2-3' | '2-4' | '3-4' },
										true,
									),
								)
							}}
						>
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
						<span>Diagonal Slant (Tilt)</span>
						<code>{Math.round((overrides.tilt ?? 0.25) * 100)}%</code>
						<input
							type="range"
							aria-label="Diagonal Slant"
							min={0}
							max={1}
							step={0.05}
							value={overrides.tilt ?? 0.25}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { tilt: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>Bleed Ratio (Bleed)</span>
						<code>{Math.round((overrides.bleed ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="Bleed Ratio"
							min={0}
							max={1}
							step={0.05}
							value={overrides.bleed ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { bleed: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>Subsplit Rate (Nest)</span>
						<code>{Math.round((overrides.nest ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="Subsplit Rate"
							min={0}
							max={1}
							step={0.05}
							value={overrides.nest ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { nest: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>Hero Weight (Big)</span>
						<code>{Math.round((overrides.big ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="Hero Weight"
							min={0}
							max={1}
							step={0.05}
							value={overrides.big ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { big: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>Border Width (LineW)</span>
						<code>{(overrides.lineW ?? 3.2).toFixed(1)}px</code>
						<input
							type="range"
							aria-label="Border Width"
							min={1.8}
							max={7.5}
							step={0.2}
							value={overrides.lineW ?? 3.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { lineW: Number(event.target.value) }, false))}
						/>
					</label>
				</div>

				<div className="quick-ai-grid" style={{ marginTop: 8 }}>
					<button
						type="button"
						onClick={() => {
							mutateSelectedPages(editor, overrides.mutationStrength)
							setStatus(`Derived layout variant (mutation  ${Math.round((overrides.mutationStrength ?? 0.45) * 100)}%)`)
						}}
					>
						<IconSliders /> Derive Layout Variant
					</button>
					{onOpenCompare ? (
						<button type="button" onClick={onOpenCompare}>
							<IconGrid /> Open  8 / 1 Candidates
						</button>
					) : null}
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>2. 6-Axis Editorial Score and Auto-Remedy</h3>
					<span>Score {Math.round(judged.score * 100)} </span>
				</div>
				<div className="rubric-bars">
					{[
						{ key: 'pacing', label: 'Pacing Fit', val: judged.axes.pacing },
						{ key: 'hierarchy', label: 'Hierarchy', val: judged.axes.hierarchy },
						{ key: 'flow', label: 'R-to-L Flow', val: judged.axes.flow },
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
							<button
								key={rem.id}
								type="button"
								className="remedy-btn"
								onClick={() => {
									setStatus(applyEditorialRemedyOnPage(editor, page, rem))
								}}
								title={rem.description}
							>
								<IconCheck /> {rem.actionLabel}
							</button>
						))}
					</div>
				</div>
			</section>
		</>
	)
}

function StoryAndDialogueSection({
	editor,
	page,
	story,
	setStory,
	globalCustomPrompt,
	setGlobalCustomPrompt,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	story: string
	setStory: (value: string) => void
	globalCustomPrompt: string
	setGlobalCustomPrompt: (value: string) => void
	setStatus: (value: string) => void
}) {
	const metas = page ? readJson<PanelMeta[]>(page.props.panelsJson, []) : []
	const panelIdx = page ? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0) : 0
	const currentMeta = metas[panelIdx]
	const pageDiff = page ? getPageDiff(page.id) : null
	const currentScenario = asScenario(page?.props.scenario ?? 'tension')
	const tip = EMOTION_DIRECTION_TIPS[currentScenario]

	return (
		<>
			{page ? (
				<section className="side-section">
					<div className="sec-head">
						<h3>1. Pacing Strategy Presets · {page.props.title}</h3>
						<span>Director Staging</span>
					</div>
					<div className="preset-pill-row" role="group" aria-label="6 Pacing Strategy Presets">
						{SCENARIOS.map((sc) => (
							<button
								key={sc}
								type="button"
								className={currentScenario === sc ? 'preset-pill active' : 'preset-pill'}
								onClick={() => {
									if (!editor) return
									setStatus(applyEmotionStrategyOnPage(editor, page, sc))
								}}
							>
								{EMOTION_DIRECTION_TIPS[sc].label.split(' ')[0]}
							</button>
						))}
					</div>
					<div className="emotion-tip-card">
						<strong>{tip.label}</strong>
						<p>Layout Rule: {tip.layoutRule}</p>
						<p>Camera Rhythm: {tip.beatRule}</p>
						<button
							type="button"
							className="primary-full"
							onClick={() => {
								if (!editor) return
								setStatus(applyEmotionStrategyOnPage(editor, page, currentScenario))
							}}
						>
							<IconSparkles /> Apply "{tip.label}" Staging & Beats
						</button>
					</div>

					{currentMeta ? (
						<div className="panel-beat-editor">
							<div className="sec-head" style={{ marginTop: 10 }}>
								<h3>
									2. # {panelIdx + 1}  Panel Beats & Dialogue
								</h3>
								<span>{currentMeta.silent ? 'Silent Ma' : 'Dialogue Beat'}</span>
							</div>
							<div className="panel-pill-selector">
								{metas.map((m, idx) => (
									<button
										key={idx}
										type="button"
										className={idx === panelIdx ? 'preset-pill active' : 'preset-pill'}
										onClick={() => {
											if (!editor) return
											editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })
										}}
									>
										#{idx + 1}{m.silent ? '·Silent' : ''}
									</button>
								))}
							</div>
							<textarea
								rows={2}
								aria-label="Panel staging & action beat"
								value={currentMeta.beat}
								onChange={(event) => {
									if (!editor) return
									const next = metas.map((m, i) => (i === panelIdx ? { ...m, beat: event.target.value } : m))
									editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
								}}
							/>
							<div className="quick-ai-grid" style={{ marginTop: 6 }}>
								<button
									type="button"
									className={currentMeta.silent ? 'active-toggle-btn' : ''}
									onClick={() => {
										if (!editor) return
										setStatus(toggleSilentPanelOnPage(editor, page, panelIdx))
									}}
								>
									{currentMeta.silent ? '✓ Silent Ma Active' : 'Set Silent Ma'}
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										addBubbleToPage(editor, page, panelIdx, 'speech', 'Hold on—!', 'Cold Scrutinizing', 'pill')
										setStatus(`Inserted in Panel # ${panelIdx + 1}  top-right safe zone: speech bubble layer`)
									}}
								>
									<IconBubble /> + Add Speech Bubble
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										addStandaloneProsodyToPage(editor, page, panelIdx, 'Cold Scrutinizing', 'seal', 'CLACK!')
										setStatus(`Inserted in Panel # ${panelIdx + 1}  independent prosody tag/SFX Layer`)
									}}
								>
									<IconSparkles /> + Add Prosody/SFX
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										setStatus(fillRealInterrogationArtworkOnPage(editor, page))
									}}
								>
									<IconImage /> Fill Studio AIPanel Art
								</button>
							</div>

							{(() => {
								if (!editor) return null
								const pageBubbles = editor
									.getSortedChildIdsForParent(page.id)
									.map((id) => editor.getShape(id))
									.filter((s): s is MangaBubble => s?.type === BUBBLE)
								return (
									<div className="bubble-layer-workbench" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(148,163,184,0.25)' }}>
										<div className="sec-head" style={{ marginBottom: 6 }}>
											<h3>Layer Controls · Bubble({pageBubbles.length}) & Prosody</h3>
											<span>Draggable/Editable</span>
										</div>
										<div className="preset-pill-row" style={{ marginBottom: 8 }}>
											<button
												type="button"
												className={page.props.showBubblesLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showBubblesLayer: page.props.showBubblesLayer === false },
													})
												}
											>
												<IconBubble /> Bubbles {page.props.showBubblesLayer !== false ? 'On' : 'Off'}
											</button>
											<button
												type="button"
												className={page.props.showProsodyLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showProsodyLayer: page.props.showProsodyLayer === false },
													})
												}
											>
												<IconTag /> Prosody {page.props.showProsodyLayer !== false ? 'On' : 'Off'}
											</button>
											<button
												type="button"
												className={page.props.showSfxLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showSfxLayer: page.props.showSfxLayer === false },
													})
												}
											>
												<IconBolt /> SFX {page.props.showSfxLayer !== false ? 'On' : 'Off'}
											</button>
											<button
												type="button"
												className={page.props.showFlow ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showFlow: !page.props.showFlow },
													})
												}
											>
												<IconEye /> Flow {page.props.showFlow ? 'On' : 'Off'}
											</button>
										</div>

										<div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
											{pageBubbles.map((b, bIdx) => (
												<div
													key={b.id}
													style={{
														padding: '6px 8px',
														borderRadius: 8,
														background: 'rgba(248,250,252,0.95)',
														border: '1px solid rgba(148,163,184,0.35)',
														display: 'flex',
														flexDirection: 'column',
														gap: 4,
													}}
												>
													<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
														<strong
															style={{ cursor: 'pointer', color: '#0066cc' }}
															onClick={() => editor.select(b.id)}
														>
															#{bIdx + 1} {b.props.panelIndex + 1} · {BUBBLE_LABELS[b.props.bubble] ?? b.props.bubble}
														</strong>
														<div style={{ display: 'flex', gap: 4 }}>
															<button
																type="button"
																className="link-btn"
																onClick={() => editor.select(b.id)}
															>
																Focus
															</button>
															<button
																type="button"
																className="link-btn"
																style={{ color: '#dc2626' }}
																onClick={() => editor.deleteShapes([b.id])}
															>
																Delete
															</button>
														</div>
													</div>
													<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
														<input
															type="text"
															value={b.props.text}
															placeholder="Dialogue text/SFX..."
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { text: e.target.value },
																})
															}
														/>
														<input
															type="text"
															value={b.props.prosody}
															placeholder="Prosody label (e.g., Cold Scrutinizing)"
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosody: e.target.value },
																})
															}
														/>
													</div>
													<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
														<select
															aria-label={`Bubble#${bIdx + 1}Shape`}
															value={b.props.bubble}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { bubble: e.target.value as BubbleStyle },
																})
															}
														>
															{BUBBLES.map((st) => (
																<option key={st} value={st}>
																	{BUBBLE_LABELS[st] ?? st}
																</option>
															))}
														</select>
														<select
															aria-label={`Bubble#${bIdx + 1}Prosody Style`}
															value={(b.props.prosodyStyle as ProsodyStyle) || 'pill'}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosodyStyle: e.target.value as ProsodyStyle },
																})
															}
														>
															{PROSODY_STYLES.map((ps) => (
																<option key={ps} value={ps}>
																	Prosody:{PROSODY_STYLE_LABELS[ps]}
																</option>
															))}
														</select>
														<select
															aria-label={`Bubble#${bIdx + 1}Prosody Color`}
															value={b.props.prosodyColor || ''}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosodyColor: e.target.value },
																})
															}
														>
															<option value="">Default</option>
															<option value="#0066cc">Cobalt Blue</option>
															<option value="#c93d35">Crimson Seal</option>
															<option value="#18222c">Sumi Ink</option>
															<option value="#0f766e">Teal Ink</option>
															<option value="#d97706">Amber Gold</option>
														</select>
													</div>
												</div>
											))}
										</div>
									</div>
								)
							})()}
							{pageDiff ? (
								<div className="card-diff-bar" style={{ marginTop: 6 }}>
									<span>Apply AI Director Polish</span>
									<button
										type="button"
										onClick={() => {
											if (!editor) return
											revertPageDiff(editor, page)
											setStatus('Reverted page to pre- AI  version')
										}}
									>
										Revert
									</button>
								</div>
							) : null}
						</div>
					) : null}
				</section>
			) : null}

			<section className="side-section">
				<div className="sec-head">
					<h3>3. Story Script &  LLM Rewrite</h3>
					<button
						type="button"
						className="link-btn"
						onClick={() => {
							const pick = SAMPLE_STORIES[Math.floor(Math.random() * SAMPLE_STORIES.length)]
							setStory(pick.text)
							setStatus(`Loaded sample script "${pick.label}"`)
						}}
					>
						Sample Script
					</button>
				</div>
				<textarea
					rows={5}
					value={story}
					onChange={(event) => setStory(event.target.value)}
					placeholder="Enter episode synopsis, character dynamics, or scene script..."
				/>
				<input
					type="text"
					value={globalCustomPrompt}
					onChange={(event) => setGlobalCustomPrompt(event.target.value)}
					placeholder="Enter director rewrite directive..."
					style={{ marginTop: 6 }}
				/>
				<div className="story-actions" style={{ marginTop: 6 }}>
					<button
						type="button"
						className="primary-full"
						onClick={async () => {
							setStatus('Calling  Text LLM Rewriting script with directive...')
							const rewritten = await rewriteStoryWithLlm(story, globalCustomPrompt)
							setStory(rewritten)
							setStatus('Text LLM Script rewrite complete')
						}}
					>
						<IconSparkles /> Run  Text LLM Rewrite Script
					</button>
					<button
						type="button"
						className="primary-full"
						onClick={() => {
							if (!editor) return
							spawnBook(editor, bookFromText(story))
							setStatus('Rebuilt reference cards and polygon storyboard pages from script')
						}}
					>
						<IconPlay /> Rebuild Pages from Script
					</button>
				</div>
			</section>
		</>
	)
}

function CameraAndCompositionSection({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	if (!editor || !page) {
		return (
			<section className="side-section">
				<div className="sec-head">
					<h3>Camera Optics & Panel Framing</h3>
					<span>Select a Panel Cell</span>
				</div>
				<p className="side-hint">Select any panel cell on a page to adjust focal length, aperture DOF, pan/zoom framing, and edge bleed.</p>
			</section>
		)
	}

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const panelIdx = page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0
	const meta = metas[panelIdx] ?? metas[0]
	if (!meta) return null

	const optParams = defaultOpticsForMeta(meta)
	const computed = computeOptics(optParams)
	const geneHit = locatePanelGene(genome, panelIdx)
	const axisAudit = auditCameraAxis(metas)

	const updateMeta = (patch: Partial<PanelMeta>) => {
		const next = metas.map((item, idx) => (idx === panelIdx ? { ...item, ...patch } : item))
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}

	return (
		<>
			<section className="side-section">
				<div className="sec-head">
					<h3>
						1. Optical Lens Lab · {page.props.title} # {panelIdx + 1} 
					</h3>
					<span>Live Panel Sync</span>
				</div>

				<div className="panel-pill-selector" style={{ marginBottom: 8 }}>
					{metas.map((_, idx) => (
						<button
							key={idx}
							type="button"
							className={idx === panelIdx ? 'preset-pill active' : 'preset-pill'}
							onClick={() => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })}
						>
							#{idx + 1}
						</button>
					))}
				</div>

				<div className="optics-readout-card">
					<div className="optics-stat">
						<small>Eq. Focal</small>
						<strong>{computed.eqFocalMm}mm</strong>
					</div>
					<div className="optics-stat">
						<small>FOV FOV</small>
						<strong>{computed.hFovDeg}°</strong>
					</div>
					<div className="optics-stat">
						<small>Derived Shot</small>
						<strong>{computed.shotLabelZh}</strong>
					</div>
					<div className="optics-stat">
						<small>Bokeh DOF</small>
						<strong>{computed.dofLabelZh}</strong>
					</div>
				</div>

				<div className="param-grid-2" style={{ marginTop: 8 }}>
					<label>
						Sensor Format
						<select
							aria-label="Sensor Format"
							value={optParams.sensor}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { sensor: event.target.value as SensorId }))
							}}
						>
							{SENSORS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Camera Angle
						<select
							aria-label="Camera Angle"
							value={meta.angle}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { angle: event.target.value as PanelMeta['angle'] }))
							}}
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
						<span>Focal Length (Focal)</span>
						<code>{optParams.focalMm}mm</code>
						<input
							type="range"
							aria-label="Focal Length"
							min={12}
							max={200}
							step={1}
							value={optParams.focalMm}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { focalMm: Number(event.target.value) }))
							}}
						/>
					</label>
					<label className="slider-row">
						<span>Aperture (f-Stop)</span>
						<code>f/{optParams.fStop.toFixed(1)}</code>
						<input
							type="range"
							aria-label="Aperture"
							min={1.4}
							max={22}
							step={0.2}
							value={optParams.fStop}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { fStop: Number(event.target.value) }))
							}}
						/>
					</label>
					<label className="slider-row">
						<span>Subject Dist (Dist)</span>
						<code>{optParams.subjectDistM.toFixed(1)}m</code>
						<input
							type="range"
							aria-label="Subject Dist"
							min={0.5}
							max={20}
							step={0.5}
							value={optParams.subjectDistM}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { subjectDistM: Number(event.target.value) }))
							}}
						/>
					</label>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>2. Panel Framing & Pan/Zoom · Per-Edge Bleed · Guides</h3>
					<span># {panelIdx + 1} </span>
				</div>

				<div className="slider-stack">
					<label className="slider-row">
						<span>Panel Zoom</span>
						<code>{(meta.imageScale || 1).toFixed(2)}×</code>
						<input
							type="range"
							aria-label="Panel Zoom"
							min={0.5}
							max={2.8}
							step={0.05}
							value={meta.imageScale || 1}
							onChange={(event) => updateMeta({ imageScale: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>Pan X X</span>
						<code>{Math.round(meta.imageOffsetX || 0)}px</code>
						<input
							type="range"
							aria-label="Horizontal Pan"
							min={-180}
							max={180}
							step={2}
							value={meta.imageOffsetX || 0}
							onChange={(event) => updateMeta({ imageOffsetX: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>Pan Y Y</span>
						<code>{Math.round(meta.imageOffsetY || 0)}px</code>
						<input
							type="range"
							aria-label="Vertical Pan"
							min={-180}
							max={180}
							step={2}
							value={meta.imageOffsetY || 0}
							onChange={(event) => updateMeta({ imageOffsetY: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>Artwork Rotation</span>
						<code>{Math.round(meta.imageRotation || 0)}°</code>
						<input
							type="range"
							aria-label="Artwork Rotation"
							min={-25}
							max={25}
							step={1}
							value={meta.imageRotation || 0}
							onChange={(event) => updateMeta({ imageRotation: Number(event.target.value) })}
						/>
					</label>
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 6 }}>
					<label className="remedy-btn" style={{ cursor: 'pointer', justifyContent: 'center', margin: 0 }}>
						<IconImage /> Upload Artwork to Panel
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
										setStatus(`Loaded image "${file.name}" into Panel # ${panelIdx + 1}  (drag to pan, scroll to zoom)`)
									}
								}
								reader.readAsDataURL(file)
								event.target.value = ''
							}}
						/>
					</label>
					<button
						type="button"
						onClick={() => {
							setStatus(fillRealInterrogationArtworkOnPage(editor, page))
						}}
					>
						<IconSparkles /> Fill Page AIArt
					</button>
				</div>

				<div className="bleed-grid-row" style={{ marginTop: 8 }}>
					{(['bT', 'bB', 'bL', 'bR'] as const).map((edge) => {
						const active = Boolean(geneHit?.gene[edge])
						const label = { bT: 'Top Bleed', bB: 'Bottom Bleed', bL: 'Left Bleed', bR: 'Right Bleed' }[edge]
						return (
							<button
								key={edge}
								type="button"
								className={active ? 'preset-pill active' : 'preset-pill'}
								onClick={() => setStatus(togglePanelBleedOnPage(editor, page, panelIdx, edge))}
							>
								{label}
							</button>
						)
					})}
					<button
						type="button"
						className={geneHit?.gene.nest ? 'preset-pill active' : 'preset-pill'}
						onClick={() => setStatus(togglePanelNestOnPage(editor, page, panelIdx))}
					>
						Subsplit
					</button>
					<button
						type="button"
						className="preset-pill"
						onClick={() => updateMeta({ imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })}
					>
						Reset View
					</button>
				</div>

				<div className="guide-toggles" style={{ marginTop: 10 }}>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showInnerFrame)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showInnerFrame: event.target.checked }, false))
							}
						/>
						<span>Show  B4  safe trim margin and crop marks</span>
					</label>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showRuleOfThirds)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showRuleOfThirds: event.target.checked }, false))
							}
						/>
						<span>Show rule-of-thirds composition grid</span>
					</label>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showAxis180)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showAxis180: event.target.checked }, false))
							}
						/>
						<span>Enable  180°  camera axis and 180° crossing check ({axisAudit.summary})</span>
					</label>
				</div>
			</section>
		</>
	)
}

export function FloatingBar(_props: { onSwitchTab?: (tab: SidebarTab) => void }) {
	const [dismissed, setDismissed] = useState(false)
	if (dismissed) return null
	return (
		<div className="canvas-context-hint-pill" onPointerDown={(e) => e.stopPropagation()}>
			<span className="hint-dot" />
			<span>
				Right-click any panel, bubble, page, or canvas <b>Right-click</b> for grouped actions · Click right edge <b>+ Extend  P2</b> to inherit context Context
			</span>
			<button type="button" onClick={() => setDismissed(true)} title="Dismiss Hint">
				×
			</button>
		</div>
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
							<IconGrid /> 36 Seed 6 -Axis Editorial Score 8 / 1 · {page.props.title} ({SCENARIO_LABELS[page.props.scenario] ?? page.props.scenario} · {ms}ms)
						</h3>
						<div className="tabs">
							<button type="button" className={mode === 'roll' ? 'on' : ''} onClick={() => setMode('roll')}>
								Sample  8 
							</button>
							<button type="button" className={mode === 'mutate' ? 'on' : ''} onClick={() => setMode('mutate')}>
								Derive Variants 8 
							</button>
						</div>
						{mode === 'mutate' ? (
							<label className="inline-slider">
								Mutation {Math.round(strength * 100)}%
								<input
									type="range"
									min={0.15}
									max={0.95}
									step={0.05}
									value={strength}
									onChange={(event) => setStrength(Number(event.target.value))}
								/>
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
									applyLayoutChoice(editor, page, {
										seed: candidate.seed,
										genome: candidate.layout.genome,
										score: candidate.score,
										reasons: candidate.reasons,
									})
									onClose()
								}}
							>
								<div className="cand-svg" dangerouslySetInnerHTML={{ __html: svg }} />
								<div className="cand-foot">
									<strong>
										#{rank + 1} · Total  {Math.round(candidate.score * 100)}  · {candidate.layout.panels.length} 
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
								<button
									type="button"
									onClick={() => exportPageSvgFile(firstPageModel, `${book.spec.title}-P1.svg`)}
								>
									<IconDownload /> Export Page SVG
								</button>
								<button
									type="button"
									onClick={async () => {
										const blob = await exportPagePng2400(firstPageModel, 2400)
										downloadBlob(`${book.spec.title}-P1-2400px.png`, blob, 'image/png')
									}}
								>
									<IconDownload /> Export  2400px PNG
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
								# {spreadIdx + 1} / {spreads.length} Spread
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
								{activePanel.pageTitle} · # {activePanel.panel.n}  ({SHOT_LABELS[activePanel.panel.shot] ?? activePanel.panel.shot} /{' '}
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
						? `Multimodal proxy ready (supports  ${data.capabilities?.join(' / ') || 'text / vision / image'}${envKeys.length ? `; detected env keys  ${envKeys.join(', ')}` : '; missing key Key  falls back to built-in offline engine'})`
						: 'Offline Engine Only',
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
							<button
								key={preset.id}
								type="button"
								className={form.provider === preset.id ? 'preset-pill active' : 'preset-pill'}
								onClick={() => selectPreset(preset.id)}
							>
								{preset.label}
							</button>
						))}
					</div>
					<label className="row">
						<input
							type="checkbox"
							checked={form.useApi}
							onChange={(event) => setForm({ ...form, useApi: event.target.checked })}
						/>
						Enable Online LLM APIs API (When off, uses zero-config built-in offline engine and screentone renderer)
					</label>
					<div className="settings-grid-2">
						<label>
							Text Provider (Text Provider)
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
							<input
								value={form.baseUrl}
								onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
								placeholder="https://api.openai.com/v1"
							/>
						</label>
						<label>
							API Key
							<input
								type="password"
								value={form.apiKey}
								onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
								placeholder="sk-... / AIza..."
							/>
						</label>
						<label>
							Text Model (Text Model)
							<input
								value={form.model}
								onChange={(event) => setForm({ ...form, model: event.target.value })}
								placeholder="gpt-4o-mini / gemini-2.5-flash"
							/>
						</label>
						<label>
							Vision Model (Vision Model)
							<input
								value={form.visionModel}
								onChange={(event) => setForm({ ...form, visionModel: event.target.value })}
								placeholder="gpt-4o / gemini-2.5-flash"
							/>
						</label>
						<label>
							Image Model (Image Model)
							<input
								value={form.imageModel}
								onChange={(event) => setForm({ ...form, imageModel: event.target.value })}
								placeholder="gpt-image-1 / flux-1.1-pro"
							/>
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
