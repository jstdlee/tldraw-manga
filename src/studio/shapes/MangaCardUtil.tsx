import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { askImage, askVision, cardToPanelPrompt, polishCardText, regenerateCardText } from '../ai/client'
import { getCardDiff, revertCardDiff } from '../editor/pipeline'
import { characterSheetSvg, referenceCardSvg } from '../render/illustrator'
import { IconFileText, IconImage, IconLock, IconUpload, IconUser } from '../ui/icons'
import { openCustomContextMenu } from '../ui/contextMenu'
import { cardProps } from './props'
import { CARD, type MangaCard } from './schema'

const KIND_LABELS: Record<MangaCard['props']['kind'], string> = {
	character: 'Character Sheet',
	image: 'Visual Reference',
	story: 'Script Beat Card',
	world: 'World Rule Card',
	environment: 'Environment Card',
	note: 'Storyboard Note',
}

export class MangaCardUtil extends BaseBoxShapeUtil<MangaCard> {
	static override type = CARD
	static override props = cardProps

	override getDefaultProps(): MangaCard['props'] {
		return {
			w: 280,
			h: 240,
			kind: 'note',
			title: 'Storyboard Reference Card',
			tag: '',
			body: '',
			voice: '',
			locked: true,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: 'Powered by Text LLM',
		}
	}

	override canEdit() {
		return false
	}

	override canBind({ bindingType }: { bindingType: string }) {
		return bindingType === 'arrow'
	}

	override onResize(shape: MangaCard, info: TLResizeInfo<MangaCard>) {
		return resizeBox(shape, info, { minWidth: 220, minHeight: 160 })
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
	const isImageCard = shape.props.kind === 'image' || shape.props.kind === 'character'
	const [title, setTitle] = useState(shape.props.title)
	const [body, setBody] = useState(shape.props.body)
	const [customPrompt, setCustomPrompt] = useState(shape.props.customPrompt || '')
	const [busy, setBusy] = useState<string>('')
	const [seedCount, setSeedCount] = useState(1)
	const focused = useRef(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		if (!focused.current) {
			setTitle(shape.props.title)
			setBody(shape.props.body)
			setCustomPrompt(shape.props.customPrompt || '')
		}
	}, [shape.props.title, shape.props.body, shape.props.customPrompt])

	const stopEvent = (event: React.SyntheticEvent) => {
		event.stopPropagation()
		editor.markEventAsHandled(event.nativeEvent)
	}

	const handlePolish = async (overridePrompt?: string) => {
		setBusy('Polishing...')
		const result = await polishCardText({
			kind: shape.props.kind,
			title,
			body,
			tag: shape.props.tag,
			customPrompt: overridePrompt ?? customPrompt,
		})
		setBody(result.text)
		editor.updateShape({
			id: shape.id,
			type: CARD,
			props: {
				body: result.text,
				customPrompt: overridePrompt ?? customPrompt,
				aiStatus: `${result.modelUsed} Polished`,
			},
		})
		setBusy('')
	}

	const _handleRegenerate = async () => {
		setBusy('Regenerating...')
		const nextCount = seedCount + 1
		setSeedCount(nextCount)
		const result = await regenerateCardText({
			kind: shape.props.kind,
			title,
			body,
			tag: shape.props.tag,
			customPrompt,
			variantSeed: nextCount,
		})
		setBody(result.text)
		editor.updateShape({
			id: shape.id,
			type: CARD,
			props: {
				body: result.text,
				aiStatus: `${result.modelUsed} Regenerated`,
			},
		})
		setBusy('')
	}

	const _handleToPanelPrompt = async () => {
		setBusy('Building Prompt...')
		const result = await cardToPanelPrompt({
			title,
			body,
			tag: shape.props.tag,
			customPrompt,
		})
		setBody(result.prompt)
		editor.updateShape({
			id: shape.id,
			type: CARD,
			props: {
				body: result.prompt,
				aiStatus: `${result.modelUsed} Prompt Ready`,
			},
		})
		setBusy('')
	}

	const handleVisionAnalyze = async () => {
		setBusy('Vision Analyzing...')
		const result = await askVision({
			imageDataUrl: shape.props.imageDataUrl,
			title,
			tag: shape.props.tag,
			body,
			customPrompt,
		})
		setBody(result.analysis)
		editor.updateShape({
			id: shape.id,
			type: CARD,
			props: {
				body: result.analysis,
				aiStatus: `${result.modelUsed} Vision Complete`,
			},
		})
		setBusy('')
	}

	const handleRedrawImage = async () => {
		setBusy('Rendering Art...')
		const nextCount = seedCount + 1
		setSeedCount(nextCount)
		const promptText = `${title} ${shape.props.tag} ${body} ${customPrompt}`.trim()
		const remoteUrl = await askImage(promptText, '16:9')
		const nextVoiceSeed = `seed-${nextCount}-${nextCount % 2 === 0 ? 'cu-low-act' : 'ws-eye'}`
		editor.updateShape({
			id: shape.id,
			type: CARD,
			props: {
				imageDataUrl: remoteUrl || shape.props.imageDataUrl,
				voice: shape.props.kind === 'image' ? nextVoiceSeed : shape.props.voice,
				aiStatus: remoteUrl ? 'Image LLM Rendered' : `Screentone Engine Rendered (#${nextCount})`,
			},
		})
		setBusy('')
	}

	const handleUploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = async () => {
			const dataUrl = typeof reader.result === 'string' ? reader.result : ''
			if (!dataUrl) return
			editor.updateShape({
				id: shape.id,
				type: CARD,
				props: {
					imageDataUrl: dataUrl,
					aiStatus: 'Loaded local reference image · Ready for Vision analysis',
				},
			})
		}
		reader.readAsDataURL(file)
	}

	const _handleCustomExecute = async () => {
		const trimmed = customPrompt.trim()
		if (isImageCard && (trimmed.includes('vision') || trimmed.includes('analyze') || trimmed.includes('inspect'))) {
			await handleVisionAnalyze()
			return
		}
		if (isImageCard && (trimmed.includes('render') || trimmed.includes('draw') || trimmed.includes('redraw'))) {
			await handlePolish(trimmed)
			await handleRedrawImage()
			return
		}
		await handlePolish(trimmed || 'Enhance cinematic tension and visual continuity details')
	}

	const diff = getCardDiff(shape.id)
	const KindIcon = shape.props.kind === 'character' ? IconUser : isImageCard ? IconImage : IconFileText

	void [_handleRegenerate, _handleToPanelPrompt, _handleCustomExecute]
	return (
		<HTMLContainer className={`manga-card kind-${shape.props.kind} ${isImageCard ? 'is-image-card' : 'is-text-card'}`}>
			<div className="card-dom-root" data-card-id={shape.id} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
				<div className="card-head">
					<span className="card-kind">
						<KindIcon /> {KIND_LABELS[shape.props.kind] ?? shape.props.kind}
					</span>
					{shape.props.tag ? <span className="card-tag">{shape.props.tag}</span> : null}
					<button
						type="button"
						className="card-lock"
						onPointerDown={stopEvent}
						onClick={() => editor.updateShape({ id: shape.id, type: CARD, props: { locked: !shape.props.locked } })}
						title="Toggle appearance consistency lock"
					>
						<IconLock /> {shape.props.locked ? 'Locked' : 'Unlocked'}
					</button>
					<button
						type="button"
						className="mini-icon-btn card-more-btn"
						onPointerDown={stopEvent}
						onClick={(e) => {
							stopEvent(e)
							openCustomContextMenu({ kind: 'card', x: e.clientX, y: e.clientY, cardId: shape.id })
						}}
						title="Open Reference Card Menu (or right-click card)"
					>
						⋯
					</button>
				</div>

				<input
					className="card-title"
					value={title}
					placeholder="Card title..."
					onChange={(event) => setTitle(event.target.value)}
					onFocus={() => {
						focused.current = true
					}}
					onBlur={() => {
						focused.current = false
						editor.updateShape({ id: shape.id, type: CARD, props: { title } })
					}}
					onPointerDown={stopEvent}
				/>

				{isImageCard ? (
					<div className="card-visual-box" onPointerDown={stopEvent}>
						{shape.props.imageDataUrl ? (
							<img src={shape.props.imageDataUrl} alt={shape.props.title} className="card-uploaded-img" />
						) : shape.props.kind === 'character' ? (
							<div className="char-sheet" dangerouslySetInnerHTML={{ __html: characterSheetSvg(shape.props.tag || '@kanta') }} />
						) : (
							<div
								className="char-sheet ref-scene-sheet"
								dangerouslySetInnerHTML={{
									__html: referenceCardSvg(shape.props.tag || 'boardwalk', title, shape.props.voice || `ref-${seedCount}`),
								}}
							/>
						)}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={handleUploadImage}
						/>
					</div>
				) : null}

				<textarea
					className="card-body"
					value={body}
					placeholder={isImageCard ? 'Visual prompt / Vision analysis notes...' : 'Describe character, world rules, or story beats...'}
					onChange={(event) => setBody(event.target.value)}
					onFocus={() => {
						focused.current = true
					}}
					onBlur={() => {
						focused.current = false
						editor.updateShape({ id: shape.id, type: CARD, props: { body } })
					}}
					onPointerDown={stopEvent}
				/>

				{diff ? (
					<div className="card-diff-bar" onPointerDown={stopEvent}>
						<span>Applied {diff.label}</span>
						<button type="button" onClick={() => revertCardDiff(editor, shape)}>
							Revert
						</button>
					</div>
				) : null}

				<div className="card-clean-foot" onPointerDown={stopEvent}>
					<span className="card-ai-badge">{busy || shape.props.aiStatus || 'Right-click for AI & Context actions'}</span>
					{isImageCard ? (
						<button type="button" className="mini-btn" onClick={() => fileInputRef.current?.click()} title="Upload local reference image">
							<IconUpload /> Replace
						</button>
					) : null}
				</div>
			</div>
		</HTMLContainer>
	)
}
