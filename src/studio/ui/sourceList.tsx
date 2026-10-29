// =============================================================================
// sourceList.tsx — the left source-list sidebar (NSOutlineView idiom).
// Three groups: Pipeline (the page chain with per-page status and inheritance
// caption), Assets (the discrete named reference registry grouped by category),
// and Library (reference tabs: Masters, Theory, Layouts, Lettering, Tones).
// Reads live canvas state; mutations and the Inspector live elsewhere.
// =============================================================================

import { useState, type ReactElement } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { buildCanvasAssetRegistryForPage, readPageContext, selectedPages } from '../editor/pipeline'
import type { DiscreteAssetCategory } from '../jev/fiveStageEngine'
import { readJson, type PanelMeta } from '../model'
import { CARD, CONTAINER, type MangaCard, type MangaContainer } from '../shapes/schema'
import type { InspectorTab } from './inspectorModel'
import { IconBook, IconBubble, IconFrame, IconGrid, IconSparkles } from './icons'

type PageStatus = 'idle' | 'storyboard' | 'done'

interface PageRow {
	id: TLShapeId
	index: number
	title: string
	status: PageStatus
}

interface AssetRow {
	tag: string
	name: string
	category: DiscreteAssetCategory
	filePath: string
	placed: boolean
}

const CATEGORY_GROUPS: ReadonlyArray<{ category: DiscreteAssetCategory; label: string }> = [
	{ category: 'character', label: 'Characters' },
	{ category: 'environment', label: 'Environments' },
	{ category: 'prop', label: 'Props' },
	{ category: 'style', label: 'Styles' },
]

const LIBRARY_ROWS: ReadonlyArray<{ label: string; tab: InspectorTab; icon: ReactElement }> = [
	{ label: 'Masters', tab: 'masters', icon: <IconSparkles /> },
	{ label: 'Theory', tab: 'theory', icon: <IconBook /> },
	{ label: 'Layouts', tab: 'layout', icon: <IconGrid /> },
	{ label: 'Lettering', tab: 'story', icon: <IconBubble /> },
	{ label: 'Tones', tab: 'camera', icon: <IconFrame /> },
]

function AssetThumb({ asset }: { asset: AssetRow }) {
	const [broken, setBroken] = useState(false)
	const showImage = !broken && /^(data:|https?:|\/)/.test(asset.filePath)
	if (showImage) {
		return <img className="asset-thumb" src={asset.filePath} alt="" loading="lazy" onError={() => setBroken(true)} />
	}
	const initial = asset.name.replace(/^[@#]/, '').charAt(0).toUpperCase() || '?'
	return <span className="asset-thumb placeholder">{initial}</span>
}

export function SourceList({
	editor,
	focusPage,
	openTab,
	setStatus,
}: {
	editor: Editor | null
	focusPage: (id: string) => void
	openTab: (tab: InspectorTab) => void
	setStatus: (value: string) => void
}) {
	const pages = useValue<PageRow[]>(
		'sourcelist-pages',
		() => {
			if (!editor) return []
			return editor
				.getCurrentPageShapes()
				.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
				.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))
				.map((page, idx) => {
					const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
					const hasArt = metas.some((m) => m.imageDataUrl)
					const status: PageStatus = hasArt ? 'done' : metas.length > 0 ? 'storyboard' : 'idle'
					return { id: page.id, index: page.props.pageIndex || idx + 1, title: page.props.title, status }
				})
		},
		[editor],
	)

	const selectedPageId = useValue<string | null>('sourcelist-selected-page', () => (editor ? selectedPages(editor)[0]?.id ?? null : null), [editor])

	const assets = useValue<AssetRow[]>(
		'sourcelist-assets',
		() => {
			if (!editor) return []
			const page = selectedPages(editor)[0] ?? editor.getCurrentPageShapes().find((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
			if (!page) return []
			const registry = buildCanvasAssetRegistryForPage(editor, page, readPageContext(editor, page))
			const placedTags = new Set(
				editor
					.getCurrentPageShapes()
					.filter((s): s is MangaCard => s.type === CARD && Boolean(s.props.tag))
					.map((s) => s.props.tag),
			)
			return Object.values(registry.assets)
				.map((asset) => ({ tag: asset.tag, name: asset.name, category: asset.category, filePath: asset.filePath, placed: placedTags.has(asset.tag) }))
				.sort((a, b) => a.tag.localeCompare(b.tag))
		},
		[editor],
	)

	const revealAsset = (asset: AssetRow) => {
		if (editor) {
			const card = editor.getCurrentPageShapes().find((s): s is MangaCard => s.type === CARD && s.props.tag === asset.tag)
			if (card) {
				editor.select(card.id)
				editor.zoomToSelection({ animation: { duration: 300 } })
				setStatus(`Selected ${asset.tag}`)
			} else {
				setStatus(`${asset.tag} is a registry asset — not yet placed on this page`)
			}
		}
		openTab('cards')
	}

	return (
		<aside className="sourcelist">
			<div className="sourcelist-body">
				<section className="sl-group">
					<h2 className="sl-group-head">Pipeline</h2>
					{pages.length === 0 ? (
						<p className="sl-empty">No pages yet.</p>
					) : (
						<div className="sl-pages">
							{pages.map((page, idx) => (
								<button
									key={page.id}
									type="button"
									className={`sl-page-row ${page.id === selectedPageId ? 'active' : ''}`}
									onClick={() => focusPage(page.id)}
									title={page.title}
								>
									<span className={`sl-dot dot-${page.status}`} aria-hidden="true" />
									<span className="sl-page-main">
										<span className="sl-page-title">P{page.index} · {page.title}</span>
										{idx > 0 ? <span className="sl-page-caption">inherits from P{pages[idx - 1].index}</span> : <span className="sl-page-caption">origin page</span>}
									</span>
								</button>
							))}
						</div>
					)}
				</section>

				<section className="sl-group">
					<h2 className="sl-group-head">Assets</h2>
					{assets.length === 0 ? (
						<p className="sl-empty">No reference assets.</p>
					) : (
						CATEGORY_GROUPS.map(({ category, label }) => {
							const rows = assets.filter((a) => a.category === category)
							if (rows.length === 0) return null
							return (
								<div key={category} className="sl-asset-group">
									<h3 className="sl-subhead">{label}</h3>
									{rows.map((asset) => (
										<button
											key={asset.tag}
											type="button"
											className={`sl-asset-row ${asset.placed ? 'placed' : ''}`}
											onClick={() => revealAsset(asset)}
											title={asset.name}
										>
											<AssetThumb asset={asset} />
											<span className="sl-asset-main">
												<span className="sl-asset-tag">{asset.tag}</span>
												<span className="sl-asset-name">{asset.name}</span>
											</span>
										</button>
									))}
								</div>
							)
						})
					)}
				</section>

				<section className="sl-group">
					<h2 className="sl-group-head">Library</h2>
					<div className="sl-library">
						{LIBRARY_ROWS.map((row) => (
							<button key={row.label} type="button" className="sl-library-row" onClick={() => openTab(row.tab)}>
								<span className="sl-library-icon" aria-hidden="true">{row.icon}</span>
								{row.label}
							</button>
						))}
					</div>
				</section>
			</div>
		</aside>
	)
}
