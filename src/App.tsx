import { useEffect, useMemo, useState } from 'react'
import { Tldraw, useValue, type Editor, type TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { SEAGULL_STORY } from './studio/demo/book'
import {
	applyUniversalFiveStagePreset,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	extendNextPageFromPage,
	runJevFiveStageCompile,
	seedDefaultIfEmpty,
	selectedPages,
} from './studio/editor/pipeline'
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
import { CompareModal, FloatingBar, LeftLibrary, ReaderModal, SettingsModal, TopBar, type SidebarTab } from './studio/ui/chrome'
import {
	CanvasContextMenu,
	detectCanvasContextMenuTarget,
	PageContextModal,
	type ContextMenuTarget,
} from './studio/ui/contextMenu'
import { resolveInspectorTab, type CanvasSelectionKind } from './studio/ui/inspectorModel'
import { buildCommands, CommandPalette, ShortcutsSheet, StageBar, type PagePick } from './studio/ui/shell'
import { completedStagesFrom, deriveStageStatuses, type StageEvidence } from './studio/ui/stageStatus'
import type { AppStage } from './studio/library/productionStages'
import './studio/studio.css'

const TAB_FOR_STAGE: Record<AppStage, SidebarTab> = {
	1: 'cards',
	2: 'story',
	3: 'layout',
	4: 'camera',
	5: 'llm',
}
const STAGE_FOR_TAB: Record<SidebarTab, AppStage> = {
	cards: 1,
	story: 2,
	layout: 3,
	camera: 4,
	llm: 5,
}

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaPromptUtil, MangaBubbleUtil]

export function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [story, setStory] = useState(SEAGULL_STORY)
	const [status, setStatus] = useState('Ready · right-click any panel, bubble, page or the canvas for the context menu · use the pipeline strip or Extend Page to grow the pipeline with inherited context')
	const [compareOpen, setCompareOpen] = useState(false)
	const [readerBook, setReaderBook] = useState<CompiledBook | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<SidebarTab>('cards')
	const [theme, setTheme] = useState<'light' | 'dark'>('light')
	// Page-first workspace: start with the Inspector drawer collapsed so the canvas
	// opens wide and uncluttered. The user expands it from the TopBar Inspector toggle.
	const [drawerOpen, setDrawerOpen] = useState(false)
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

	useEffect(() => {
		if (!drawerOpen || selectionKind === 'none') return
		const next = resolveInspectorTab(selectionKind)
		// resolveInspectorTab only yields reference tabs for pseudo-selections,
		// which never arise from a shape selection, so this is always a SidebarTab.
		if (next === 'cards' || next === 'story' || next === 'layout' || next === 'camera' || next === 'llm') {
			setActiveTab(next)
		}
	}, [selectionKind, drawerOpen])

	const stageStatuses = useMemo(
		() => deriveStageStatuses({ dirty: [], completed: completedStagesFrom(canvasModel.evidence) }),
		[canvasModel.evidence],
	)
	const activeStage = STAGE_FOR_TAB[activeTab]

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
	const switchTab = (tab: SidebarTab) => {
		setActiveTab(tab)
		setDrawerOpen(true)
	}
	const extendPage = () => {
		if (!editor) return
		const active = selectedPages(editor)[0]
		const res = extendNextPageFromPage(editor, active?.id)
		setStatus(res.message)
	}

	const commands = useMemo(() => {
		const ctx = {
			pages: canvasModel.pages,
			presets: listUniversalPresets().map((p) => ({ id: p.id, title: p.title })),
			theme,
			hasEditor: Boolean(editor),
			focusPage,
			extendPage,
			switchTab,
			toggleDrawer: () => setDrawerOpen((prev) => !prev),
			toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
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
	}, [canvasModel.pages, editor, theme])

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme)
		if (editor) {
			editor.user.updateUserPreferences({ colorScheme: theme })
		}
	}, [editor, theme])

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
					setContextMenuTarget({
						kind: 'page',
						x: detail.clientX,
						y: detail.clientY,
						pageId: shape.id,
					})
				}
			} else if (detail.kind === 'card') {
				const shape = editor.getShape<MangaCard>(detail.shapeId)
				if (shape && shape.type === CARD) {
					setContextMenuTarget({
						kind: 'card',
						x: detail.clientX,
						y: detail.clientY,
						cardId: shape.id,
					})
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
				setDrawerOpen((prev) => !prev)
			} else if (key === 'e' && event.shiftKey) {
				event.preventDefault()
				exportHtml()
			} else if (key === 'e') {
				event.preventDefault()
				extendPage()
			} else if (key === 'r') {
				event.preventDefault()
				openReader()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor])

	const toggleTheme = () => {
		setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
	}

	return (
		<div className={`studio-shell theme-${theme}`} data-theme={theme}>
			<TopBar
				editor={editor}
				story={story}
				status={status}
				setStatus={setStatus}
				onOpenCompare={() => setCompareOpen(true)}
				onOpenReader={() => { if (editor) setReaderBook(compileBook(editor)) }}
				onOpenSettings={() => setSettingsOpen(true)}
				onSwitchTab={(tab) => {
					setActiveTab(tab)
					setDrawerOpen(true)
				}}
				theme={theme}
				onToggleTheme={toggleTheme}
				drawerOpen={drawerOpen}
				onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
				onOpenPalette={() => setPaletteOpen(true)}
			/>
			<div className={`studio-main ${drawerOpen ? '' : 'drawer-closed'}`}>
				{drawerOpen ? (
					<LeftLibrary
						editor={editor}
						story={story}
						setStory={setStory}
						setStatus={setStatus}
						activeTab={activeTab}
						setActiveTab={setActiveTab}
						onOpenCompare={() => setCompareOpen(true)}
					/>
				) : null}
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
						persistenceKey="tldraw-manga-v6"
						shapeUtils={shapeUtils}
						components={{
							InFrontOfTheCanvas: () => <FloatingBar onSwitchTab={(tab) => setActiveTab(tab)} />,
						}}
						onMount={(mounted) => {
							;(window as unknown as { __MANGA_EDITOR__?: Editor }).__MANGA_EDITOR__ = mounted
							setEditor(mounted)
							mounted.user.updateUserPreferences({ colorScheme: theme })
							seedDefaultIfEmpty(mounted)
						}}
					/>
				</main>
			</div>

			<StageBar
				statuses={stageStatuses}
				activeStage={drawerOpen ? activeStage : null}
				onFocusStage={(stage) => switchTab(TAB_FOR_STAGE[stage])}
				onRepropagate={() => {
					if (editor) setStatus(runJevFiveStageCompile(editor))
				}}
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
		</div>
	)
}

export default App
