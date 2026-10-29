import { useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { SEAGULL_STORY } from './studio/demo/book'
import {
	applyUniversalFiveStagePreset,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	extendNextPageFromPage,
	recompilePromptsStage4,
	relayoutLetteringStage5,
	relayoutPageStage3,
	selectedPages,
	spawnBlankPageAtPoint,
} from './studio/editor/pipeline'
import { EMPTY_DIRTY_STATE, hasPageDirty } from './studio/pipeline/dirtyStore'
import { readPageDirty, repropagatePage } from './studio/pipeline/pageMeta'
import { listUniversalPresets } from './studio/jev/fiveStageEngine'
import { readerHtml } from './studio/export/htmlReader'
import { downloadText } from './studio/export/ora'
import { readJson, type PanelMeta } from './studio/model'
import { MangaBubbleUtil } from './studio/shapes/MangaBubbleUtil'
import { MangaCardUtil } from './studio/shapes/MangaCardUtil'
import { MangaContainerUtil } from './studio/shapes/MangaContainerUtil'
import { MangaPromptUtil } from './studio/shapes/MangaPromptUtil'
import { BUBBLE, CARD, CONTAINER, type MangaCard, type MangaContainer } from './studio/shapes/schema'
import { compileBook, type CompiledBook } from './studio/spec/compile'
import { CompareModal, ConditionalStylePanel, ReaderModal, SettingsModal, TopBar } from './studio/ui/chrome'
import {
	CanvasContextMenu,
	detectCanvasContextMenuTarget,
	PageContextModal,
	type ContextMenuTarget,
} from './studio/ui/contextMenu'
import { Inspector } from './studio/ui/inspector/Inspector'
import { resolveInspectorTab, type CanvasSelectionKind, type InspectorTab } from './studio/ui/inspectorModel'
import { SourceList } from './studio/ui/sourceList'
import { buildCommands, CommandPalette, ShortcutsSheet, StageBar, WelcomeSheet, type PagePick } from './studio/ui/shell'
import { completedStagesFrom, deriveStageStatuses, STAGE_META, type StageEvidence } from './studio/ui/stageStatus'
import { parseDeepLink } from './studio/ui/deepLink'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref, tldrawColorScheme, type ResolvedTheme, type ThemePref } from './studio/ui/theme'

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaPromptUtil, MangaBubbleUtil]

export function App() {
	// Deep-link config is parsed once from the URL. It decides the store mode,
	// an optional preset to load, the initial appearance, and the opening
	// Inspector tab / selection. See studio/ui/deepLink.ts.
	const presetList = useMemo(() => listUniversalPresets(), [])
	const deepLink = useMemo(
		() => parseDeepLink(typeof window === 'undefined' ? '' : window.location.search, presetList.map((p) => p.id)),
		[presetList],
	)
	const persistenceKey = deepLink.ephemeral ? undefined : 'tldraw-manga-v6'

	const [editor, setEditor] = useState<Editor | null>(null)
	const [story, setStory] = useState(SEAGULL_STORY)
	const [status, setStatus] = useState('Ready · right-click any panel, bubble, page or the canvas for the context menu · use the source list or the Inspector to drive the pipeline')
	const [compareOpen, setCompareOpen] = useState(false)
	const [readerBook, setReaderBook] = useState<CompiledBook | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [welcomeOpen, setWelcomeOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<InspectorTab>(deepLink.inspector ?? (deepLink.masterId ? 'masters' : 'layout'))
	const [themePref, setThemePref] = useState<ThemePref>(() => deepLink.theme ?? loadThemePref())
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(deepLink.theme ?? loadThemePref()))
	// Page-first workspace: the left source list opens by default; the right
	// Inspector stays collapsed so the canvas opens wide (Cmd-1 / Cmd-2 toggle).
	// A deep link that targets the Inspector opens it immediately.
	const [leftOpen, setLeftOpen] = useState(true)
	const [rightOpen, setRightOpen] = useState(Boolean(deepLink.inspector || deepLink.masterId))
	const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null)
	const [contextModalPageId, setContextModalPageId] = useState<TLShapeId | null>(null)
	const [paletteOpen, setPaletteOpen] = useState(false)
	const [shortcutsOpen, setShortcutsOpen] = useState(false)

	// One reactive sweep over canvas shapes feeds the pipeline list and the
	// bottom stage bar: which pages exist and which stages show observable output.
	const canvasModel = useValue(
		'canvas-model',
		() => {
			if (!editor) {
				return {
					pages: [] as PagePick[],
					evidence: {
						hasAssets: false,
						hasStoryboard: false,
						hasLayout: false,
						hasArt: false,
						hasLettering: false,
					} satisfies StageEvidence,
				}
			}
			const shapes = editor.getCurrentPageShapes()
			const pageShapes = shapes
				.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
				.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))
			const pages: PagePick[] = pageShapes.map((page, idx) => ({
				id: page.id,
				index: page.props.pageIndex || idx + 1,
				title: page.props.title,
			}))
			const hasAssets = shapes.some((s): s is MangaCard => s.type === CARD)
			let hasStoryboard = false
			let hasLayout = false
			let hasArt = false
			for (const page of pageShapes) {
				const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
				if (metas.length > 0) hasStoryboard = true
				if (page.props.genomeJson) hasLayout = true
				if (metas.some((m) => m.imageDataUrl)) hasArt = true
			}
			const hasLettering = shapes.some((s) => s.type === BUBBLE)
			return { pages, evidence: { hasAssets, hasStoryboard, hasLayout, hasArt, hasLettering } }
		},
		[editor],
	)

	// The page the Inspector operates on: the selected page, else the first page.
	const activePage = useValue<MangaContainer | null>(
		'active-page',
		() => {
			if (!editor) return null
			const selected = selectedPages(editor)[0]
			if (selected) return selected
			return (
				editor
					.getCurrentPageShapes()
					.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
					.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))[0] ?? null
			)
		},
		[editor],
	)

	// Contextual Inspector: a single-shape selection re-drives the active tab.
	const selectionKind = useValue<CanvasSelectionKind>(
		'selection-kind',
		() => {
			if (!editor) return 'none'
			const sel = editor.getSelectedShapes()
			if (sel.length !== 1) return 'none'
			const shape = sel[0]
			if (shape.type === CARD) return 'card'
			if (shape.type === BUBBLE) return 'bubble'
			if (shape.type === CONTAINER && (shape as MangaContainer).props.role === 'page') return 'page'
			return 'none'
		},
		[editor],
	)

	// A deep link can pin the opening Inspector tab (e.g. ?inspector=masters).
	// Loading a preset auto-selects its first page, which would otherwise yank the
	// tab to Page via the selection reducer below. We let the deep-link tab win
	// that first programmatic selection, then hand control back to the user.
	const honorDeepLinkTab = useRef(Boolean(deepLink.inspector || deepLink.masterId || deepLink.selectFirstPanel))

	useEffect(() => {
		if (!rightOpen || selectionKind === 'none') return
		if (honorDeepLinkTab.current) {
			honorDeepLinkTab.current = false
			return
		}
		setActiveTab(resolveInspectorTab(selectionKind))
	}, [selectionKind, rightOpen])

	// The active page's stale/running state drives the bottom stage bar. activePage
	// is reactive to shape (and meta) changes, so this recomputes on every edit.
	const pageDirty = useMemo(() => (activePage ? readPageDirty(activePage) : EMPTY_DIRTY_STATE), [activePage])

	const stageStatuses = useMemo(
		() =>
			deriveStageStatuses({
				dirty: pageDirty.dirty,
				running: pageDirty.running,
				completed: completedStagesFrom(canvasModel.evidence),
			}),
		[canvasModel.evidence, pageDirty],
	)
	const activeStage = rightOpen ? STAGE_META.find((m) => m.inspectorTab === activeTab)?.stage ?? null : null

	// Re-propagate the active page's stale stages using the pure executor over the
	// real Stage 3-5 runners. Image regeneration is never part of this. The page is
	// re-fetched from the editor at call time so a keyboard-shortcut invocation is
	// never driven by a stale closure.
	const repropagate = () => {
		if (!editor) {
			setStatus('Select a page to re-propagate')
			return
		}
		const page =
			selectedPages(editor)[0] ??
			editor
				.getCurrentPageShapes()
				.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
				.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))[0] ??
			null
		if (!page) {
			setStatus('Select a page to re-propagate')
			return
		}
		const pageId = page.id
		const outcome = repropagatePage(editor, page, {
			3: () => relayoutPageStage3(editor, pageId),
			4: () => recompilePromptsStage4(editor, pageId),
			5: () => relayoutLetteringStage5(editor, pageId),
		})
		setStatus(outcome ? outcome.message : 'Nothing stale to re-propagate')
	}

	const focusPage = (id: string) => {
		if (!editor) return
		editor.select(id as TLShapeId)
		editor.zoomToSelection({ animation: { duration: 300 } })
	}

	const openReader = () => {
		if (editor) setReaderBook(compileBook(editor))
	}
	const exportHtml = () => {
		if (!editor) return
		const book = compileBook(editor)
		downloadText(`${book.spec.title}.html`, readerHtml(book), 'text/html;charset=utf-8')
		setStatus('Exported standalone HTML reader')
	}
	// Opening a tab reveals the Inspector so the controls are visible.
	const switchTab = (tab: InspectorTab) => {
		setActiveTab(tab)
		setRightOpen(true)
	}
	const extendPage = () => {
		if (!editor) return
		const active = selectedPages(editor)[0]
		const res = extendNextPageFromPage(editor, active?.id)
		setStatus(res.message)
	}

	// Apply the parsed deep link once the editor mounts: load a preset (or show
	// the welcome sheet on a truly empty document), then honour an inspector tab
	// and/or a first-panel preselection. Runs synchronously inside onMount.
	const applyDeepLinkOnMount = (mounted: Editor) => {
		if (deepLink.presetId) {
			const msg = applyUniversalFiveStagePreset(mounted, deepLink.presetId)
			setStatus(msg)
		} else if (mounted.getCurrentPageShapeIds().size === 0) {
			setWelcomeOpen(true)
		}
		if (deepLink.selectFirstPanel) {
			const firstPage = mounted
				.getCurrentPageShapes()
				.filter((s): s is MangaContainer => s.type === CONTAINER && (s as MangaContainer).props.role === 'page')
				.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))[0]
			if (firstPage) {
				mounted.updateShape<MangaContainer>({ id: firstPage.id, type: CONTAINER, props: { selectedPanel: 0 } })
				mounted.select(firstPage.id)
				mounted.zoomToSelection({ animation: { duration: 200 } })
				if (!deepLink.inspector && !deepLink.masterId) {
					setActiveTab('camera')
					setRightOpen(true)
				}
			}
		}
	}

	const commands = useMemo(() => {
		const ctx = {
			pages: canvasModel.pages,
			presets: presetList.map((p) => ({ id: p.id, title: p.title })),
			theme: resolvedTheme,
			hasEditor: Boolean(editor),
			canRepropagate: hasPageDirty(pageDirty),
			repropagate,
			focusPage,
			extendPage,
			switchTab,
			toggleDrawer: () => setRightOpen((prev) => !prev),
			toggleSidebar: () => setLeftOpen((prev) => !prev),
			toggleTheme: () => setThemePref((prev) => nextThemePref(prev)),
			openReader,
			openCompare: () => setCompareOpen(true),
			openShortcuts: () => setShortcutsOpen(true),
			openSettings: () => setSettingsOpen(true),
			exportHtml,
			applyPreset: (id: string) => {
				if (!editor) return
				void Promise.resolve(applyUniversalFiveStagePreset(editor, id)).then((msg) => {
					if (typeof msg === 'string') setStatus(msg)
				})
			},
			createTextCard: () => {
				if (!editor) return
				createTextCardOnCanvas(editor, 'note', 'Reference Card', 'Describe a scene beat, character, world rule or motif.')
				setStatus('Created text reference card on canvas')
			},
			createImageCard: () => {
				if (!editor) return
				createImageCardOnCanvas(editor, 'image', 'Visual Reference Card', '#reference', 'Describe the reference art, framing and tone for image-to-image.')
				setStatus('Created image reference card on canvas')
			},
		}
		return buildCommands(ctx)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canvasModel.pages, editor, resolvedTheme, pageDirty, activePage])

	// Resolve the preference to a concrete theme. In Auto mode, track the OS
	// appearance live so the canvas and chrome follow a system theme switch.
	useEffect(() => {
		setResolvedTheme(resolveTheme(themePref))
		saveThemePref(themePref)
		if (themePref !== 'auto' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
		const mq = window.matchMedia('(prefers-color-scheme: dark)')
		const onChange = () => setResolvedTheme(resolveTheme('auto'))
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [themePref])

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', resolvedTheme)
		if (editor) {
			editor.user.updateUserPreferences({ colorScheme: tldrawColorScheme(themePref) })
		}
	}, [editor, resolvedTheme, themePref])

	useEffect(() => {
		if (!editor) return

		const onOpenCustomMenu = (event: Event) => {
			const detail = (event as CustomEvent<{
				kind: 'page' | 'card'
				shapeId: TLShapeId
				clientX: number
				clientY: number
			}>).detail
			if (!detail) return
			if (detail.kind === 'page') {
				const shape = editor.getShape<MangaContainer>(detail.shapeId)
				if (shape && shape.type === CONTAINER) {
					setContextMenuTarget({ kind: 'page', x: detail.clientX, y: detail.clientY, pageId: shape.id })
				}
			} else if (detail.kind === 'card') {
				const shape = editor.getShape<MangaCard>(detail.shapeId)
				if (shape && shape.type === CARD) {
					setContextMenuTarget({ kind: 'card', x: detail.clientX, y: detail.clientY, cardId: shape.id })
				}
			}
		}

		const onOpenPageContext = (event: Event) => {
			const detail = (event as CustomEvent<{ pageId: TLShapeId }>).detail
			if (detail?.pageId) {
				setContextModalPageId(detail.pageId)
			}
		}

		const onExtendNextPage = (event: Event) => {
			const detail = (event as CustomEvent<{ pageId: TLShapeId }>).detail
			if (detail?.pageId) {
				const res = extendNextPageFromPage(editor, detail.pageId)
				setStatus(res.message)
			}
		}

		window.addEventListener('manga:open-context-menu', onOpenCustomMenu)
		window.addEventListener('manga:open-page-context', onOpenPageContext)
		window.addEventListener('manga:extend-next-page', onExtendNextPage)
		return () => {
			window.removeEventListener('manga:open-context-menu', onOpenCustomMenu)
			window.removeEventListener('manga:open-page-context', onOpenPageContext)
			window.removeEventListener('manga:extend-next-page', onExtendNextPage)
		}
	}, [editor])

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey
			if (!mod) return
			const key = event.key.toLowerCase()
			if (key === 'k') {
				event.preventDefault()
				setPaletteOpen((prev) => !prev)
			} else if (key === '/') {
				event.preventDefault()
				setShortcutsOpen((prev) => !prev)
			} else if (key === '1') {
				event.preventDefault()
				setLeftOpen((prev) => !prev)
			} else if (key === '2') {
				event.preventDefault()
				setRightOpen((prev) => !prev)
			} else if (key === 'e' && event.shiftKey) {
				event.preventDefault()
				exportHtml()
			} else if (key === 'e') {
				event.preventDefault()
				extendPage()
			} else if (key === 'r' && event.shiftKey) {
				event.preventDefault()
				repropagate()
			} else if (key === 'r') {
				event.preventDefault()
				openReader()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor])

	const toggleTheme = () => setThemePref((prev) => nextThemePref(prev))

	return (
		<div className={`studio-shell theme-${resolvedTheme}`} data-theme={resolvedTheme}>
			<TopBar
				editor={editor}
				status={status}
				setStatus={setStatus}
				themePref={themePref}
				onToggleTheme={toggleTheme}
				leftOpen={leftOpen}
				onToggleLeft={() => setLeftOpen((prev) => !prev)}
				rightOpen={rightOpen}
				onToggleRight={() => setRightOpen((prev) => !prev)}
				onOpenReader={openReader}
				onExport={exportHtml}
				onOpenSettings={() => setSettingsOpen(true)}
				onOpenPalette={() => setPaletteOpen(true)}
			/>
			<div className={`studio-main ${leftOpen ? 'has-left' : ''} ${rightOpen ? 'has-right' : ''}`}>
				{leftOpen ? <SourceList editor={editor} focusPage={focusPage} openTab={switchTab} setStatus={setStatus} /> : null}
				<main
					className="canvas-wrap"
					onContextMenuCapture={(event) => {
						if (!editor) return
						event.preventDefault()
						event.stopPropagation()
						const target = detectCanvasContextMenuTarget(editor, event.clientX, event.clientY, event.target)
						if (target) {
							setContextMenuTarget(target)
						}
					}}
				>
					<Tldraw
						persistenceKey={persistenceKey}
						shapeUtils={shapeUtils}
						components={{
							StylePanel: ConditionalStylePanel,
							PageMenu: null,
							QuickActions: null,
						}}
						onMount={(mounted) => {
							;(window as unknown as { __MANGA_EDITOR__?: Editor }).__MANGA_EDITOR__ = mounted
							setEditor(mounted)
							mounted.user.updateUserPreferences({ colorScheme: tldrawColorScheme(themePref) })
							applyDeepLinkOnMount(mounted)
						}}
					/>
				</main>
				{rightOpen ? (
					<Inspector
						editor={editor}
						page={activePage}
						activeTab={activeTab}
						setActiveTab={setActiveTab}
						story={story}
						setStory={setStory}
						setStatus={setStatus}
						onOpenCompare={() => setCompareOpen(true)}
						initialMaster={deepLink.masterId}
					/>
				) : null}
			</div>

			<StageBar
				statuses={stageStatuses}
				activeStage={activeStage}
				onFocusStage={(stage) => {
					const meta = STAGE_META.find((m) => m.stage === stage)
					if (meta) switchTab(meta.inspectorTab)
				}}
				onRepropagate={repropagate}
			/>

			{paletteOpen ? <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} /> : null}
			{shortcutsOpen ? <ShortcutsSheet onClose={() => setShortcutsOpen(false)} /> : null}

			{editor && contextMenuTarget ? (
				<CanvasContextMenu
					editor={editor}
					target={contextMenuTarget}
					onClose={() => setContextMenuTarget(null)}
					onStatus={(msg) => setStatus(msg)}
					onOpenCompare={() => setCompareOpen(true)}
					onOpenReader={() => setReaderBook(compileBook(editor))}
					onOpenPageContext={(pageId) => setContextModalPageId(pageId)}
				/>
			) : null}

			{editor && contextModalPageId ? (
				<PageContextModal
					editor={editor}
					pageId={contextModalPageId}
					onClose={() => setContextModalPageId(null)}
					onStatus={(msg) => setStatus(msg)}
					onSelectPage={(nextId) => setContextModalPageId(nextId)}
				/>
			) : null}

			{compareOpen ? <CompareModal editor={editor} onClose={() => setCompareOpen(false)} /> : null}
			{readerBook ? <ReaderModal book={readerBook} onClose={() => setReaderBook(null)} /> : null}
			{settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
			{welcomeOpen ? (
				<WelcomeSheet
					presets={presetList}
					onPickPreset={(id) => {
						if (editor) setStatus(applyUniversalFiveStagePreset(editor, id))
						setWelcomeOpen(false)
					}}
					onBlank={() => {
						if (editor) {
							spawnBlankPageAtPoint(editor)
							setStatus('Started a blank project · right-click the page to build the pipeline')
						}
						setWelcomeOpen(false)
					}}
					onClose={() => setWelcomeOpen(false)}
				/>
			) : null}
		</div>
	)
}

export default App
