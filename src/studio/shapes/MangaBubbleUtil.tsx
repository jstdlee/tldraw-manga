import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { bubbleMarkup } from '../render/bubbles'
import { BUBBLE, type MangaBubble } from './schema'
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
	const [editing, setEditing] = useState(false)
	const focused = useRef(false)
	const drag = useRef<{ mark: string } | null>(null)
	useEffect(() => {
		if (!focused.current) setText(shape.props.text)
	}, [shape.props.text])
	const markup = bubbleMarkup({
		style: shape.props.bubble,
		text: shape.props.text,
		prosody: shape.props.prosody,
		emphasis: shape.props.emphasis,
		w: shape.props.w,
		h: shape.props.h,
		tailX: shape.props.tailX,
		tailY: shape.props.tailY,
		spin: shape.props.spin,
	})
	return (
		<HTMLContainer className="manga-bubble">
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
				<circle
					cx={shape.props.tailX}
					cy={shape.props.tailY}
					r={8}
					fill="#1e78c8"
					stroke="#fff"
					strokeWidth={2}
					style={{ pointerEvents: 'all' }}
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
				/>
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
		</HTMLContainer>
	)
}
