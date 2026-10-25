import { useEffect, useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { SEAGULL_STORY } from './studio/demo/book'
import { seedDefaultIfEmpty } from './studio/editor/pipeline'
import { MangaBubbleUtil } from './studio/shapes/MangaBubbleUtil'
import { MangaCardUtil } from './studio/shapes/MangaCardUtil'
import { MangaContainerUtil } from './studio/shapes/MangaContainerUtil'
import { MangaPromptUtil } from './studio/shapes/MangaPromptUtil'
import type { CompiledBook } from './studio/spec/compile'
import { CompareModal, FloatingBar, LeftLibrary, ReaderModal, SettingsModal, TopBar, type SidebarTab } from './studio/ui/chrome'
import './studio/studio.css'

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaPromptUtil, MangaBubbleUtil]

export function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [story, setStory] = useState(SEAGULL_STORY)
	const [status, setStatus] = useState('就绪 · 设定卡 → 版式台 → 分镜台词 → 光学镜头 → 完稿导出')
	const [compareOpen, setCompareOpen] = useState(false)
	const [readerBook, setReaderBook] = useState<CompiledBook | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<SidebarTab>('cards')
	const [theme, setTheme] = useState<'light' | 'dark'>('light')

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme)
		if (editor) {
			editor.user.updateUserPreferences({ colorScheme: theme })
		}
	}, [editor, theme])

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
				onOpenReader={(book) => setReaderBook(book)}
				onOpenSettings={() => setSettingsOpen(true)}
				onSwitchTab={(tab) => setActiveTab(tab)}
				theme={theme}
				onToggleTheme={toggleTheme}
			/>
			<div className="studio-main">
				<LeftLibrary
					editor={editor}
					story={story}
					setStory={setStory}
					setStatus={setStatus}
					activeTab={activeTab}
					setActiveTab={setActiveTab}
					onOpenCompare={() => setCompareOpen(true)}
				/>
				<main className="canvas-wrap">
					<Tldraw
						persistenceKey="tldraw-manga-v5"
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
			{compareOpen ? <CompareModal editor={editor} onClose={() => setCompareOpen(false)} /> : null}
			{readerBook ? <ReaderModal book={readerBook} onClose={() => setReaderBook(null)} /> : null}
			{settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
		</div>
	)
}

export default App
