import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { askText } from '../ai/client'
import { ANGLE_LABELS, ENV_IDS, ENV_LABELS, LIGHT_IDS, LIGHT_LABELS, SCENARIO_LABELS } from '../demo/book'
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
import { type Beat, type BubbleStyle, type PanelMeta, type ProsodyStyle } from '../model'
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

// Menu dimensions (true macOS / Figma proportions).
const MENU_W = 248
const SUBMENU_W = 216

const SHOT_OPTIONS: Array<{ id: PanelMeta['shot']; label: string }> = [
	{ id: 'EWS', label: 'EWS · Extreme Wide' },
	{ id: 'WS', label: 'WS · Wide Shot' },
	{ id: 'MS', label: 'MS · Medium Shot' },
	{ id: 'MCU', label: 'MCU · Medium Close-Up' },
	{ id: 'CU', label: 'CU · Close-Up' },
	{ id: 'ECU', label: 'ECU · Extreme Close-Up' },
]

const ANGLE_OPTIONS: Array<{ id: PanelMeta['angle']; label: string }> = [
	{ id: 'eye', label: 'Eye Level' },
	{ id: 'low', label: 'Low Angle' },
	{ id: 'high', label: 'High Angle' },
	{ id: 'dutch', label: 'Dutch Tilt' },
	{ id: 'bird', label: "Bird's-Eye" },
]

const FOCAL_OPTIONS: Array<{ mm: number; focal?: PanelMeta['focal']; label: string }> = [
	{ mm: 18, focal: '18mm', label: '18mm Ultra-Wide' },
	{ mm: 28, label: '28mm Wide' },
	{ mm: 35, focal: '35mm', label: '35mm Street' },
	{ mm: 50, focal: '50mm', label: '50mm Standard' },
	{ mm: 85, focal: '85mm', label: '85mm Portrait' },
]

const BLEED_OPTIONS: Array<{ edge: 'bT' | 'bB' | 'bL' | 'bR'; label: string }> = [
	{ edge: 'bT', label: 'Top Bleed' },
	{ edge: 'bB', label: 'Bottom Bleed' },
	{ edge: 'bL', label: 'Left Bleed' },
	{ edge: 'bR', label: 'Right Bleed' },
]

const BALLOON_SHAPE_OPTIONS: Array<{ id: BubbleStyle; label: string }> = [
	{ id: 'speech', label: 'Speech Oval' },
	{ id: 'shout', label: 'Burst Shout' },
	{ id: 'whisper', label: 'Whisper Dashed' },
	{ id: 'thought', label: 'Thought Cloud' },
	{ id: 'caption', label: 'Narrative Box' },
	{ id: 'broadcast', label: 'Broadcast Jagged' },
	{ id: 'sfx', label: 'Graphic SFX' },
]

const PROSODY_STYLE_OPTIONS: Array<{ id: ProsodyStyle; label: string }> = [
	{ id: 'pill', label: 'Pill Tag' },
	{ id: 'seal', label: 'Crimson Seal' },
	{ id: 'slant', label: 'Slanted Cut' },
	{ id: 'burst', label: 'Starburst' },
	{ id: 'minimal', label: 'Minimal' },
	{ id: 'off', label: 'Hidden' },
]

const PROSODY_ACCENT_COLORS: Array<{ color: string; label: string }> = [
	{ color: '#e11d48', label: 'Crimson Seal' },
	{ color: '#2563eb', label: 'Ultramarine' },
	{ color: '#d97706', label: 'Amber Gold' },
	{ color: '#0f172a', label: 'Sumi Ink' },
	{ color: '#7c3aed', label: 'Electric Violet' },
]

const BUBBLE_FILL_PRESETS: Array<{ color: string; label: string }> = [
	{ color: '#fffefb', label: 'Paper White' },
	{ color: '#fef9c3', label: 'Warm Cream' },
	{ color: '#f1f5f9', label: 'Cool Mist' },
	{ color: '#ffe4e6', label: 'Rose Tint' },
	{ color: '#0f172a', label: 'Inverted Noir' },
]

// The 5 interrogation + 4 seagull studio artwork plates surfaced by the
// "Apply Studio Artwork" flyout.
const STUDIO_ART_PRESETS: Array<{ url: string; label: string }> = [
	{ url: '/assets/wutai/p1_01_mountain_mist.jpg', label: 'Wutai P1 · Mountain Mist & Monastery' },
	{ url: '/assets/wutai/p1_02_offering_poem.jpg', label: 'Wutai P1 · Offering the Poem Scroll' },
	{ url: '/assets/wutai/p1_03_master_zhixuan.jpg', label: 'Wutai P1 · Master Zhixuan Sees Through Wrath' },
	{ url: '/assets/wutai/p2_01_tea_debate.jpg', label: 'Wutai P2 · Cliffside Tea Debate (Xiu vs Wu)' },
	{ url: '/assets/wutai/p2_02_three_realms.jpg', label: 'Wutai P2 · Three Realms of the Dharma' },
	{ url: '/assets/wutai/p2_03_stone_ripples.jpg', label: 'Wutai P2 · Stone Cast into Still Water' },
	{ url: '/assets/wutai/p3_01_salvation_truth.jpg', label: 'Wutai P3 · Shattering Dependency (Deng-Kao-Yao)' },
	{ url: '/assets/wutai/p3_02_brush_correction.jpg', label: 'Wutai P3 · Two Characters Revised by Brush' },
	{ url: '/assets/wutai/p3_03_clouds_awakening.jpg', label: 'Wutai P3 · Golden Summit Clouds Parting' },
	{ url: '/assets/interrogation/panel1_establishing.jpg', label: 'Interrogation · Establishing' },
	{ url: '/assets/interrogation/panel2_cuff_probe.jpg', label: 'Interrogation · Cuff Probe' },
	{ url: '/assets/interrogation/panel3_watch_macro.jpg', label: 'Interrogation · Watch Macro' },
	{ url: '/assets/interrogation/panel4_silent_lighter_spark.jpg', label: 'Interrogation · Lighter Spark' },
	{ url: '/assets/interrogation/panel5_climax_accusation.jpg', label: 'Interrogation · Accusation' },
	{ url: '/assets/seagull/env_rocky_pier_cliff.jpg', label: 'Seagull · Rocky Pier Cliff' },
	{ url: '/assets/seagull/char_gull_philosopher.jpg', label: 'Seagull · Gull Philosopher' },
	{ url: '/assets/seagull/char_gull_foodie.jpg', label: 'Seagull · Gull Foodie' },
	{ url: '/assets/seagull/prop_pier_fries_cone.jpg', label: 'Seagull · Pier Fries Cone' },
]

const SCENARIOS: Scenario[] = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax']

function clampMenuCoords(x: number, y: number, menuH = 540): { left: number; top: number } {
	const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
	const vh = typeof window !== 'undefined' ? window.innerHeight : 900
	return {
		left: Math.max(10, Math.min(x, vw - MENU_W - 12)),
		top: Math.max(48, Math.min(y, vh - menuH - 12)),
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

function MenuHeader({ children }: { children: ReactNode }) {
	return <div className="mctx-header">{children}</div>
}

function MenuDivider() {
	return <div className="mctx-divider" role="separator" />
}

function MenuRow({
	label,
	shortcut,
	checked,
	destructive,
	disabled,
	onSelect,
}: {
	label: string
	shortcut?: string
	checked?: boolean
	destructive?: boolean
	disabled?: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			className={`mctx-row${destructive ? ' destructive' : ''}${checked ? ' checked' : ''}`}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation()
				onSelect()
			}}
		>
			<span className="mctx-check">{checked ? '✓' : ''}</span>
			<span className="mctx-label">{label}</span>
			{shortcut ? <span className="mctx-shortcut">{shortcut}</span> : null}
		</button>
	)
}

function MenuColorRow({
	label,
	color,
	checked,
	onSelect,
}: {
	label: string
	color: string
	checked?: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			className={`mctx-row${checked ? ' checked' : ''}`}
			onClick={(event) => {
				event.stopPropagation()
				onSelect()
			}}
		>
			<span className="mctx-check">{checked ? '✓' : ''}</span>
			<span className="mctx-dot" style={{ background: color }} />
			<span className="mctx-label">{label}</span>
		</button>
	)
}

function MenuSub({
	id,
	label,
	checked,
	openLeft,
	children,
}: {
	id: string
	label: string
	checked?: boolean
	openLeft: boolean
	children: ReactNode
}) {
	const [open, setOpen] = useState(false)
	return (
		<div className="mctx-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
			<button
				type="button"
				className={`mctx-row has-sub${checked ? ' checked' : ''}${open ? ' open' : ''}`}
				onClick={(event) => {
					event.stopPropagation()
					setOpen(true)
				}}
			>
				<span className="mctx-check">{checked ? '✓' : ''}</span>
				<span className="mctx-label">{label}</span>
				<span className="mctx-caret">▸</span>
			</button>
			{open ? (
				<div className={`mctx-flyout${openLeft ? ' left' : ''}`} data-submenu-id={id} style={{ width: SUBMENU_W }}>
					{children}
				</div>
			) : null}
		</div>
	)
}

export function CanvasContextMenu({
	editor,
	target,
	onClose,
	onStatus,
	onOpenPageContext,
}: {
	editor: Editor | null
	target: ContextMenuTarget | null
	onClose: () => void
	onStatus: (msg: string) => void
	onOpenCompare?: () => void
	onOpenReader?: () => void
	onOpenPageContext: (pageId: TLShapeId) => void
}) {
	const menuRef = useRef<HTMLDivElement | null>(null)
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [prosodyDraft, setProsodyDraft] = useState('')
	const [editingProsody, setEditingProsody] = useState(false)

	useEffect(() => {
		if (!target) return
		setEditingProsody(false)
		if (target.kind === 'bubble' && editor) {
			const b = editor.getShape(target.bubbleId)
			if (b?.type === BUBBLE) setProsodyDraft((b as MangaBubble).props.prosody || '')
		}
	}, [target, editor])

	useEffect(() => {
		if (!target) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		const onPointerDown = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

	// Estimated rendered heights so the menu is clamped fully on-screen. The menu
	// itself does not scroll (so flyout submenus are never clipped); each flyout
	// scrolls internally when its list is long.
	const menuHeight =
		target.kind === 'cell' ? 700 : target.kind === 'bubble' ? 420 : target.kind === 'page' ? 340 : 300
	const pos = clampMenuCoords(target.x, target.y, menuHeight)
	const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
	const openLeft = pos.left + MENU_W + SUBMENU_W > viewportWidth

	const exportPagePng = async (page: MangaContainer) => {
		const book = compileBook(editor)
		const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
		if (model) {
			const bytes = await exportPagePng2400(model, 2400)
			downloadBlob(`manga-p${page.props.pageIndex}.png`, bytes, 'image/png')
		}
		onStatus(`Exported ${page.props.title} as 2400px print PNG`)
	}

	const exportPageSvg = (page: MangaContainer) => {
		const book = compileBook(editor)
		const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
		if (model) exportPageSvgFile(model, `manga-p${page.props.pageIndex}.svg`)
		onStatus(`Exported ${page.props.title} as vector SVG`)
	}

	const exportPageOra = async (page: MangaContainer) => {
		const book = compileBook(editor)
		const model = book.pages.find((p) => p.model.uid === page.id)?.model ?? book.pages[0]?.model
		if (model) {
			const bytes = await exportOpenRaster(model)
			downloadBlob(`manga-p${page.props.pageIndex}.ora`, bytes, 'image/openraster')
		}
		onStatus(`Exported ${page.props.title} as layered OpenRaster (.ora)`)
	}

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
			onStatus(`Replaced ${page.props.title} panel ${panelIndex + 1} artwork`)
			onClose()
		}
		reader.readAsDataURL(file)
	}

	// ---- Panel cell ---------------------------------------------------------
	if (target.kind === 'cell') {
		const page = editor.getShape(target.pageId) as MangaContainer | undefined
		if (!page || page.type !== CONTAINER) return null
		const metas = readJsonSafe<PanelMeta[]>(page.props.panelsJson, [])
		const panelIndex = Math.max(0, Math.min(target.panelIndex, Math.max(0, metas.length - 1)))
		const meta = metas[panelIndex]
		if (!meta) return null
		const activeFocalMm = meta.focalMm

		return (
			<div ref={menuRef} className="mctx-menu" style={{ left: pos.left, top: pos.top, width: MENU_W }} onContextMenu={(e) => e.preventDefault()}>
				<MenuHeader>{`Panel #${panelIndex + 1} · ${meta.shot} · ${meta.focal || '50mm'}`}</MenuHeader>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					style={{ display: 'none' }}
					onChange={(e) => handleCellImageUpload(page, panelIndex, e.target.files?.[0])}
				/>

				<MenuRow label="Replace Panel Artwork..." onSelect={() => fileInputRef.current?.click()} />
				<MenuSub id="studio-artwork" label="Apply Studio Artwork" openLeft={openLeft}>
					{STUDIO_ART_PRESETS.map((preset) => (
						<MenuRow
							key={preset.url}
							label={preset.label}
							checked={meta.imageDataUrl === preset.url}
							onSelect={() => onStatus(loadPresetArtIntoPanel(editor, page, panelIndex, preset.url))}
						/>
					))}
				</MenuSub>
				<MenuRow
					label="Regenerate Panel with AI"
					shortcut="⌘R"
					onSelect={async () => {
						onStatus(`Regenerating panel ${panelIndex + 1}...`)
						onClose()
						onStatus(await regenerateSelectedPanel(editor, page, panelIndex))
					}}
				/>
				<MenuRow
					label="Reset Pan & Zoom 100%"
					shortcut="⌘0"
					onSelect={() => onStatus(resetPanelTransformOnPage(editor, page, panelIndex))}
				/>
				<MenuSub id="rotate-artwork" label="Rotate Artwork" openLeft={openLeft}>
					<MenuRow label="Rotate -5°" onSelect={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, -5))} />
					<MenuRow label="Rotate +5°" onSelect={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, 5))} />
					<MenuRow label="Reset 0°" onSelect={() => onStatus(rotatePanelImageOnPage(editor, page, panelIndex, 'reset'))} />
				</MenuSub>

				<MenuDivider />
				<MenuSub id="shot-scale" label="Shot Scale" openLeft={openLeft}>
					{SHOT_OPTIONS.map((shot) => (
						<MenuRow
							key={shot.id}
							label={shot.label}
							checked={meta.shot === shot.id}
							onSelect={() => {
								const next = metas.map((m, idx) => (idx === panelIndex ? { ...m, shot: shot.id } : m))
								editor.updateShape<MangaContainer>({
									id: page.id,
									type: CONTAINER,
									props: { panelsJson: JSON.stringify(next) },
								})
								onStatus(`Panel ${panelIndex + 1} shot scale set to ${shot.label}`)
							}}
						/>
					))}
				</MenuSub>
				<MenuSub id="camera-angle" label="Camera Angle" openLeft={openLeft}>
					{ANGLE_OPTIONS.map((angle) => (
						<MenuRow
							key={angle.id}
							label={angle.label}
							checked={meta.angle === angle.id}
							onSelect={() => onStatus(applyOpticsToPanel(editor, page, panelIndex, { angle: angle.id }))}
						/>
					))}
				</MenuSub>
				<MenuSub id="focal-length" label="Focal Length" openLeft={openLeft}>
					{FOCAL_OPTIONS.map((focal) => (
						<MenuRow
							key={focal.mm}
							label={focal.label}
							checked={activeFocalMm != null ? activeFocalMm === focal.mm : focal.focal ? meta.focal === focal.focal : false}
							onSelect={() => onStatus(applyOpticsToPanel(editor, page, panelIndex, { focalMm: focal.mm }))}
						/>
					))}
				</MenuSub>
				<MenuRow
					label="Silent Beat (No Dialogue)"
					checked={Boolean(meta.silent)}
					onSelect={() => onStatus(toggleSilentPanelOnPage(editor, page, panelIndex))}
				/>

				<MenuDivider />
				<MenuRow label="Split Row (+1 Panel)" onSelect={() => onStatus(togglePanelNestOnPage(editor, page, panelIndex))} />
				<MenuRow label="Merge Row (-1 Panel)" onSelect={() => onStatus(togglePanelNestOnPage(editor, page, panelIndex))} />
				<MenuRow
					label="Picture-in-Picture Inset"
					checked={Boolean(meta.subsplitInset?.enabled)}
					onSelect={() => onStatus(togglePanelSubsplitOnPage(editor, page, panelIndex))}
				/>
				<MenuSub id="full-bleed" label="Full-Bleed Edge" openLeft={openLeft}>
					{BLEED_OPTIONS.map((bleed) => (
						<MenuRow
							key={bleed.edge}
							label={bleed.label}
							onSelect={() => onStatus(togglePanelBleedOnPage(editor, page, panelIndex, bleed.edge))}
						/>
					))}
				</MenuSub>

				<MenuDivider />
				<MenuRow
					label="Add Speech Balloon"
					onSelect={() => {
						addBubbleToPage(editor, page, panelIndex, 'speech', 'New dialogue line', 'Calm', 'pill')
						onStatus(`Added speech balloon to panel ${panelIndex + 1}`)
						onClose()
					}}
				/>
				<MenuRow
					label="Add Thought Balloon"
					onSelect={() => {
						addBubbleToPage(editor, page, panelIndex, 'thought', 'Inner thought...', '', 'pill')
						onStatus(`Added thought balloon to panel ${panelIndex + 1}`)
						onClose()
					}}
				/>
				<MenuRow
					label="Add Narrative Caption"
					onSelect={() => {
						addBubbleToPage(editor, page, panelIndex, 'caption', '23:17 · Rain lashes the room.', '', 'minimal')
						onStatus(`Added narrative caption to panel ${panelIndex + 1}`)
						onClose()
					}}
				/>
				<MenuRow
					label="Add Prosody Badge"
					onSelect={() => {
						addStandaloneProsodyToPage(editor, page, panelIndex, 'Cold Scrutinizing', 'seal', 'CLACK!')
						onStatus(`Added prosody badge to panel ${panelIndex + 1}`)
						onClose()
					}}
				/>
				<MenuRow
					label="Add Sound Effect (SFX)"
					onSelect={() => {
						addBubbleToPage(editor, page, panelIndex, 'sfx', 'BOOM', 'Burst', 'burst')
						onStatus(`Added sound effect to panel ${panelIndex + 1}`)
						onClose()
					}}
				/>

				<MenuDivider />
				<MenuRow
					label="Inspect Page Context & Continuity..."
					shortcut="⌘I"
					onSelect={() => {
						onOpenPageContext(page.id)
						onClose()
					}}
				/>
				<MenuRow
					label="Extend Next Page in Pipeline"
					shortcut="⌘↵"
					onSelect={() => {
						onStatus(extendNextPageFromPage(editor, page.id).message)
						onClose()
					}}
				/>
				<MenuSub id="page-actions" label="Page Actions & Export" openLeft={openLeft}>
					<MenuRow
						label="Recompile Page (JEV 5-Stage)"
						onSelect={() => {
							editor.select(page.id)
							onStatus(runJevFiveStageCompile(editor))
							onClose()
						}}
					/>
					<MenuRow
						label="Reroll Layout Topology"
						onSelect={() => {
							editor.select(page.id)
							rerollSelectedPages(editor)
							onStatus(`Rerolled ${page.props.title} layout topology`)
							onClose()
						}}
					/>
					<MenuDivider />
					{SCENARIOS.map((scenario) => (
						<MenuRow
							key={scenario}
							label={`Pacing · ${SCENARIO_LABELS[scenario]}`}
							checked={page.props.scenario === scenario}
							onSelect={() => onStatus(applyEmotionStrategyOnPage(editor, page, scenario))}
						/>
					))}
					<MenuDivider />
					<MenuRow
						label="Export Print PNG 2400px"
						onSelect={() => {
							onClose()
							void exportPagePng(page)
						}}
					/>
					<MenuRow
						label="Export Vector SVG"
						onSelect={() => {
							exportPageSvg(page)
							onClose()
						}}
					/>
					<MenuRow
						label="Export Layered ORA"
						onSelect={() => {
							onClose()
							void exportPageOra(page)
						}}
					/>
				</MenuSub>
			</div>
		)
	}

	// ---- Speech balloon / prosody ------------------------------------------
	if (target.kind === 'bubble') {
		const bubble = editor.getShape(target.bubbleId) as MangaBubble | undefined
		if (!bubble || bubble.type !== BUBBLE) return null
		const curProsodyStyle = (bubble.props.prosodyStyle || 'pill') as ProsodyStyle

		return (
			<div ref={menuRef} className="mctx-menu" style={{ left: pos.left, top: pos.top, width: MENU_W }} onContextMenu={(e) => e.preventDefault()}>
				<MenuHeader>Balloon & Prosody Layer</MenuHeader>

				<MenuSub id="balloon-shape" label="Balloon Shape" openLeft={openLeft}>
					{BALLOON_SHAPE_OPTIONS.map((style) => (
						<MenuRow
							key={style.id}
							label={style.label}
							checked={bubble.props.bubble === style.id}
							onSelect={() => {
								editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { bubble: style.id } })
								onStatus(`Balloon shape set to ${style.label}`)
							}}
						/>
					))}
				</MenuSub>
				<MenuRow
					label="AI Polish Subtext"
					onSelect={async () => {
						onClose()
						const line = await askText(
							'Rewrite this manga dialogue line with sharper subtext in under 20 words; output only the dialogue line.',
							bubble.props.text,
							() => `${bubble.props.text.replace(/[.!]+$/, '')}... Do you really think that watch stopped on its own?`,
						)
						editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { text: line } })
						onStatus(`AI polished dialogue: "${line}"`)
					}}
				/>

				<MenuDivider />
				<MenuSub id="prosody-style" label="Prosody Badge Style" openLeft={openLeft}>
					{PROSODY_STYLE_OPTIONS.map((style) => (
						<MenuRow
							key={style.id}
							label={style.label}
							checked={curProsodyStyle === style.id}
							onSelect={() => {
								editor.updateShape<MangaBubble>({
									id: bubble.id,
									type: BUBBLE,
									props: {
										prosodyStyle: style.id,
										prosody: style.id !== 'off' && !bubble.props.prosody ? 'Cold' : bubble.props.prosody,
									},
								})
								onStatus(`Prosody badge style set to ${style.label}`)
							}}
						/>
					))}
				</MenuSub>
				<MenuSub id="prosody-color" label="Prosody Accent Color" openLeft={openLeft}>
					{PROSODY_ACCENT_COLORS.map((item) => (
						<MenuColorRow
							key={item.color}
							label={item.label}
							color={item.color}
							checked={bubble.props.prosodyColor === item.color}
							onSelect={() => {
								editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { prosodyColor: item.color } })
								onStatus(`Prosody accent color set to ${item.label}`)
							}}
						/>
					))}
				</MenuSub>
				{editingProsody ? (
					<div className="mctx-inline-input">
						<input
							type="text"
							autoFocus
							value={prosodyDraft}
							placeholder="Prosody label (e.g. Cold Scrutinizing)"
							onChange={(e) => {
								setProsodyDraft(e.target.value)
								editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { prosody: e.target.value } })
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === 'Escape') setEditingProsody(false)
							}}
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
				) : (
					<MenuRow label="Edit Prosody Label..." onSelect={() => setEditingProsody(true)} />
				)}
				<MenuRow
					label="Reset Prosody Offset"
					onSelect={() => {
						editor.updateShape<MangaBubble>({
							id: bubble.id,
							type: BUBBLE,
							props: { prosodyOffsetX: 0, prosodyOffsetY: 0, prosodyScale: 1 },
						})
						onStatus('Reset prosody badge offset')
					}}
				/>

				<MenuDivider />
				<MenuSub id="balloon-fill" label="Balloon Fill" openLeft={openLeft}>
					{BUBBLE_FILL_PRESETS.map((item) => (
						<MenuColorRow
							key={item.color}
							label={item.label}
							color={item.color}
							checked={bubble.props.fillColor === item.color}
							onSelect={() => {
								editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { fillColor: item.color } })
								onStatus(`Balloon fill set to ${item.label}`)
							}}
						/>
					))}
				</MenuSub>
				<MenuSub id="typography-size" label="Typography Size" openLeft={openLeft}>
					<MenuRow
						label="Larger (+2px)"
						onSelect={() =>
							editor.updateShape<MangaBubble>({
								id: bubble.id,
								type: BUBBLE,
								props: {
									emphasis: Math.min(2, Number((bubble.props.emphasis + 0.18).toFixed(2))),
									w: Math.round(bubble.props.w * 1.08),
									h: Math.round(bubble.props.h * 1.08),
								},
							})
						}
					/>
					<MenuRow
						label="Smaller (-2px)"
						onSelect={() =>
							editor.updateShape<MangaBubble>({
								id: bubble.id,
								type: BUBBLE,
								props: {
									emphasis: Math.max(0.6, Number((bubble.props.emphasis - 0.18).toFixed(2))),
									w: Math.max(64, Math.round(bubble.props.w * 0.92)),
									h: Math.max(44, Math.round(bubble.props.h * 0.92)),
								},
							})
						}
					/>
					<MenuRow
						label="Reset (15px)"
						onSelect={() => editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { emphasis: 1 } })}
					/>
				</MenuSub>
				<MenuSub id="tilt-angle" label="Tilt Angle" openLeft={openLeft}>
					<MenuRow
						label="Tilt Left -8°"
						onSelect={() =>
							editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { spin: Math.max(-35, (bubble.props.spin || 0) - 8) } })
						}
					/>
					<MenuRow
						label="Level 0°"
						onSelect={() => editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { spin: 0 } })}
					/>
					<MenuRow
						label="Tilt Right +8°"
						onSelect={() =>
							editor.updateShape<MangaBubble>({ id: bubble.id, type: BUBBLE, props: { spin: Math.min(35, (bubble.props.spin || 0) + 8) } })
						}
					/>
				</MenuSub>

				<MenuDivider />
				<MenuRow
					label="Duplicate Balloon"
					shortcut="⌘D"
					onSelect={() => {
						const dupId = createShapeId(`bubble-dup-${bubble.id.replace('shape:', '')}-${bubble.props.panelIndex}`)
						editor.createShape<MangaBubble>({
							id: dupId,
							type: BUBBLE,
							parentId: bubble.parentId,
							x: bubble.x + 22,
							y: bubble.y + 18,
							props: { ...bubble.props },
						})
						editor.select(dupId)
						onStatus('Duplicated balloon')
						onClose()
					}}
				/>
				<MenuRow
					label="Delete Balloon"
					shortcut="⌫"
					destructive
					onSelect={() => {
						editor.deleteShapes([bubble.id])
						onStatus('Deleted balloon')
						onClose()
					}}
				/>
			</div>
		)
	}

	// ---- Reference card -----------------------------------------------------
	if (target.kind === 'card') {
		const card = editor.getShape(target.cardId) as MangaCard | undefined
		if (!card || card.type !== CARD) return null
		const supportsVision = card.props.kind === 'character' || card.props.kind === 'image' || card.props.kind === 'environment'

		return (
			<div ref={menuRef} className="mctx-menu" style={{ left: pos.left, top: pos.top, width: MENU_W }} onContextMenu={(e) => e.preventDefault()}>
				<MenuHeader>{`Reference Asset · ${card.props.kind.toUpperCase()}`}</MenuHeader>

				<MenuRow
					label={card.props.locked ? 'Unlock Consistency Tag' : 'Lock Consistency Tag'}
					checked={card.props.locked}
					onSelect={() => {
						const nextLocked = !card.props.locked
						editor.updateShape<MangaCard>({ id: card.id, type: CARD, props: { locked: nextLocked } })
						onStatus(`${nextLocked ? 'Locked' : 'Unlocked'} "${card.props.title}" consistency tag`)
						onClose()
					}}
				/>
				<MenuRow
					label="Inject into Active Page Context"
					shortcut="⌘L"
					onSelect={() => {
						onStatus(bindCardToPageContext(editor, card))
						onClose()
					}}
				/>

				<MenuDivider />
				<MenuRow
					label="AI Polish"
					onSelect={async () => {
						onClose()
						onStatus(await applySelectedCardAiAction(editor, card, 'polish'))
					}}
				/>
				<MenuRow
					label="AI Regenerate"
					onSelect={async () => {
						onClose()
						onStatus(await applySelectedCardAiAction(editor, card, 'regenerate'))
					}}
				/>
				{supportsVision ? (
					<>
						<MenuRow
							label="Vision Reverse-Prompt"
							onSelect={async () => {
								onClose()
								onStatus(await applySelectedCardAiAction(editor, card, 'vision'))
							}}
						/>
						<MenuRow
							label="AI Redraw"
							onSelect={async () => {
								onClose()
								onStatus(await applySelectedCardAiAction(editor, card, 'redraw'))
							}}
						/>
					</>
				) : null}

				<MenuDivider />
				<MenuRow
					label="Delete Card"
					shortcut="⌫"
					destructive
					onSelect={() => {
						editor.deleteShapes([card.id])
						onStatus(`Deleted card "${card.props.title}"`)
						onClose()
					}}
				/>
			</div>
		)
	}

	// ---- Page frame ---------------------------------------------------------
	if (target.kind === 'page') {
		const page = editor.getShape(target.pageId) as MangaContainer | undefined
		if (!page || page.type !== CONTAINER) return null
		const moodFlags = page.props.mood || ''
		const hasThirds = moodFlags.includes('thirds=1')
		const hasAxis = moodFlags.includes('axis=1')

		return (
			<div ref={menuRef} className="mctx-menu" style={{ left: pos.left, top: pos.top, width: MENU_W }} onContextMenu={(e) => e.preventDefault()}>
				<MenuHeader>{`${page.props.title} · JEV ${Math.round(page.props.score * 100)}`}</MenuHeader>

				<MenuRow
					label="Extend Next Page (Inherit Context)"
					shortcut="⌘↵"
					onSelect={() => {
						onStatus(extendNextPageFromPage(editor, page.id).message)
						onClose()
					}}
				/>
				<MenuRow
					label="Inspect & Edit Page Context..."
					shortcut="⌘I"
					onSelect={() => {
						onOpenPageContext(page.id)
						onClose()
					}}
				/>
				<MenuRow
					label="Duplicate as Layout Variant"
					onSelect={() => {
						onStatus(cloneVariantPage(editor, page.id))
						onClose()
					}}
				/>

				<MenuDivider />
				<MenuRow
					label="Recompile Page (JEV 5-Stage)"
					onSelect={() => {
						editor.select(page.id)
						onStatus(runJevFiveStageCompile(editor))
						onClose()
					}}
				/>
				<MenuRow
					label="Reroll Panel Topology"
					onSelect={() => {
						editor.select(page.id)
						rerollSelectedPages(editor)
						onStatus(`Rerolled ${page.props.title} panel topology`)
						onClose()
					}}
				/>
				<MenuSub id="pacing-strategy" label="Pacing Strategy" openLeft={openLeft}>
					{SCENARIOS.map((scenario) => (
						<MenuRow
							key={scenario}
							label={SCENARIO_LABELS[scenario]}
							checked={page.props.scenario === scenario}
							onSelect={() => onStatus(applyEmotionStrategyOnPage(editor, page, scenario))}
						/>
					))}
				</MenuSub>

				<MenuDivider />
				<MenuSub id="layer-visibility" label="Layer Visibility" openLeft={openLeft}>
					<MenuRow
						label="Speech Balloons"
						checked={page.props.showBubblesLayer !== false}
						onSelect={() => {
							const next = page.props.showBubblesLayer === false
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showBubblesLayer: next } })
							onStatus(`${next ? 'Shown' : 'Hidden'}: speech balloons`)
						}}
					/>
					<MenuRow
						label="Prosody Badges"
						checked={page.props.showProsodyLayer !== false}
						onSelect={() => {
							const next = page.props.showProsodyLayer === false
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showProsodyLayer: next } })
							onStatus(`${next ? 'Shown' : 'Hidden'}: prosody badges`)
						}}
					/>
					<MenuRow
						label="Sound Effects (SFX)"
						checked={page.props.showSfxLayer !== false}
						onSelect={() => {
							const next = page.props.showSfxLayer === false
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showSfxLayer: next } })
							onStatus(`${next ? 'Shown' : 'Hidden'}: sound effects`)
						}}
					/>
					<MenuRow
						label="Gaze & Focal Trajectory"
						checked={Boolean(page.props.showFlow)}
						onSelect={() => {
							const next = !page.props.showFlow
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showFlow: next } })
							onStatus(`${next ? 'Enabled' : 'Disabled'}: gaze & focal trajectory`)
						}}
					/>
					<MenuRow
						label="Rule-of-Thirds & 180° Axis"
						checked={hasThirds || hasAxis}
						onSelect={() => {
							const next = !(hasThirds || hasAxis)
							onStatus(updatePageParametric(editor, page, { showRuleOfThirds: next, showAxis180: next }, false))
						}}
					/>
				</MenuSub>

				<MenuDivider />
				<MenuSub id="export-page" label="Export Page" openLeft={openLeft}>
					<MenuRow
						label="Print PNG (2400px)"
						onSelect={() => {
							onClose()
							void exportPagePng(page)
						}}
					/>
					<MenuRow
						label="Vector SVG"
						onSelect={() => {
							exportPageSvg(page)
							onClose()
						}}
					/>
					<MenuRow
						label="Layered OpenRaster (.ora)"
						onSelect={() => {
							onClose()
							void exportPageOra(page)
						}}
					/>
				</MenuSub>
			</div>
		)
	}

	// ---- Empty canvas -------------------------------------------------------
	return (
		<div ref={menuRef} className="mctx-menu" style={{ left: pos.left, top: pos.top, width: MENU_W }} onContextMenu={(e) => e.preventDefault()}>
			<MenuHeader>Manga Studio Canvas</MenuHeader>

			<MenuRow
				label="New Blank Page Here"
				onSelect={() => {
					spawnBlankPageAtPoint(editor, target.canvasX, target.canvasY)
					onStatus('Created new page on canvas')
					onClose()
				}}
			/>
			<MenuRow
				label="Extend Next Page from Latest"
				shortcut="⌘↵"
				onSelect={() => {
					onStatus(extendNextPageFromPage(editor).message)
					onClose()
				}}
			/>
			<MenuSub id="new-reference-card" label="New Reference Card" openLeft={openLeft}>
				<MenuRow
					label="Character Sheet"
					onSelect={() => {
						createImageCardOnCanvas(
							editor,
							'character',
							'New Character Sheet',
							'@new_char',
							'Investigator in a dark trench coat, sharp rim lighting and a piercing gaze.',
						)
						onStatus('Created character sheet (@new_char)')
						onClose()
					}}
				/>
				<MenuRow
					label="World / Environment Rule"
					onSelect={() => {
						createTextCardOnCanvas(
							editor,
							'world',
							'World & Lighting Rule Card',
							'Hardboiled seinen monochrome slate palette, strictly enforcing the 180-degree camera axis.',
						)
						onStatus('Created world rule card')
						onClose()
					}}
				/>
				<MenuRow
					label="Story Beat Card"
					onSelect={() => {
						createTextCardOnCanvas(editor, 'story', 'New Scene Script Card', 'Enter panel action beats and dialogue rhythm for this scene.')
						onStatus('Created story beat card')
						onClose()
					}}
				/>
			</MenuSub>

			<MenuDivider />
			<MenuRow
				label="Tidy Page Pipeline Layout"
				onSelect={() => {
					onStatus(tidyCanvasLayout(editor))
					onClose()
				}}
			/>
			<MenuRow
				label="Zoom to Fit All"
				shortcut="⌘0"
				onSelect={() => {
					editor.zoomToFit({ animation: { duration: 180 } })
					onClose()
				}}
			/>
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
		{ tag: '@ding_yuanying', title: 'Ding Yuanying (Strategist)', kind: 'character', imageDataUrl: '/assets/wutai/p2_02_three_realms.jpg' },
		{ tag: '@master_zhixuan', title: 'Master Zhixuan (Abbot)', kind: 'character', imageDataUrl: '/assets/wutai/p1_03_master_zhixuan.jpg' },
		{ tag: '#prop_poem_scroll', title: 'Xuan-Paper Poem Scroll & Brush', kind: 'prop', imageDataUrl: '/assets/wutai/p3_02_brush_correction.jpg' },
		{ tag: '#prop_zen_tea_pond', title: 'Cliffside Tea Table & Lotus Pond', kind: 'prop', imageDataUrl: '/assets/wutai/p2_03_stone_ripples.jpg' },
		{ tag: '#env_wutai_monastery', title: 'Wutai Mountain Zen Monastery', kind: 'environment', imageDataUrl: '/assets/wutai/p1_01_mountain_mist.jpg' },
		{ tag: '@lu_chen', title: 'Detective Lu Chen', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_lu_chen.jpg' },
		{ tag: '@lin_ye', title: 'Suspect Lin Ye', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_lin_ye.jpg' },
		{ tag: '@shen_mo', title: 'Deputy Chief Shen Mo', kind: 'character', imageDataUrl: '/assets/interrogation/asset_char_shen_mo.jpg' },
		{
			tag: '#prop_pocket_watch',
			title: 'Cracked Silver Pocket Watch (23:17)',
			kind: 'prop',
			imageDataUrl: '/assets/interrogation/asset_prop_pocket_watch.jpg',
		},
		{
			tag: '#env_interrogation_room',
			title: 'Precinct 3F Interrogation Room',
			kind: 'environment',
			imageDataUrl: '/assets/interrogation/asset_env_interrogation_room.jpg',
		},
		{ tag: '#prop_rust_cuff', title: 'Red-Lead Dock Primer', kind: 'prop' },
		{ tag: '#prop_brass_lighter', title: 'Vintage Brass Lighter', kind: 'prop' },
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
						<span className="ctx-modal-eyebrow">PAGE PIPELINE CONTEXT INSPECTOR · Page Context & Continuity Inspector</span>
						<h3>
							{page.props.title}
							{ctx.inheritedFromPageIndex ? (
								<span className="ctx-lineage-pill">Inherited from  P{ctx.inheritedFromPageIndex}</span>
							) : (
								<span className="ctx-lineage-pill origin">Root Page P1</span>
							)}
						</h3>
					</div>
					<button type="button" className="ctx-close-btn" onClick={onClose}>
						Close
					</button>
				</header>

				<div className="ctx-modal-body">
					<section className="ctx-section">
						<div className="ctx-sec-head">
							<strong>Page Pipeline Lineage</strong>
							<span>Click any page node to inspect its inherited  Context</span>
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
											<span>{p.props.title.replace(/^#\d+Ch\s*·\s*P\d+\s*·?\s*/, '') || p.props.title}</span>
											<small>{pCtx.lockedAssetTags.length} Locked Assets</small>
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
								<strong>+ Extend  P{allPages.length + 1}</strong>
								<span>Inherit Context</span>
							</button>
						</div>
					</section>

					<div className="ctx-grid-2col">
						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>Inherited World Rules & Lighting</strong>
								<span>Auto-propagates to downstream pages</span>
							</div>
							<div className="ctx-form-grid-3">
								<label>
									<span>Style Guide</span>
									<select value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}>
										<option value="shanshui_ink">Song Shan-Shui Ink Wash & Vermilion Seal (shanshui_ink)</option>
										<option value="seinen_noir">Hardboiled Seinen · Film Noir (seinen_noir)</option>
										<option value="shonen_water">Coastal Shonen · Crisp Screentone (shonen_water)</option>
										<option value="classic">Classic Narrative Manga (classic)</option>
									</select>
								</label>
								<label>
									<span>Environment</span>
									<select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
										{ENV_IDS.map((id) => (
											<option key={id} value={id}>
												{ENV_LABELS[id] ?? id}
											</option>
										))}
									</select>
								</label>
								<label>
									<span>Lighting</span>
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
								<span>World & Visual Rules (World Rules)</span>
								<textarea rows={2} value={worldRules} onChange={(e) => setWorldRules(e.target.value)} />
							</label>
						</section>

						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>Cross-Page 180° Camera & Narrative Continuity</strong>
								<span>Ensures cross-page  180°  eyeline continuity</span>
							</div>
							<div className="ctx-optics-handoff-row">
								<div className="ctx-handoff-stat">
									<small>Prev Exit Shot</small>
									<strong>
										{ctx.prevExitShot} · {ANGLE_LABELS[ctx.prevExitAngle] ?? ctx.prevExitAngle}
									</strong>
								</div>
								<div className="ctx-handoff-stat">
									<small>180° Eyeline Vector</small>
									<strong>
										({ctx.prevExitEyeline[0]}, {ctx.prevExitEyeline[1]})
									</strong>
								</div>
								<div className="ctx-handoff-stat">
									<small>Exit Tension</small>
									<strong>{Math.round(ctx.prevExitTension * 100)}%</strong>
								</div>
							</div>
							<label className="ctx-block-label">
								<span>Inherited Story Summary (prevPageSummary)</span>
								<textarea rows={2} value={prevSummary} onChange={(e) => setPrevSummary(e.target.value)} />
							</label>
						</section>
					</div>

					<section className="ctx-section">
						<div className="ctx-sec-head">
							<strong>Locked Character & Prop Assets ({lockedTags.length} Active)</strong>
							<span>Checked  @Character / #Prop / #Scene  will be injected into this page and downstream pages'  Stage 4 clean image prompts</span>
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
										<span className="ctx-asset-check">{isLocked ? '✓ Locked' : '+ Active'}</span>
									</button>
								)
							})}
							<div className="ctx-add-tag-box">
								<input
									type="text"
									value={newTagInput}
									placeholder="Add  @Character or #Prop  tag..."
									onChange={(e) => setNewTagInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault()
											addCustomTag()
										}
									}}
								/>
								<button type="button" onClick={addCustomTag}>
									+ Add
								</button>
							</div>
						</div>
					</section>

					<div className="ctx-grid-2col">
						<section className="ctx-section">
							<div className="ctx-sec-head">
								<strong>Page Script Beats & Pacing Strategy ({page.props.title})</strong>
								<span>Edit per-panel shot scale, action beat, and dialogue</span>
							</div>
							<div className="ctx-form-grid-3">
								<label>
									<span>Pacing Strategy</span>
									<select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
										{SCENARIOS.map((sc) => (
											<option key={sc} value={sc}>
												{SCENARIO_LABELS[sc]} ({sc})
											</option>
										))}
									</select>
								</label>
								<label>
									<span>Target Panels</span>
									<select value={targetPanels} onChange={(e) => setTargetPanels(Number(e.target.value))}>
										{[3, 4, 5, 6, 7].map((n) => (
											<option key={n} value={n}>
												{n} 
											</option>
										))}
									</select>
								</label>
								<label>
									<span>Page Directive</span>
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
								<strong>Extend Page (P{(page.props.pageIndex || 1) + 1}) Plot Beats (Optional)</strong>
								<span>Leave blank to auto-derive from inherited  Context  auto-continuation P{(page.props.pageIndex || 1) + 1}  sequential beats</span>
							</div>
							<textarea
								className="ctx-script-textarea"
								rows={7}
								value={nextPageCustomScript}
								placeholder={`Optional: enter  P${(page.props.pageIndex || 1) + 1}  plot beats (or click " Context Extend  P${(page.props.pageIndex || 1) + 1}" below to auto-continue, inheriting locked  ${lockedTags.slice(0, 4).join(' ')}  and  180°  camera axis)...`}
								onChange={(e) => setNextPageCustomScript(e.target.value)}
							/>
						</section>
					</div>
				</div>

				<footer className="ctx-modal-footer">
					<div className="ctx-footer-left">
						<span>
							Active Page: {page.props.title} · Locked {lockedTags.length}  Locked Assets · Exit Axis ({ctx.prevExitEyeline[0]},{' '}
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
							Save Context & Recompile Page ({page.props.title})
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
							Extend Next Page with This Context (P{(page.props.pageIndex || 1) + 1})
						</button>
					</div>
				</footer>
			</div>
		</div>
	)
}
