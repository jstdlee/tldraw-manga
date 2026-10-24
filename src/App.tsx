import { Tldraw } from 'tldraw'
import { FloatingBar, Sidebar, StudioModal, TopBar, handleMount } from './studio/ui/chrome'
import { MangaBubbleUtil } from './studio/shapes/MangaBubbleUtil'
import { MangaCardUtil } from './studio/shapes/MangaCardUtil'
import { MangaContainerUtil } from './studio/shapes/MangaContainerUtil'
import { MangaPromptUtil } from './studio/shapes/MangaPromptUtil'

const shapeUtils = [MangaContainerUtil, MangaCardUtil, MangaBubbleUtil, MangaPromptUtil]
const components = { InFrontOfTheCanvas: FloatingBar, SharePanel: null }

export default function App() {
	return (
		<div className="studio">
			<TopBar />
			<div className="studio-body">
				<Sidebar />
				<div className="studio-canvas">
					<Tldraw persistenceKey="tldraw-manga" shapeUtils={shapeUtils} components={components} onMount={handleMount} />
				</div>
			</div>
			<StudioModal />
		</div>
	)
}
