import { useEffect, useMemo, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { useValue } from '@tldraw/state-react'
import { ENV_IDS, ENV_LABELS, LIGHT_IDS, LIGHT_LABELS } from '../demo/book'
import { getState, notify, patch, useStudio } from '../editor/store'
import {
	centroid,
	configFor,
	dragColDivider,
	dragRowDivider,
	pointInPoly,
	realize,
	sanitize,
	type Divider,
	type Layout,
} from '../layout/engine'
import { asScenario, layoutFeatures, layoutScore } from '../layout/score'
import { readJson, refreshAspects, type PanelMeta } from '../model'
import { pageModel } from '../editor/placement'
import { renderPageSvg } from '../render/pageSvg'
import { emptyContainer } from '../editor/build'
import { isBubble, isPage } from './guards'
import { CONTAINER, type MangaContainer } from './schema'
import { containerProps } from './props'
import { wireShapes } from './wire'

export class MangaContainerUtil extends BaseBoxShapeUtil<MangaContainer> {
	static override type = CONTAINER
	static override props = containerProps

	override getDefaultProps(): MangaContainer['props'] {
		return emptyContainer('chapter')
	}

	override canEdit() {
		return false
	}

	override canResize(shape: MangaContainer) {
		return shape.props.role !== 'page'
	}

	override isAspectRatioLocked(shape: MangaContainer) {
		return shape.props.role === 'page'
	}

	override canBind({ bindingType }: { bindingType: string }) {
		return bindingType === 'arrow'
	}

	override canReceiveNewChildrenOfType(shape: MangaContainer, type: string) {
		if (shape.props.role === 'page') return type === 'manga-bubble' || type === 'manga-card' || type === 'note' || type === 'text' || type === 'image' || type === 'geo'
		return type === 'manga-card' || type === 'manga-prompt-block' || type === 'note' || type === 'text' || type === 'image' || type === 'geo'
	}

	override onResize(shape: MangaContainer, info: TLResizeInfo<MangaContainer>) {
		return resizeBox(shape, info, { minWidth: 220, minHeight: 160 })
	}

	override getIndicatorPath(shape: MangaContainer) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	override component(shape: MangaContainer) {
		return <ContainerView shape={shape} />
	}
}

function halt(editor: ReturnType<typeof useEditor>, event: { stopPropagation(): void; nativeEvent: Event }) {
	event.stopPropagation()
	editor.markEventAsHandled(event)
}

function ContainerView({ shape }: { shape: MangaContainer }) {
	const editor = useEditor()
	const studio = useStudio()
	const svgRef = useRef<SVGSVGElement | null>(null)
	const drag = useRef<{ kind: 'gutter' | 'pan'; divider?: Divider; lastX: number; lastY: number; mark: string; panel: number } | null>(null)
	const view = useMemo(() => pageView(shape), [shape])
	const bubbles = useValue(
		'page-bubbles',
		() =>
			shape.props.role === 'page'
				? editor
						.getSortedChildIdsForParent(shape.id)
						.map((id) => editor.getShape(id))
						.filter(isBubble)
				: [],
		[editor, shape.id, shape.props.role],
	)
	const layout = view?.layout
	const armed = studio.wiringFrom === shape.id
	const cropping = studio.crop?.pageId === shape.id
	useEffect(() => {
		const node = svgRef.current
		if (!node || shape.props.role !== 'page') return
		const onWheel = (event: WheelEvent) => {
			const crop = getState().crop
			if (!crop || crop.pageId !== shape.id) return
			event.preventDefault()
			event.stopPropagation()
			editor.markEventAsHandled(event)
			const page = editor.getShape(shape.id)
			if (!isPage(page)) return
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
			const meta = metas[crop.panel]
			if (!meta) return
			metas[crop.panel] = { ...meta, imageScale: clamp((meta.imageScale || 1) * (event.deltaY > 0 ? 0.92 : 1.08), 0.45, 3.4) }
			editor.updateShape({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(metas) } })
		}
		node.addEventListener('wheel', onWheel, { passive: false })
		return () => node.removeEventListener('wheel', onWheel)
	}, [editor, shape.id, shape.props.role])

	const onPort = (event: React.PointerEvent, side: 'in' | 'out') => {
		halt(editor, event)
		if (side === 'out') {
			patch({ wiringFrom: shape.id })
			notify('再点下游容器左侧的圆点，把设定沿箭头送过去。')
			return
		}
		const from = getState().wiringFrom
		if (!from) {
			notify('先点上游右侧的圆点。')
			return
		}
		wireShapes(editor, from, shape.id)
		patch({ wiringFrom: null })
		notify('接好了。导出时会沿这根箭头收集章节和页。')
	}

	return (
		<HTMLContainer className={`manga-root role-${shape.props.role}`}>
			{shape.props.role === 'page' && view && layout ? (
				<>
					<div className="manga-art" dangerouslySetInnerHTML={{ __html: view.svg }} />
					<svg
						ref={svgRef}
						className="manga-hit"
						viewBox={`0 0 ${layout.width} ${layout.height}`}
						onDoubleClick={(event) => {
							const point = pointOf(svgRef.current, event)
							if (!point) return
							const panel = hitPanel(layout, point.x, point.y)
							if (panel < 0) return
							halt(editor, event)
							const crop = getState().crop
							if (crop && crop.pageId === shape.id && crop.panel === panel) patch({ crop: null })
							else patch({ crop: { pageId: shape.id, panel } })
							editor.setSelectedShapes([shape.id])
						}}
						onPointerDown={(event) => {
							const svg = svgRef.current
							const point = pointOf(svg, event)
							if (!point || !svg) return
							const divider = nearDivider(layout, point.x, point.y)
							if (divider) {
								halt(editor, event)
								svg.setPointerCapture(event.pointerId)
								drag.current = { kind: 'gutter', divider, lastX: point.x, lastY: point.y, mark: editor.markHistoryStoppingPoint('gutter'), panel: -1 }
								return
							}
							if (!cropping) return
							const panel = hitPanel(layout, point.x, point.y)
							if (panel < 0) return
							halt(editor, event)
							svg.setPointerCapture(event.pointerId)
							patch({ crop: { pageId: shape.id, panel } })
							drag.current = { kind: 'pan', lastX: point.x, lastY: point.y, mark: editor.markHistoryStoppingPoint('pan'), panel }
						}}
						onPointerMove={(event) => {
							const current = drag.current
							const point = pointOf(svgRef.current, event)
							if (!current || !point) return
							const dx = point.x - current.lastX
							const dy = point.y - current.lastY
							current.lastX = point.x
							current.lastY = point.y
							const page = editor.getShape(shape.id)
							if (!isPage(page)) return
							if (current.kind === 'gutter' && current.divider) {
								const config = configFor(page.props.layoutPreset, page.props.targetPanels)
								const genome =
									current.divider.kind === 'row'
										? dragRowDivider(sanitize(readJson(page.props.genomeJson, { rowW: [1], rowTilt: [], rows: [] })), current.divider.index, dx, dy, config)
										: dragColDivider(sanitize(readJson(page.props.genomeJson, { rowW: [1], rowTilt: [], rows: [] })), current.divider.row, current.divider.index, dx, dy, config)
								const realized = realize(genome, config)
								const prev = readJson<PanelMeta[]>(page.props.panelsJson, [])
								const metas = refreshAspects(prev, realized.panels, page.props.seed)
								const judged = layoutScore(layoutFeatures({ genome, panels: realized.panels }), realized.panels.length, asScenario(page.props.scenario))
								editor.updateShape({
									id: page.id,
									type: CONTAINER,
									props: { genomeJson: JSON.stringify(genome), panelsJson: JSON.stringify(metas), score: judged.score },
								})
								return
							}
							const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
							const meta = metas[current.panel]
							if (!meta) return
							metas[current.panel] = {
								...meta,
								imageOffsetX: clamp(meta.imageOffsetX + dx, -420, 420),
								imageOffsetY: clamp(meta.imageOffsetY + dy, -420, 420),
							}
							editor.updateShape({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(metas) } })
						}}
						onPointerUp={() => {
							if (drag.current) editor.squashToMark(drag.current.mark)
							drag.current = null
						}}
					>
						{layout.panels.map((panel, index) => (
							<polygon
								key={index}
								points={panel.pts.map((pt) => pt.join(',')).join(' ')}
								fill="transparent"
								stroke={cropping && studio.crop?.panel === index ? '#d6453d' : 'transparent'}
								strokeWidth={cropping && studio.crop?.panel === index ? 3 : 0}
								style={{ pointerEvents: 'all' }}
							/>
						))}
						{shape.props.showFlow ? <FlowOverlay layout={layout} metas={view.metas} bubbles={bubbles} pageW={shape.props.w} pageH={shape.props.h} /> : null}
						{layout.dividers.map((divider) => (
							<g key={`${divider.kind}-${divider.row}-${divider.index}`} style={{ pointerEvents: 'all' }}>
								<line
									x1={divider.kind === 'row' ? divider.x - 34 : divider.x}
									y1={divider.kind === 'row' ? divider.y : divider.y - 34}
									x2={divider.kind === 'row' ? divider.x + 34 : divider.x}
									y2={divider.kind === 'row' ? divider.y : divider.y + 34}
									stroke="#d6453d"
									strokeWidth={4}
								/>
								<circle cx={divider.x} cy={divider.y} r={12} fill="#fffefb" stroke="#d6453d" strokeWidth={2} />
							</g>
						))}
					</svg>
					<div className="page-chip">
						{shape.props.title} · {shape.props.score.toFixed(2)}
						{cropping ? ` · 格内 ${((studio.crop?.panel ?? 0) + 1)}` : ''}
					</div>
				</>
			) : (
				<div className="container-body">
					<div className="container-kicker">{shape.props.role === 'bible' ? '设定母容器' : '章节容器'}</div>
					<h2>{shape.props.title}</h2>
					<p className="container-sub">{shape.props.subtitle}</p>
					{shape.props.role === 'bible' ? (
						<label className="field">
							画风
							<select
								value={shape.props.stylePreset}
								onPointerDown={(event) => halt(editor, event)}
								onChange={(event) => editor.updateShape({ id: shape.id, type: CONTAINER, props: { stylePreset: event.target.value } })}
							>
								{['少年网点', '少女淡彩', '硬诺瓦尔', '港风水墨'].map((preset) => (
									<option key={preset}>{preset}</option>
								))}
							</select>
						</label>
					) : (
						<div className="field-row">
							<label className="field">
								场景
								<select
									value={shape.props.environment}
									onPointerDown={(event) => halt(editor, event)}
									onChange={(event) => setChapterEnvironment(editor, shape, event.target.value)}
								>
									{ENV_IDS.map((id) => (
										<option key={id} value={id}>
											{ENV_LABELS[id]}
										</option>
									))}
								</select>
							</label>
							<label className="field">
								光
								<select
									value={shape.props.lighting}
									onPointerDown={(event) => halt(editor, event)}
									onChange={(event) => setChapterLighting(editor, shape, event.target.value)}
								>
									{LIGHT_IDS.map((id) => (
										<option key={id} value={id}>
											{LIGHT_LABELS[id]}
										</option>
									))}
								</select>
							</label>
						</div>
					)}
					<p className="container-hint">{shape.props.role === 'bible' ? '把角色卡拖进来，或从左侧放下一块新的。' : shape.props.mood}</p>
				</div>
			)}
			<button type="button" className={`port port-in ${studio.wiringFrom ? 'listen' : ''}`} aria-label="输入端口" onPointerDown={(event) => onPort(event, 'in')} />
			<button type="button" className={`port port-out ${armed ? 'armed' : ''}`} aria-label="输出端口" onPointerDown={(event) => onPort(event, 'out')} />
		</HTMLContainer>
	)
}

function FlowOverlay({
	layout,
	metas,
	bubbles,
	pageW,
	pageH,
}: {
	layout: Layout
	metas: PanelMeta[]
	bubbles: Array<{ x: number; y: number; props: { w: number; h: number; panelIndex: number } }>
	pageW: number
	pageH: number
}) {
	const centers = layout.panels.map((panel) => centroid(panel.pts))
	const sx = layout.width / pageW
	const sy = layout.height / pageH
	const chain = bubbles
		.slice()
		.sort((a, b) => a.props.panelIndex - b.props.panelIndex || a.y - b.y)
		.map((bubble) => `${((bubble.x + bubble.props.w / 2) * sx).toFixed(1)},${((bubble.y + bubble.props.h / 2) * sy).toFixed(1)}`)
		.join(' ')
	return (
		<g style={{ pointerEvents: 'none' }}>
			<rect x={layout.inner.x0} y={layout.inner.y0} width={layout.inner.x1 - layout.inner.x0} height={layout.inner.y1 - layout.inner.y0} fill="none" stroke="#1e78c8" strokeDasharray="7 5" strokeWidth={1.6} />
			<polyline points={centers.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ')} fill="none" stroke="#d6453d" strokeWidth={2.4} />
			{chain ? <polyline points={chain} fill="none" stroke="#1e78c8" strokeWidth={2} strokeDasharray="7 5" /> : null}
			{centers.map((center, index) => {
				const [dx, dy] = metas[index]?.eyeline ?? [0, 0]
				return <line key={index} x1={center[0]} y1={center[1]} x2={center[0] + dx} y2={center[1] + dy} stroke="#1f9d55" strokeWidth={2.4} />
			})}
		</g>
	)
}

function pageView(shape: MangaContainer) {
	if (shape.props.role !== 'page') return null
	const layout: Layout = {
		...realize(sanitize(readJson(shape.props.genomeJson, { rowW: [1], rowTilt: [], rows: [] })), configFor(shape.props.layoutPreset, shape.props.targetPanels)),
		seed: shape.props.seed,
	}
	const metas = readJson<PanelMeta[]>(shape.props.panelsJson, [])
	const svg = renderPageSvg(
		pageModel({
			uid: shape.id,
			title: shape.props.title,
			width: layout.width,
			height: layout.height,
			inner: layout.inner,
			panels: layout.panels.map((panel, index) => ({
				pts: panel.pts,
				meta: metas[index] ?? {
					imageSeed: `${shape.props.seed}-p${index}`,
					imageOffsetX: 0,
					imageOffsetY: 0,
					imageScale: 1,
					imageRotation: 0,
					aspect: '1:1',
					shot: 'MS',
					angle: 'eye',
					focal: '50mm',
					beat: '',
					who: [],
					fries: 'none',
					eyeline: [8, -4],
					imageDataUrl: '',
					environment: '',
				},
			})),
			environment: shape.props.environment,
			lighting: shape.props.lighting,
			scenario: shape.props.scenario,
			bubbles: [],
			pageW: shape.props.w,
			pageH: shape.props.h,
			numbers: 'on',
			director: false,
		}),
	)
	return { svg, layout, metas }
}

function pointOf(svg: SVGSVGElement | null, event: { clientX: number; clientY: number }) {
	if (!svg) return null
	const rect = svg.getBoundingClientRect()
	if (!rect.width || !rect.height) return null
	const view = svg.viewBox.baseVal
	return {
		x: ((event.clientX - rect.left) / rect.width) * (view.width || 1),
		y: ((event.clientY - rect.top) / rect.height) * (view.height || 1),
	}
}

function hitPanel(layout: Layout, x: number, y: number) {
	for (let index = layout.panels.length - 1; index >= 0; index -= 1) {
		if (pointInPoly(x, y, layout.panels[index].pts)) return index
	}
	return -1
}

function nearDivider(layout: Layout, x: number, y: number) {
	let best: Divider | null = null
	let distance = 20
	for (const divider of layout.dividers) {
		const next = Math.hypot(divider.x - x, divider.y - y)
		if (next < distance) {
			best = divider
			distance = next
		}
	}
	return best
}

function setChapterEnvironment(editor: ReturnType<typeof useEditor>, shape: MangaContainer, environment: string) {
	editor.run(() => {
		editor.updateShape({ id: shape.id, type: CONTAINER, props: { environment } })
		for (const id of editor.getSortedChildIdsForParent(shape.id)) {
			const card = editor.getShape(id)
			if (card?.type === 'manga-card' && (card.props as { kind: string }).kind === 'environment') {
				editor.updateShape({
					id,
					type: 'manga-card',
					props: { tag: environment, title: environment, body: ENV_LABELS[environment] ?? environment },
				})
			}
		}
		for (const page of editor.getCurrentPageShapes().filter(isPage)) {
			if (page.props.chapterIndex !== shape.props.chapterIndex) continue
			const metas = readJson<PanelMeta[]>(page.props.panelsJson, []).map((meta) => ({ ...meta, imageDataUrl: '' }))
			editor.updateShape({ id: page.id, type: CONTAINER, props: { environment, panelsJson: JSON.stringify(metas) } })
		}
	})
	notify(`第 ${shape.props.chapterIndex} 话场景改为 ${ENV_LABELS[environment] ?? environment}。`)
}

function setChapterLighting(editor: ReturnType<typeof useEditor>, shape: MangaContainer, lighting: string) {
	editor.run(() => {
		editor.updateShape({ id: shape.id, type: CONTAINER, props: { lighting } })
		for (const page of editor.getCurrentPageShapes().filter(isPage)) {
			if (page.props.chapterIndex !== shape.props.chapterIndex) continue
			editor.updateShape({ id: page.id, type: CONTAINER, props: { lighting } })
		}
	})
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}
