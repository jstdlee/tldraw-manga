import { useState } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import './studio/studio.css'
import { SEAGULL_STORY } from './studio/demo/book'
import { seedDefaultIfEmpty, spawnPromptBlock } from './studio/editor/pipeline'
import type { BlockId } from './studio/prompts/library'
import type { CompiledBook } from './studio/spec/compile'
import { MangaBubbleUtil } from './studio/shapes/MangaBubbleUtil'
import { MangaCardUtil } from './studio/shapes/MangaCardUtil'
import { MangaContainerUtil } from './studio/shapes/MangaContainerUtil'
import { MangaPromptUtil } from './studio/shapes/MangaPromptUtil'
import { CompareModal, FloatingBar, LeftLibrary, ReaderModal, SettingsModal, TopBar, type SidebarTab } from './studio/ui/chrome'

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaPromptUtil, MangaBubbleUtil]

const components: TLComponents = {
	InFrontOfTheCanvas: FloatingBar,
	SharePanel: null,
	StylePanel: null,
	MainMenu: null,
	PageMenu: null,
	ActionsMenu: null,
	QuickActions: null,
	HelperButtons: null,
	DebugPanel: null,
	DebugMenu: null,
	MenuPanel: null,
	TopPanel: null,
}

export function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [story, setStory] = useState(SEAGULL_STORY)
	const [status, setStatus] = useState('就绪 · 文字卡/图像卡均支持 AI 润色、重生成、Vision 识图反推与自定义提示词')
	const [activeTab, setActiveTab] = useState<SidebarTab>('cards')
	const [compareOpen, setCompareOpen] = useState(false)
	const [readerBook, setReaderBook] = useState<CompiledBook | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)

	return (
		<div className="studio-root">
			<TopBar
				editor={editor}
				story={story}
				status={status}
				setStatus={setStatus}
				onOpenCompare={() => setCompareOpen(true)}
				onOpenReader={(book) => setReaderBook(book)}
				onOpenSettings={() => setSettingsOpen(true)}
				onSwitchTab={(tab) => setActiveTab(tab)}
			/>
			<div className="studio-body">
				<LeftLibrary
					editor={editor}
					story={story}
					setStory={setStory}
					setStatus={setStatus}
					activeTab={activeTab}
					setActiveTab={setActiveTab}
				/>
				<div
					className="studio-canvas"
					onDragOver={(event) => {
						if (event.dataTransfer.types.includes('application/manga-block')) event.preventDefault()
					}}
					onDrop={(event) => {
						const block = event.dataTransfer.getData('application/manga-block') as BlockId
						if (!block || !editor) return
						event.preventDefault()
						const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
						spawnPromptBlock(editor, block, point.x, point.y)
						setStatus(`已放入「${block}」AI 节点，用箭头连向容器或直接点击执行`)
					}}
				>
					<Tldraw
						persistenceKey="tldraw-manga-studio-v2"
						shapeUtils={shapeUtils}
						components={components}
						onMount={(ed) => {
							;(window as unknown as { __tldrawEditor?: Editor }).__tldrawEditor = ed
							setEditor(ed)
							seedDefaultIfEmpty(ed)
						}}
					/>
				</div>
			</div>
			{compareOpen ? <CompareModal editor={editor} onClose={() => setCompareOpen(false)} /> : null}
			{readerBook ? <ReaderModal book={readerBook} onClose={() => setReaderBook(null)} /> : null}
			{settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
		</div>
	)
}

export default App
