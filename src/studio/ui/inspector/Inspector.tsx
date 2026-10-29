// =============================================================================
// Inspector.tsx — the right contextual Inspector panel.
// A compact segmented tab control (Page · Panel · Balloon · Asset · Masters ·
// Theory) over one tab's worth of fields. The active tab is driven by the canvas
// selection through resolveInspectorTab; Masters and Theory are reference tabs
// the user opens explicitly. The Inspector never stacks panels.
// =============================================================================

import { lazy, Suspense } from 'react'
import { type Editor } from 'tldraw'
import { type CanvasSelectionKind, type InspectorTab } from '../inspectorModel'
import { type MangaContainer } from '../../shapes/schema'
import { AssetTab } from './AssetTab'
import { BalloonTab } from './BalloonTab'
import { PageTab, type PipelineInspectorOps } from './PageTab'
import { PanelTab } from './PanelTab'

// Masters and Theory are reference tabs the user opens explicitly, and they pull
// in the large style-master / comics-theory data libraries. Load them (and their
// data) on demand so the first paint never pays for them. A restrained skeleton
// bridges the one-frame import gap.
const MastersTab = lazy(() => import('./MastersTab').then((m) => ({ default: m.MastersTab })))
const TheoryTab = lazy(() => import('./TheoryTab').then((m) => ({ default: m.TheoryTab })))

function TabSkeleton() {
	return (
		<div className="inspector-skeleton" aria-busy="true" aria-live="polite">
			<span className="inspector-skeleton-line" />
			<span className="inspector-skeleton-line" />
			<span className="inspector-skeleton-line short" />
		</div>
	)
}

/** The six Inspector tabs, mapped to their internal selection-resolution ids. */
export const INSPECTOR_TABS: ReadonlyArray<{ id: InspectorTab; label: string }> = [
	{ id: 'layout', label: 'Page' },
	{ id: 'camera', label: 'Panel' },
	{ id: 'story', label: 'Balloon' },
	{ id: 'cards', label: 'Asset' },
	{ id: 'masters', label: 'Masters' },
	{ id: 'theory', label: 'Theory' },
]

export function Inspector({
	editor,
	page,
	activeTab,
	setActiveTab,
	story,
	setStory,
	setStatus,
	onOpenCompare,
	initialMaster,
	selectionKind = 'none',
	pipeline,
}: {
	editor: Editor | null
	page: MangaContainer | null
	activeTab: InspectorTab
	setActiveTab: (tab: InspectorTab) => void
	story: string
	setStory: (value: string) => void
	setStatus: (value: string) => void
	onOpenCompare?: () => void
	/** Master id to pre-select when the Masters tab first opens (deep link). */
	initialMaster?: string | null
	/** Current canvas selection kind, so the Theory tab scope follows selection. */
	selectionKind?: CanvasSelectionKind
	/** Pipeline operator actions + live stage status for the Page tab. */
	pipeline?: PipelineInspectorOps
}) {
	return (
		<aside className="inspector">
			<div className="inspector-tabs" role="tablist" aria-label="Inspector">
				{INSPECTOR_TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={activeTab === tab.id}
						className={activeTab === tab.id ? 'active' : ''}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>
			{activeTab === 'layout' ? (
				<PageTab editor={editor} page={page} story={story} setStory={setStory} setStatus={setStatus} onOpenCompare={onOpenCompare} pipeline={pipeline} />
			) : activeTab === 'camera' ? (
				<PanelTab editor={editor} page={page} setStatus={setStatus} />
			) : activeTab === 'story' ? (
				<BalloonTab editor={editor} page={page} setStatus={setStatus} />
			) : activeTab === 'cards' ? (
				<AssetTab editor={editor} setStatus={setStatus} />
			) : activeTab === 'masters' ? (
				<Suspense fallback={<TabSkeleton />}>
					<MastersTab editor={editor} page={page} setStatus={setStatus} initialMaster={initialMaster} />
				</Suspense>
			) : (
				<Suspense fallback={<TabSkeleton />}>
					<TheoryTab editor={editor} page={page} setStatus={setStatus} selectionKind={selectionKind} />
				</Suspense>
			)}
		</aside>
	)
}
