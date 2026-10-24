import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { ENV_LABELS } from '../demo/book'
import { characterSheetSvg } from '../render/illustrator'
import { CARD, type MangaCard } from './schema'
import { cardProps } from './props'

export class MangaCardUtil extends BaseBoxShapeUtil<MangaCard> {
	static override type = CARD
	static override props = cardProps

	override getDefaultProps(): MangaCard['props'] {
		return {
			w: 240,
			h: 180,
			kind: 'note',
			tag: '',
			title: '笔记',
			body: '',
			voice: '',
			locked: false,
			imageSeed: '',
		}
	}

	override canEdit() {
		return false
	}

	override canBind({ bindingType }: { bindingType: string }) {
		return bindingType === 'arrow'
	}

	override onResize(shape: MangaCard, info: TLResizeInfo<MangaCard>) {
		return resizeBox(shape, info, { minWidth: 160, minHeight: 90 })
	}

	override getIndicatorPath(shape: MangaCard) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	override component(shape: MangaCard) {
		return <CardView shape={shape} />
	}
}

function CardView({ shape }: { shape: MangaCard }) {
	const editor = useEditor()
	const [body, setBody] = useState(shape.props.body)
	const focused = useRef(false)
	useEffect(() => {
		if (!focused.current) setBody(shape.props.body)
	}, [shape.props.body])
	const label = shape.props.kind === 'environment' ? ENV_LABELS[shape.props.title] ?? shape.props.title : shape.props.title
	const commit = (value: string) => {
		editor.updateShape({ id: shape.id, type: CARD, props: { body: value } })
	}
	return (
		<HTMLContainer className={`manga-card kind-${shape.props.kind}`}>
			<header>
				<span>{shape.props.tag || kindLabel(shape.props.kind)}</span>
				{shape.props.locked ? <em>外形锁定</em> : null}
			</header>
			<strong>{label}</strong>
			{shape.props.kind === 'character' ? <div className="turnaround" dangerouslySetInnerHTML={{ __html: characterSheetSvg(shape.props.tag) }} /> : null}
			<textarea
				value={body}
				onFocus={() => {
					focused.current = true
				}}
				onBlur={() => {
					focused.current = false
					commit(body)
				}}
				onChange={(event) => setBody(event.target.value)}
				onPointerDown={(event) => {
					event.stopPropagation()
					editor.markEventAsHandled(event)
				}}
			/>
			{shape.props.voice ? <p>{shape.props.voice}</p> : null}
		</HTMLContainer>
	)
}

function kindLabel(kind: MangaCard['props']['kind']) {
	if (kind === 'character') return '角色'
	if (kind === 'story') return '故事'
	if (kind === 'world') return '世界'
	if (kind === 'environment') return '场景覆盖'
	return '笔记'
}
