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
import { CompareModal, FloatingBar, ReaderModal, SettingsModal, TopBar } from './studio/ui/chrome'
import {
	CanvasContextMenu,
	detectCanvasContextMenuTarget,
	PageContextModal,
	type ContextMenuTarget,
} from './studio/ui/contextMenu'
import { Inspector } from './studio/ui/inspector/Inspector'
import { resolveInspectorTab, type CanvasSelectionKind, type InspectorTab } from './studio/ui/inspectorModel'
import { SourceList } from './studio/ui/sourceList'
import { buildCommands, CommandPalette, ShortcutsSheet, StageBar, type PagePick } from './studio/ui/shell'
import { completedStagesFrom, deriveStageStatuses, STAGE_META, type StageEvidence } from './studio/ui/stageStatus'

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaPromptUtil, MangaBubbleUtil]

export function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [story, setStory] = useState(SEAGULL_STORY)
	const [status, setStatus] = useState('Ready · right-click any panel, bubble, page or the canvas for the context menu · use the source list or the Inspector to drive the pipeline')
	const [compareOpen, setCompareOpen] = useState(false)
	const [readerBook, setReaderBook] = useState<CompiledBook | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<InspectorTab>('layout')
	const [theme, setTheme] = useState<'light' | 'dark'>('light')
	// Page-first workspace: the left source list opens by default; the right
	// Inspector stays collapsed so the canvas opens wide (Cmd-1 / Cmd-2 toggle).
	const [leftOpen, setLeftOpen] = useState(true)
	const [rightOpen, setRightOpen] = useState(false)
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

	useEffect(() => {
		if (!rightOpen || selectionKind === 'none') return
		setActiveTab(resolveInspectorTab(selectionKind))
	}, [selectionKind, rightOpen])

	const stageStatuses = useMemo(
		() => deriveStageStatuses({ dirty: [], completed: completedStagesFrom(canvasModel.evidence) }),
		[canvasModel.evidence],
	)
	const activeStage = rightOpen ? STAGE_META.find((m) => m.inspectorTab === activeTab)?.stage ?? null : null

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

	const commands = useMemo(() => {
		const ctx = {
			pages: canvasModel.pages,
			presets: listUniversalPresets().map((p) => ({ id: p.id, title: p.title })),
			theme,
			hasEditor: Boolean(editor),
			focusPage,
			extendPage,
			switchTab,
			toggleDrawer: () => setRightOpen((prev) => !prev),
			toggleSidebar: () => setLeftOpen((prev) => !prev),
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
				status={status}
				setStatus={setStatus}
				theme={theme}
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
						persistenceKey="tldraw-manga-v6"
						shapeUtils={shapeUtils}
						components={{
							InFrontOfTheCanvas: () => <FloatingBar />,
						}}
						onMount={(mounted) => {
							;(window as unknown as { __MANGA_EDITOR__?: Editor }).__MANGA_EDITOR__ = mounted
							setEditor(mounted)
							mounted.user.updateUserPreferences({ colorScheme: theme })
							seedDefaultIfEmpty(mounted)
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
