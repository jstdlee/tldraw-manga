import { useEffect, useState } from 'react'
import { useEditor, useValue, type Editor } from 'tldraw'
import { askImage, askText } from '../ai/client'
import { applyProviderPreset, loadSettings, PROVIDER_PRESETS, saveSettings, type ApiSettings, type ProviderId } from '../ai/settings'
import {
	ANGLE_LABELS,
	BUBBLE_LABELS,
	bookFromText,
	ENV_IDS,
	ENV_LABELS,
	FOCAL_LABELS,
	LIGHT_IDS,
	LIGHT_LABELS,
	PRESET_LABELS,
	SAMPLE_STORIES,
	SCENARIO_LABELS,
	SEAGULL_STORY,
	SHOT_LABELS,
} from '../demo/book'
import {
	applyLayoutChoice,
	applySelectedCardAiAction,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	mutateSelectedPages,
	polishPageWithAi,
	rerollSelectedPages,
	rewriteStoryWithLlm,
	runBlock,
	selectedPages,
	spawnBook,
	spawnPromptBlock,
	toggleAllFlow,
} from '../editor/pipeline'
import { downloadBlob, downloadText, exportOpenRaster } from '../export/ora'
import { readerHtml } from '../export/htmlReader'
import { configFor } from '../layout/engine'
import { asScenario, pickTopLayouts, SCENARIOS } from '../layout/score'
import { buildPanelPrompt, readJson, safeCorner, type BubbleStyle, type PanelMeta, type Prosody } from '../model'
import { ANGLES, FOCALS, PROMPT_BLOCKS, SHOTS, type BlockId } from '../prompts/library'
import { renderPageSvg } from '../render/pageSvg'
import { BUBBLE, CARD, CONTAINER, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { compileBook, type CompiledBook } from '../spec/compile'

const PRESETS = ['seizen', 'std', 'action', 'tobira'] as const
const BUBBLES: BubbleStyle[] = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']
const PROSODIES: Prosody[] = ['', '冷笑', '颤抖', '怒吼', '低语', '停顿']

export type SidebarTab = 'cards' | 'story' | 'llm'

export function TopBar({
	editor,
	story,
	status,
	setStatus,
	onOpenCompare,
	onOpenReader,
	onOpenSettings,
	onSwitchTab,
}: {
	editor: Editor | null
	story: string
	status: string
	setStatus: (value: string) => void
	onOpenCompare: () => void
	onOpenReader: (book: CompiledBook) => void
	onOpenSettings: () => void
	onSwitchTab: (tab: SidebarTab) => void
}) {
	const settings = loadSettings()
	const run = async (label: string, fn: (ed: Editor) => Promise<string | void> | string | void) => {
		if (!editor) return
		setStatus(`⏳ 正在执行：${label}…`)
		const result = await fn(editor)
		setStatus(typeof result === 'string' && result ? result : `✅ ${label}完成`)
	}

	return (
		<header className="topbar">
			<div className="brand-cluster">
				<div className="brand">
					<strong>tldraw-manga</strong>
					<span>AI 漫剧分镜工作台</span>
				</div>
				<button
					type="button"
					className="llm-status-pill"
					onClick={() => {
						onSwitchTab('llm')
						onOpenSettings()
					}}
					title="点击配置内置文本 LLM、Vision 视觉识图与图像生成模型"
				>
					<span className="dot" />
					<span>
						⚙️ 模型：文本 <b>{settings.model}</b> · 视觉 <b>{settings.visionModel}</b> · 生图 <b>{settings.imageModel}</b>
					</span>
				</button>
			</div>

			<div className="pipeline-steps">
				<div className="step-group">
					<span className="step-badge">① 剧本拆解</span>
					<button
						type="button"
						className="primary"
						onClick={() =>
							void run('AI 一键拆解剧本与分镜', (ed) => {
								spawnBook(ed, bookFromText(story))
								return '✨ 已由 Text LLM 拆解设定集、双话章节与多边形分镜页'
							})
						}
					>
						🚀 一键生成漫剧
					</button>
					<button type="button" onClick={() => void run('AI 提炼设定集', (ed) => runBlock(ed, 'extract'))}>
						📝 提炼设定
					</button>
				</div>

				<span className="step-arrow">→</span>

				<div className="step-group">
					<span className="step-badge">② 多边形分格</span>
					<button type="button" onClick={() => void run('智能换分格', (ed) => rerollSelectedPages(ed))}>
						🎲 智能换格
					</button>
					<button type="button" onClick={onOpenCompare}>
						📊 四选一评分
					</button>
					<button type="button" onClick={() => void run('局部斜切变异', (ed) => mutateSelectedPages(ed))}>
						⚡ 斜切变异
					</button>
				</div>

				<span className="step-arrow">→</span>

				<div className="step-group">
					<span className="step-badge">③ AI 润色与生图</span>
					<button type="button" className="accent-btn" onClick={() => void run('AI 导演润色分镜与台词', (ed) => polishPageWithAi(ed))}>
						✨ AI 润色分镜
					</button>
					<button type="button" className="accent-btn" onClick={() => void run('AI 渲染漫画画面', (ed) => runBlock(ed, 'render'))}>
						🎨 AI 渲染成稿
					</button>
				</div>

				<span className="step-arrow">→</span>

				<div className="step-group">
					<span className="step-badge">④ 审计与导出</span>
					<button
						type="button"
						onClick={() =>
							void run('切换阅读动线审计', (ed) => {
								const next = toggleAllFlow(ed)
								return next ? '👁️ 已开启右→左阅读动线审计层（红：格序 / 蓝：视线 / 绿：气泡）' : '已关闭阅读动线审计层'
							})
						}
					>
						👁️ 阅读动线
					</button>
					<button
						type="button"
						onClick={() => {
							if (!editor) return
							onOpenReader(compileBook(editor))
						}}
					>
						📖 整书预览
					</button>
					<button
						type="button"
						onClick={() => {
							if (!editor) return
							const book = compileBook(editor)
							downloadText(`${book.spec.title}.html`, readerHtml(book), 'text/html;charset=utf-8')
							setStatus('✅ 已导出单文件 HTML 阅读器（支持双页/条漫/分镜推镜/设定集）')
						}}
					>
						📥 导出 HTML
					</button>
					<button
						type="button"
						onClick={() =>
							void run('导出分层 ORA', async (ed) => {
								const book = compileBook(ed)
								const first = book.pages[0]
								if (!first) return '没有可导出的页面'
								const bytes = await exportOpenRaster(first.model)
								downloadBlob(`${book.spec.title}-P1.ora`, bytes, 'image/openraster')
								return '✅ 已导出 5 层 OpenRaster (.ora) 分层工程包'
							})
						}
					>
						📦 导出 ORA
					</button>
				</div>
			</div>

			<div className="status-pill" title={status}>
				{status}
			</div>
		</header>
	)
}

export function LeftLibrary({
	editor,
	story,
	setStory,
	setStatus,
	activeTab,
	setActiveTab,
}: {
	editor: Editor | null
	story: string
	setStory: (value: string) => void
	setStatus: (value: string) => void
	activeTab: SidebarTab
	setActiveTab: (tab: SidebarTab) => void
}) {
	const [globalCustomPrompt, setGlobalCustomPrompt] = useState('强化正午硬光对比与动作分镜张力，高潮前留一格静帧')
	const [cardQuickPrompt, setCardQuickPrompt] = useState('')
	const [settings, setSettings] = useState<ApiSettings>(() => loadSettings())

	const updateSettings = (patch: Partial<ApiSettings>) => {
		const next = saveSettings(patch)
		setSettings(next)
	}

	const handleSelectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setSettings(next)
		setStatus(`⚙️ 已切换模型预设为 ${PROVIDER_PRESETS.find((p) => p.id === provider)?.label ?? provider}`)
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-tabs">
				<button type="button" className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>
					🃏 卡片与 AI 助手
				</button>
				<button type="button" className={activeTab === 'story' ? 'active' : ''} onClick={() => setActiveTab('story')}>
					📖 剧本与指令
				</button>
				<button type="button" className={activeTab === 'llm' ? 'active' : ''} onClick={() => setActiveTab('llm')}>
					⚙️ 模型配置
				</button>
			</div>

			<div className="sidebar-body">
				{activeTab === 'cards' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>1. 新建 AI 卡片（文字卡 / 图像参考卡）</h3>
								<span>自带 LLM 快捷栏</span>
							</div>
							<p className="side-hint">卡片均内置「AI 润色美化、AI 重新生成、Vision 识图反推、AI 重绘、自定义提示词」快捷栏：</p>
							<div className="card-spawn-grid">
								<button
									type="button"
									className="spawn-card-btn text-card-btn"
									onClick={() => {
										if (!editor) return
										createTextCardOnCanvas(
											editor,
											'note',
											'分镜剧情设定卡',
											'勘太护住最后一盒薯条退到防波堤边缘，海风吹起连帽卫衣，头顶黑影骤然压下。',
										)
										setStatus('📝 已在画布创建「文字设定卡」，可直接点击卡上 AI 按钮润色或改写')
									}}
								>
									<strong>📝 + 文字设定卡</strong>
									<small>角色/剧情/世界观 · Text LLM 润色与重生</small>
								</button>

								<button
									type="button"
									className="spawn-card-btn img-card-btn"
									onClick={() => {
										if (!editor) return
										createImageCardOnCanvas(
											editor,
											'image',
											'场景视觉参考图卡',
											'@boardwalk',
											'正午防波堤仰拍参考图，18mm 广角透视，浓墨线配灰网点，右上角留出对白安全区。',
										)
										setStatus('🖼️ 已在画布创建「图像参考卡」，支持 Vision 识图反推与 AI 重绘')
									}}
								>
									<strong>🖼️ + 图像参考卡</strong>
									<small>参考图/概念图 · Vision 反推与 AI 生图</small>
								</button>
							</div>

							<div className="char-row">
								{[
									{ tag: '@kanta', name: '👤 勘太三视图卡', desc: '凌乱黑发，深蓝连帽卫衣，领口挂旧护目镜，右颊一贴创可贴' },
									{ tag: '@mei', name: '👤 芽衣三视图卡', desc: '利落短发配发卡，浅色长风衣，斜挎老胶片相机，眼神冷静' },
									{ tag: '@boss', name: '👤 头目鸥视觉卡', desc: '体型硕大的银背海鸥，左眼一道旧疤，左脚套金属环，翼展极宽' },
								].map((char) => (
									<button
										key={char.tag}
										type="button"
										onClick={() => {
											if (!editor) return
											createImageCardOnCanvas(editor, 'character', char.name.replace('👤 ', ''), char.tag, char.desc)
											setStatus(`👤 已在画布放置 ${char.name}`)
										}}
									>
										+ {char.name}
									</button>
								))}
							</div>
						</section>

						<section className="side-section">
							<div className="sec-head">
								<h3>2. 选中卡片 / 分镜 AI 快捷台</h3>
								<span>多模态协同</span>
							</div>
							<div className="quick-ai-box">
								<div className="quick-ai-grid">
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'polish', cardQuickPrompt))
											} else {
												setStatus(await polishPageWithAi(editor, cardQuickPrompt))
											}
										}}
									>
										✨ AI 润色美化
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'regenerate', cardQuickPrompt))
											} else {
												rerollSelectedPages(editor)
												setStatus('🔄 已重新生成选中页分镜排布')
											}
										}}
									>
										🔄 AI 重新生成
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card =
												editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD) ??
												editor.getCurrentPageShapes().find((s): s is MangaCard => s.type === CARD && (s.props.kind === 'image' || s.props.kind === 'character'))
											if (card) {
												editor.select(card.id)
												setStatus(await applySelectedCardAiAction(editor, card, 'vision', cardQuickPrompt))
											}
										}}
									>
										👁️ Vision 识图反推
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card =
												editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD && (s.props.kind === 'image' || s.props.kind === 'character'))
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'redraw', cardQuickPrompt))
											} else {
												setStatus(await runBlock(editor, 'render'))
											}
										}}
									>
										🎨 AI 重新生图
									</button>
								</div>
								<div className="side-custom-prompt">
									<input
										type="text"
										value={cardQuickPrompt}
										onChange={(event) => setCardQuickPrompt(event.target.value)}
										placeholder="💬 输入自定义提示词（如：改成暴雨逆光 / 反推服装锚点）…"
									/>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'polish', cardQuickPrompt))
											} else {
												setStatus(await polishPageWithAi(editor, cardQuickPrompt))
											}
										}}
									>
										执行
									</button>
								</div>
							</div>
						</section>

						<section className="side-section">
							<div className="sec-head">
								<h3>3. AI 导演流程节点（点击运行或拖入画布）</h3>
								<span>6 大算子</span>
							</div>
							<div className="brick-list">
								{PROMPT_BLOCKS.map((block) => (
									<div
										key={block.id}
										className="brick"
										draggable
										onDragStart={(event) => {
											event.dataTransfer.setData('application/manga-block', block.id)
										}}
									>
										<div>
											<strong>{block.title}</strong>
											<p>{block.summary}</p>
										</div>
										<div className="brick-actions">
											<button
												type="button"
												onClick={async () => {
													if (!editor) return
													const out = await runBlock(editor, block.id)
													setStatus(out)
												}}
											>
												运行
											</button>
											<button
												type="button"
												onClick={() => {
													if (!editor) return
													spawnPromptBlock(editor, block.id)
													setStatus(`已将「${block.title}」节点放入画布`)
												}}
											>
												+画布
											</button>
										</div>
									</div>
								))}
							</div>
						</section>
					</>
				) : null}

				{activeTab === 'story' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>1. 漫画故事原稿</h3>
								<select value="" onChange={(event) => event.target.value && setStory(event.target.value)}>
									<option value="">切换示例剧本…</option>
									{SAMPLE_STORIES.map((item) => (
										<option key={item.label} value={item.text}>
											{item.label}
										</option>
									))}
								</select>
							</div>
							<textarea value={story} onChange={(event) => setStory(event.target.value)} rows={6} placeholder="输入故事梗概、分场剧本或对白…" />
							<div className="story-actions">
								<button
									type="button"
									className="primary-full"
									onClick={() => {
										if (!editor) return
										spawnBook(editor, bookFromText(story))
										setStatus('🚀 已根据当前故事剧本重新拆解设定集、章节与分镜页')
									}}
								>
									🚀 按此剧本一键生成全书分镜
								</button>
								<button type="button" onClick={() => setStory(SEAGULL_STORY)}>
									重置默认
								</button>
							</div>
						</section>

						<section className="side-section">
							<div className="sec-head">
								<h3>2. 💬 自定义 LLM 提示词改写剧本</h3>
								<span>Text LLM</span>
							</div>
							<p className="side-hint">输入自定义风格、矛盾或镜头要求，让大模型辅助改写剧本或扩写分镜细节：</p>
							<textarea
								rows={3}
								value={globalCustomPrompt}
								onChange={(event) => setGlobalCustomPrompt(event.target.value)}
								placeholder="例如：把第二话改成暴风雨夜霓虹天台对决，增加悬疑反转与特写静帧…"
							/>
							<div className="preset-chips">
								{[
									'🔥 强化热血动作与广角张力',
									'🌧️ 改为赛博雨夜悬疑氛围',
									'🎭 强化冷幽默对白与反差感',
									'🎬 高潮前插入无台词特写静帧',
								].map((chip) => (
									<button key={chip} type="button" className="chip-btn" onClick={() => setGlobalCustomPrompt(chip.slice(2).trim())}>
										{chip}
									</button>
								))}
							</div>
							<div className="story-actions">
								<button
									type="button"
									className="primary-full"
									onClick={async () => {
										setStatus('⏳ 正在调用 Text LLM 按自定义指令改写剧本…')
										const rewritten = await rewriteStoryWithLlm(story, globalCustomPrompt)
										setStory(rewritten)
										if (editor) {
											const storyCard = editor
												.getCurrentPageShapes()
												.find((s): s is MangaCard => s.type === CARD && s.props.kind === 'story')
											if (storyCard) {
												editor.updateShape<MangaCard>({
													id: storyCard.id,
													type: CARD,
													props: { body: rewritten, customPrompt: globalCustomPrompt, aiStatus: '✨ 已按全局指令改写' },
												})
											}
										}
										setStatus('✨ Text LLM 已按自定义指令完成剧本改写，并同步至故事设定卡')
									}}
								>
									✨ 调用 Text LLM 改写并美化剧本
								</button>
							</div>
						</section>
					</>
				) : null}

				{activeTab === 'llm' ? (
					<section className="side-section llm-config-panel">
						<div className="sec-head">
							<h3>内置多模态模型配置中心</h3>
							<span>Text · Vision · Image</span>
						</div>
						<p className="side-hint">
							支持一键切换 OpenAI / Gemini / OpenRouter / DeepSeek / 本地 Ollama。未开启在线 API 时，内置离线中文引擎与网点渲染器将自动兜底。
						</p>

						<div className="preset-bar">
							{PROVIDER_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className={settings.provider === preset.id ? 'preset-pill active' : 'preset-pill'}
									onClick={() => handleSelectPreset(preset.id)}
								>
									{preset.id.toUpperCase()}
								</button>
							))}
						</div>

						<label className="check-row">
							<input
								type="checkbox"
								checked={settings.useApi}
								onChange={(event) => updateSettings({ useApi: event.target.checked })}
							/>
							<span>启用在线大模型 API（关闭时使用零配置内置离线引擎）</span>
						</label>

						<div className="model-group-card">
							<h4>📝 1. 文本大模型 (Text LLM · 剧本/润色/提示词)</h4>
							<label>
								服务商 (Provider)
								<select value={settings.provider} onChange={(event) => handleSelectPreset(event.target.value as ProviderId)}>
									{PROVIDER_PRESETS.map((preset) => (
										<option key={preset.id} value={preset.id}>
											{preset.label}
										</option>
									))}
								</select>
							</label>
							<label>
								接口地址 (Base URL)
								<input
									value={settings.baseUrl}
									onChange={(event) => updateSettings({ baseUrl: event.target.value })}
									placeholder="https://api.openai.com/v1"
								/>
							</label>
							<label>
								API Key（仅保存在本地浏览器，经过本地代理转发）
								<input
									type="password"
									value={settings.apiKey}
									onChange={(event) => updateSettings({ apiKey: event.target.value })}
									placeholder="sk-... / AIza..."
								/>
							</label>
							<label>
								文本模型名称 (Text Model)
								<input
									value={settings.model}
									onChange={(event) => updateSettings({ model: event.target.value })}
									placeholder="gpt-4o-mini / gemini-2.5-flash / deepseek-chat"
								/>
							</label>
						</div>

						<div className="model-group-card">
							<h4>👁️ 2. 视觉大模型 (Vision LLM · 识图反推/构图诊断)</h4>
							<label>
								视觉服务商 (Vision Provider)
								<select
									value={settings.visionProvider}
									onChange={(event) => updateSettings({ visionProvider: event.target.value as ProviderId })}
								>
									{PROVIDER_PRESETS.map((preset) => (
										<option key={preset.id} value={preset.id}>
											{preset.label}
										</option>
									))}
								</select>
							</label>
							<label>
								视觉模型名称 (Vision Model)
								<input
									value={settings.visionModel}
									onChange={(event) => updateSettings({ visionModel: event.target.value })}
									placeholder="gpt-4o / gemini-2.5-flash / qwen-vl-max"
								/>
							</label>
						</div>

						<div className="model-group-card">
							<h4>🎨 3. 图像生成模型 (Image Gen · 参考图/分镜渲染)</h4>
							<label>
								生图服务商 (Image Provider)
								<select
									value={settings.imageProvider}
									onChange={(event) => updateSettings({ imageProvider: event.target.value as ProviderId })}
								>
									{PROVIDER_PRESETS.map((preset) => (
										<option key={preset.id} value={preset.id}>
											{preset.label}
										</option>
									))}
								</select>
							</label>
							<label>
								生图模型名称 (Image Model)
								<input
									value={settings.imageModel}
									onChange={(event) => updateSettings({ imageModel: event.target.value })}
									placeholder="gpt-image-1 / gemini-2.5-flash-image / flux-1.1-pro"
								/>
							</label>
						</div>

						<div className="model-group-card">
							<h4>🧭 4. 全局漫画系统提示词补充</h4>
							<textarea
								rows={2}
								value={settings.systemAppendix}
								onChange={(event) => updateSettings({ systemAppendix: event.target.value })}
							/>
						</div>
					</section>
				) : null}
			</div>
		</aside>
	)
}

export function FloatingBar() {
	const editor = useEditor()
	const selected = useValue('selected', () => editor.getSelectedShapes(), [editor])
	const [customInput, setCustomInput] = useState('')
	const [feedback, setFeedback] = useState('')

	const card = selected.find((shape): shape is MangaCard => shape.type === CARD)
	const page = selected.find((shape): shape is MangaContainer => shape.type === CONTAINER && shape.props.role === 'page')
	const bubble = selected.find((shape): shape is MangaBubble => shape.type === BUBBLE)

	if (!card && !page && !bubble) return null

	if (card) {
		const isImg = card.props.kind === 'image' || card.props.kind === 'character'
		return (
			<div className="floatbar" onPointerDown={(event) => event.stopPropagation()}>
				<span className="float-title">
					{isImg ? '🖼️ 图像卡 AI 助手' : '📝 文字卡 AI 助手'}：<b>{card.props.title}</b>
				</span>
				<button
					type="button"
					className="float-ai-btn"
					onClick={async () => {
						const msg = await applySelectedCardAiAction(editor, card, 'polish', customInput || undefined)
						setFeedback(msg)
					}}
				>
					✨ AI 润色美化
				</button>
				<button
					type="button"
					className="float-ai-btn"
					onClick={async () => {
						const msg = await applySelectedCardAiAction(editor, card, 'regenerate', customInput || undefined)
						setFeedback(msg)
					}}
				>
					🔄 AI 重新生成
				</button>
				{isImg ? (
					<>
						<button
							type="button"
							className="float-ai-btn accent"
							onClick={async () => {
								const msg = await applySelectedCardAiAction(editor, card, 'vision', customInput || undefined)
								setFeedback(msg)
							}}
						>
							👁️ Vision 识图反推
						</button>
						<button
							type="button"
							className="float-ai-btn accent"
							onClick={async () => {
								const msg = await applySelectedCardAiAction(editor, card, 'redraw', customInput || undefined)
								setFeedback(msg)
							}}
						>
							🎨 AI 重新生图
						</button>
					</>
				) : null}
				<div className="float-custom-input">
					<input
						type="text"
						value={customInput}
						onChange={(event) => setCustomInput(event.target.value)}
						placeholder="💬 输入自定义提示词改写此卡…"
					/>
					<button
						type="button"
						onClick={async () => {
							const msg = await applySelectedCardAiAction(editor, card, 'polish', customInput || '强化漫画镜头表现力')
							setFeedback(msg)
						}}
					>
						发送 LLM
					</button>
				</div>
				{feedback ? <span className="float-feedback">{feedback}</span> : null}
			</div>
		)
	}

	if (bubble) {
		return (
			<div className="floatbar" onPointerDown={(event) => event.stopPropagation()}>
				<span className="float-title">💬 气泡与拟声词工具栏</span>
				<label>
					框型
					<select
						value={bubble.props.bubble}
						onChange={(event) => editor.updateShape({ id: bubble.id, type: BUBBLE, props: { bubble: event.target.value as BubbleStyle } })}
					>
						{BUBBLES.map((style) => (
							<option key={style} value={style}>
								{BUBBLE_LABELS[style] ?? style}
							</option>
						))}
					</select>
				</label>
				<label>
					语气标注
					<select
						value={bubble.props.prosody}
						onChange={(event) => editor.updateShape({ id: bubble.id, type: BUBBLE, props: { prosody: event.target.value } })}
					>
						{PROSODIES.map((prosody) => (
							<option key={prosody} value={prosody}>
								{prosody || '无标注'}
							</option>
						))}
					</select>
				</label>
				<label>
					字号缩放
					<input
						type="range"
						min={0.75}
						max={1.45}
						step={0.05}
						value={bubble.props.emphasis}
						onChange={(event) => editor.updateShape({ id: bubble.id, type: BUBBLE, props: { emphasis: Number(event.target.value) } })}
					/>
				</label>
				<button
					type="button"
					className="float-ai-btn"
					onClick={async () => {
						const line = await askText(
							'把这句漫画台词改写得更有潜台词，不超过 18 个汉字，全部使用中文。',
							bubble.props.text,
							() => `${bubble.props.text.replace(/[。！!]+$/, '')}……才怪！`,
						)
						editor.updateShape({ id: bubble.id, type: BUBBLE, props: { text: line } })
					}}
				>
					✨ AI 润色台词
				</button>
			</div>
		)
	}

	if (!page) return null
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const panelIdx = page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0
	const meta = metas[panelIdx]
	const updateMeta = (patch: Partial<PanelMeta>) => {
		const next = metas.map((item, idx) => (idx === panelIdx ? { ...item, ...patch } : item))
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}

	return (
		<div className="floatbar" onPointerDown={(event) => event.stopPropagation()}>
			<span className="float-title">📄 {page.props.title}</span>
			<label>
				叙事场景
				<select
					value={page.props.scenario}
					onChange={(event) => {
						const scenario = event.target.value
						const config = configFor(page.props.layoutPreset, page.props.targetPanels)
						const best = pickTopLayouts(page.props.seed, config, page.props.targetPanels, asScenario(scenario)).top[0]
						editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { scenario } })
						applyLayoutChoice(editor, page, { seed: best.seed, genome: best.layout.genome, score: best.score, reasons: best.reasons })
					}}
				>
					{SCENARIOS.map((scenario) => (
						<option key={scenario} value={scenario}>
							{SCENARIO_LABELS[scenario] ?? scenario}
						</option>
					))}
				</select>
			</label>
			<label>
				分格预设
				<select
					value={page.props.layoutPreset}
					onChange={(event) => {
						const layoutPreset = event.target.value
						const config = configFor(layoutPreset, page.props.targetPanels)
						const best = pickTopLayouts(page.props.seed, config, page.props.targetPanels, asScenario(page.props.scenario)).top[0]
						editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { layoutPreset } })
						applyLayoutChoice(editor, page, { seed: best.seed, genome: best.layout.genome, score: best.score, reasons: best.reasons })
					}}
				>
					{PRESETS.map((preset) => (
						<option key={preset} value={preset}>
							{PRESET_LABELS[preset] ?? preset}
						</option>
					))}
				</select>
			</label>
			<label>
				目标格数
				<input
					type="number"
					min={3}
					max={9}
					value={page.props.targetPanels}
					onChange={(event) => {
						const targetPanels = Math.min(9, Math.max(3, Number(event.target.value)))
						const config = configFor(page.props.layoutPreset, targetPanels)
						const best = pickTopLayouts(page.props.seed, config, targetPanels, asScenario(page.props.scenario)).top[0]
						editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { targetPanels } })
						applyLayoutChoice(editor, page, { seed: best.seed, genome: best.layout.genome, score: best.score, reasons: best.reasons })
					}}
				/>
			</label>
			<button
				type="button"
				onClick={() => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showFlow: !page.props.showFlow } })}
			>
				{page.props.showFlow ? '🙈 隐藏动线' : '👁️ 阅读动线'}
			</button>
			<button type="button" onClick={() => rerollSelectedPages(editor)}>
				🎲 换分格
			</button>

			{meta ? (
				<>
					<span className="sep" />
					<span className="float-sub">第 {panelIdx + 1} 格：</span>
					<select value={meta.shot} onChange={(event) => updateMeta({ shot: event.target.value as PanelMeta['shot'] })}>
						{SHOTS.map((shot) => (
							<option key={shot} value={shot}>
								{SHOT_LABELS[shot] ?? shot}
							</option>
						))}
					</select>
					<select value={meta.angle} onChange={(event) => updateMeta({ angle: event.target.value as PanelMeta['angle'] })}>
						{ANGLES.map((angle) => (
							<option key={angle} value={angle}>
								{ANGLE_LABELS[angle] ?? angle}
							</option>
						))}
					</select>
					<select value={meta.focal} onChange={(event) => updateMeta({ focal: event.target.value as PanelMeta['focal'] })}>
						{FOCALS.map((focal) => (
							<option key={focal} value={focal}>
								{FOCAL_LABELS[focal] ?? focal}
							</option>
						))}
					</select>
					<button
						type="button"
						className="float-ai-btn accent"
						onClick={async () => {
							const prompt = buildPanelPrompt({
								environment: meta.environment || page.props.environment,
								lighting: page.props.lighting,
								shot: meta.shot,
								angle: meta.angle,
								focal: meta.focal,
								aspect: meta.aspect,
								beat: `${meta.beat} ${customInput}`.trim(),
								locks: '@kanta @mei @boss',
								corner: safeCorner('top-right'),
							})
							const dataUrl = await askImage(prompt, meta.aspect)
							updateMeta({ imageSeed: `${meta.imageSeed}~`, imageDataUrl: dataUrl })
							setFeedback(`🎨 已重绘第 ${panelIdx + 1} 格`)
						}}
					>
						🎨 AI 重绘本格
					</button>
				</>
			) : null}

			<div className="float-custom-input">
				<input
					type="text"
					value={customInput}
					onChange={(event) => setCustomInput(event.target.value)}
					placeholder="💬 输入指令让 LLM 美化本页分镜…"
				/>
				<button
					type="button"
					onClick={async () => {
						const msg = await polishPageWithAi(editor, customInput || '强化镜头节奏与台词表现力')
						setFeedback(msg)
					}}
				>
					AI 润色
				</button>
			</div>
			{feedback ? <span className="float-feedback">{feedback}</span> : null}
		</div>
	)
}

export function CompareModal({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
	if (!editor) return null
	const page = selectedPages(editor)[0]
	if (!page) return null
	const config = configFor(page.props.layoutPreset, page.props.targetPanels)
	const { top, ms } = pickTopLayouts(page.props.seed, config, page.props.targetPanels, asScenario(page.props.scenario), 36)
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box wide" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>
						📊 36 种子打分四选一 · {page.props.title}（场景：{SCENARIO_LABELS[page.props.scenario] ?? page.props.scenario} · 耗时 {ms}ms）
					</h3>
					<button type="button" onClick={onClose}>
						关闭
					</button>
				</header>
				<div className="compare-grid">
					{top.map((candidate) => {
						const panels = candidate.layout.panels.map((panel, index) => ({
							pts: panel.pts,
							meta: metas[index] ?? {
								imageSeed: `${candidate.seed}-p${index}`,
								imageOffsetX: 0,
								imageOffsetY: 0,
								imageScale: 1,
								imageRotation: 0,
								aspect: '1:1',
								shot: 'MS' as const,
								angle: 'eye' as const,
								focal: '50mm' as const,
								beat: '',
								who: ['kanta'],
								fries: 'none' as const,
								eyeline: [8, -4] as [number, number],
								imageDataUrl: '',
								environment: page.props.environment,
							},
							environment: page.props.environment,
							lighting: page.props.lighting,
							energy: page.props.scenario === 'action' ? ('burst' as const) : ('calm' as const),
						}))
						const svg = renderPageSvg({
							uid: candidate.seed,
							title: candidate.seed,
							width: candidate.layout.width,
							height: candidate.layout.height,
							inner: candidate.layout.inner,
							panels,
							bubbles: [],
							numbers: 'on',
							director: true,
						})
						return (
							<div
								key={candidate.seed}
								className="candidate"
								onClick={() => {
									applyLayoutChoice(editor, page, {
										seed: candidate.seed,
										genome: candidate.layout.genome,
										score: candidate.score,
										reasons: candidate.reasons,
									})
									onClose()
								}}
							>
								<div className="cand-svg" dangerouslySetInnerHTML={{ __html: svg }} />
								<div className="cand-foot">
									<strong>评分 {Math.round(candidate.score * 100)} 分</strong>
									<span>{candidate.reasons.join(' · ')}</span>
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export function ReaderModal({ book, onClose }: { book: CompiledBook; onClose: () => void }) {
	const [mode, setMode] = useState<'spread' | 'webtoon' | 'panel' | 'bible'>('spread')
	const [spreadIdx, setSpreadIdx] = useState(0)
	const [panelStep, setPanelStep] = useState(0)
	const spreads: CompiledBook['pages'][] = []
	for (let index = 0; index < book.pages.length; index += 2) spreads.push(book.pages.slice(index, index + 2))
	const flatPanels = book.pages.flatMap((page, pagePosition) =>
		page.panels.map((panel) => ({
			pagePosition,
			pageTitle: `${page.chapterTitle} · ${page.specTitle}`,
			svg: page.svg,
			width: page.width,
			height: page.height,
			panel,
		})),
	)
	const activeSpread = spreads[Math.min(spreadIdx, Math.max(0, spreads.length - 1))] ?? []
	const activePanel = flatPanels[Math.min(panelStep, Math.max(0, flatPanels.length - 1))]

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box reader" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>📖 {book.spec.title} · 整书四模式预览</h3>
					<div className="tabs">
						<button type="button" className={mode === 'spread' ? 'on' : ''} onClick={() => setMode('spread')}>
							日漫右翻双页
						</button>
						<button type="button" className={mode === 'webtoon' ? 'on' : ''} onClick={() => setMode('webtoon')}>
							条漫纵向滚动
						</button>
						<button type="button" className={mode === 'panel' ? 'on' : ''} onClick={() => setMode('panel')}>
							分镜格逐格推镜
						</button>
						<button type="button" className={mode === 'bible' ? 'on' : ''} onClick={() => setMode('bible')}>
							角色与世界设定集
						</button>
					</div>
					<button type="button" onClick={onClose}>
						关闭
					</button>
				</header>
				{mode === 'spread' ? (
					<div className="spread-body">
						<div className="spread-stage">
							{activeSpread.map((page) => (
								<div key={page.id} className="spread-leaf" dangerouslySetInnerHTML={{ __html: page.svg }} />
							))}
						</div>
						<div className="pager">
							<button type="button" onClick={() => setSpreadIdx(Math.min(spreads.length - 1, spreadIdx + 1))}>
								← 下一页（向左翻）
							</button>
							<span>
								第 {spreadIdx + 1} / {spreads.length} 跨页
							</span>
							<button type="button" onClick={() => setSpreadIdx(Math.max(0, spreadIdx - 1))}>
								上一页（向右翻） →
							</button>
						</div>
					</div>
				) : null}
				{mode === 'webtoon' ? (
					<div className="webtoon-body">
						{book.pages.map((page) => (
							<div key={page.id} className="webtoon-leaf" dangerouslySetInnerHTML={{ __html: page.svg }} />
						))}
					</div>
				) : null}
				{mode === 'panel' && activePanel ? (
					<div className="spread-body">
						<div
							className="panel-stage"
							dangerouslySetInnerHTML={{
								__html: activePanel.svg.replace(
									/viewBox="[^"]*"/,
									`viewBox="${activePanel.panel.minX - 18} ${activePanel.panel.minY - 18} ${activePanel.panel.maxX - activePanel.panel.minX + 36} ${activePanel.panel.maxY - activePanel.panel.minY + 36}"`,
								),
							}}
						/>
						<div className="pager">
							<button type="button" onClick={() => setPanelStep(Math.max(0, panelStep - 1))}>
								上一格
							</button>
							<span>
								{activePanel.pageTitle} · 第 {activePanel.panel.n} 格（{SHOT_LABELS[activePanel.panel.shot] ?? activePanel.panel.shot} /{' '}
								{ANGLE_LABELS[activePanel.panel.angle] ?? activePanel.panel.angle} / {activePanel.panel.focal}）
							</span>
							<button type="button" onClick={() => setPanelStep(Math.min(flatPanels.length - 1, panelStep + 1))}>
								下一格
							</button>
						</div>
					</div>
				) : null}
				{mode === 'bible' ? (
					<div className="bible-body">
						<p>{book.spec.bible.story}</p>
						<p>{book.spec.bible.worldRules}</p>
						<div className="bible-chars">
							{book.spec.bible.characters.map((char, index) => (
								<div key={char.tag} className="bible-char">
									<strong>
										{char.name} ({char.tag})
									</strong>
									<p>{char.appearance}</p>
									<div dangerouslySetInnerHTML={{ __html: book.sheets[index] ?? '' }} />
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>
		</div>
	)
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const [form, setForm] = useState<ApiSettings>(() => loadSettings())
	const [health, setHealth] = useState<string>('正在检测本地代理与离线引擎状态…')
	useEffect(() => {
		fetch('/api/health')
			.then((res) => res.json())
			.then((data: { ok?: boolean; capabilities?: string[]; env?: Record<string, boolean> }) => {
				const envKeys = Object.entries(data.env ?? {})
					.filter(([, on]) => on)
					.map(([key]) => key)
				setHealth(
					data.ok
						? `✅ 多模态代理就绪（支持 ${data.capabilities?.join(' / ') || 'text / vision / image'}${envKeys.length ? `；环境变量已检测到 ${envKeys.join(', ')}` : '；未填 Key 时自动启用内置中文离线引擎'}）`
						: '⚠️ 仅离线引擎',
				)
			})
			.catch(() => setHealth('✅ 内置离线中文模型与手绘网点引擎已就绪'))
	}, [])

	const selectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setForm(next)
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box llm-modal" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>⚙️ 内置多模态大模型配置中心（文本 Text · 视觉 Vision · 图像 Image）</h3>
					<button type="button" onClick={onClose}>
						关闭
					</button>
				</header>
				<div className="settings-form">
					<p className="hint">{health}</p>
					<div className="preset-bar">
						{PROVIDER_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								className={form.provider === preset.id ? 'preset-pill active' : 'preset-pill'}
								onClick={() => selectPreset(preset.id)}
							>
								一键预设：{preset.label}
							</button>
						))}
					</div>

					<label className="check">
						<input type="checkbox" checked={form.useApi} onChange={(event) => setForm({ ...form, useApi: event.target.checked })} />
						启用在线多模态 API（不勾选或未填 Key 时，所有卡片润色、Vision 识图与漫画生图均由内置离线引擎即时响应）
					</label>

					<div className="settings-columns">
						<div className="model-group-card">
							<h4>📝 1. 文本模型 (Text LLM)</h4>
							<label>
								服务商
								<select value={form.provider} onChange={(event) => selectPreset(event.target.value as ProviderId)}>
									{PROVIDER_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Base URL
								<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
							</label>
							<label>
								API Key
								<input
									type="password"
									value={form.apiKey}
									onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
									placeholder="留空则使用环境变量或内置离线引擎"
								/>
							</label>
							<label>
								Text Model（用于拆剧本、润色文字卡、改写台词）
								<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
							</label>
						</div>

						<div className="model-group-card">
							<h4>👁️ 2. 视觉模型 (Vision LLM)</h4>
							<label>
								视觉服务商
								<select
									value={form.visionProvider}
									onChange={(event) => setForm({ ...form, visionProvider: event.target.value as ProviderId })}
								>
									{PROVIDER_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Vision Model（用于图像卡识图反推、人设提取、构图审计）
								<input value={form.visionModel} onChange={(event) => setForm({ ...form, visionModel: event.target.value })} />
							</label>

							<h4 style={{ marginTop: 12 }}>🎨 3. 图像生成模型 (Image Gen)</h4>
							<label>
								生图服务商
								<select
									value={form.imageProvider}
									onChange={(event) => setForm({ ...form, imageProvider: event.target.value as ProviderId })}
								>
									{PROVIDER_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Image Model（用于图像参考卡重绘与分镜格画面生成）
								<input value={form.imageModel} onChange={(event) => setForm({ ...form, imageModel: event.target.value })} />
							</label>
						</div>
					</div>

					<label>
						全局系统提示词附加约束
						<input value={form.systemAppendix} onChange={(event) => setForm({ ...form, systemAppendix: event.target.value })} />
					</label>

					<button
						type="button"
						className="primary"
						onClick={() => {
							saveSettings(form)
							onClose()
						}}
					>
						💾 保存多模态模型配置
					</button>
				</div>
			</div>
		</div>
	)
}

export { ENV_IDS, ENV_LABELS, LIGHT_IDS, LIGHT_LABELS, type BlockId }
