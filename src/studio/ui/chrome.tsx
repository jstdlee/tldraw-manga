import { useState } from 'react'
import { useValue } from '@tldraw/state-react'
import { useEditor, type Editor, type TLShapeId } from 'tldraw'
import { probeApi } from '../ai/client'
import { loadSettings, saveSettings, type ApiSettings, type ProviderId } from '../ai/settings'
import { ENV_LABELS, SEAGULL_TEXT } from '../demo/book'
import { packageLayers } from '../export/ora'
import { readerHtml } from '../export/htmlReader'
import { readJson, type PanelMeta } from '../model'
import {
	applyGenome,
	buildPipeline,
	chapterize,
	createCardAt,
	createPromptAt,
	extractBible,
	mutatePages,
	randomizeAtmosphere,
	relayout,
	renderTargets,
	restageDialogue,
	retargetPage,
	showLayoutChoices,
	updatePanels,
} from '../editor/pipeline'
import { getState, notify, patch, useStudio } from '../editor/store'
import { PROMPT_BLOCKS, type BlockId } from '../prompts/library'
import { isBubble, isChapter, isContainer, isPage } from '../shapes/guards'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from '../shapes/schema'
import { compileBook } from '../spec/compile'

const RAIN = '雨夜里 @lin 把伞忘在霓虹巷口。店主 @qiao 追出来，伞骨是用旧筷子修的。巷口的灯灭了一排。第二天伞还在，里面只剩一张湿掉的收据。'

const SCENARIOS = ['establishing', 'tension', 'intimacy', 'action', 'reveal', 'climax'] as const
const PRESETS = ['seizen', 'std', 'action', 'tobira'] as const
const BUBBLE_STYLES = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx'] as const
const PROSODY = ['', '冷笑', '颤抖', '怒吼', '低语', '停顿'] as const
const TEMPLATES = [
	{ tag: '@kanta', title: '勘太', body: '17岁，乱黑发，红防风外套，白T恤，深蓝裤，左耳银钉。', voice: '短句，嘴硬。' },
	{ tag: '@mei', title: '芽衣', body: '齐肩黑褐波波头，蓝衬衫，红白条纹围裙，眼下一颗小痣。', voice: '干、轻，不抬高音量。' },
	{ tag: '@boss', title: '头目鸥', body: '白羽海鸥，黄喙，左眼上一道红疤。', voice: '舞台腔，把抢说成收税。' },
]

export function handleMount(editor: Editor) {
	patch({ editor })
	const container = editor.getContainer()
	const allow = (event: DragEvent) => {
		const types = event.dataTransfer?.types
		if (!types) return
		const list = Array.from(types)
		if (list.includes('application/x-manga-block') || list.includes('application/x-manga-card')) event.preventDefault()
	}
	const drop = (event: DragEvent) => {
		const block = event.dataTransfer?.getData('application/x-manga-block')
		const card = event.dataTransfer?.getData('application/x-manga-card')
		if (!block && !card) return
		event.preventDefault()
		const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
		if (block) createPromptAt(editor, block as BlockId, point.x, point.y)
		if (card) {
			const props = JSON.parse(card) as (typeof TEMPLATES)[number]
			createCardAt(editor, { ...props, kind: 'character' }, point.x, point.y)
		}
	}
	container.addEventListener('dragover', allow)
	container.addEventListener('drop', drop)
	const bible = editor.getCurrentPageShapes().find((shape) => isContainer(shape) && shape.props.role === 'bible')
	if (isContainer(bible) && bible.props.story) patch({ story: bible.props.story })
	else if (!editor.getCurrentPageShapes().some((shape) => isContainer(shape))) buildPipeline(editor, getState().story)
	editor.setCurrentTool('select')
	return () => {
		container.removeEventListener('dragover', allow)
		container.removeEventListener('drop', drop)
	}
}

export function TopBar() {
	const studio = useStudio()
	const editor = studio.editor
	const run = (fn: (editor: Editor) => void) => {
		if (!editor) return
		fn(editor)
	}
	return (
		<header className="topbar">
			<div className="brand">
				<strong>Manga Studio</strong>
				<span>海鸥抢薯条</span>
			</div>
			<div className="top-actions">
				<button type="button" data-testid="macro-full" onClick={() => run((ed) => buildPipeline(ed, studio.story))}>
					🚀 一键出漫
				</button>
				<button type="button" onClick={() => run((ed) => extractBible(ed, studio.story))}>
					⚡ 一键设定集
				</button>
				<button type="button" onClick={() => run((ed) => chapterize(ed, studio.story))}>
					📚 一键分章
				</button>
				<button type="button" onClick={() => run(relayout)}>
					🎲 换分格
				</button>
				<button type="button" onClick={() => run(mutatePages)}>
					🧬 局部变异
				</button>
				<button type="button" onClick={() => run(restageDialogue)}>
					🎬 分镜+台词
				</button>
				<button type="button" onClick={() => run(randomizeAtmosphere)}>
					🎲 随机环境
				</button>
				<button type="button" disabled={Boolean(studio.busy)} onClick={() => run((ed) => void renderTargets(ed, false))}>
					🎨 渲染
				</button>
				<button type="button" data-testid="open-reader" onClick={() => run(openReader)}>
					📖 整书预览
				</button>
				<button type="button" data-testid="export-html" onClick={() => run(downloadHtml)}>
					📥 导出 HTML
				</button>
				<button type="button" disabled={Boolean(studio.busy)} onClick={() => run((ed) => void downloadOra(ed))}>
					📦 导出 ORA
				</button>
				<button type="button" data-testid="open-json" onClick={() => run(openJson)}>
					📋 Comics JSON
				</button>
			</div>
			<div className="status" role="status">
				{studio.busy ? '正在打包图层…' : studio.toast}
			</div>
		</header>
	)
}

export function Sidebar() {
	const studio = useStudio()
	return (
		<aside className="sidebar">
			<section>
				<h2>故事</h2>
				<textarea value={studio.story} onChange={(event) => patch({ story: event.target.value })} spellCheck={false} />
				<div className="side-row">
					<button type="button" onClick={() => patch({ story: SEAGULL_TEXT })}>
						海鸥抢薯条
					</button>
					<button type="button" onClick={() => patch({ story: RAIN })}>
						雨夜的伞
					</button>
				</div>
			</section>
			<section>
				<h2>提示砖</h2>
				<p className="side-note">拖到画布上，改芯片，再点「跑这块」。也可以直接用顶栏。</p>
				{PROMPT_BLOCKS.map((block) => (
					<article
						key={block.id}
						className="side-block"
						draggable
						onDragStart={(event) => {
							event.dataTransfer.setData('application/x-manga-block', block.id)
							event.dataTransfer.effectAllowed = 'copy'
						}}
					>
						<strong>{block.title}</strong>
						<span>{block.summary}</span>
						<button
							type="button"
							onClick={() => {
								const editor = getState().editor
								if (!editor) return
								const bounds = editor.getViewportPageBounds()
								createPromptAt(editor, block.id, bounds.midX - 80, bounds.midY - 40)
							}}
						>
							放到画布
						</button>
					</article>
				))}
			</section>
			<section>
				<h2>角色模板</h2>
				{TEMPLATES.map((card) => (
					<button
						key={card.tag}
						type="button"
						className="side-card"
						draggable
						onDragStart={(event) => {
							event.dataTransfer.setData('application/x-manga-card', JSON.stringify(card))
							event.dataTransfer.effectAllowed = 'copy'
						}}
						onClick={() => {
							const editor = getState().editor
							if (!editor) return
							const bounds = editor.getViewportPageBounds()
							createCardAt(editor, { ...card, kind: 'character' }, bounds.midX, bounds.midY)
						}}
					>
						{card.tag} {card.title}
					</button>
				))}
			</section>
			<section>
				<button type="button" className="settings-link" onClick={() => patch({ modal: { kind: 'settings' } })}>
					图像 / 文本 API
				</button>
				{window.mangaDesktop?.isElectron ? (
					<p className="side-note">
						桌面版 · {window.mangaDesktop.platform} · {window.mangaDesktop.arch}
					</p>
				) : null}
			</section>
		</aside>
	)
}

export function FloatingBar() {
	const editor = useEditor()
	const studio = useStudio()
	const selected = useValue('selected-manga', () => editor.getSelectedShapes(), [editor])
	const bubbles = selected.filter(isBubble)
	const pages = selected.filter(isPage)
	const chapters = selected.filter(isChapter)
	const page = pages[0]
	const crop = studio.crop && page && studio.crop.pageId === page.id ? studio.crop : null
	const metas = page ? readJson<PanelMeta[]>(page.props.panelsJson, []) : []
	const meta = crop ? metas[crop.panel] : undefined
	return (
		<div className="floatbar">
			{bubbles.length ? <BubbleTools editor={editor} bubbles={bubbles} /> : null}
			{page ? (
				<PageTools editor={editor} page={page} meta={meta} panel={crop?.panel ?? null} />
			) : chapters[0] ? (
				<p>
					{chapters[0].props.title} · {ENV_LABELS[chapters[0].props.environment] ?? chapters[0].props.environment}。选中它再导出，就只出这一话。
				</p>
			) : (
				<p>选中一页可以换分格、拖中缝、双击格子后在格里移图。气泡双击改字，蓝点拖尾巴。</p>
			)}
		</div>
	)
}

function PageTools({ editor, page, meta, panel }: { editor: Editor; page: MangaContainer; meta?: PanelMeta; panel: number | null }) {
	return (
		<div className="float-tools">
			<select value={page.props.scenario} onChange={(event) => retargetPage(editor, page.id, { scenario: event.target.value })}>
				{SCENARIOS.map((scenario) => (
					<option key={scenario}>{scenario}</option>
				))}
			</select>
			<select value={page.props.layoutPreset} onChange={(event) => retargetPage(editor, page.id, { layoutPreset: event.target.value })}>
				{PRESETS.map((preset) => (
					<option key={preset}>{preset}</option>
				))}
			</select>
			<label>
				格
				<input
					type="number"
					min={3}
					max={9}
					value={page.props.targetPanels}
					onChange={(event) => retargetPage(editor, page.id, { targetPanels: clampCount(Number(event.target.value)) })}
				/>
			</label>
			<button type="button" onClick={() => relayout(editor)}>
				🎲 换分格
			</button>
			<button type="button" onClick={() => showLayoutChoices(editor, page)}>
				四选一
			</button>
			<button type="button" onClick={() => mutatePages(editor)}>
				🧬 局部变异
			</button>
			<button type="button" onClick={() => restageDialogue(editor)}>
				🎬 台词
			</button>
			<button type="button" onClick={() => randomizeAtmosphere(editor)}>
				🎲 环境
			</button>
			<button type="button" onClick={() => editor.updateShape({ id: page.id, type: CONTAINER, props: { showFlow: !page.props.showFlow } })}>
				👁️ {page.props.showFlow ? '隐藏动线' : '阅读动线'}
			</button>
			<button
				type="button"
				onClick={() => patch({ crop: panel === null ? { pageId: page.id, panel: 0 } : null })}
			>
				✥ {panel === null ? '格内移图' : '退出移图'}
			</button>
			<button type="button" onClick={() => void renderTargets(editor, panel !== null)}>
				🎨 {panel === null ? '渲染本页' : '渲染本格'}
			</button>
			{meta && panel !== null ? (
				<>
					<label>
						缩放
						<input
							type="range"
							min={0.45}
							max={3.2}
							step={0.05}
							value={meta.imageScale || 1}
							onChange={(event) => writeMeta(editor, page, panel, { imageScale: Number(event.target.value) })}
						/>
					</label>
					<label>
						旋转
						<input
							type="range"
							min={-25}
							max={25}
							step={1}
							value={meta.imageRotation || 0}
							onChange={(event) => writeMeta(editor, page, panel, { imageRotation: Number(event.target.value) })}
						/>
					</label>
					<button type="button" onClick={() => writeMeta(editor, page, panel, { imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })}>
						复位
					</button>
					<span className="meta-read">
						{panel + 1} · {meta.shot} · {meta.angle} · {meta.focal} · {meta.aspect}
					</span>
				</>
			) : null}
		</div>
	)
}

function BubbleTools({ editor, bubbles }: { editor: Editor; bubbles: MangaBubble[] }) {
	const first = bubbles[0]
	const apply = (props: Partial<MangaBubble['props']>) => {
		editor.run(() => {
			for (const bubble of bubbles) editor.updateShape({ id: bubble.id, type: BUBBLE, props })
		})
	}
	return (
		<div className="float-tools">
			{BUBBLE_STYLES.map((style) => (
				<button key={style} type="button" className={first.props.bubble === style ? 'on' : ''} onClick={() => apply({ bubble: style, spin: style === 'sfx' ? -8 : 0 })}>
					{style}
				</button>
			))}
			{PROSODY.map((prosody) => (
				<button key={prosody || 'none'} type="button" className={first.props.prosody === prosody ? 'on' : ''} onClick={() => apply({ prosody })}>
					{prosody ? `[${prosody}]` : '无语气'}
				</button>
			))}
			<button type="button" onClick={() => apply({ emphasis: first.props.emphasis > 1.1 ? 0.85 : first.props.emphasis < 0.95 ? 1 : 1.35 })}>
				字号
			</button>
		</div>
	)
}

export function StudioModal() {
	const studio = useStudio()
	if (!studio.modal) return null
	const modal = studio.modal
	return (
		<div className="modal-back" onClick={() => patch({ modal: null })}>
			<div className="modal" onClick={(event) => event.stopPropagation()}>
				<header>
					<strong>
						{modal.kind === 'reader' ? modal.title : modal.kind === 'json' ? modal.title : modal.kind === 'layouts' ? modal.title : 'API'}
					</strong>
					<div className="modal-actions">
						{modal.kind === 'json' ? (
							<>
								<button type="button" onClick={() => void copyText(modal.text)}>
									📋 复制 Spec JSON
								</button>
								<button
									type="button"
									onClick={() => saveBlob('comics-spec.json', new Blob([modal.text], { type: 'application/json;charset=utf-8' }))}
								>
									下载 JSON
								</button>
							</>
						) : null}
						<button type="button" onClick={() => patch({ modal: null })}>
							关闭
						</button>
					</div>
				</header>
				{modal.kind === 'reader' ? <iframe title={modal.title} srcDoc={modal.html} /> : null}
				{modal.kind === 'json' ? <pre className="json">{modal.text}</pre> : null}
				{modal.kind === 'layouts' ? <LayoutPicker pageId={modal.pageId} choices={modal.choices} /> : null}
				{modal.kind === 'settings' ? <SettingsForm /> : null}
			</div>
		</div>
	)
}

function LayoutPicker({ pageId, choices }: { pageId: TLShapeId; choices: Array<{ score: number; reasons: string; genomeJson: string; width: number; height: number; panels: Array<{ pts: [number, number][] }> }> }) {
	const editor = getState().editor
	return (
		<div className="layout-grid">
			{choices.map((choice, index) => (
				<button key={choice.genomeJson} type="button" onClick={() => editor && applyGenome(editor, pageId, choice.genomeJson)}>
					<svg viewBox={`0 0 ${choice.width} ${choice.height}`}>
						{choice.panels.map((panel, panelIndex) => (
							<polygon key={panelIndex} points={panel.pts.map((pt) => pt.join(',')).join(' ')} />
						))}
					</svg>
					<span>
						#{index + 1} · {choice.score.toFixed(3)}
					</span>
					<small>{choice.reasons}</small>
				</button>
			))}
		</div>
	)
}

function SettingsForm() {
	const [settings, setSettings] = useState<ApiSettings>(loadSettings)
	const [detail, setDetail] = useState('不填密钥也能画。离线网点稿不需要网络。')
	const update = (partial: Partial<ApiSettings>) => setSettings((current) => ({ ...current, ...partial }))
	return (
		<form
			className="settings"
			onSubmit={(event) => {
				event.preventDefault()
				saveSettings(settings)
				notify(settings.useApi ? '已保存。渲染会先问代理，失败就退回网点稿。' : '已保存。渲染使用离线网点稿。')
				patch({ modal: null })
			}}
		>
			<label className="check">
				<input type="checkbox" checked={settings.useApi} onChange={(event) => update({ useApi: event.target.checked })} />
				渲染和设定提炼走 API
			</label>
			<label>
				服务
				<select value={settings.provider} onChange={(event) => update({ provider: event.target.value as ProviderId })}>
					<option value="openai">OpenAI</option>
					<option value="gemini">Gemini</option>
					<option value="openrouter">OpenRouter</option>
					<option value="local">本地 OpenAI 兼容</option>
				</select>
			</label>
			<label>
				Base URL
				<input value={settings.baseUrl} placeholder="留空则用服务默认地址" onChange={(event) => update({ baseUrl: event.target.value })} />
			</label>
			<label>
				API key
				<input type="password" value={settings.apiKey} placeholder="或在启动环境里提供 OPENAI_API_KEY / GEMINI_API_KEY" onChange={(event) => update({ apiKey: event.target.value })} />
			</label>
			<label>
				文本模型
				<input value={settings.model} onChange={(event) => update({ model: event.target.value })} />
			</label>
			<label>
				图像模型
				<input value={settings.imageModel} onChange={(event) => update({ imageModel: event.target.value })} />
			</label>
			<p>{detail}</p>
			<div className="side-row">
				<button type="submit">保存</button>
				<button
					type="button"
					onClick={() => {
						saveSettings(settings)
						void probeApi().then((result) => setDetail(result.detail))
					}}
				>
					测试连接
				</button>
			</div>
		</form>
	)
}

function openReader(editor: Editor) {
	const book = compileBook(editor, selectionFilter(editor))
	if (!book.pages.length) {
		notify('没有可预览的页。')
		return
	}
	patch({ modal: { kind: 'reader', title: book.spec.title, html: readerHtml(book) } })
}

function openJson(editor: Editor) {
	const book = compileBook(editor, selectionFilter(editor))
	patch({ modal: { kind: 'json', title: `${book.spec.title} · ComicsSpec v1`, text: JSON.stringify(book.spec, null, 2) } })
}

function downloadHtml(editor: Editor) {
	const book = compileBook(editor, selectionFilter(editor))
	if (!book.pages.length) {
		notify('没有可导出的页。')
		return
	}
	const html = readerHtml(book)
	saveBlob(`${book.spec.title}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))
	notify(`已下载 ${book.spec.title}.html，双击即可离线阅读。`)
}

async function downloadOra(editor: Editor) {
	const book = compileBook(editor, selectionFilter(editor))
	if (!book.pages.length) {
		notify('没有可导出的页。')
		return
	}
	patch({ busy: 'ora' })
	try {
		const archive = await packageLayers(
			book.pages.map((page) => ({
				name: `${page.chapterTitle}-${page.specTitle}`.replace(/\s+/g, ''),
				model: page.model,
				svg: page.svg,
			})),
		)
		saveBlob(`${book.spec.title}-layers.zip`, new Blob([Uint8Array.from(archive)], { type: 'application/zip' }))
		notify('已下载分层包：每页一个 .ora（Director / Bubbles / Ink / Art / Paper）和一份 SVG。')
	} catch (error) {
		notify(error instanceof Error ? error.message : '分层导出失败')
	} finally {
		patch({ busy: '' })
	}
}

function selectionFilter(editor: Editor) {
	const selected = editor.getSelectedShapes().filter(isContainer)
	const chapters = selected.filter((shape) => shape.props.role === 'chapter').map((shape) => shape.id)
	const pages = selected.filter((shape) => shape.props.role === 'page').map((shape) => shape.id)
	if (!chapters.length && !pages.length) return undefined
	return {
		chapters: chapters.length ? chapters : undefined,
		pages: pages.length ? pages : undefined,
	}
}

function writeMeta(editor: Editor, page: MangaContainer, index: number, partial: Partial<PanelMeta>) {
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	if (!metas[index]) return
	metas[index] = { ...metas[index], ...partial }
	updatePanels(editor, page.id, metas)
}

function clampCount(value: number) {
	if (!Number.isFinite(value)) return 4
	return Math.min(9, Math.max(3, Math.round(value)))
}

async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text)
		notify('Comics JSON 已复制。')
	} catch {
		notify('复制失败。可以改用下载 JSON。')
	}
}

function saveBlob(name: string, blob: Blob) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = name
	document.body.append(link)
	link.click()
	link.remove()
	// Electron reads the blob after the click returns. Revoking immediately cancels the save.
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
