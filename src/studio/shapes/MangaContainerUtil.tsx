import { useMemo, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import { ENV_LABELS, LIGHT_LABELS, SCENARIO_LABELS } from '../demo/book'
import { energyFor } from '../editor/placement'
import { rerollSelectedPages } from '../editor/pipeline'
import { downloadBlob, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import {
	centroid,
	clamp,
	configFor,
	dragColDivider,
	dragRowDivider,
	pointInPoly,
	realize,
	sanitize,
	type Divider,
	type Genome,
} from '../layout/engine'
import { asScenario, layoutFeatures, layoutScore } from '../layout/score'
import { readJson, readPageParams, refreshAspects, type PanelMeta } from '../model'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { IconBook, IconDownload, IconFrame, IconRefresh } from '../ui/icons'
import { containerProps } from './props'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from './schema'

export class MangaContainerUtil extends BaseBoxShapeUtil<MangaContainer> {
	static override type = CONTAINER
	static override props = containerProps

	override getDefaultProps(): MangaContainer['props'] {
		return {
			w: 460,
			h: 650,
			role: 'page',
			title: 'P1',
			subtitle: '',
			story: '',
			worldRules: '',
			stylePreset: '少年网点',
			mood: '',
			environment: 'boardwalk',
			lighting: 'hard-noon',
			chapterIndex: 1,
			pageIndex: 1,
			scenario: 'tension',
			layoutPreset: 'std',
			dialogueDensity: 50,
			targetPanels: 5,
			seed: 'p1',
			genomeJson: '{}',
			panelsJson: '[]',
			scriptJson: '[]',
			score: 0,
			reasonsJson: '[]',
			showFlow: false,
			selectedPanel: -1,
		}
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return true
	}

	override isAspectRatioLocked(shape: MangaContainer) {
		return shape.props.role === 'page'
	}

	override canBind() {
		return true
	}

	override canReceiveNewChildrenOfType(shape: MangaContainer, type: string) {
		if (shape.props.role === 'page') return type === BUBBLE || type === 'note' || type === 'text' || type === 'image'
		return type !== CONTAINER
	}

	override onResize(shape: MangaContainer, info: TLResizeInfo<MangaContainer>) {
		return resizeBox(shape, info, { minWidth: 260, minHeight: 200 })
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

function ContainerView({ shape }: { shape: MangaContainer }) {
	const editor = useEditor()
	if (shape.props.role !== 'page') {
		const roleLabel = shape.props.role === 'bible' ? '设定集' : `第${shape.props.chapterIndex}话`
		const envLabel = ENV_LABELS[shape.props.environment] ?? shape.props.environment
		const lightLabel = LIGHT_LABELS[shape.props.lighting] ?? shape.props.lighting
		return (
			<HTMLContainer className={`manga-container role-${shape.props.role}`}>
				<header className="container-bar">
					<span className="role-pill">
						<IconBook /> {roleLabel}
					</span>
					<strong>{shape.props.title}</strong>
					<span className="container-sub">
						{shape.props.role === 'bible' ? shape.props.stylePreset : `${envLabel} · ${lightLabel}`}
					</span>
				</header>
				<div className="container-body">
					<p>{shape.props.subtitle || shape.props.mood || '将设定卡、视觉参考卡或 AI 节点放入此容器，并通过连线驱动分镜页。'}</p>
				</div>
			</HTMLContainer>
		)
	}
	return <PageView shape={shape} editor={editor} />
}

function PageView({ shape, editor }: { shape: MangaContainer; editor: ReturnType<typeof useEditor> }) {
	const dragRef = useRef<{
		mode: 'divider' | 'pan'
		divider?: Divider
		panelIndex?: number
		startX: number
		startY: number
		genome: Genome
		metas: PanelMeta[]
		mark: string
	} | null>(null)

	const overrides = useMemo(
		() => readPageParams(shape.props.mood, shape.props.layoutPreset),
		[shape.props.mood, shape.props.layoutPreset],
	)
	const genome = useMemo(
		() => sanitize(readJson<Genome>(shape.props.genomeJson, { rows: [] })),
		[shape.props.genomeJson],
	)
	const config = useMemo(
		() => configFor(shape.props.layoutPreset, shape.props.targetPanels, overrides),
		[shape.props.layoutPreset, shape.props.targetPanels, overrides],
	)
	const layout = useMemo(() => realize(genome, config), [genome, config])
	const metas = useMemo(() => readJson<PanelMeta[]>(shape.props.panelsJson, []), [shape.props.panelsJson])

	const childBubbles = useValue(
		'page-bubbles',
		() =>
			editor
				.getSortedChildIdsForParent(shape.id)
				.map((id) => editor.getShape(id))
				.filter((item): item is MangaBubble => item?.type === BUBBLE),
		[editor, shape.id],
	)

	const pageRenderModel = useMemo<PageRenderModel>(
		() => ({
			uid: shape.id.replace(/[^a-zA-Z0-9]/g, ''),
			title: shape.props.title,
			width: layout.width,
			height: layout.height,
			inner: layout.inner,
			panels: layout.panels.map((panel, index) => {
				const meta = metas[index] ?? {
					imageSeed: `${shape.props.seed}-p${index}`,
					imageOffsetX: 0,
					imageOffsetY: 0,
					imageScale: 1,
					imageRotation: 0,
					aspect: '1:1',
					shot: 'MS' as const,
					angle: 'eye' as const,
					focal: '50mm' as const,
					beat: '',
					who: [],
					fries: 'none' as const,
					eyeline: [8, -4] as [number, number],
					imageDataUrl: '',
					environment: '',
				}
				return {
					pts: panel.pts,
					meta,
					environment: meta.environment || shape.props.environment,
					lighting: shape.props.lighting,
					energy: energyFor(shape.props.scenario, meta.fries),
				}
			}),
			bubbles: [],
			numbers: 'corner',
			director: shape.props.showFlow,
			lineWidth: overrides.lineW,
			showInnerFrame: overrides.showInnerFrame,
			showRuleOfThirds: overrides.showRuleOfThirds,
			showAxis180: overrides.showAxis180,
			selectedPanel: shape.props.selectedPanel,
			part: 'all',
		}),
		[
			layout,
			metas,
			overrides,
			shape.id,
			shape.props.environment,
			shape.props.lighting,
			shape.props.scenario,
			shape.props.seed,
			shape.props.selectedPanel,
			shape.props.showFlow,
			shape.props.title,
		],
	)

	const artSvg = useMemo(() => renderPageSvg(pageRenderModel), [pageRenderModel])

	const toLocalLayout = (clientX: number, clientY: number) => {
		const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
		const local = editor.getPointInShapeSpace(shape, pagePoint)
		const headerH = 36
		const stageH = Math.max(1, shape.props.h - headerH - 24)
		return {
			x: (local.x / shape.props.w) * layout.width,
			y: ((local.y - headerH) / stageH) * layout.height,
		}
	}

	const selected = shape.props.selectedPanel
	const reasons = readJson<string[]>(shape.props.reasonsJson, [])
	const scenarioZh = SCENARIO_LABELS[shape.props.scenario] ?? shape.props.scenario

	const centers = layout.panels.map((panel) => centroid(panel.pts))
	const sx = layout.width / shape.props.w
	const sy = layout.height / Math.max(1, shape.props.h - 60)
	const bubbleChain = childBubbles
		.slice()
		.sort((a, b) => a.props.panelIndex - b.props.panelIndex || a.y - b.y)
		.map((bubble) => `${((bubble.x + bubble.props.w / 2) * sx).toFixed(1)},${((bubble.y + bubble.props.h / 2) * sy).toFixed(1)}`)

	const stopEvent = (event: React.SyntheticEvent) => {
		event.stopPropagation()
		editor.markEventAsHandled(event.nativeEvent)
	}

	return (
		<HTMLContainer className="manga-container role-page">
			<header className="container-bar">
				<span className="role-pill">
					<IconFrame /> {shape.props.title}
				</span>
				<span className="badge">{scenarioZh}</span>
				<span className="badge">{layout.panels.length}格</span>
				<span className="badge score" title={reasons.join(' · ')}>
					{Math.round(shape.props.score * 100)}分
				</span>
				<div className="page-mini-actions" onPointerDown={stopEvent}>
					<button
						type="button"
						className="mini-icon-btn"
						title="切换此页分格版式"
						onClick={() => {
							editor.select(shape.id)
							rerollSelectedPages(editor)
						}}
					>
						<IconRefresh />
					</button>
					<button
						type="button"
						className="mini-icon-btn"
						title="导出单页矢量 SVG"
						onClick={() => exportPageSvgFile(pageRenderModel, `${shape.props.title}.svg`)}
					>
						SVG
					</button>
					<button
						type="button"
						className="mini-icon-btn"
						title="导出 2400px 印刷级高清 PNG"
						onClick={async () => {
							const blob = await exportPagePng2400(pageRenderModel, 2400)
							downloadBlob(`${shape.props.title}-2400px.png`, blob, 'image/png')
						}}
					>
						<IconDownload /> PNG
					</button>
				</div>
			</header>
			<div
				className="page-stage"
				onWheel={(event) => {
					if (selected < 0 || !metas[selected]) return
					event.stopPropagation()
					const next = metas.slice()
					const factor = event.deltaY < 0 ? 1.07 : 0.93
					next[selected] = { ...next[selected], imageScale: clamp((next[selected].imageScale || 1) * factor, 0.6, 2.6) }
					editor.updateShape({ id: shape.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
				}}
			>
				<div className="page-art" dangerouslySetInnerHTML={{ __html: artSvg }} />
				<svg
					className="page-overlay"
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					preserveAspectRatio="none"
					onPointerMove={(event) => {
						const state = dragRef.current
						if (!state) return
						event.stopPropagation()
						const pos = toLocalLayout(event.clientX, event.clientY)
						const dx = pos.x - state.startX
						const dy = pos.y - state.startY
						if (state.mode === 'divider' && state.divider) {
							const nextGenome =
								state.divider.kind === 'row'
									? dragRowDivider(state.genome, state.divider.index, dx, dy, config)
									: dragColDivider(state.genome, state.divider.row, state.divider.index, dx, dy, config)
							const nextLayout = realize(nextGenome, config)
							const nextMetas = refreshAspects(state.metas, nextLayout.panels, shape.props.seed)
							const judged = layoutScore(layoutFeatures(nextLayout), shape.props.targetPanels, asScenario(shape.props.scenario))
							editor.updateShape({
								id: shape.id,
								type: CONTAINER,
								props: {
									genomeJson: JSON.stringify(nextGenome),
									panelsJson: JSON.stringify(nextMetas),
									score: judged.score,
									reasonsJson: JSON.stringify(judged.reasons),
								},
							})
						} else if (state.mode === 'pan' && state.panelIndex !== undefined) {
							const next = state.metas.slice()
							const base = next[state.panelIndex]
							if (!base) return
							next[state.panelIndex] = { ...base, imageOffsetX: Math.round(base.imageOffsetX + dx), imageOffsetY: Math.round(base.imageOffsetY + dy) }
							editor.updateShape({ id: shape.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
						}
					}}
					onPointerUp={() => {
						if (dragRef.current) editor.squashToMark(dragRef.current.mark)
						dragRef.current = null
					}}
					onDoubleClick={(event) => {
						event.stopPropagation()
						editor.markEventAsHandled(event)
						const pos = toLocalLayout(event.clientX, event.clientY)
						const hit = layout.panels.findIndex((panel) => pointInPoly(pos.x, pos.y, panel.pts))
						editor.select(shape.id)
						editor.updateShape({ id: shape.id, type: CONTAINER, props: { selectedPanel: hit === selected ? -1 : hit } })
					}}
					onPointerDown={(event) => {
						const pos = toLocalLayout(event.clientX, event.clientY)
						const hit = layout.panels.findIndex((panel) => pointInPoly(pos.x, pos.y, panel.pts))
						if (hit >= 0 && hit !== selected) {
							editor.select(shape.id)
							editor.updateShape({ id: shape.id, type: CONTAINER, props: { selectedPanel: hit } })
						}
						if (selected < 0) return
						if (!layout.panels[selected] || !pointInPoly(pos.x, pos.y, layout.panels[selected].pts)) return
						event.stopPropagation()
						editor.markEventAsHandled(event)
						event.currentTarget.setPointerCapture(event.pointerId)
						dragRef.current = {
							mode: 'pan',
							panelIndex: selected,
							startX: pos.x,
							startY: pos.y,
							genome,
							metas,
							mark: editor.markHistoryStoppingPoint('pan-panel'),
						}
					}}
				>
					{selected >= 0 && layout.panels[selected] ? (
						<polygon
							points={layout.panels[selected].pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
							fill="rgba(37,99,235,0.06)"
							stroke="#2563eb"
							strokeWidth={4.5}
							strokeDasharray="10 5"
						/>
					) : null}

					{shape.props.showFlow ? (
						<g className="flow-overlay" pointerEvents="none">
							{centers.length > 1 ? (
								<polyline
									points={centers.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
									fill="none"
									stroke="#c93d35"
									strokeWidth={4}
									strokeLinecap="round"
								/>
							) : null}
							{centers.map(([cx, cy], index) => {
								const eye = metas[index]?.eyeline ?? [12, -4]
								return (
									<g key={index}>
										<circle cx={cx} cy={cy} r={14} fill="#c93d35" />
										<text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff">
											{index + 1}
										</text>
										<line x1={cx} y1={cy} x2={cx + eye[0] * 3} y2={cy + eye[1] * 3} stroke="#1f8a5b" strokeWidth={3.5} />
									</g>
								)
							})}
							{bubbleChain.length > 1 ? <polyline points={bubbleChain.join(' ')} fill="none" stroke="#1e78c8" strokeWidth={3} strokeDasharray="8 6" /> : null}
						</g>
					) : null}

					{layout.dividers.map((divider, index) => (
						<g
							key={index}
							style={{ cursor: divider.kind === 'row' ? 'ns-resize' : 'ew-resize', pointerEvents: 'all' }}
							onPointerDown={(event) => {
								event.stopPropagation()
								editor.markEventAsHandled(event)
								const svg = event.currentTarget.ownerSVGElement
								svg?.setPointerCapture(event.pointerId)
								const pos = toLocalLayout(event.clientX, event.clientY)
								dragRef.current = {
									mode: 'divider',
									divider,
									startX: pos.x,
									startY: pos.y,
									genome,
									metas,
									mark: editor.markHistoryStoppingPoint('drag-gutter'),
								}
							}}
						>
							<circle cx={divider.x} cy={divider.y} r={14} fill="rgba(37,99,235,0.12)" />
							<circle cx={divider.x} cy={divider.y} r={5.5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.8} />
						</g>
					))}
				</svg>
			</div>
			<footer className="page-foot">
				<span>{reasons.slice(0, 2).join(' · ') || '单击选格联动光学镜头 · 拖拽分割点调斜切分格'}</span>
			</footer>
		</HTMLContainer>
	)
}
