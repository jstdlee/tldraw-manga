import { BaseBoxShapeUtil, HTMLContainer, resizeBox, useEditor, type TLResizeInfo } from 'tldraw'
import { ANGLE_LABELS, ENV_IDS, ENV_LABELS, FOCAL_LABELS, LIGHT_IDS, LIGHT_LABELS, SHOT_LABELS } from '../demo/book'
import { runBlock } from '../editor/pipeline'
import { readJson } from '../model'
import { ANGLES, defaultParams, FOCALS, PROMPT_BLOCKS, SHOTS, STYLE_PRESETS, type BlockId } from '../prompts/library'
import { IconPlay, IconTerminal } from '../ui/icons'
import { promptProps } from './props'
import { PROMPT, type MangaPrompt } from './schema'

export class MangaPromptUtil extends BaseBoxShapeUtil<MangaPrompt> {
	static override type = PROMPT
	static override props = promptProps

	override getDefaultProps(): MangaPrompt['props'] {
		return {
			w: 270,
			h: 196,
			block: 'extract',
			title: '设定集提炼',
			paramsJson: JSON.stringify(defaultParams('extract')),
			preview: '',
		}
	}

	override canEdit() {
		return false
	}

	override canBind({ bindingType }: { bindingType: string }) {
		return bindingType === 'arrow'
	}

	override onResize(shape: MangaPrompt, info: TLResizeInfo<MangaPrompt>) {
		return resizeBox(shape, info, { minWidth: 210, minHeight: 150 })
	}

	override getIndicatorPath(shape: MangaPrompt) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	override component(shape: MangaPrompt) {
		return <PromptView shape={shape} />
	}
}

function PromptView({ shape }: { shape: MangaPrompt }) {
	const editor = useEditor()
	const block = PROMPT_BLOCKS.find((item) => item.id === shape.props.block)
	const params = readJson<Record<string, string | number | boolean>>(shape.props.paramsJson, defaultParams(shape.props.block))
	const setParam = (key: string, value: string | number | boolean) => {
		editor.updateShape({ id: shape.id, type: PROMPT, props: { paramsJson: JSON.stringify({ ...params, [key]: value }) } })
	}
	const engineLabel = shape.props.block === 'render' ? 'Image LLM + 网点引擎' : 'Text + Vision LLM'
	return (
		<HTMLContainer className="manga-prompt">
			<header>
				<span>
					<IconTerminal /> {shape.props.title.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+\s*/, '')}
				</span>
				<em className="prompt-engine-tag">{engineLabel}</em>
			</header>
			<p>{block?.summary}</p>
			<div className="prompt-chips" onPointerDown={(event) => event.stopPropagation()}>
				<Chips block={shape.props.block} params={params} onChange={setParam} />
			</div>
			{shape.props.preview ? (
				<pre>{shape.props.preview}</pre>
			) : (
				<details onPointerDown={(event) => event.stopPropagation()}>
					<summary>查看内置提示词模板</summary>
					<p>{block?.template}</p>
				</details>
			)}
			<button
				type="button"
				onPointerDown={(event) => {
					event.stopPropagation()
					editor.markEventAsHandled(event)
				}}
				onClick={() => void runBlock(editor, shape.props.block, params, shape.id)}
			>
				<IconPlay /> 执行管线节点
			</button>
		</HTMLContainer>
	)
}

function Chips({
	block,
	params,
	onChange,
}: {
	block: BlockId
	params: Record<string, string | number | boolean>
	onChange: (key: string, value: string | number | boolean) => void
}) {
	if (block === 'extract') {
		return (
			<select value={String(params.stylePreset ?? '少年网点')} onChange={(event) => onChange('stylePreset', event.target.value)}>
				{STYLE_PRESETS.map((preset) => (
					<option key={preset}>{preset}</option>
				))}
			</select>
		)
	}
	if (block === 'chapterize') {
		return (
			<>
				<label>
					话数
					<input type="number" min={1} max={4} value={Number(params.chapters ?? 2)} onChange={(event) => onChange('chapters', Number(event.target.value))} />
				</label>
				<label>
					每话页数
					<input type="number" min={1} max={4} value={Number(params.pages ?? 2)} onChange={(event) => onChange('pages', Number(event.target.value))} />
				</label>
			</>
		)
	}
	if (block === 'camera' || block === 'random') {
		return (
			<>
				{block === 'random' ? (
					<select value={String(params.environment ?? 'neon-rain')} onChange={(event) => onChange('environment', event.target.value)}>
						{ENV_IDS.map((id) => (
							<option key={id} value={id}>
								{ENV_LABELS[id]}
							</option>
						))}
					</select>
				) : null}
				{block === 'random' ? (
					<select value={String(params.lighting ?? 'neon-bounce')} onChange={(event) => onChange('lighting', event.target.value)}>
						{LIGHT_IDS.map((id) => (
							<option key={id} value={id}>
								{LIGHT_LABELS[id]}
							</option>
						))}
					</select>
				) : null}
				<select value={String(params.shot ?? 'MS')} onChange={(event) => onChange('shot', event.target.value)}>
					{SHOTS.map((shot) => (
						<option key={shot} value={shot}>
							{SHOT_LABELS[shot] ?? shot}
						</option>
					))}
				</select>
				<select value={String(params.angle ?? 'low')} onChange={(event) => onChange('angle', event.target.value)}>
					{ANGLES.map((angle) => (
						<option key={angle} value={angle}>
							{ANGLE_LABELS[angle] ?? angle}
						</option>
					))}
				</select>
				<select value={String(params.focal ?? '18mm')} onChange={(event) => onChange('focal', event.target.value)}>
					{FOCALS.map((focal) => (
						<option key={focal} value={focal}>
							{FOCAL_LABELS[focal] ?? focal}
						</option>
					))}
				</select>
			</>
		)
	}
	if (block === 'name') return <span>高潮前静帧 · 左下角翻页钩子</span>
	return <span>禁止AI乱码字 · 安全留白 · 黑白网点</span>
}
