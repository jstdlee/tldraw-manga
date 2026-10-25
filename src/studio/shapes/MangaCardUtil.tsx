import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { askImage, askVision, cardToPanelPrompt, polishCardText, regenerateCardText } from '../ai/client'
import { getCardDiff, revertCardDiff } from '../editor/pipeline'
import { characterSheetSvg, referenceCardSvg } from '../render/illustrator'
import { IconEye, IconFileText, IconImage, IconLock, IconRefresh, IconSend, IconSparkles, IconUpload, IconUser } from '../ui/icons'
import { cardProps } from './props'
import { CARD, type MangaCard } from './schema'

const KIND_LABELS: Record<MangaCard['props']['kind'], string> = {
	character: '角色视觉卡',
	image: '图像参考卡',
	story: '剧本文字卡',
	world: '世界观文字卡',
	environment: '场景设定卡',
	note: '分镜文字卡',
}

export class MangaCardUtil extends BaseBoxShapeUtil<MangaCard> {
	static override type = CARD
	static override props = cardProps

	override getDefaultProps(): MangaCard['props'] {
		return {
			w: 280,
			h: 240,
			kind: 'note',
			title: '分镜文字设定卡',
			tag: '',
			body: '',
			voice: '',
			locked: true,
			imageDataUrl: '',
			customPrompt: '',
			aiStatus: '由 Text LLM 驱动',
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
		setBusy('润色中…')
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
				aiStatus: `${result.modelUsed} 已美化`,
			},
		})
		setBusy('')
	}

	const handleRegenerate = async () => {
		setBusy('重生成…')
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
				aiStatus: `${result.modelUsed} 已重新生成`,
			},
		})
		setBusy('')
	}

	const handleToPanelPrompt = async () => {
		setBusy('转提示词…')
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
				aiStatus: `${result.modelUsed} 已生成分镜词`,
			},
		})
		setBusy('')
	}

	const handleVisionAnalyze = async () => {
		setBusy('Vision 识图中…')
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
				aiStatus: `${result.modelUsed} 识图完成`,
			},
		})
		setBusy('')
	}

	const handleRedrawImage = async () => {
		setBusy('AI 生图中…')
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
				aiStatus: remoteUrl ? 'Image LLM 已重绘图像' : `生图引擎已重绘 (变体#${nextCount})`,
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
					aiStatus: '已载入本地参考图 · 可点 Vision 反推',
				},
			})
		}
		reader.readAsDataURL(file)
	}

	const handleCustomExecute = async () => {
		const trimmed = customPrompt.trim()
		if (isImageCard && (trimmed.includes('识图') || trimmed.includes('反推') || trimmed.includes('分析'))) {
			await handleVisionAnalyze()
			return
		}
		if (isImageCard && (trimmed.includes('生图') || trimmed.includes('重绘') || trimmed.includes('画'))) {
			await handlePolish(trimmed)
			await handleRedrawImage()
			return
		}
		await handlePolish(trimmed || '深化漫画镜头张力与细节设定')
	}

	const diff = getCardDiff(shape.id)
	const KindIcon = shape.props.kind === 'character' ? IconUser : isImageCard ? IconImage : IconFileText

	return (
		<HTMLContainer className={`manga-card kind-${shape.props.kind} ${isImageCard ? 'is-image-card' : 'is-text-card'}`}>
			<div className="card-head">
				<span className="card-kind">
					<KindIcon /> {KIND_LABELS[shape.props.kind] ?? shape.props.kind}
				</span>
				{shape.props.tag ? <span className="card-tag">{shape.props.tag}</span> : null}
				<span className="card-ai-badge">{busy || shape.props.aiStatus || (isImageCard ? 'Vision + Image' : 'Text LLM')}</span>
				{shape.props.kind === 'character' ? (
					<button
						type="button"
						className="card-lock"
						onPointerDown={stopEvent}
						onClick={() => editor.updateShape({ id: shape.id, type: CARD, props: { locked: !shape.props.locked } })}
					>
						<IconLock /> {shape.props.locked ? '锁定' : '未锁'}
					</button>
				) : null}
			</div>

			<input
				className="card-title"
				value={title}
				placeholder="输入卡片标题…"
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
				placeholder={isImageCard ? '图像提示词 / Vision 识图反推描述…' : '输入角色、世界观、剧情或分镜描述…'}
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
					<span>已应用 {diff.label}</span>
					<button type="button" onClick={() => revertCardDiff(editor, shape)}>
						一键回退原版
					</button>
				</div>
			) : null}

			<div className="card-llm-toolbar" onPointerDown={stopEvent}>
				{isImageCard ? (
					<>
						<button type="button" className="card-llm-btn primary" onClick={() => void handleRedrawImage()} title="重新生成参考图像">
							<IconRefresh /> AI 重绘
						</button>
						<button type="button" className="card-llm-btn accent" onClick={() => void handleVisionAnalyze()} title="调用 Vision 视觉模型反推画面人设与构图">
							<IconEye /> Vision 反推
						</button>
						<button type="button" className="card-llm-btn" onClick={() => void handlePolish()} title="调用文本 LLM 美化扩写生图提示词">
							<IconSparkles /> 美化词
						</button>
						<button type="button" className="card-llm-btn" onClick={() => fileInputRef.current?.click()} title="上传本地参考图">
							<IconUpload /> 换图
						</button>
					</>
				) : (
					<>
						<button type="button" className="card-llm-btn primary" onClick={() => void handlePolish()} title="调用文本 LLM 润色美化设定">
							<IconSparkles /> AI 润色美化
						</button>
						<button type="button" className="card-llm-btn" onClick={() => void handleRegenerate()} title="调用文本 LLM 重新生成另一版方案">
							<IconRefresh /> AI 重生
						</button>
						<button type="button" className="card-llm-btn accent" onClick={() => void handleToPanelPrompt()} title="将文字设定转化为结构化分镜词">
							转分镜词
						</button>
					</>
				)}
			</div>

			<div className="card-custom-prompt" onPointerDown={stopEvent}>
				<input
					type="text"
					value={customPrompt}
					placeholder={isImageCard ? '自定义指令：如「加上夕阳逆光」…' : '自定义指令：如「改成赛博雨夜风」…'}
					onChange={(event) => setCustomPrompt(event.target.value)}
					onFocus={() => {
						focused.current = true
					}}
					onBlur={() => {
						focused.current = false
						editor.updateShape({ id: shape.id, type: CARD, props: { customPrompt } })
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							void handleCustomExecute()
						}
					}}
				/>
				<button type="button" onClick={() => void handleCustomExecute()}>
					<IconSend /> 发送
				</button>
			</div>
		</HTMLContainer>
	)
}
