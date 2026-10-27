import { useEffect, useRef, useState } from 'react'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { askText } from '../ai/client'
import {
	ANGLE_LABELS,
	BUBBLE_LABELS,
	ENV_IDS,
	ENV_LABELS,
	LIGHT_IDS,
	LIGHT_LABELS,
	SCENARIO_LABELS,
	SHOT_LABELS,
} from '../demo/book'
import {
	addBubbleToPage,
	addStandaloneProsodyToPage,
	applyEmotionStrategyOnPage,
	applyOpticsToPanel,
	applySelectedCardAiAction,
	bindCardToPageContext,
	cloneVariantPage,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	extendNextPageFromPage,
	formatBeatsToScriptText,
	loadPresetArtIntoPanel,
	readPageContext,
	regenerateSelectedPanel,
	rerollSelectedPages,
	resetPanelTransformOnPage,
	rotatePanelImageOnPage,
	runJevFiveStageCompile,
	spawnBlankPageAtPoint,
	tidyCanvasLayout,
	togglePanelBleedOnPage,
	togglePanelNestOnPage,
	togglePanelSubsplitOnPage,
	toggleSilentPanelOnPage,
	updatePageContextAndRecompile,
	updatePageParametric,
} from '../editor/pipeline'
import { downloadBlob, exportOpenRaster, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import { compileBook } from '../spec/compile'
import { configFor, generate, pointInPoly, realize, sanitize } from '../layout/engine'
import { type Scenario } from '../layout/score'
import {
	PROSODY_STYLE_LABELS,
	type Beat,
	type BubbleStyle,
	type PanelMeta,
	type ProsodyStyle,
} from '../model'

const PROSODY_STYLES: ProsodyStyle[] = ['pill', 'seal', 'slant', 'burst', 'minimal', 'off']
const PROSODY_Preset_COLORS: Array<{ color: string; label: string }> = [
	{ color: '#e11d48', label: '朱印红' },
	{ color: '#2563eb', label: '群青蓝' },
	{ color: '#d97706', label: '琥珀金' },
	{ color: '#0f172a', label: '玄墨黑' },
	{ color: '#7c3aed', label: '紫电' },
]
import { BUBBLE, CARD, CONTAINER, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'

export type ContextMenuTarget =
	| {
			kind: 'cell'
			x: number
			y: number
			pageId: TLShapeId
			panelIndex: number
			tab?: 'cell' | 'page'
	  }
	| {
			kind: 'page'
			x: number
			y: number
			pageId: TLShapeId
	  }
	| {
			kind: 'bubble'
			x: number
			y: number
			bubbleId: TLShapeId
	  }
	| {
			kind: 'card'
			x: number
			y: number
			cardId: TLShapeId
	  }
	| {
			kind: 'canvas'
			x: number
			y: number
			canvasX: number
			canvasY: number
	  }

export function openCustomContextMenu(target: ContextMenuTarget): void {
	window.dispatchEvent(new CustomEvent<ContextMenuTarget>('manga:open-context-menu', { detail: target }))
}

export function openPageContextInspector(pageId: TLShapeId): void {
	window.dispatchEvent(new CustomEvent<{ pageId: TLShapeId }>('manga:open-page-context', { detail: { pageId } }))
}

export function triggerExtendNextPage(pageId?: TLShapeId): void {
	window.dispatchEvent(new CustomEvent<{ pageId?: TLShapeId }>('manga:extend-next-page', { detail: { pageId } }))
}

const BUBBLE_FILL_PRESETS = [
	{ color: '#fffefb', label: '纸白' },
	{ color: '#fef9c3', label: '暖米' },
	{ color: '#f1f5f9', label: '冷灰' },
	{ color: '#ffe4e6', label: '绯红' },
	{ color: '#0f172a', label: '黑底' },
]

const SHOTS: Array<PanelMeta['shot']> = ['EWS', 'WS', 'MS', 'MCU', 'CU', 'ECU']
const ANGLES: Array<PanelMeta['angle']> = ['eye', 'low', 'high', 'dutch', 'bird']
const FOCALS: Array<{ focal: PanelMeta['focal']; mm: number }> = [
	{ focal: '18mm', mm: 18 },
	{ focal: '35mm', mm: 35 },
	{ focal: '50mm', mm: 50 },
	{ focal: '85mm', mm: 85 },
]
const SCENARIOS: Scenario[] = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax']

function clampMenuCoords(x: number, y: number, menuW = 336, menuH = 510): { left: number; top: number } {
	const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
	const vh = typeof window !== 'undefined' ? window.innerHeight : 900
	return {
		left: Math.max(12, Math.min(x, vw - menuW - 14)),
		top: Math.max(48, Math.min(y, vh - menuH - 14)),
	}
}

export function detectCanvasContextMenuTarget(
	editor: Editor,
	clientX: number,
	clientY: number,
	domTarget: EventTarget | null,
): ContextMenuTarget {
	const el = domTarget instanceof HTMLElement ? domTarget : null
	const pagePt = editor.screenToPage({ x: clientX, y: clientY })

	const bubbleEl = el?.closest('[data-bubble-id]') as HTMLElement | null
	if (bubbleEl) {
		const bubbleId = bubbleEl.getAttribute('data-bubble-id') as TLShapeId
		const shape = editor.getShape(bubbleId)
		if (shape?.type === BUBBLE) {
			editor.select(shape.id)
			return { kind: 'bubble', x: clientX, y: clientY, bubbleId: shape.id }
		}
	}

	const cardEl = el?.closest('[data-card-id]') as HTMLElement | null
	if (cardEl) {
		const cardId = cardEl.getAttribute('data-card-id') as TLShapeId
		const shape = editor.getShape(cardId)
		if (shape?.type === CARD) {
			editor.select(shape.id)
			return { kind: 'card', x: clientX, y: clientY, cardId: shape.id }
		}
	}

	const pageEl = el?.closest('[data-page-id]') as HTMLElement | null
	const cellEl = el?.closest('[data-panel-index]') as HTMLElement | null
	if (pageEl) {
		const pageId = pageEl.getAttribute('data-page-id') as TLShapeId
		const page = editor.getShape(pageId)
		if (page?.type === CONTAINER && page.props.role === 'page') {
			const onHeaderOrFooter = Boolean(el?.closest('.container-bar, .page-foot'))
			if (onHeaderOrFooter && !cellEl) {
				editor.select(page.id)
				return { kind: 'page', x: clientX, y: clientY, pageId: page.id }
			}
			let panelIndex = cellEl ? Number(cellEl.getAttribute('data-panel-index')) : -1
			if (panelIndex < 0 || Number.isNaN(panelIndex)) {
				panelIndex = hitTestPagePanelIndex(page as MangaContainer, pagePt.x, pagePt.y)
			}
			editor.select(page.id)
			editor.updateShape<MangaContainer>({
				id: page.id,
				type: CONTAINER,
				props: { selectedPanel: panelIndex },
			})
			return { kind: 'cell', x: clientX, y: clientY, pageId: page.id, panelIndex, tab: 'cell' }
		}
	}

	const allShapes = editor.getCurrentPageShapes()
	for (let i = allShapes.length - 1; i >= 0; i -= 1) {
		const s = allShapes[i]
		if (s.type === BUBBLE) {
			const parent = s.parentId ? editor.getShape(s.parentId) : null
			const bx = (parent && 'x' in parent ? parent.x : 0) + s.x
			const by = (parent && 'y' in parent ? parent.y : 0) + s.y
			if (pagePt.x >= bx && pagePt.x <= bx + s.props.w && pagePt.y >= by && pagePt.y <= by + s.props.h) {
				editor.select(s.id)
				return { kind: 'bubble', x: clientX, y: clientY, bubbleId: s.id }
			}
		}
	}
	for (let i = allShapes.length - 1; i >= 0; i -= 1) {
		const s = allShapes[i]
		if (s.type === CARD) {
			if (pagePt.x >= s.x && pagePt.x <= s.x + s.props.w && pagePt.y >= s.y && pagePt.y <= s.y + s.props.h) {
				editor.select(s.id)
				return { kind: 'card', x: clientX, y: clientY, cardId: s.id }
			}
		}
		if (s.type === CONTAINER && s.props.role === 'page') {
			if (pagePt.x >= s.x && pagePt.x <= s.x + s.props.w && pagePt.y >= s.y && pagePt.y <= s.y + s.props.h) {
				const relY = pagePt.y - s.y
				if (relY <= 36 || relY >= s.props.h - 28) {
					editor.select(s.id)
					return { kind: 'page', x: clientX, y: clientY, pageId: s.id }
				}
				const panelIndex = hitTestPagePanelIndex(s, pagePt.x, pagePt.y)
				editor.select(s.id)
				editor.updateShape<MangaContainer>({
					id: s.id,
					type: CONTAINER,
					props: { selectedPanel: panelIndex },
				})
				return { kind: 'cell', x: clientX, y: clientY, pageId: s.id, panelIndex, tab: 'cell' }
			}
		}
	}

	return {
		kind: 'canvas',
		x: clientX,
		y: clientY,
		canvasX: Math.round(pagePt.x),
		canvasY: Math.round(pagePt.y),
	}
}

function hitTestPagePanelIndex(page: MangaContainer, pageX: number, pageY: number): number {
	const config = configFor(page.props.layoutPreset, page.props.targetPanels)
	const rawGenome = readJsonSafe(page.props.genomeJson, generate(page.props.seed, config).genome)
	const layout = realize(sanitize(rawGenome), config)
	const stageW = page.props.w || 460
	const stageH = (page.props.h || 650) - 58
	const relX = ((pageX - page.x) / Math.max(1, stageW)) * layout.width
	const relY = ((pageY - page.y - 34) / Math.max(1, stageH)) * layout.height
	for (let idx = 0; idx < layout.panels.length; idx += 1) {
		if (pointInPoly(relX, relY, layout.panels[idx].pts)) {
			return idx
		}
	}
	return Math.max(0, page.props.selectedPanel || 0)
}

function readJsonSafe<T>(raw: string, fallback: T): T {
	try {
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch {
		return fallback
	}
}

export function CanvasContextMenu({
	editor,
	target,
	onClose,
	onStatus,
	onOpenCompare,
	onOpenReader,
	onOpenPageContext,
}: {
	editor: Editor | null
	target: ContextMenuTarget | null
	onClose: () => void
	onStatus: (msg: string) => void
	onOpenCompare: () => void
	onOpenReader: () => void
	onOpenPageContext: (pageId: TLShapeId) => void
}) {
	const menuRef = useRef<HTMLDivElement | null>(null)
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [prosodyDraft, setProsodyDraft] = useState('')
	const [activeTab, setActiveTab] = useState<'cell' | 'page'>('cell')

	useEffect(() => {
		if (!target) return
		if (target.kind === 'cell') {
			setActiveTab(target.tab ?? 'cell')
		} else if (target.kind === 'page') {
			setActiveTab('page')
		}
		if (target.kind === 'bubble' && editor) {
			const b = editor.getShape(target.bubbleId)
			if (b?.type === BUBBLE) setProsodyDraft(b.props.prosody || '')
		}
	}, [target, editor])

	useEffect(() => {
		if (!target) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		const onPointerDown = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('mousedown', onPointerDown)
		return () => {
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('mousedown', onPointerDown)
		}
	}, [target, onClose])

	if (!editor || !target) return null

	const pos = clampMenuCoords(target.x, target.y)

	const handleCellImageUpload = (page: MangaContainer, panelIndex: number, file: File | undefined) => {
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			const dataUrl = typeof reader.result === 'string' ? reader.result : ''
			if (!dataUrl) return
			const metas = readJsonSafe<PanelMeta[]>(page.props.panelsJson, [])
			if (!metas[panelIndex]) return
			metas[panelIndex] = {
				...metas[panelIndex],
				imageDataUrl: dataUrl,
				imageOffsetX: 0,
				imageOffsetY: 0,
				imageScale: 1,
				imageRotation: 0,
			}
			editor.updateShape<MangaContainer>({
				id: page.id,
				type: CONTAINER,
				props: { panelsJson: JSON.stringify(metas), selectedPanel: panelIndex },
			})
			onStatus(`已上传并替换 ${page.props.title} 第 ${panelIndex + 1} 格底图`)
			onClose()
		}
		reader.readAsDataURL(file)
	}

	if (target.kind === 'cell' || target.kind === 'page') {
		const page = editor.getShape(target.pageId) as MangaContainer | undefined
		if (!page || page.type !== CONTAINER) return null
		const metas = readJsonSafe<PanelMeta[]>(page.props.panelsJson, [])
		const panelIndex =
			target.kind === 'cell'
				? Math.max(0, Math.min(target.panelIndex, Math.max(0, metas.length - 1)))
				: Math.max(0, page.props.selectedPanel || 0)
		const meta = metas[panelIndex]
		const ctx = readPageContext(editor, page)
		const showCellView = target.kind === 'cell' && activeTab === 'cell' && Boolean(meta)

		const moodFlags = page.props.mood || ''
		const hasThirds = moodFlags.includes('thirds=1')
		const hasAxis = moodFlags.includes('axis=1')

		return (
			<div
				ref={menuRef}
				className="apple-context-menu"
				style={{ left: pos.left, top: pos.top }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div className="ctx-header">
					<div className="ctx-header-title">
						<strong>{page.props.title}</strong>
						<span>
							{showCellView && meta
								? `分镜格 #${panelIndex + 1} · ${meta.shot} · ${meta.focal}`
								: `整页容器 · ${metas.length} 格 · JEV ${Math.round(page.props.score * 100)}分`}
						</span>
					</div>
					<div className="ctx-mode-switch">
						<button type="button" className={showCellView ? 'on' : ''} onClick={() => setActiveTab('cell')}>
							分镜格 #{panelIndex + 1}
						</button>
						<button type="button" className={!showCellView ? 'on' : ''} onClick={() => setActiveTab('page')}>
							整页与流水线
						</button>
					</div>
				</div>

				{showCellView && meta ? (
					<>
						<div className="ctx-group">
							<div className="ctx-group-label">格内画面与插图 (Artwork & Crop)</div>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								style={{ display: 'none' }}
								onChange={(e) => handleCellImageUpload(page, panelIndex, e.target.files?.[0])}
							/>
							<div className="ctx-action-grid-2">
								<button type="button" className="ctx-item" onClick={() => fileInputRef.current?.click()}>
									<span>上传/替换本格底图…</span>
									<kbd>⌘U</kbd>
								</button>
								<button
									type="button"
									className="ctx-item"
									onClick={() => {
										onStatus(loadPresetArtIntoPanel(editor, page, panelIndex))
										onClose()
									}}
								>
									<span>切换预置分镜原画</span>
									<kbd>⌘I</kbd>
								</button>
							</div>
							<button
								type="button"
								className="ctx-item primary-item"
								onClick={async () => {
									onStatus(`正在按本页锁定资产重绘第 ${panelIndex + 1} 格…`)
									onClose()
									const msg = await regenerateSelectedPanel(editor, page, panelIndex)
									onStatus(msg)
								}}
							>
								<span>AI 仅重绘此格画面（继承本页锁定设定）</span>
								<kbd>⌘R</kbd>
							</button>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">画面变换</span>
								<div className="ctx-pills">
									<button
										type="button"
										onClick={() => {
											onStatus(resetPanelTransformOnPage(editor, page, panelIndex))
											onClose()
										}}
									>
										居中复位 100%
									</button>
									<button type="button" onClick={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, -5))}>
										↺ -5°
									</button>
									<button type="button" onClick={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, 5))}>
										↻ +5°
									</button>
									<button type="button" onClick={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, 'reset'))}>
										0°
									</button>
								</div>
							</div>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">镜头景别与光学 (Camera & Optics)</div>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">景别</span>
								<div className="ctx-pills">
									{SHOTS.map((shot) => (
										<button
											key={shot}
											type="button"
											className={meta.shot === shot ? 'active' : ''}
											title={SHOT_LABELS[shot]}
											onClick={() => {
												const next = metas.map((m, idx) => (idx === panelIndex ? { ...m, shot } : m))
												editor.updateShape<MangaContainer>({
													id: page.id,
													type: CONTAINER,
													props: { panelsJson: JSON.stringify(next) },
												})
												onStatus(`第 ${panelIndex + 1} 格景别已切换为 ${SHOT_LABELS[shot]}`)
											}}
										>
											{shot}
										</button>
									))}
								</div>
							</div>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">机位</span>
								<div className="ctx-pills">
									{ANGLES.map((angle) => (
										<button
											key={angle}
											type="button"
											className={meta.angle === angle ? 'active' : ''}
											onClick={() => {
												onStatus(applyOpticsToPanel(editor, page, panelIndex, { angle }))
											}}
										>
											{ANGLE_LABELS[angle] ?? angle}
										</button>
									))}
								</div>
							</div>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">焦段</span>
								<div className="ctx-pills">
									{FOCALS.map((item) => (
										<button
											key={item.focal}
											type="button"
											className={meta.focal === item.focal ? 'active' : ''}
											onClick={() => {
												onStatus(applyOpticsToPanel(editor, page, panelIndex, { focalMm: item.mm }))
											}}
										>
											{item.focal}
										</button>
									))}
									<button
										type="button"
										className={meta.silent ? 'active' : ''}
										onClick={() => {
											onStatus(toggleSilentPanelOnPage(editor, page, panelIndex))
										}}
									>
										{meta.silent ? '✓ 无声静帧' : '设为静帧'}
									</button>
								</div>
							</div>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">分格构图与破框 (Composition & Bleed)</div>
							<div className="ctx-action-grid-2">
								<button
									type="button"
									className={`ctx-item ${meta.subsplitInset?.enabled ? 'active-item' : ''}`}
									onClick={() => {
										onStatus(togglePanelSubsplitOnPage(editor, page, panelIndex))
									}}
								>
									<span>{meta.subsplitInset?.enabled ? '✓ 画中画反应子格 (PiP)' : '开启画中画子格 (PiP)'}</span>
								</button>
								<button
									type="button"
									className="ctx-item"
									onClick={() => {
										onStatus(togglePanelNestOnPage(editor, page, panelIndex))
										onClose()
									}}
								>
									<span>纵切/合并子分格</span>
								</button>
							</div>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">四边出血</span>
								<div className="ctx-pills">
									{(['bT', 'bB', 'bL', 'bR'] as const).map((edge) => (
										<button
											key={edge}
											type="button"
											onClick={() => {
												onStatus(togglePanelBleedOnPage(editor, page, panelIndex, edge))
											}}
										>
											{{ bT: '上破框', bB: '下破框', bL: '左破框', bR: '右破框' }[edge]}
										</button>
									))}
								</div>
							</div>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">在此格插入独立图层 (Insert Layer)</div>
							<div className="ctx-pills">
								<button
									type="button"
									onClick={() => {
										addBubbleToPage(editor, page, panelIndex, 'speech', '新台词对白', '沉稳', 'pill')
										onStatus(`已在第 ${panelIndex + 1} 格插入对白气泡`)
										onClose()
									}}
								>
									+ 对白气泡
								</button>
								<button
									type="button"
									onClick={() => {
										addStandaloneProsodyToPage(editor, page, panelIndex, '冷笑审视', 'seal', '咔哒！')
										onStatus(`已在第 ${panelIndex + 1} 格插入独立语气助词与拟声标签`)
										onClose()
									}}
								>
									+ 语气助词印章
								</button>
								<button
									type="button"
									onClick={() => {
										addBubbleToPage(editor, page, panelIndex, 'sfx', '轰——！！', '爆发', 'burst')
										onStatus(`已在第 ${panelIndex + 1} 格插入拟声词 (SFX)`)
										onClose()
									}}
								>
									+ 拟声词 SFX
								</button>
								<button
									type="button"
									onClick={() => {
										addBubbleToPage(editor, page, panelIndex, 'caption', '23:17 · 雨夜审讯室。', '', 'minimal')
										onStatus(`已在第 ${panelIndex + 1} 格插入旁白方框`)
										onClose()
									}}
								>
									+ 旁白方框
								</button>
							</div>
						</div>

						<div className="ctx-group ctx-group-footer">
							<button
								type="button"
								className="ctx-item pipeline-cta"
								onClick={() => {
									const res = extendNextPageFromPage(editor, page.id)
									onStatus(res.message)
									onClose()
								}}
							>
								<span>延续生成下一页 (P{(page.props.pageIndex || 1) + 1} · 继承本页 Context)</span>
								<kbd>→</kbd>
							</button>
							<button
								type="button"
								className="ctx-item"
								onClick={() => {
									onOpenPageContext(page.id)
									onClose()
								}}
							>
								<span>浏览 / 编辑本页继承设定与剧情 Context ({ctx.lockedAssetTags.length} 资产)…</span>
								<kbd>⌘E</kbd>
							</button>
						</div>
					</>
				) : (
					<>
						<div className="ctx-group">
							<div className="ctx-group-label">页面流水线与上下文继承 (Page Pipeline & Context)</div>
							<button
								type="button"
								className="ctx-item pipeline-cta"
								onClick={() => {
									const res = extendNextPageFromPage(editor, page.id)
									onStatus(res.message)
									onClose()
								}}
							>
								<span>延续生成下一页 (P{(page.props.pageIndex || 1) + 1} · 继承本页 Context)</span>
								<kbd>⌘↵</kbd>
							</button>
							<button
								type="button"
								className="ctx-item primary-item"
								onClick={() => {
									onOpenPageContext(page.id)
									onClose()
								}}
							>
								<span>浏览 / 编辑本页继承设定与剧情 Context ({ctx.lockedAssetTags.length} 项锁定)…</span>
								<kbd>⌘E</kbd>
							</button>
							<button
								type="button"
								className="ctx-item"
								onClick={() => {
									onStatus(cloneVariantPage(editor, page.id))
									onClose()
								}}
							>
								<span>克隆本页为对比变体 (Clone Variant)</span>
								<kbd>⌘D</kbd>
							</button>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">JEV 决策与版式引擎 (JEV Layout Solver)</div>
							<div className="ctx-action-grid-2">
								<button
									type="button"
									className="ctx-item"
									onClick={() => {
										editor.select(page.id)
										onStatus(runJevFiveStageCompile(editor))
										onClose()
									}}
								>
									<span>JEV 五阶段重编译</span>
								</button>
								<button
									type="button"
									className="ctx-item"
									onClick={() => {
										editor.select(page.id)
										rerollSelectedPages(editor)
										onStatus(`已智能重排 ${page.props.title} 分格版式`)
										onClose()
									}}
								>
									<span>重排分格版式</span>
								</button>
							</div>
							<button
								type="button"
								className="ctx-item"
								onClick={() => {
									editor.select(page.id)
									onOpenCompare()
									onClose()
								}}
							>
								<span>打开 8 选 1 候选版式对比工作台…</span>
								<kbd>⌘K</kbd>
							</button>
							<div className="ctx-inline-row">
								<span className="ctx-sub-label">情绪策略</span>
								<div className="ctx-pills">
									{SCENARIOS.map((sc) => (
										<button
											key={sc}
											type="button"
											className={page.props.scenario === sc ? 'active' : ''}
											onClick={() => {
												onStatus(applyEmotionStrategyOnPage(editor, page, sc))
											}}
										>
											{SCENARIO_LABELS[sc]}
										</button>
									))}
								</div>
							</div>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">独立图层显示开关 (Layer Visibility)</div>
							<div className="ctx-pills">
								<button
									type="button"
									className={page.props.showBubblesLayer !== false ? 'active' : ''}
									onClick={() => {
										const next = page.props.showBubblesLayer === false
										editor.updateShape<MangaContainer>({
											id: page.id,
											type: CONTAINER,
											props: { showBubblesLayer: next },
										})
										onStatus(`${next ? '已显示' : '已隐藏'}文字气泡层`)
									}}
								>
									{page.props.showBubblesLayer !== false ? '✓ 气泡层' : '气泡层'}
								</button>
								<button
									type="button"
									className={page.props.showProsodyLayer !== false ? 'active' : ''}
									onClick={() => {
										const next = page.props.showProsodyLayer === false
										editor.updateShape<MangaContainer>({
											id: page.id,
											type: CONTAINER,
											props: { showProsodyLayer: next },
										})
										onStatus(`${next ? '已显示' : '已隐藏'}独立语气助词层`)
									}}
								>
									{page.props.showProsodyLayer !== false ? '✓ 语气助词层' : '语气助词层'}
								</button>
								<button
									type="button"
									className={page.props.showSfxLayer !== false ? 'active' : ''}
									onClick={() => {
										const next = page.props.showSfxLayer === false
										editor.updateShape<MangaContainer>({
											id: page.id,
											type: CONTAINER,
											props: { showSfxLayer: next },
										})
										onStatus(`${next ? '已显示' : '已隐藏'}拟声词 SFX 层`)
									}}
								>
									{page.props.showSfxLayer !== false ? '✓ 拟声词层' : '拟声词层'}
								</button>
								<button
									type="button"
									className={page.props.showFlow ? 'active' : ''}
									onClick={() => {
										const next = !page.props.showFlow
										editor.updateShape<MangaContainer>({
											id: page.id,
											type: CONTAINER,
											props: { showFlow: next },
										})
										onStatus(`${next ? '已开启' : '已关闭'}视线动线与焦点轨迹`)
									}}
								>
									{page.props.showFlow ? '✓ 视线动线' : '视线动线'}
								</button>
								<button
									type="button"
									className={hasThirds || hasAxis ? 'active' : ''}
									onClick={() => {
										const nextVal = !(hasThirds || hasAxis)
										onStatus(updatePageParametric(editor, page, { showRuleOfThirds: nextVal, showAxis180: nextVal }, false))
									}}
								>
									{hasThirds || hasAxis ? '✓ 九宫格与180°轴' : '九宫格与180°轴'}
								</button>
							</div>
						</div>

						<div className="ctx-group">
							<div className="ctx-group-label">单页完稿导出 (Export Manuscript)</div>
							<div className="ctx-pills">
								<button
									type="button"
									onClick={async () => {
										onClose()
										const book = compileBook(editor)
										const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
										if (model) {
											const bytes = await exportPagePng2400(model, 2400)
											downloadBlob(`manga-p${page.props.pageIndex}.png`, bytes, 'image/png')
										}
										onStatus(`已导出 ${page.props.title} 2400px 印刷级 PNG`)
									}}
								>
									导出 PNG (2400px)
								</button>
								<button
									type="button"
									onClick={() => {
										const book = compileBook(editor)
										const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
										if (model) {
											exportPageSvgFile(model, `manga-p${page.props.pageIndex}.svg`)
										}
										onStatus(`已导出 ${page.props.title} 矢量 SVG 原稿`)
										onClose()
									}}
								>
									导出矢量 SVG
								</button>
								<button
									type="button"
									onClick={async () => {
										onClose()
										const book = compileBook(editor)
										const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
										if (model) {
											const bytes = await exportOpenRaster(model)
											downloadBlob(`manga-p${page.props.pageIndex}.ora`, bytes, 'image/openraster')
										}
										onStatus(`已导出 ${page.props.title} 分层 OpenRaster (.ora)`)
									}}
								>
									导出分层 .ORA
								</button>
							</div>
						</div>
					</>
				)}
			</div>
		)
	}

	if (target.kind === 'bubble') {
		const bubble = editor.getShape(target.bubbleId) as MangaBubble | undefined
		if (!bubble || bubble.type !== BUBBLE) return null
		const curProsodyStyle = (bubble.props.prosodyStyle || 'pill') as ProsodyStyle

		return (
			<div
				ref={menuRef}
				className="apple-context-menu"
				style={{ left: pos.left, top: pos.top }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div className="ctx-header">
					<div className="ctx-header-title">
						<strong>气泡与独立语气图层</strong>
						<span>格 #{bubble.props.panelIndex + 1} · 双击改台词 · 橙色手柄拖语气</span>
					</div>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">气泡框型 (Balloon Style)</div>
					<div className="ctx-pills">
						{(Object.keys(BUBBLE_LABELS) as BubbleStyle[]).map((style) => (
							<button
								key={style}
								type="button"
								className={bubble.props.bubble === style ? 'active' : ''}
								onClick={() => {
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: { bubble: style },
									})
									onStatus(`已将气泡框型切换为「${BUBBLE_LABELS[style]}」`)
								}}
							>
								{BUBBLE_LABELS[style]}
							</button>
						))}
					</div>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">独立语气助词图层 (Prosody Badge Layer)</div>
					<div className="ctx-inline-input">
						<input
							type="text"
							value={prosodyDraft}
							placeholder="输入语气助词（如：冷笑审视、怒吼、低语）"
							onChange={(e) => {
								const val = e.target.value
								setProsodyDraft(val)
								editor.updateShape<MangaBubble>({
									id: bubble.id,
									type: BUBBLE,
									props: { prosody: val },
								})
							}}
						/>
						<button
							type="button"
							onClick={() => {
								setProsodyDraft('')
								editor.updateShape<MangaBubble>({
									id: bubble.id,
									type: BUBBLE,
									props: { prosody: '' },
								})
							}}
						>
							清空
						</button>
					</div>
					<div className="ctx-inline-row">
						<span className="ctx-sub-label">样式</span>
						<div className="ctx-pills">
							{PROSODY_STYLES.map((st) => (
								<button
									key={st}
									type="button"
									className={curProsodyStyle === st ? 'active' : ''}
									onClick={() => {
										editor.updateShape<MangaBubble>({
											id: bubble.id,
											type: BUBBLE,
											props: {
												prosodyStyle: st,
												prosody: st !== 'off' && !bubble.props.prosody ? '冷峻' : bubble.props.prosody,
											},
										})
										onStatus(`语气助词样式已切换为「${PROSODY_STYLE_LABELS[st]}」`)
									}}
								>
									{PROSODY_STYLE_LABELS[st]}
								</button>
							))}
						</div>
					</div>
					<div className="ctx-inline-row">
						<span className="ctx-sub-label">配色</span>
						<div className="ctx-swatches">
							{PROSODY_Preset_COLORS.map((item) => (
								<button
									key={item.color}
									type="button"
									className={`ctx-swatch ${bubble.props.prosodyColor === item.color ? 'active' : ''}`}
									style={{ background: item.color }}
									title={item.label}
									onClick={() => {
										editor.updateShape<MangaBubble>({
											id: bubble.id,
											type: BUBBLE,
											props: { prosodyColor: item.color },
										})
										onStatus(`语气配色已设为「${item.label}」`)
									}}
								/>
							))}
							<button
								type="button"
								className="ctx-mini-btn"
								onClick={() => {
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: { prosodyOffsetX: 0, prosodyOffsetY: 0, prosodyScale: 1 },
									})
									onStatus('已复位语气助词印章锚点偏移')
								}}
							>
								复位偏移
							</button>
						</div>
					</div>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">气泡底色与排版 (Appearance & Spin)</div>
					<div className="ctx-inline-row">
						<span className="ctx-sub-label">底色</span>
						<div className="ctx-swatches">
							{BUBBLE_FILL_PRESETS.map((item) => (
								<button
									key={item.color}
									type="button"
									className={`ctx-swatch ${bubble.props.fillColor === item.color ? 'active' : ''}`}
									style={{ background: item.color }}
									title={item.label}
									onClick={() => {
										editor.updateShape<MangaBubble>({
											id: bubble.id,
											type: BUBBLE,
											props: { fillColor: item.color },
										})
									}}
								/>
							))}
						</div>
					</div>
					<div className="ctx-inline-row">
						<span className="ctx-sub-label">字号与倾角</span>
						<div className="ctx-pills">
							<button
								type="button"
								onClick={() => {
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: {
											emphasis: Math.min(2, Number((bubble.props.emphasis + 0.18).toFixed(2))),
											w: Math.round(bubble.props.w * 1.08),
											h: Math.round(bubble.props.h * 1.08),
										},
									})
								}}
							>
								A+ 放大
							</button>
							<button
								type="button"
								onClick={() => {
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: {
											emphasis: Math.max(0.6, Number((bubble.props.emphasis - 0.18).toFixed(2))),
											w: Math.max(64, Math.round(bubble.props.w * 0.92)),
											h: Math.max(44, Math.round(bubble.props.h * 0.92)),
										},
									})
								}}
							>
								A- 缩小
							</button>
							<button
								type="button"
								onClick={() =>
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: { spin: Math.max(-35, (bubble.props.spin || 0) - 8) },
									})
								}
							>
								左倾 -8°
							</button>
							<button
								type="button"
								onClick={() =>
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: { spin: 0 },
									})
								}
							>
								0°
							</button>
							<button
								type="button"
								onClick={() =>
									editor.updateShape<MangaBubble>({
										id: bubble.id,
										type: BUBBLE,
										props: { spin: Math.min(35, (bubble.props.spin || 0) + 8) },
									})
								}
							>
								右倾 +8°
							</button>
						</div>
					</div>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">智能台词与图层操作 (AI & Layer)</div>
					<button
						type="button"
						className="ctx-item primary-item"
						onClick={async () => {
							onClose()
							const line = await askText(
								'把这句漫画台词改写得更有潜台词张力，不超过 20 个汉字，只输出台词本身。',
								bubble.props.text,
								() => `${bubble.props.text.replace(/[。！!]+$/, '')}……你真以为那只表是自己停的？`,
							)
							editor.updateShape<MangaBubble>({
								id: bubble.id,
								type: BUBBLE,
								props: { text: line },
							})
							onStatus(`已 AI 润色台词：「${line}」`)
						}}
					>
						<span>AI 润色此句潜台词与语气</span>
						<kbd>⌘P</kbd>
					</button>
					<div className="ctx-action-grid-2">
						<button
							type="button"
							className="ctx-item"
							onClick={() => {
								const dupId = createShapeId(`bubble-dup-${Date.now()}`)
								editor.createShape<MangaBubble>({
									id: dupId,
									type: BUBBLE,
									parentId: bubble.parentId,
									x: bubble.x + 22,
									y: bubble.y + 18,
									props: { ...bubble.props },
								})
								editor.select(dupId)
								onStatus('已复制当前气泡')
								onClose()
							}}
						>
							<span>复制气泡</span>
						</button>
						<button
							type="button"
							className="ctx-item danger-item"
							onClick={() => {
								editor.deleteShapes([bubble.id])
								onStatus('已删除气泡')
								onClose()
							}}
						>
							<span>删除此气泡</span>
							<kbd>⌫</kbd>
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (target.kind === 'card') {
		const card = editor.getShape(target.cardId) as MangaCard | undefined
		if (!card || card.type !== CARD) return null

		return (
			<div
				ref={menuRef}
				className="apple-context-menu"
				style={{ left: pos.left, top: pos.top }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div className="ctx-header">
					<div className="ctx-header-title">
						<strong>{card.props.title}</strong>
						<span>设定资产卡 · {card.props.tag || card.props.kind}</span>
					</div>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">外观一致性锁定与页面 Context 注入</div>
					<button
						type="button"
						className="ctx-item pipeline-cta"
						onClick={() => {
							onStatus(bindCardToPageContext(editor, card))
							onClose()
						}}
					>
						<span>绑定并注入到当前分镜页 Context</span>
						<kbd>⌘L</kbd>
					</button>
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							const nextLocked = !card.props.locked
							editor.updateShape<MangaCard>({
								id: card.id,
								type: CARD,
								props: { locked: nextLocked },
							})
							onStatus(`${nextLocked ? '已锁定' : '已解锁'}设定卡「${card.props.title}」外观一致性`)
							onClose()
						}}
					>
						<span>
							{card.props.locked
								? `✓ 已锁定外观标签 (${card.props.tag || '点击解锁'})`
								: `锁定外观一致性标签 (${card.props.tag || '无'})`}
						</span>
					</button>
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">多模态 AI 设定与立绘工坊</div>
					<div className="ctx-action-grid-2">
						<button
							type="button"
							className="ctx-item"
							onClick={async () => {
								onClose()
								onStatus(await applySelectedCardAiAction(editor, card, 'polish'))
							}}
						>
							<span>AI 润色设定文本</span>
						</button>
						<button
							type="button"
							className="ctx-item"
							onClick={async () => {
								onClose()
								onStatus(await applySelectedCardAiAction(editor, card, 'regenerate'))
							}}
						>
							<span>AI 重新生成方案</span>
						</button>
					</div>
					{(card.props.kind === 'character' || card.props.kind === 'image' || card.props.kind === 'environment') && (
						<div className="ctx-action-grid-2">
							<button
								type="button"
								className="ctx-item"
								onClick={async () => {
									onClose()
									onStatus(await applySelectedCardAiAction(editor, card, 'vision'))
								}}
							>
								<span>Vision 识图反推人设</span>
							</button>
							<button
								type="button"
								className="ctx-item"
								onClick={async () => {
									onClose()
									onStatus(await applySelectedCardAiAction(editor, card, 'redraw'))
								}}
							>
								<span>AI 重绘参考立绘</span>
							</button>
						</div>
					)}
				</div>

				<div className="ctx-group">
					<div className="ctx-group-label">卡片操作</div>
					<div className="ctx-action-grid-2">
						<button
							type="button"
							className="ctx-item"
							onClick={() => {
								const dupId = createShapeId(`card-dup-${Date.now()}`)
								editor.createShape<MangaCard>({
									id: dupId,
									type: CARD,
									x: card.x + 28,
									y: card.y + 28,
									props: { ...card.props, title: `${card.props.title} · 副本` },
								})
								editor.select(dupId)
								onStatus(`已复制设定卡「${card.props.title}」`)
								onClose()
							}}
						>
							<span>复制设定卡</span>
						</button>
						<button
							type="button"
							className="ctx-item danger-item"
							onClick={() => {
								editor.deleteShapes([card.id])
								onStatus(`已删除设定卡「${card.props.title}」`)
								onClose()
							}}
						>
							<span>删除设定卡</span>
							<kbd>⌫</kbd>
						</button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div
			ref={menuRef}
			className="apple-context-menu"
			style={{ left: pos.left, top: pos.top }}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div className="ctx-header">
				<div className="ctx-header-title">
					<strong>画布空间快捷菜单</strong>
					<span>坐标 ({target.canvasX}, {target.canvasY}) · 以单页为单位流水线创作</span>
				</div>
			</div>

			<div className="ctx-group">
				<div className="ctx-group-label">单页制作与流水线续写 (Page Pipeline)</div>
				<button
					type="button"
					className="ctx-item pipeline-cta"
					onClick={() => {
						const res = extendNextPageFromPage(editor)
						onStatus(res.message)
						onClose()
					}}
				>
					<span>从末页延续生成下一页 (继承最新 Context)</span>
					<kbd>⌘↵</kbd>
				</button>
				<button
					type="button"
					className="ctx-item"
					onClick={() => {
						spawnBlankPageAtPoint(editor, target.canvasX, target.canvasY)
						onStatus('已在当前画布位置新建分镜页')
						onClose()
					}}
				>
					<span>在此处新建独立分镜页</span>
					<kbd>⌘N</kbd>
				</button>
			</div>

			<div className="ctx-group">
				<div className="ctx-group-label">在此处新建设定与参考资产卡 (Spawn Asset Card)</div>
				<div className="ctx-action-grid-2">
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							createImageCardOnCanvas(
								editor,
								'character',
								'新角色视觉设定卡',
								'@new_char',
								'身穿深色风衣的调查员，冷峻侧逆光，眼神锐利。',
							)
							onStatus('已新建角色视觉设定卡 (@new_char)')
							onClose()
						}}
					>
						<span>+ 角色视觉卡 (@char)</span>
					</button>
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							createImageCardOnCanvas(
								editor,
								'image',
								'新场景/道具参考卡',
								'#prop_clue',
								'关键剧情证物或场景参考图，锁定线条与光影质感。',
							)
							onStatus('已新建场景/道具参考卡 (#prop_clue)')
							onClose()
						}}
					>
						<span>+ 道具/场景参考卡</span>
					</button>
				</div>
				<div className="ctx-action-grid-2">
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							createTextCardOnCanvas(editor, 'story', '新场次分镜剧本卡', '在此输入本场戏的分镜动作与对白节拍。')
							onStatus('已新建场次分镜剧本卡')
							onClose()
						}}
					>
						<span>+ 剧本文字卡</span>
					</button>
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							createTextCardOnCanvas(editor, 'world', '世界观与光影法则卡', '硬派青年漫黑白灰冷调，严格遵守 180° 摄像机轴线。')
							onStatus('已新建世界观法则卡')
							onClose()
						}}
					>
						<span>+ 世界观法则卡</span>
					</button>
				</div>
			</div>

			<div className="ctx-group">
				<div className="ctx-group-label">画布整理与整书预览</div>
				<div className="ctx-action-grid-2">
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							onStatus(tidyCanvasLayout(editor))
							onClose()
						}}
					>
						<span>横向对齐所有分镜页</span>
					</button>
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							editor.zoomToFit({ animation: { duration: 180 } })
							onClose()
						}}
					>
						<span>缩放适配全画布</span>
					</button>
				</div>
				<button
					type="button"
					className="ctx-item"
					onClick={() => {
						onOpenReader()
						onClose()
					}}
				>
					<span>打开整书翻页阅读器</span>
					<kbd>⌘B</kbd>
				</button>
			</div>
		</div>
	)
}

export function PageContextModal({
	editor,
	pageId,
	onClose,
	onSelectPage,
	onStatus,
}: {
	editor: Editor | null
	pageId: TLShapeId | null
	onClose: () => void
	onSelectPage: (nextPageId: TLShapeId) => void
	onStatus: (msg: string) => void
}) {
	const [stylePreset, setStylePreset] = useState('seinen_noir')
	const [environment, setEnvironment] = useState('interrogation-room')
	const [lighting, setLighting] = useState('rim')
	const [worldRules, setWorldRules] = useState('')
	const [lockedTags, setLockedTags] = useState<string[]>([])
	const [newTagInput, setNewTagInput] = useState('')
	const [prevSummary, setPrevSummary] = useState('')
	const [pageDirective, setPageDirective] = useState('')
	const [scenario, setScenario] = useState<Scenario>('tension')
	const [targetPanels, setTargetPanels] = useState(5)
	const [storyScript, setStoryScript] = useState('')
	const [nextPageCustomScript, setNextPageCustomScript] = useState('')

	const page = editor && pageId ? (editor.getShape(pageId) as MangaContainer | undefined) : undefined

	useEffect(() => {
		if (!editor || !page || page.type !== CONTAINER) return
		const ctx = readPageContext(editor, page)
		const beats = readJsonSafe<Beat[]>(page.props.scriptJson, [])
		setStylePreset(ctx.stylePreset)
		setEnvironment(ctx.environment)
		setLighting(ctx.lighting)
		setWorldRules(ctx.worldRules)
		setLockedTags(ctx.lockedAssetTags)
		setPrevSummary(ctx.prevPageSummary)
		setPageDirective(ctx.pageDirective)
		setScenario((page.props.scenario as Scenario) || 'tension')
		setTargetPanels(page.props.targetPanels || beats.length || 5)
		setStoryScript(page.props.story || formatBeatsToScriptText(beats))
		setNextPageCustomScript('')
	}, [editor, pageId, page?.props.contextJson, page?.props.scriptJson])

	if (!editor || !page || page.type !== CONTAINER) return null

	const ctx = readPageContext(editor, page)
	const allPages = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaContainer => s.type === CONTAINER && s.props.role === 'page')
		.sort((a, b) => (a.props.pageIndex || 0) - (b.props.pageIndex || 0))

	const allCards = editor
		.getCurrentPageShapes()
		.filter((s): s is MangaCard => s.type === CARD)

	const assetCatalog = new Map<string, { tag: string; title: string; kind: string; imageDataUrl?: string }>()
	for (const card of allCards) {
		if (card.props.tag) {
			assetCatalog.set(card.props.tag, {
				tag: card.props.tag,
				title: card.props.title,
				kind: card.props.kind,
				imageDataUrl: card.props.imageDataUrl,
			})
		}
	}
	const builtinAssets: Array<{ tag: string; title: string; kind: string; imageDataUrl?: string }> = [
		{ tag: '@lu_chen', title: '侦探·陆沉', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_lu_chen.jpg' },
		{ tag: '@lin_ye', title: '嫌疑人·林野', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_lin_ye.jpg' },
		{ tag: '@shen_mo', title: '副局长·沈默', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_shen_mo.jpg' },
		{
			tag: '#prop_pocket_watch',
			title: '裂纹银壳怀表 (23:17)',
			kind: 'prop',
			imageDataUrl: '/assets/interrogation/asset_prop_pocket_watch.jpg',
		},
		{
			tag: '#env_interrogation_room',
			title: '旧港警署三楼审讯室',
			kind: 'environment',
			imageDataUrl: '/assets/interrogation/asset_env_interrogation_room.jpg',
		},
		{ tag: '#prop_rust_cuff', title: '袖口红丹防锈漆', kind: 'prop' },
		{ tag: '#prop_brass_lighter', title: '旧铜打火机', kind: 'prop' },
	]
	for (const item of builtinAssets) {
		if (!assetCatalog.has(item.tag)) assetCatalog.set(item.tag, item)
	}
	for (const tag of lockedTags) {
		if (!assetCatalog.has(tag)) {
			assetCatalog.set(tag, { tag, title: tag, kind: tag.startsWith('@') ? 'character' : 'prop' })
		}
	}

	const toggleTag = (tag: string) => {
		setLockedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
	}

	const addCustomTag = () => {
		const raw = newTagInput.trim()
		if (!raw) return
		const formatted = raw.startsWith('@') || raw.startsWith('#') ? raw : `@${raw}`
		if (!lockedTags.includes(formatted)) {
			setLockedTags((prev) => [...prev, formatted])
		}
		setNewTagInput('')
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box context-inspector-modal" onClick={(e) => e.stopPropagation()}>
				<header className="ctx-modal-header">
					<div>
						<span className="ctx-modal-eyebrow">PAGE PIPELINE CONTEXT INSPECTOR · 单页上下文继承与流水线设定</span>
						<h3>
							{page.props.title}
							{ctx.inheritedFromPageIndex ? (
								<span className="ctx-lineage-pill">承接自 P{ctx.inheritedFromPageIndex}</span>
							) : (
								<span className="ctx-lineage-pill origin">起始母页 P1</span>
							)}
						</h3>
					</div>
					<button type="button" className="ctx-close-btn" onClick={onClose}>
						关闭
					</button>
				</header>

				<div className="ctx-modal-body">
					<section className="ctx-section">
						<div className="ctx-sec-head">
							<strong>① 页面流水线溯源链 (Page-to-Page Lineage)</strong>
							<span>点击页节点可切换查看每页独立继承的 Context</span>
						</div>
						<div className="ctx-lineage-chain">
							{allPages.map((p, idx) => {
								const pCtx = readPageContext(editor, p)
								const isCurrent = p.id === page.id
								return (
									<div key={p.id} className="ctx-lineage-node-wrap">
										{idx > 0 && <span className="ctx-lineage-arrow">→</span>}
										<button
											type="button"
											className={`ctx-lineage-node ${isCurrent ? 'active' : ''}`}
											onClick={() => {
												editor.select(p.id)
												onSelectPage(p.id)
											}}
										>
											<strong>P{p.props.pageIndex || idx + 1}</strong>
											<span>{p.props.title.replace(/^第\d+话\s*·\s*P\d+\s*·?\s*/, '') || p.props.title}</span>
											<small>{pCtx.lockedAssetTags.length} 项锁定设定</small>
										</button>
									</div>
								)
							})}
							<span className="ctx-lineage-arrow">→</span>
							<button
								type="button"
								className="ctx-lineage-node spawn-next"
								onClick={() => {
									const res = extendNextPageFromPage(editor, page.id, {
										stylePreset,
										environment,
										lighting,
										worldRules,
										lockedAssetTags: lockedTags,
										customDirective: pageDirective,
										customStoryText: nextPageCustomScript.trim() || undefined,
									})
									onStatus(res.message)
									onSelectPage(res.pageId)
								}}
							>
								<strong>+ 续写 P{allPages.length + 1}</strong>
								<span>继承当前页 Context</span>
							</button>
						</div>
					</section>

					<div className="ctx-grid-2col">
						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>② 继承的世界观与环境光效 (World & Lighting)</strong>
								<span>向下一页自动传递</span>
							</div>
							<div className="ctx-form-grid-3">
								<label>
									<span>画风规范</span>
									<select value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}>
										<option value="seinen_noir">硬派青年漫·黑色电影 (seinen_noir)</option>
										<option value="shonen_water">少年海风·浓墨网点 (shonen_water)</option>
										<option value="classic">经典平实·故事漫 (classic)</option>
									</select>
								</label>
								<label>
									<span>场景拓扑</span>
									<select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
										{ENV_IDS.map((id) => (
											<option key={id} value={id}>
												{ENV_LABELS[id] ?? id}
											</option>
										))}
									</select>
								</label>
								<label>
									<span>主导光效</span>
									<select value={lighting} onChange={(e) => setLighting(e.target.value)}>
										{LIGHT_IDS.map((id) => (
											<option key={id} value={id}>
												{LIGHT_LABELS[id] ?? id}
											</option>
										))}
									</select>
								</label>
							</div>
							<label className="ctx-block-label">
								<span>世界观与视觉铁律 (World Rules)</span>
								<textarea rows={2} value={worldRules} onChange={(e) => setWorldRules(e.target.value)} />
							</label>
						</section>

						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>③ 跨页镜头轴线与前情交接 (Cross-Page Handoff)</strong>
								<span>保障翻页 180° 视线不跳轴</span>
							</div>
							<div className="ctx-optics-handoff-row">
								<div className="ctx-handoff-stat">
									<small>上页尾格景别</small>
									<strong>
										{ctx.prevExitShot} · {ANGLE_LABELS[ctx.prevExitAngle] ?? ctx.prevExitAngle}
									</strong>
								</div>
								<div className="ctx-handoff-stat">
									<small>180° 视线轴向量</small>
									<strong>
										({ctx.prevExitEyeline[0]}, {ctx.prevExitEyeline[1]})
									</strong>
								</div>
								<div className="ctx-handoff-stat">
									<small>尾格情绪张力</small>
									<strong>{Math.round(ctx.prevExitTension * 100)}%</strong>
								</div>
							</div>
							<label className="ctx-block-label">
								<span>承接前页剧情摘要 (prevPageSummary)</span>
								<textarea rows={2} value={prevSummary} onChange={(e) => setPrevSummary(e.target.value)} />
							</label>
						</section>
					</div>

					<section className="ctx-section">
						<div className="ctx-sec-head">
							<strong>④ 本页锁定并延续的角色与道具资产 ({lockedTags.length} 项已激活)</strong>
							<span>勾选的 @角色 / #道具 / #场景 将注入本页及后续派生页的 Stage 4 纯画面提示词</span>
						</div>
						<div className="ctx-asset-chips">
							{Array.from(assetCatalog.values()).map((asset) => {
								const isLocked = lockedTags.includes(asset.tag)
								return (
									<button
										key={asset.tag}
										type="button"
										className={`ctx-asset-chip ${isLocked ? 'locked' : ''}`}
										onClick={() => toggleTag(asset.tag)}
									>
										{asset.imageDataUrl && <img src={asset.imageDataUrl} alt={asset.title} className="ctx-asset-thumb" />}
										<div className="ctx-asset-meta">
											<strong>{asset.title}</strong>
											<code>{asset.tag}</code>
										</div>
										<span className="ctx-asset-check">{isLocked ? '✓ 已锁定' : '+ 启用'}</span>
									</button>
								)
							})}
							<div className="ctx-add-tag-box">
								<input
									type="text"
									value={newTagInput}
									placeholder="新增 @角色 或 #道具 标签…"
									onChange={(e) => setNewTagInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault()
											addCustomTag()
										}
									}}
								/>
								<button type="button" onClick={addCustomTag}>
									+ 添加
								</button>
							</div>
						</div>
					</section>

					<div className="ctx-grid-2col">
						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>⑤ 本页分镜台本与情绪策略 ({page.props.title})</strong>
								<span>可直接编辑每格景别、动作与「台词」</span>
							</div>
							<div className="ctx-form-grid-3">
								<label>
									<span>本页情绪策略</span>
									<select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
										{SCENARIOS.map((sc) => (
											<option key={sc} value={sc}>
												{SCENARIO_LABELS[sc]} ({sc})
											</option>
										))}
									</select>
								</label>
								<label>
									<span>目标分格数</span>
									<select value={targetPanels} onChange={(e) => setTargetPanels(Number(e.target.value))}>
										{[3, 4, 5, 6, 7].map((n) => (
											<option key={n} value={n}>
												{n} 格
											</option>
										))}
									</select>
								</label>
								<label>
									<span>导演指令焦点</span>
									<input type="text" value={pageDirective} onChange={(e) => setPageDirective(e.target.value)} />
								</label>
							</div>
							<textarea
								className="ctx-script-textarea"
								rows={5}
								value={storyScript}
								onChange={(e) => setStoryScript(e.target.value)}
							/>
						</section>

						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>⑥ 续写下一页 (P{(page.props.pageIndex || 1) + 1}) 剧情节拍（可选）</strong>
								<span>留空则按本页继承 Context 自动推演 P{(page.props.pageIndex || 1) + 1} 连续分镜</span>
							</div>
							<textarea
								className="ctx-script-textarea"
								rows={7}
								value={nextPageCustomScript}
								placeholder={`可选：输入 P${(page.props.pageIndex || 1) + 1} 的新一段分镜剧情（或直接点击右下角「以此 Context 延续生成 P${(page.props.pageIndex || 1) + 1}」自动续写下一幕，完整继承上方锁定的 ${lockedTags.slice(0, 4).join(' ')} 与 180° 镜头轴线）…`}
								onChange={(e) => setNextPageCustomScript(e.target.value)}
							/>
						</section>
					</div>
				</div>

				<footer className="ctx-modal-footer">
					<div className="ctx-footer-left">
						<span>
							当前页：{page.props.title} · 已锁定 {lockedTags.length} 项设定资产 · 尾格轴线 ({ctx.prevExitEyeline[0]},{' '}
							{ctx.prevExitEyeline[1]})
						</span>
					</div>
					<div className="ctx-footer-actions">
						<button
							type="button"
							className="ctx-btn-secondary"
							onClick={() => {
								const msg = updatePageContextAndRecompile(editor, page, {
									stylePreset,
									environment,
									lighting,
									worldRules,
									lockedAssetTags: lockedTags,
									prevPageSummary: prevSummary,
									pageDirective,
									story: storyScript,
									scenario,
									targetPanels,
								})
								onStatus(msg)
								onClose()
							}}
						>
							保存设定并重编译本页 ({page.props.title})
						</button>
						<button
							type="button"
							className="ctx-btn-primary"
							onClick={() => {
								updatePageContextAndRecompile(editor, page, {
									stylePreset,
									environment,
									lighting,
									worldRules,
									lockedAssetTags: lockedTags,
									prevPageSummary: prevSummary,
									pageDirective,
									story: storyScript,
									scenario,
									targetPanels,
								})
								const res = extendNextPageFromPage(editor, page.id, {
									stylePreset,
									environment,
									lighting,
									worldRules,
									lockedAssetTags: lockedTags,
									customDirective: pageDirective,
									customStoryText: nextPageCustomScript.trim() || undefined,
								})
								onStatus(res.message)
								onClose()
							}}
						>
							以此 Context 延续生成下一页 (P{(page.props.pageIndex || 1) + 1}) →
						</button>
					</div>
				</footer>
			</div>
		</div>
	)
}
