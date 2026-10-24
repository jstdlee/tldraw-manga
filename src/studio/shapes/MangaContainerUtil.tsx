import { useMemo, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import { ENV_LABELS, LIGHT_LABELS, SCENARIO_LABELS } from '../demo/book'
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
import { readJson, refreshAspects, type PanelMeta } from '../model'
import { energyFor } from '../editor/placement'
import { renderPageSvg } from '../render/pageSvg'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from './schema'
import { containerProps } from './props'

export class MangaContainerUtil extends BaseBoxShapeUtil<MangaContainer> {
	static override type = CONTAINER
	static override props = containerProps

	override getDefaultProps(): MangaContainer['props'] {
		return {
			w: 460,
			h: 640,
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
		const roleLabel = shape.props.role === 'bible' ? '📖 设定集' : `📑 第${shape.props.chapterIndex}话`
		const envLabel = ENV_LABELS[shape.props.environment] ?? shape.props.environment
		const lightLabel = LIGHT_LABELS[shape.props.lighting] ?? shape.props.lighting
		return (
			<HTMLContainer className={`manga-container role-${shape.props.role}`}>
				<header className="container-bar">
					<span className="role-pill">{roleLabel}</span>
					<strong>{shape.props.title}</strong>
					<span className="container-sub">
						{shape.props.role === 'bible' ? shape.props.stylePreset : `${envLabel} · ${lightLabel}`}
					</span>
				</header>
				<div className="container-body">
					<p>{shape.props.subtitle || shape.props.mood || '把文字设定卡、图像参考卡或 AI 节点放入此容器，或用箭头连向下游容器。'}</p>
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

	const genome = useMemo(() => sanitize(readJson<Genome>(shape.props.genomeJson, { rowW: [], rowTilt: [], rows: [] })), [shape.props.genomeJson])
	const config = useMemo(() => configFor(shape.props.layoutPreset, shape.props.targetPanels), [shape.props.layoutPreset, shape.props.targetPanels])
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

	const artSvg = useMemo(
		() =>
			renderPageSvg({
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
				numbers: 'on',
				director: shape.props.showFlow,
				part: 'all',
			}),
		[layout, metas, shape.id, shape.props.environment, shape.props.lighting, shape.props.scenario, shape.props.seed, shape.props.showFlow, shape.props.title],
	)

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

	return (
		<HTMLContainer className="manga-container role-page">
			<header className="container-bar">
				<span className="role-pill">📄 {shape.props.title}</span>
				<span className="badge">{scenarioZh}</span>
				<span className="badge">{layout.panels.length}格</span>
				<span className="badge score" title={reasons.join(' · ')}>
					评分 {Math.round(shape.props.score * 100)}
				</span>
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
						editor.updateShape({ id: shape.id, type: CONTAINER, props: { selectedPanel: hit === selected ? -1 : hit } })
					}}
					onPointerDown={(event) => {
						if (selected < 0) return
						const pos = toLocalLayout(event.clientX, event.clientY)
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
							fill="rgba(201,61,53,0.08)"
							stroke="#c93d35"
							strokeWidth={5}
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
							<circle cx={divider.x} cy={divider.y} r={16} fill="rgba(201,61,53,0.16)" />
							<circle cx={divider.x} cy={divider.y} r={7} fill="#c93d35" stroke="#fffefb" strokeWidth={2} />
						</g>
					))}
				</svg>
			</div>
			<footer className="page-foot">
				<span>{reasons.slice(0, 2).join(' · ') || '拖拽红点改斜切分格 · 双击格内推拉构图'}</span>
			</footer>
		</HTMLContainer>
	)
}
