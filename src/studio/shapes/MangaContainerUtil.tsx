import { useMemo, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import { ENV_LABELS, LIGHT_LABELS, SCENARIO_LABELS } from '../demo/book'
import { energyFor } from '../editor/placement'
import { rerollSelectedPages } from '../editor/pipeline'
import { downloadBlob, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import {
	clamp,
	configFor,
	dragColDivider,
	dragRowDivider,
	pointInPoly,
	realize,
	sanitize,
	type Divider,
	type Genome,
	type Layout,
} from '../layout/engine'
import { asScenario, layoutFeatures, layoutScore } from '../layout/score'
import { renderGazeFocalTrajectorySvg, solvePageGazeFocalTrajectory } from '../jev/fiveStageEngine'
import { readJson, readPageParams, refreshAspects, type PanelMeta } from '../model'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { IconBook, IconDownload, IconFrame, IconRefresh } from '../ui/icons'
import { containerProps } from './props'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from './schema'

function placeholderMeta(seed: string, index: number): PanelMeta {
	return {
		imageSeed: `${seed}-p${index}`,
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
	}
}

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
	const fileInputRef = useRef<HTMLInputElement | null>(null)
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

	const sx = layout.width / shape.props.w
	const sy = layout.height / Math.max(1, shape.props.h - 60)

	// Live Saccadic Focal-Gaze-Bubble Trajectory for the on-canvas page: focal rings,
	// gaze vectors, intra-panel bubble->focal->exit chains and cross-gutter saccades.
	const gazeMarkup = useMemo(() => {
		if (!shape.props.showFlow) return ''
		const safeMetas = layout.panels.map((_, index) => metas[index] ?? placeholderMeta(shape.props.seed, index))
		const gazeBubbles = childBubbles.map((bubble) => ({
			panelIndex: bubble.props.panelIndex,
			style: bubble.props.bubble,
			x: bubble.x * sx,
			y: bubble.y * sy,
			w: bubble.props.w * sx,
			h: bubble.props.h * sy,
		}))
		const trajectory = solvePageGazeFocalTrajectory(layout as Layout, safeMetas, gazeBubbles, 'rtl')
		return renderGazeFocalTrajectorySvg(
			`${shape.id.replace(/[^a-zA-Z0-9]/g, '')}flow`,
			trajectory,
			layout.panels.map((panel, index) => ({ pts: panel.pts, meta: safeMetas[index] })),
		)
	}, [shape.props.showFlow, shape.props.seed, shape.id, layout, metas, childBubbles, sx, sy])

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
				onDragOver={(event) => {
					event.preventDefault()
					event.stopPropagation()
				}}
				onDrop={(event) => {
					event.preventDefault()
					event.stopPropagation()
					const file = event.dataTransfer?.files?.[0]
					if (!file || !file.type.startsWith('image/')) return
					const pos = toLocalLayout(event.clientX, event.clientY)
					const hit = layout.panels.findIndex((panel) => pointInPoly(pos.x, pos.y, panel.pts))
					const targetIdx = hit >= 0 ? hit : Math.max(0, selected)
					const reader = new FileReader()
					reader.onload = () => {
						const dataUrl = typeof reader.result === 'string' ? reader.result : ''
						if (!dataUrl) return
						const next = metas.slice()
						if (!next[targetIdx]) return
						next[targetIdx] = {
							...next[targetIdx],
							imageDataUrl: dataUrl,
							imageOffsetX: 0,
							imageOffsetY: 0,
							imageScale: 1,
							imageRotation: 0,
						}
						editor.updateShape({
							id: shape.id,
							type: CONTAINER,
							props: { selectedPanel: targetIdx, panelsJson: JSON.stringify(next) },
						})
					}
					reader.readAsDataURL(file)
				}}
				onWheel={(event) => {
					const pos = toLocalLayout(event.clientX, event.clientY)
					const hit = layout.panels.findIndex((panel) => pointInPoly(pos.x, pos.y, panel.pts))
					const targetIdx = hit >= 0 ? hit : selected
					if (targetIdx < 0 || !metas[targetIdx]) return
					event.stopPropagation()
					event.preventDefault()
					editor.markEventAsHandled(event.nativeEvent)
					const next = metas.slice()
					const factor = event.deltaY < 0 ? 1.07 : 0.93
					next[targetIdx] = {
						...next[targetIdx],
						imageScale: Number(clamp((next[targetIdx].imageScale || 1) * factor, 0.45, 3.2).toFixed(2)),
					}
					editor.updateShape({
						id: shape.id,
						type: CONTAINER,
						props: { selectedPanel: targetIdx, panelsJson: JSON.stringify(next) },
					})
				}}
			>
				<div className="page-art" dangerouslySetInnerHTML={{ __html: artSvg }} />
				<svg
					className="page-overlay"
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					preserveAspectRatio="none"
					style={{ cursor: 'grab' }}
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
							next[state.panelIndex] = {
								...base,
								imageOffsetX: Math.round((base.imageOffsetX || 0) + dx),
								imageOffsetY: Math.round((base.imageOffsetY || 0) + dy),
							}
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
						const activePanel = hit >= 0 ? hit : selected
						if (hit >= 0 && hit !== selected) {
							editor.select(shape.id)
							editor.updateShape({ id: shape.id, type: CONTAINER, props: { selectedPanel: hit } })
						}
						if (activePanel < 0 || !layout.panels[activePanel]) return
						event.stopPropagation()
						editor.markEventAsHandled(event)
						event.currentTarget.setPointerCapture(event.pointerId)
						dragRef.current = {
							mode: 'pan',
							panelIndex: activePanel,
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

					{shape.props.showFlow && gazeMarkup ? (
						<g className="flow-overlay" pointerEvents="none" dangerouslySetInnerHTML={{ __html: gazeMarkup }} />
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
			<footer
				className="page-foot"
				onPointerDown={(e) => {
					e.stopPropagation()
					editor.markEventAsHandled(e)
				}}
			>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					style={{ display: 'none' }}
					onChange={(e) => {
						const file = e.target.files?.[0]
						if (!file) return
						const targetIdx = Math.max(0, selected)
						const reader = new FileReader()
						reader.onload = () => {
							const dataUrl = typeof reader.result === 'string' ? reader.result : ''
							if (!dataUrl) return
							const next = metas.slice()
							if (!next[targetIdx]) return
							next[targetIdx] = {
								...next[targetIdx],
								imageDataUrl: dataUrl,
								imageOffsetX: 0,
								imageOffsetY: 0,
								imageScale: 1,
								imageRotation: 0,
							}
							editor.updateShape({
								id: shape.id,
								type: CONTAINER,
								props: { selectedPanel: targetIdx, panelsJson: JSON.stringify(next) },
							})
						}
						reader.readAsDataURL(file)
						e.target.value = ''
					}}
				/>
				{(() => {
					const activeIdx = Math.max(0, selected)
					const activeMeta = metas[activeIdx]
					const scaleVal = Number(activeMeta?.imageScale || 1)
					const presetSamples = [
						'/assets/interrogation/panel1_establishing.jpg',
						'/assets/interrogation/panel2_cuff_probe.jpg',
						'/assets/interrogation/panel3_watch_macro.jpg',
						'/assets/interrogation/panel4_silent_lighter_spark.jpg',
						'/assets/interrogation/panel5_climax_accusation.jpg',
					]
					return (
						<div className="page-cell-hud" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
								<span className="pill accent" style={{ fontSize: 10, padding: '1px 6px' }}>格#{activeIdx + 1}</span>
								<button
									className="mini-btn"
									title="上传或替换当前单元格底图（也支持直接把图片拖入画格）"
									onClick={() => fileInputRef.current?.click()}
								>
									📷 插图
								</button>
								<button
									className="mini-btn"
									title="载入预置 AI 原画样图到当前格"
									onClick={() => {
										const next = metas.slice()
										if (!next[activeIdx]) return
										next[activeIdx] = {
											...next[activeIdx],
											imageDataUrl: presetSamples[activeIdx % presetSamples.length],
											imageOffsetX: 0,
											imageOffsetY: 0,
											imageScale: 1,
											imageRotation: 0,
										}
										editor.updateShape({
											id: shape.id,
											type: CONTAINER,
											props: { selectedPanel: activeIdx, panelsJson: JSON.stringify(next) },
										})
									}}
								>
									🖼️ 样图
								</button>
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
								<span style={{ fontSize: 10, color: '#475569' }}>缩放</span>
								<input
									type="range"
									min={0.5}
									max={2.8}
									step={0.05}
									value={scaleVal}
									style={{ width: 64, accentColor: '#0066cc', cursor: 'pointer' }}
									onChange={(e) => {
										const nextScale = Number(e.target.value)
										const next = metas.slice()
										if (!next[activeIdx]) return
										next[activeIdx] = { ...next[activeIdx], imageScale: nextScale }
										editor.updateShape({ id: shape.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
									}}
								/>
								<span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', minWidth: 30 }}>{Math.round(scaleVal * 100)}%</span>
								<button
									className="mini-btn"
									title="复位当前格图片位置、缩放与旋转"
									onClick={() => {
										const next = metas.slice()
										if (!next[activeIdx]) return
										next[activeIdx] = {
											...next[activeIdx],
											imageOffsetX: 0,
											imageOffsetY: 0,
											imageScale: 1,
											imageRotation: 0,
										}
										editor.updateShape({ id: shape.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
									}}
								>
									✥ 复位
								</button>
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
								<button
									className={`mini-btn ${shape.props.showBubblesLayer !== false ? 'active' : ''}`}
									title="显示/隐藏文字气泡独立图层"
									onClick={() =>
										editor.updateShape({
											id: shape.id,
											type: CONTAINER,
											props: { showBubblesLayer: shape.props.showBubblesLayer === false },
										})
									}
								>
									气泡
								</button>
								<button
									className={`mini-btn ${shape.props.showProsodyLayer !== false ? 'active' : ''}`}
									title="显示/隐藏语气助词独立图层"
									onClick={() =>
										editor.updateShape({
											id: shape.id,
											type: CONTAINER,
											props: { showProsodyLayer: shape.props.showProsodyLayer === false },
										})
									}
								>
									语气
								</button>
							</div>
						</div>
					)
				})()}
			</footer>
		</HTMLContainer>
	)
}
