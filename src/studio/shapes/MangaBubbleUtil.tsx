import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, useValue, type TLResizeInfo } from 'tldraw'
import {
	bubbleMarkup,
	computeProsodyBadgeAnchor,
	type BubbleDraw,
} from '../render/bubbles'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from './schema'
import { bubbleProps } from './props'

export class MangaBubbleUtil extends BaseBoxShapeUtil<MangaBubble> {
	static override type = BUBBLE
	static override props = bubbleProps

	override getDefaultProps(): MangaBubble['props'] {
		return {
			w: 180,
			h: 90,
			bubble: 'speech',
			text: '……',
			prosody: '',
			emphasis: 1,
			tailX: 90,
			tailY: 120,
			panelIndex: 0,
			spin: 0,
			prosodyStyle: 'pill',
			prosodyOffsetX: 0,
			prosodyOffsetY: 0,
			prosodyScale: 1,
			prosodyColor: '',
			fillColor: '#fffefb',
			fontWeight: 600,
		}
	}

	override canEdit() {
		return false
	}

	override onResize(shape: MangaBubble, info: TLResizeInfo<MangaBubble>) {
		return resizeBox(shape, info, { minWidth: 72, minHeight: 40 })
	}

	override getIndicatorPath(shape: MangaBubble) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	override component(shape: MangaBubble) {
		return <BubbleView shape={shape} />
	}
}

function BubbleView({ shape }: { shape: MangaBubble }) {
	const editor = useEditor()
	const [text, setText] = useState(shape.props.text)
	const [prosodyText, setProsodyText] = useState(shape.props.prosody)
	const [editing, setEditing] = useState(false)
	const [editingProsody, setEditingProsody] = useState(false)
	const focused = useRef(false)
	const drag = useRef<{ mark: string } | null>(null)
	const prosodyDrag = useRef<{
		mark: string
		startLocalX: number
		startLocalY: number
		baseOffsetX: number
		baseOffsetY: number
	} | null>(null)

	useEffect(() => {
		if (!focused.current) setText(shape.props.text)
	}, [shape.props.text])

	useEffect(() => {
		if (!editingProsody) setProsodyText(shape.props.prosody)
	}, [shape.props.prosody, editingProsody])

	const parentPage = useValue(
		'bubble-parent-page',
		() => {
			const parentShape = shape.parentId ? editor.getShape(shape.parentId) : undefined
			return parentShape && parentShape.type === CONTAINER && (parentShape as MangaContainer).props.role === 'page'
				? (parentShape as MangaContainer)
				: undefined
		},
		[editor, shape.parentId],
	)

	const hideSpeechLayer =
		parentPage && parentPage.props.showBubblesLayer === false && shape.props.bubble !== 'sfx'
	const hideSfxLayer =
		parentPage && parentPage.props.showSfxLayer === false && shape.props.bubble === 'sfx'
	const hideProsodyLayer = parentPage ? parentPage.props.showProsodyLayer === false : false

	if (hideSpeechLayer || hideSfxLayer) {
		return <HTMLContainer className="manga-bubble" style={{ display: 'none', pointerEvents: 'none' }} />
	}

	const drawModel: BubbleDraw = {
		style: shape.props.bubble,
		text: shape.props.text,
		prosody: shape.props.prosody,
		emphasis: shape.props.emphasis,
		w: shape.props.w,
		h: shape.props.h,
		tailX: shape.props.tailX,
		tailY: shape.props.tailY,
		spin: shape.props.spin,
		prosodyStyle: shape.props.prosodyStyle,
		prosodyOffsetX: shape.props.prosodyOffsetX,
		prosodyOffsetY: shape.props.prosodyOffsetY,
		prosodyScale: shape.props.prosodyScale,
		prosodyColor: shape.props.prosodyColor,
		fillColor: shape.props.fillColor,
		fontWeight: shape.props.fontWeight,
		hideProsody: hideProsodyLayer,
	}

	const markup = bubbleMarkup(drawModel)
	const prosodyAnchor = computeProsodyBadgeAnchor(drawModel)
	const showTailHandle =
		shape.props.bubble !== 'caption' &&
		shape.props.bubble !== 'broadcast' &&
		shape.props.bubble !== 'sfx'

	return (
		<HTMLContainer className="manga-bubble">
			<div
				data-bubble-id={shape.id}
				style={{ width: "100%", height: "100%" }}
				onWheel={(event) => {
					if (!event.altKey) return
					event.stopPropagation()
					event.preventDefault()
					editor.markEventAsHandled(event.nativeEvent)
					const delta = event.deltaY < 0 ? -4 : 4
					const nextSpin = Math.max(-45, Math.min(45, (shape.props.spin || 0) + delta))
					editor.updateShape({ id: shape.id, type: BUBBLE, props: { spin: nextSpin } })
				}}
			>
			<svg
				viewBox={`0 0 ${shape.props.w} ${shape.props.h}`}
				style={{ overflow: 'visible', transform: `rotate(${shape.props.spin}deg)`, transformOrigin: 'center' }}
				onDoubleClick={(event) => {
					event.stopPropagation()
					editor.markEventAsHandled(event)
					setEditing(true)
				}}
			>
				<g dangerouslySetInnerHTML={{ __html: markup }} />
				{showTailHandle ? (
					<circle
						className="bubble-tail-handle"
						cx={shape.props.tailX}
						cy={shape.props.tailY}
						r={7}
						fill="#1e78c8"
						stroke="#fff"
						strokeWidth={2}
						style={{ pointerEvents: 'all', cursor: 'grab' }}
						onPointerDown={(event) => {
							event.stopPropagation()
							editor.markEventAsHandled(event)
							event.currentTarget.setPointerCapture(event.pointerId)
							drag.current = { mark: editor.markHistoryStoppingPoint('tail') }
						}}
						onPointerMove={(event) => {
							if (!drag.current) return
							const local = editor.getPointInShapeSpace(shape, editor.screenToPage({ x: event.clientX, y: event.clientY }))
							editor.updateShape({ id: shape.id, type: BUBBLE, props: { tailX: local.x, tailY: local.y } })
						}}
						onPointerUp={() => {
							if (drag.current) editor.squashToMark(drag.current.mark)
							drag.current = null
						}}
					>
						<title>拖拽蓝色圆点：调节气泡尾巴指向</title>
					</circle>
				) : null}
				{prosodyAnchor.visible ? (
					<g
						className="bubble-prosody-handle"
						transform={`translate(${(prosodyAnchor.cx + prosodyAnchor.bw / 2 + 8).toFixed(1)}, ${prosodyAnchor.cy.toFixed(1)})`}
						style={{ pointerEvents: 'all', cursor: 'grab' }}
						onDoubleClick={(event) => {
							event.stopPropagation()
							editor.markEventAsHandled(event)
							setEditingProsody(true)
						}}
						onPointerDown={(event) => {
							event.stopPropagation()
							editor.markEventAsHandled(event)
							event.currentTarget.setPointerCapture(event.pointerId)
							const local = editor.getPointInShapeSpace(shape, editor.screenToPage({ x: event.clientX, y: event.clientY }))
							prosodyDrag.current = {
								mark: editor.markHistoryStoppingPoint('prosody-offset'),
								startLocalX: local.x,
								startLocalY: local.y,
								baseOffsetX: shape.props.prosodyOffsetX ?? 0,
								baseOffsetY: shape.props.prosodyOffsetY ?? 0,
							}
						}}
						onPointerMove={(event) => {
							if (!prosodyDrag.current) return
							const local = editor.getPointInShapeSpace(shape, editor.screenToPage({ x: event.clientX, y: event.clientY }))
							const dx = local.x - prosodyDrag.current.startLocalX
							const dy = local.y - prosodyDrag.current.startLocalY
							editor.updateShape({
								id: shape.id,
								type: BUBBLE,
								props: {
									prosodyOffsetX: Math.round(prosodyDrag.current.baseOffsetX + dx),
									prosodyOffsetY: Math.round(prosodyDrag.current.baseOffsetY + dy),
								},
							})
						}}
						onPointerUp={() => {
							if (prosodyDrag.current) editor.squashToMark(prosodyDrag.current.mark)
							prosodyDrag.current = null
						}}
					>
						<polygon
							points="0,-6.5 6.5,0 0,6.5 -6.5,0"
							fill="#d97706"
							stroke="#ffffff"
							strokeWidth={1.8}
						/>
						<title>拖拽橙色菱形手柄：独立移动语气助词图层位置（双击可改语气词）</title>
					</g>
				) : null}
			</svg>
			{editing ? (
				<textarea
					autoFocus
					value={text}
					onChange={(event) => setText(event.target.value)}
					onFocus={() => {
						focused.current = true
					}}
					onBlur={() => {
						focused.current = false
						setEditing(false)
						editor.updateShape({ id: shape.id, type: BUBBLE, props: { text } })
					}}
					onPointerDown={(event) => {
						event.stopPropagation()
						editor.markEventAsHandled(event)
					}}
				/>
			) : null}
			{editingProsody ? (
				<input
					type="text"
					className="bubble-prosody-inline-input"
					autoFocus
					placeholder="输入自定义语气助词（如：冷笑审视）"
					value={prosodyText}
					style={{
						position: 'absolute',
						top: -30,
						left: 4,
						right: 4,
						zIndex: 30,
						padding: '3px 8px',
						fontSize: 11,
						fontWeight: 700,
						borderRadius: 6,
						border: '1.5px solid #d97706',
						background: '#fffbeb',
						color: '#1e293b',
					}}
					onChange={(event) => setProsodyText(event.target.value)}
					onBlur={() => {
						setEditingProsody(false)
						editor.updateShape({ id: shape.id, type: BUBBLE, props: { prosody: prosodyText } })
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === 'Escape') {
							setEditingProsody(false)
							editor.updateShape({ id: shape.id, type: BUBBLE, props: { prosody: prosodyText } })
						}
					}}
					onPointerDown={(event) => {
						event.stopPropagation()
						editor.markEventAsHandled(event)
					}}
				/>
			) : null}
			</div>
		</HTMLContainer>
	)
}
