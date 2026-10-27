import { useEffect, useState } from 'react'
import { Tldraw, type Editor, type TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { SEAGULL_STORY } from './studio/demo/book'
import { extendNextPageFromPage, seedDefaultIfEmpty } from './studio/editor/pipeline'
import { MangaBubbleUtil } from './studio/shapes/MangaBubbleUtil'
import { MangaCardUtil } from './studio/shapes/MangaCardUtil'
import { MangaContainerUtil } from './studio/shapes/MangaContainerUtil'
import { MangaPromptUtil } from './studio/shapes/MangaPromptUtil'
import { CARD, CONTAINER, type MangaCard, type MangaContainer } from './studio/shapes/schema'
import { compileBook, type CompiledBook } from './studio/spec/compile'
import { CompareModal, FloatingBar, LeftLibrary, ReaderModal, SettingsModal, TopBar, type SidebarTab } from './studio/ui/chrome'
import {
	CanvasContextMenu,
	detectCanvasContextMenuTarget,
	PageContextModal,
	type ContextMenuTarget,
} from './studio/ui/contextMenu'
import './studio/studio.css'

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
							setEditor(mounted)
							mounted.user.updateUserPreferences({ colorScheme: theme })
							seedDefaultIfEmpty(mounted)
						}}
					/>
				</main>
			</div>

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
