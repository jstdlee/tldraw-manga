import { useEffect, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { applyProviderPreset, loadSettings, PROVIDER_PRESETS, saveSettings, type ApiSettings, type ProviderId } from '../ai/settings'
import {
	ANGLE_LABELS,
	BUBBLE_LABELS,
	bookFromText,
	PRESET_LABELS,
	SAMPLE_STORIES,
	SCENARIO_LABELS,
	SHOT_LABELS,
} from '../demo/book'
import {
	addBubbleToPage,
	addStandaloneProsodyToPage,
	applyEditorialRemedyOnPage,
	fillRealInterrogationArtworkOnPage,
	applyEmotionStrategyOnPage,
	applyLayoutChoice,
	applyOpticsToPanel,
	applySelectedCardAiAction,
	applyUniversalFiveStagePreset,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	getPageDiff,
	mutateSelectedPages,
	polishPageWithAi,
	rerollSelectedPages,
	revertPageDiff,
	rewriteStoryWithLlm,
	runBlock,
	extendNextPageFromPage,
	runJevFiveStageCompile,
	selectedPages,
	spawnBook,
	spawnPromptBlock,
	togglePanelBleedOnPage,
	togglePanelNestOnPage,
	toggleSilentPanelOnPage,
	updatePageParametric,
} from '../editor/pipeline'
import { compileProgrammaticLayoutGenome, listUniversalPresets } from '../jev/fiveStageEngine'
import { readerHtml } from '../export/htmlReader'
import { downloadBlob, downloadText, exportPagePng2400, exportPageSvgFile } from '../export/ora'
import {
	configFor,
	generate,
	locatePanelGene,
	PAGE_RATIOS,
	realize,
	ROW_RANGES,
	sanitize,
	type Genome,
} from '../layout/engine'
import {
	asScenario,
	EMOTION_DIRECTION_TIPS,
	layoutFeatures,
	layoutScore,
	pickLayoutBundle,
	SCENARIOS,
} from '../layout/score'
import {
	PROSODY_STYLE_LABELS,
	readJson,
	readPageParams,
	type Beat,
	type BubbleStyle,
	type PanelMeta,
	type ProsodyStyle,
} from '../model'
import { auditCameraAxis, computeOptics, defaultOpticsForMeta, SENSORS, type SensorId } from '../optics/shotLab'
import { ANGLES, PROMPT_BLOCKS } from '../prompts/library'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'
import { BUBBLE, CARD, CONTAINER, type MangaBubble, type MangaCard, type MangaContainer } from '../shapes/schema'
import { compileBook, type CompiledBook } from '../spec/compile'
import { openPageContextInspector } from './contextMenu'
import {
	IconBook,
	IconBubble,
	IconCamera,
	IconCheck,
	IconClose,
	IconCompass,
	IconDownload,
	IconEye,
	IconFileText,
	IconGrid,
	IconImage,
	IconLayers,
	IconMoon,
	IconPlay,
	IconPlus,
	IconRefresh,
	IconSend,
	IconSettings,
	IconSliders,
	IconSparkles,
	IconSun,
	IconUser,
	IconWand,
} from './icons'

const PRESETS = ['seizen', 'std', 'action', 'tobira'] as const
const BUBBLES: BubbleStyle[] = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']
const PROSODY_STYLES: ProsodyStyle[] = ['pill', 'seal', 'slant', 'burst', 'minimal', 'off']

// Chinese display labels for the story-agnostic universal 5-stage presets.
const UNIVERSAL_PRESET_LABELS: Record<string, string> = {
	'seagull-fries': '海堤双鸥 · 水彩哲思',
	'noir-watchmaker': '雨夜审讯室 · 停摆怀表 (硬派青年漫)',
	'shonen-blade': '风暴神社 · 热血决斗',
}

export type SidebarTab = 'cards' | 'layout' | 'story' | 'camera' | 'llm'

export function TopBar({
	editor,
	story: _story,
	status,
	setStatus,
	onOpenCompare: _onOpenCompare,
	onOpenReader,
	onOpenSettings,
	onSwitchTab,
	theme,
	onToggleTheme,
	drawerOpen = true,
	onToggleDrawer,
}: {
	editor: Editor | null
	story: string
	status: string
	setStatus: (value: string) => void
	onOpenCompare: () => void
	onOpenReader: (book: CompiledBook) => void
	onOpenSettings: () => void
	onSwitchTab: (tab: SidebarTab) => void
	theme: 'light' | 'dark'
	onToggleTheme: () => void
	drawerOpen?: boolean
	onToggleDrawer?: () => void
}) {
	const settings = loadSettings()
	const run = async (label: string, fn: (ed: Editor) => Promise<string | void> | string | void) => {
		if (!editor) return
		setStatus(`正在执行：${label}…`)
		const result = await fn(editor)
		setStatus(typeof result === 'string' && result ? result : `${label}完成`)
	}

	return (
		<header className="topbar apple-clean-topbar">
			<div className="brand-cluster">
				{onToggleDrawer ? (
					<button
						type="button"
						className={`drawer-toggle-btn ${drawerOpen ? 'active' : ''}`}
						onClick={onToggleDrawer}
						title={drawerOpen ? '收起左侧工作台抽屉（全屏画布模式）' : '展开左侧工作台抽屉'}
					>
						<IconSliders /> {drawerOpen ? '收起抽屉' : '工作台抽屉'}
					</button>
				) : null}
				<div className="brand">
					<strong>tldraw-manga</strong>
					<span>单页流水线漫剧制作台</span>
				</div>
			</div>

			<div className="pipeline-steps">
				<div className="step-group">
					<select
						className="universal-preset-select"
						aria-label="切换故事预设"
						title="切换内置故事与设定集预设"
						value=""
						onChange={(event) => {
							const presetId = event.target.value
							if (!presetId) return
							void run('切换故事预设', (ed) => applyUniversalFiveStagePreset(ed, presetId))
							event.currentTarget.value = ''
						}}
					>
						<option value="" disabled>
							故事预设…
						</option>
						{listUniversalPresets().map((preset) => (
							<option key={preset.id} value={preset.id}>
								{UNIVERSAL_PRESET_LABELS[preset.id] ?? preset.title}
							</option>
						))}
					</select>

					<button
						type="button"
						title="对当前页运行 JEV 五阶段分镜编译与视线动线求解"
						onClick={() => void run('JEV 五阶段编译', (ed) => runJevFiveStageCompile(ed))}
					>
						<IconLayers /> 编译本页
					</button>

					<button
						type="button"
						title="浏览或编辑当前页继承的角色、道具、180°视线轴与剧情 Context"
						onClick={() => {
							if (!editor) return
							const page = selectedPages(editor)[0]
							if (page) openPageContextInspector(page.id)
						}}
					>
						<IconCompass /> 本页 Context 设定
					</button>

					<button
						type="button"
						className="primary"
						title="以当前页为母本，继承锁定设定与180°镜头轴线延续生成下一页 (P+1)"
						onClick={() =>
							void run('流水线延续下一页', (ed) => {
								const active = selectedPages(ed)[0]
								return extendNextPageFromPage(ed, active?.id).message
							})
						}
					>
						<IconPlus /> 续写下一页 (继承 Context)
					</button>
				</div>
			</div>

			<div className="status-pill" title={status}>
				{status}
			</div>

			<div className="topbar-right-actions">
				<button
					type="button"
					onClick={() => {
						if (!editor) return
						onOpenReader(compileBook(editor))
					}}
					title="打开整书翻页/条漫阅读器"
				>
					<IconBook /> 阅读预览
				</button>
				<button
					type="button"
					onClick={() => {
						if (!editor) return
						const book = compileBook(editor)
						downloadText(`${book.spec.title}.html`, readerHtml(book), 'text/html;charset=utf-8')
						setStatus('已导出单文件 HTML 阅读器')
					}}
					title="导出独立 HTML 漫剧阅读器"
				>
					<IconDownload /> 导出
				</button>
				<button
					type="button"
					className="llm-status-pill"
					onClick={() => {
						onSwitchTab('llm')
						onOpenSettings()
					}}
					title={`当前模型：${settings.model} / ${settings.imageModel}`}
				>
					<span className="dot" />
					<span>
						<IconSettings /> 模型设置
					</span>
				</button>
				<button
					type="button"
					onClick={onToggleTheme}
					title="切换浅色 / 深色主题"
				>
					{theme === 'light' ? <IconMoon /> : <IconSun />}
				</button>
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
	onOpenCompare,
}: {
	editor: Editor | null
	story: string
	setStory: (value: string) => void
	setStatus: (value: string) => void
	activeTab: SidebarTab
	setActiveTab: (tab: SidebarTab) => void
	onOpenCompare?: () => void
}) {
	const [globalCustomPrompt, setGlobalCustomPrompt] = useState('强化正午硬光对比与动作分镜张力，高潮前留一格静帧')
	const [cardQuickPrompt, setCardQuickPrompt] = useState('')
	const [settings, setSettings] = useState<ApiSettings>(() => loadSettings())

	const activePage = useValue(
		'active-page',
		() => {
			if (!editor) return null
			return selectedPages(editor)[0] ?? null
		},
		[editor],
	)

	const updateSettings = (patch: Partial<ApiSettings>) => {
		const next = saveSettings(patch)
		setSettings(next)
	}

	const handleSelectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setSettings(next)
		setStatus(`已切换模型预设为 ${PROVIDER_PRESETS.find((p) => p.id === provider)?.label ?? provider}`)
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-tabs" role="tablist" aria-label="制作流程阶段">
				<button type="button" className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>
					<IconFileText /> 1.设定卡
				</button>
				<button type="button" className={activeTab === 'layout' ? 'active' : ''} onClick={() => setActiveTab('layout')}>
					<IconGrid /> 2.版式台
				</button>
				<button type="button" className={activeTab === 'story' ? 'active' : ''} onClick={() => setActiveTab('story')}>
					<IconBubble /> 3.分镜台词
				</button>
				<button type="button" className={activeTab === 'camera' ? 'active' : ''} onClick={() => setActiveTab('camera')}>
					<IconCamera /> 4.镜头构图
				</button>
				<button type="button" className={activeTab === 'llm' ? 'active' : ''} onClick={() => setActiveTab('llm')}>
					<IconSettings /> 5.模型节点
				</button>
			</div>

			<div className="sidebar-body">
				{activeTab === 'cards' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>新建设定卡（文字卡 / 视觉参考卡）</h3>
								<span>多模态组件</span>
							</div>
							<p className="side-hint">在无限画布中放置设定卡并连线至章节或分镜页，卡片自带润色、重生、Vision 识图反推与一键回退：</p>
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
										setStatus('已在画布创建「文字设定卡」，可直接点击卡上按钮润色或改写')
									}}
								>
									<strong>
										<IconPlus /> 文字设定卡
									</strong>
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
										setStatus('已在画布创建「图像参考卡」，支持 Vision 识图反推与 AI 重绘')
									}}
								>
									<strong>
										<IconImage /> 图像参考卡
									</strong>
									<small>参考图/概念图 · Vision 反推与 AI 生图</small>
								</button>
							</div>

							<div className="char-row">
								{[
									{ tag: '@kanta', name: '勘太三视图卡', desc: '凌乱黑发，深蓝连帽卫衣，领口挂旧护目镜，右颊一贴创可贴' },
									{ tag: '@mei', name: '芽衣三视图卡', desc: '利落短发配发卡，浅色长风衣，斜挎老胶片相机，眼神冷静' },
									{ tag: '@boss', name: '头目鸥视觉卡', desc: '体型硕大的银背海鸥，左眼一道旧疤，左脚套金属环，翼展极宽' },
								].map((char) => (
									<button
										key={char.tag}
										type="button"
										onClick={() => {
											if (!editor) return
											createImageCardOnCanvas(editor, 'character', char.name, char.tag, char.desc)
											setStatus(`已在画布放置 ${char.name}`)
										}}
									>
										<IconUser /> + {char.name}
									</button>
								))}
							</div>
						</section>

						<section className="side-section">
							<div className="sec-head">
								<h3>选中卡片 / 分镜 AI 快捷台</h3>
								<span>A/B 对比可回退</span>
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
										<IconSparkles /> AI 润色美化
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
												setStatus('已重新生成选中页分镜排布')
											}
										}}
									>
										<IconRefresh /> AI 重新生成
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'vision', cardQuickPrompt))
											} else {
												const imgCard = editor
													.getCurrentPageShapes()
													.find((s): s is MangaCard => s.type === CARD && (s.props.kind === 'image' || s.props.kind === 'character'))
												if (imgCard) {
													editor.select(imgCard.id)
													setStatus(await applySelectedCardAiAction(editor, imgCard, 'vision', cardQuickPrompt))
												}
											}
										}}
									>
										<IconEye /> Vision 识图反推
									</button>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card && (card.props.kind === 'image' || card.props.kind === 'character')) {
												setStatus(await applySelectedCardAiAction(editor, card, 'redraw', cardQuickPrompt))
											} else {
												setStatus(await runBlock(editor, 'render'))
											}
										}}
									>
										<IconWand /> AI 图像重绘
									</button>
								</div>
								<div className="quick-prompt-row">
									<input
										type="text"
										value={cardQuickPrompt}
										onChange={(event) => setCardQuickPrompt(event.target.value)}
										placeholder="输入自定义指令（如：改成赛博朋克雨夜、强化仰拍压迫感）…"
									/>
									<button
										type="button"
										onClick={async () => {
											if (!editor) return
											const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
											if (card) {
												setStatus(await applySelectedCardAiAction(editor, card, 'polish', cardQuickPrompt || '强化漫画镜头张力'))
											} else {
												setStatus(await polishPageWithAi(editor, cardQuickPrompt || '强化镜头与台词张力'))
											}
										}}
									>
										<IconSend /> 执行
									</button>
								</div>
							</div>
						</section>
					</>
				) : null}

				{activeTab === 'layout' ? (
					<LayoutWorkbenchSection
						editor={editor}
						page={activePage}
						setStatus={setStatus}
						onOpenCompare={onOpenCompare}
					/>
				) : null}

				{activeTab === 'story' ? (
					<StoryAndDialogueSection
						editor={editor}
						page={activePage}
						story={story}
						setStory={setStory}
						globalCustomPrompt={globalCustomPrompt}
						setGlobalCustomPrompt={setGlobalCustomPrompt}
						setStatus={setStatus}
					/>
				) : null}

				{activeTab === 'camera' ? (
					<CameraAndCompositionSection
						editor={editor}
						page={activePage}
						setStatus={setStatus}
					/>
				) : null}

				{activeTab === 'llm' ? (
					<>
						<section className="side-section">
							<div className="sec-head">
								<h3>画布 AI 提示词算子节点</h3>
								<span>可拖入画布连线</span>
							</div>
							<div className="block-list">
								{PROMPT_BLOCKS.map((block) => (
									<div key={block.id} className="block-card">
										<div className="block-top">
											<strong>{block.title.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+\s*/, '')}</strong>
											<div className="block-btns">
												<button
													type="button"
													onClick={async () => {
														if (!editor) return
														setStatus(`正在运行 ${block.title}…`)
														const note = await runBlock(editor, block.id)
														setStatus(note)
													}}
												>
													运行
												</button>
												<button
													type="button"
													onClick={() => {
														if (!editor) return
														spawnPromptBlock(editor, block.id)
														setStatus(`已将「${block.title}」节点放置到画布中央`)
													}}
												>
													+ 放画布
												</button>
											</div>
										</div>
										<p>{block.summary}</p>
									</div>
								))}
							</div>
						</section>

						<section className="side-section llm-config-panel">
							<div className="sec-head">
								<h3>内置多模态模型配置中心</h3>
								<span>Text · Vision · Image</span>
							</div>
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
								<h4>1. 文本大模型 (Text LLM · 剧本/润色/提示词)</h4>
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
									API Key
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
										placeholder="gpt-4o-mini / gemini-2.5-flash"
									/>
								</label>
							</div>

							<div className="model-group-card">
								<h4>2. 视觉与生图模型 (Vision & Image LLM)</h4>
								<label>
									视觉模型名称 (Vision Model)
									<input
										value={settings.visionModel}
										onChange={(event) => updateSettings({ visionModel: event.target.value })}
										placeholder="gpt-4o / gemini-2.5-flash"
									/>
								</label>
								<label>
									生图模型名称 (Image Model)
									<input
										value={settings.imageModel}
										onChange={(event) => updateSettings({ imageModel: event.target.value })}
										placeholder="gpt-image-1 / flux-1.1-pro"
									/>
								</label>
							</div>
						</section>
					</>
				) : null}
			</div>
		</aside>
	)
}

function LayoutWorkbenchSection({
	editor,
	page,
	setStatus,
	onOpenCompare,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
	onOpenCompare?: () => void
}) {
	if (!editor || !page) {
		return (
			<section className="side-section">
				<div className="sec-head">
					<h3>版式生成与主编评分台</h3>
					<span>请选择分镜页</span>
				</div>
				<p className="side-hint">在画布上点击任意分镜页容器，即可调节几何斜切、出血率与 6 轴主编评分。</p>
			</section>
		)
	}

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const layout = realize(genome, config)
	const judged = layoutScore(layoutFeatures(layout), page.props.targetPanels, asScenario(page.props.scenario))

	const rawBeats = readJson<Beat[]>(page.props.scriptJson, [])
	const progDecision = compileProgrammaticLayoutGenome(rawBeats, asScenario(page.props.scenario), page.props.seed)

	return (
		<>
			<section className="side-section">
				<div className="sec-head">
					<h3>0. JEV 决策模型程式化版式与视角锁定</h3>
					<span>Stage 2 → 3 确定性收敛</span>
				</div>
				<div className="emotion-tip-card" style={{ marginBottom: 8 }}>
					<strong>张力曲线 τ_t → 14因子机位 + 多边形行高/斜切/列宽程式化合成</strong>
					<div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5, marginTop: 4, maxHeight: 120, overflowY: 'auto', background: 'rgba(248,250,252,0.9)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)' }}>
						{progDecision.decisionTrace.map((line, i) => (
							<div key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5 }}>
								{line}
							</div>
						))}
					</div>
					<div className="quick-ai-grid" style={{ marginTop: 6 }}>
						<button
							type="button"
							className="primary-full"
							onClick={() => {
								setStatus(runJevFiveStageCompile(editor))
							}}
						>
							<IconSparkles /> 一键执行 JEV 程式化版式 + 14因子视角锁定
						</button>
						<button
							type="button"
							onClick={() => {
								setStatus(fillRealInterrogationArtworkOnPage(editor, page))
							}}
						>
							<IconImage /> 载入真实AI分镜原画
						</button>
					</div>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>1. 版式预设与几何参数 · {page.props.title}</h3>
					<span>{layout.panels.length} 格</span>
				</div>

				<div className="preset-pill-row" role="group" aria-label="四大经典版式预设">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							className={page.props.layoutPreset === preset ? 'preset-pill active' : 'preset-pill'}
							onClick={() => {
								const nextConfig = configFor(preset, page.props.targetPanels)
								const best = pickLayoutBundle(page.props.seed, nextConfig, page.props.targetPanels, asScenario(page.props.scenario), { count: 8 }).top[0]
								editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { layoutPreset: preset, mood: '' } })
								const refreshed = editor.getShape<MangaContainer>(page.id) ?? page
								applyLayoutChoice(editor, refreshed, {
									seed: best.seed,
									genome: best.layout.genome,
									score: best.score,
									reasons: best.reasons,
								})
								setStatus(`已切换版式预设为「${PRESET_LABELS[preset] ?? preset}」`)
							}}
						>
							{(PRESET_LABELS[preset] ?? preset).split(' ')[0]}
						</button>
					))}
				</div>

				<div className="param-grid-2">
					<label>
						画幅比例
						<select
							aria-label="画幅比例"
							value={String(overrides.ratio)}
							onChange={(event) => {
								setStatus(updatePageParametric(editor, page, { ratio: Number(event.target.value) }, true))
							}}
						>
							{PAGE_RATIOS.map((r) => (
								<option key={r.id} value={String(r.ratio)}>
									{r.label}
								</option>
							))}
						</select>
					</label>
					<label>
						段数范围 (Row Range)
						<select
							aria-label="段数范围"
							value={overrides.rowRange}
							onChange={(event) => {
								setStatus(
									updatePageParametric(
										editor,
										page,
										{ rowRange: event.target.value as '1-3' | '2-3' | '2-4' | '3-4' },
										true,
									),
								)
							}}
						>
							{ROW_RANGES.map((r) => (
								<option key={r.id} value={r.id}>
									{r.label}
								</option>
							))}
						</select>
					</label>
				</div>

				<div className="slider-stack">
					<label className="slider-row">
						<span>斜切度 (Tilt)</span>
						<code>{Math.round((overrides.tilt ?? 0.25) * 100)}%</code>
						<input
							type="range"
							aria-label="斜切度"
							min={0}
							max={1}
							step={0.05}
							value={overrides.tilt ?? 0.25}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { tilt: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>出血率 (Bleed)</span>
						<code>{Math.round((overrides.bleed ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="出血率"
							min={0}
							max={1}
							step={0.05}
							value={overrides.bleed ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { bleed: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>嵌套率 (Nest)</span>
						<code>{Math.round((overrides.nest ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="嵌套率"
							min={0}
							max={1}
							step={0.05}
							value={overrides.nest ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { nest: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>大格权重 (Big)</span>
						<code>{Math.round((overrides.big ?? 0.2) * 100)}%</code>
						<input
							type="range"
							aria-label="大格权重"
							min={0}
							max={1}
							step={0.05}
							value={overrides.big ?? 0.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { big: Number(event.target.value) }, true))}
						/>
					</label>
					<label className="slider-row">
						<span>框线粗细 (LineW)</span>
						<code>{(overrides.lineW ?? 3.2).toFixed(1)}px</code>
						<input
							type="range"
							aria-label="框线粗细"
							min={1.8}
							max={7.5}
							step={0.2}
							value={overrides.lineW ?? 3.2}
							onChange={(event) => setStatus(updatePageParametric(editor, page, { lineW: Number(event.target.value) }, false))}
						/>
					</label>
				</div>

				<div className="quick-ai-grid" style={{ marginTop: 8 }}>
					<button
						type="button"
						onClick={() => {
							mutateSelectedPages(editor, overrides.mutationStrength)
							setStatus(`已按当前基因派生局部变体（强度 ${Math.round((overrides.mutationStrength ?? 0.45) * 100)}%）`)
						}}
					>
						<IconSliders /> 以此页派生变体
					</button>
					{onOpenCompare ? (
						<button type="button" onClick={onOpenCompare}>
							<IconGrid /> 打开 8 选 1 候选包
						</button>
					) : null}
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>2. 主编 6 轴评分与一键诊断修复</h3>
					<span>总评 {Math.round(judged.score * 100)} 分</span>
				</div>
				<div className="rubric-bars">
					{[
						{ key: 'pacing', label: '节奏匹配', val: judged.axes.pacing },
						{ key: 'hierarchy', label: '主次层级', val: judged.axes.hierarchy },
						{ key: 'flow', label: '右→左动线', val: judged.axes.flow },
						{ key: 'tension', label: '斜切张力', val: judged.axes.tension },
						{ key: 'bleedHook', label: '翻页钩子', val: judged.axes.bleedHook },
						{ key: 'balance', label: '版面均衡', val: judged.axes.balance },
					].map((item) => (
						<div key={item.key} className="rubric-row">
							<span>{item.label}</span>
							<div className="rubric-track">
								<div className="rubric-fill" style={{ width: `${Math.round(item.val * 100)}%` }} />
							</div>
							<code>{Math.round(item.val * 100)}</code>
						</div>
					))}
				</div>

				<div className="remedy-box">
					<div className="remedy-head">
						<span>诊断缺陷：{judged.deficits[0]}</span>
					</div>
					<div className="remedy-list">
						{judged.remedies.map((rem) => (
							<button
								key={rem.id}
								type="button"
								className="remedy-btn"
								onClick={() => {
									setStatus(applyEditorialRemedyOnPage(editor, page, rem))
								}}
								title={rem.description}
							>
								<IconCheck /> {rem.actionLabel}
							</button>
						))}
					</div>
				</div>
			</section>
		</>
	)
}

function StoryAndDialogueSection({
	editor,
	page,
	story,
	setStory,
	globalCustomPrompt,
	setGlobalCustomPrompt,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	story: string
	setStory: (value: string) => void
	globalCustomPrompt: string
	setGlobalCustomPrompt: (value: string) => void
	setStatus: (value: string) => void
}) {
	const metas = page ? readJson<PanelMeta[]>(page.props.panelsJson, []) : []
	const panelIdx = page ? (page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0) : 0
	const currentMeta = metas[panelIdx]
	const pageDiff = page ? getPageDiff(page.id) : null
	const currentScenario = asScenario(page?.props.scenario ?? 'tension')
	const tip = EMOTION_DIRECTION_TIPS[currentScenario]

	return (
		<>
			{page ? (
				<section className="side-section">
					<div className="sec-head">
						<h3>1. 情绪分镜锦囊 · {page.props.title}</h3>
						<span>导演技法联动</span>
					</div>
					<div className="preset-pill-row" role="group" aria-label="六大情绪分镜锦囊">
						{SCENARIOS.map((sc) => (
							<button
								key={sc}
								type="button"
								className={currentScenario === sc ? 'preset-pill active' : 'preset-pill'}
								onClick={() => {
									if (!editor) return
									setStatus(applyEmotionStrategyOnPage(editor, page, sc))
								}}
							>
								{EMOTION_DIRECTION_TIPS[sc].label.split(' ')[0]}
							</button>
						))}
					</div>
					<div className="emotion-tip-card">
						<strong>{tip.label}</strong>
						<p>版式法则：{tip.layoutRule}</p>
						<p>镜头节奏：{tip.beatRule}</p>
						<button
							type="button"
							className="primary-full"
							onClick={() => {
								if (!editor) return
								setStatus(applyEmotionStrategyOnPage(editor, page, currentScenario))
							}}
						>
							<IconSparkles /> 一键应用「{tip.label}」分镜排布与节拍
						</button>
					</div>

					{currentMeta ? (
						<div className="panel-beat-editor">
							<div className="sec-head" style={{ marginTop: 10 }}>
								<h3>
									2. 第 {panelIdx + 1} 格分镜节拍与对白
								</h3>
								<span>{currentMeta.silent ? '无声静帧' : '有声对白格'}</span>
							</div>
							<div className="panel-pill-selector">
								{metas.map((m, idx) => (
									<button
										key={idx}
										type="button"
										className={idx === panelIdx ? 'preset-pill active' : 'preset-pill'}
										onClick={() => {
											if (!editor) return
											editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })
										}}
									>
										第{idx + 1}格{m.silent ? '·静' : ''}
									</button>
								))}
							</div>
							<textarea
								rows={2}
								aria-label="当前分镜格画面节拍描述"
								value={currentMeta.beat}
								onChange={(event) => {
									if (!editor) return
									const next = metas.map((m, i) => (i === panelIdx ? { ...m, beat: event.target.value } : m))
									editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
								}}
							/>
							<div className="quick-ai-grid" style={{ marginTop: 6 }}>
								<button
									type="button"
									className={currentMeta.silent ? 'active-toggle-btn' : ''}
									onClick={() => {
										if (!editor) return
										setStatus(toggleSilentPanelOnPage(editor, page, panelIdx))
									}}
								>
									{currentMeta.silent ? '✓ 已设无声留白格' : '设为无声留白格'}
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										addBubbleToPage(editor, page, panelIdx, 'speech', '等一下——！', '冷笑审视', 'pill')
										setStatus(`已在第 ${panelIdx + 1} 格右上安全区添加独立对白气泡图层`)
									}}
								>
									<IconBubble /> + 新增对白气泡
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										addStandaloneProsodyToPage(editor, page, panelIdx, '冷笑审视', 'seal', '咔哒！')
										setStatus(`已在第 ${panelIdx + 1} 格添加独立语气助词/拟声图层`)
									}}
								>
									<IconSparkles /> + 新增独立语气/拟声层
								</button>
								<button
									type="button"
									onClick={() => {
										if (!editor) return
										setStatus(fillRealInterrogationArtworkOnPage(editor, page))
									}}
								>
									<IconImage /> 填入真实AI分镜原画
								</button>
							</div>

							{(() => {
								if (!editor) return null
								const pageBubbles = editor
									.getSortedChildIdsForParent(page.id)
									.map((id) => editor.getShape(id))
									.filter((s): s is MangaBubble => s?.type === BUBBLE)
								return (
									<div className="bubble-layer-workbench" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(148,163,184,0.25)' }}>
										<div className="sec-head" style={{ marginBottom: 6 }}>
											<h3>独立图层总控 · 气泡({pageBubbles.length}) & 语气助词</h3>
											<span>可拖拽位置/改样式</span>
										</div>
										<div className="preset-pill-row" style={{ marginBottom: 8 }}>
											<button
												type="button"
												className={page.props.showBubblesLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showBubblesLayer: page.props.showBubblesLayer === false },
													})
												}
											>
												💬 气泡层 {page.props.showBubblesLayer !== false ? '开' : '关'}
											</button>
											<button
												type="button"
												className={page.props.showProsodyLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showProsodyLayer: page.props.showProsodyLayer === false },
													})
												}
											>
												🏷️ 语气层 {page.props.showProsodyLayer !== false ? '开' : '关'}
											</button>
											<button
												type="button"
												className={page.props.showSfxLayer !== false ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showSfxLayer: page.props.showSfxLayer === false },
													})
												}
											>
												⚡ 拟声层 {page.props.showSfxLayer !== false ? '开' : '关'}
											</button>
											<button
												type="button"
												className={page.props.showFlow ? 'preset-pill active' : 'preset-pill'}
												onClick={() =>
													editor.updateShape<MangaContainer>({
														id: page.id,
														type: CONTAINER,
														props: { showFlow: !page.props.showFlow },
													})
												}
											>
												👁️ 动线 {page.props.showFlow ? '开' : '关'}
											</button>
										</div>

										<div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
											{pageBubbles.map((b, bIdx) => (
												<div
													key={b.id}
													style={{
														padding: '6px 8px',
														borderRadius: 8,
														background: 'rgba(248,250,252,0.95)',
														border: '1px solid rgba(148,163,184,0.35)',
														display: 'flex',
														flexDirection: 'column',
														gap: 4,
													}}
												>
													<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
														<strong
															style={{ cursor: 'pointer', color: '#0066cc' }}
															onClick={() => editor.select(b.id)}
														>
															#{bIdx + 1} 格{b.props.panelIndex + 1} · {BUBBLE_LABELS[b.props.bubble] ?? b.props.bubble}
														</strong>
														<div style={{ display: 'flex', gap: 4 }}>
															<button
																type="button"
																className="link-btn"
																onClick={() => editor.select(b.id)}
															>
																定位选中
															</button>
															<button
																type="button"
																className="link-btn"
																style={{ color: '#dc2626' }}
																onClick={() => editor.deleteShapes([b.id])}
															>
																删除
															</button>
														</div>
													</div>
													<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
														<input
															type="text"
															value={b.props.text}
															placeholder="气泡台词/拟声词…"
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { text: e.target.value },
																})
															}
														/>
														<input
															type="text"
															value={b.props.prosody}
															placeholder="独立语气词（如：冷笑审视）"
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosody: e.target.value },
																})
															}
														/>
													</div>
													<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
														<select
															aria-label={`气泡#${bIdx + 1}框型`}
															value={b.props.bubble}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { bubble: e.target.value as BubbleStyle },
																})
															}
														>
															{BUBBLES.map((st) => (
																<option key={st} value={st}>
																	{BUBBLE_LABELS[st] ?? st}
																</option>
															))}
														</select>
														<select
															aria-label={`气泡#${bIdx + 1}语气样式`}
															value={(b.props.prosodyStyle as ProsodyStyle) || 'pill'}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosodyStyle: e.target.value as ProsodyStyle },
																})
															}
														>
															{PROSODY_STYLES.map((ps) => (
																<option key={ps} value={ps}>
																	语气:{PROSODY_STYLE_LABELS[ps]}
																</option>
															))}
														</select>
														<select
															aria-label={`气泡#${bIdx + 1}语气颜色`}
															value={b.props.prosodyColor || ''}
															onChange={(e) =>
																editor.updateShape<MangaBubble>({
																	id: b.id,
																	type: BUBBLE,
																	props: { prosodyColor: e.target.value },
																})
															}
														>
															<option value="">默认色</option>
															<option value="#0066cc">经典蓝</option>
															<option value="#c93d35">朱印红</option>
															<option value="#18222c">玄墨黑</option>
															<option value="#0f766e">青黛绿</option>
															<option value="#d97706">琥珀金</option>
														</select>
													</div>
												</div>
											))}
										</div>
									</div>
								)
							})()}
							{pageDiff ? (
								<div className="card-diff-bar" style={{ marginTop: 6 }}>
									<span>已应用 AI 导演润色</span>
									<button
										type="button"
										onClick={() => {
											if (!editor) return
											revertPageDiff(editor, page)
											setStatus('已回退本页分镜至 AI 润色前版本')
										}}
									>
										一键回退原版
									</button>
								</div>
							) : null}
						</div>
					) : null}
				</section>
			) : null}

			<section className="side-section">
				<div className="sec-head">
					<h3>3. 故事剧本原稿与 LLM 改写</h3>
					<button
						type="button"
						className="link-btn"
						onClick={() => {
							const pick = SAMPLE_STORIES[Math.floor(Math.random() * SAMPLE_STORIES.length)]
							setStory(pick.text)
							setStatus(`已载入示例剧本《${pick.label}》`)
						}}
					>
						换示例剧本
					</button>
				</div>
				<textarea
					rows={5}
					value={story}
					onChange={(event) => setStory(event.target.value)}
					placeholder="输入分集梗概、角色关系或单场戏剧本…"
				/>
				<input
					type="text"
					value={globalCustomPrompt}
					onChange={(event) => setGlobalCustomPrompt(event.target.value)}
					placeholder="输入全局导演改写指令…"
					style={{ marginTop: 6 }}
				/>
				<div className="story-actions" style={{ marginTop: 6 }}>
					<button
						type="button"
						className="primary-full"
						onClick={async () => {
							setStatus('正在调用 Text LLM 按自定义指令改写剧本…')
							const rewritten = await rewriteStoryWithLlm(story, globalCustomPrompt)
							setStory(rewritten)
							setStatus('Text LLM 已完成剧本改写')
						}}
					>
						<IconSparkles /> 调用 Text LLM 改写剧本
					</button>
					<button
						type="button"
						className="primary-full"
						onClick={() => {
							if (!editor) return
							spawnBook(editor, bookFromText(story))
							setStatus('已按当前剧本重新生成整套设定卡、章节与多边形分镜页')
						}}
					>
						<IconPlay /> 按剧本重建画布漫剧
					</button>
				</div>
			</section>
		</>
	)
}

function CameraAndCompositionSection({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	if (!editor || !page) {
		return (
			<section className="side-section">
				<div className="sec-head">
					<h3>光学镜头与构图取景台</h3>
					<span>请选择分镜格</span>
				</div>
				<p className="side-hint">点击任意分镜页中的分镜格，即可联动调节焦距、光圈景深、画框内推拉摇移与四边出血。</p>
			</section>
		)
	}

	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const genome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])
	const panelIdx = page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0
	const meta = metas[panelIdx] ?? metas[0]
	if (!meta) return null

	const optParams = defaultOpticsForMeta(meta)
	const computed = computeOptics(optParams)
	const geneHit = locatePanelGene(genome, panelIdx)
	const axisAudit = auditCameraAxis(metas)

	const updateMeta = (patch: Partial<PanelMeta>) => {
		const next = metas.map((item, idx) => (idx === panelIdx ? { ...item, ...patch } : item))
		editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { panelsJson: JSON.stringify(next) } })
	}

	return (
		<>
			<section className="side-section">
				<div className="sec-head">
					<h3>
						1. 光学镜头实验室 · {page.props.title} 第 {panelIdx + 1} 格
					</h3>
					<span>实时画面联动</span>
				</div>

				<div className="panel-pill-selector" style={{ marginBottom: 8 }}>
					{metas.map((_, idx) => (
						<button
							key={idx}
							type="button"
							className={idx === panelIdx ? 'preset-pill active' : 'preset-pill'}
							onClick={() => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { selectedPanel: idx } })}
						>
							第{idx + 1}格
						</button>
					))}
				</div>

				<div className="optics-readout-card">
					<div className="optics-stat">
						<small>等效焦距</small>
						<strong>{computed.eqFocalMm}mm</strong>
					</div>
					<div className="optics-stat">
						<small>视场角 FOV</small>
						<strong>{computed.hFovDeg}°</strong>
					</div>
					<div className="optics-stat">
						<small>推导景别</small>
						<strong>{computed.shotLabelZh}</strong>
					</div>
					<div className="optics-stat">
						<small>背景虚化</small>
						<strong>{computed.dofLabelZh}</strong>
					</div>
				</div>

				<div className="param-grid-2" style={{ marginTop: 8 }}>
					<label>
						画幅传感器
						<select
							aria-label="画幅传感器"
							value={optParams.sensor}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { sensor: event.target.value as SensorId }))
							}}
						>
							{SENSORS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</label>
					<label>
						机位俯仰角
						<select
							aria-label="机位俯仰角"
							value={meta.angle}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { angle: event.target.value as PanelMeta['angle'] }))
							}}
						>
							{ANGLES.map((a) => (
								<option key={a} value={a}>
									{ANGLE_LABELS[a] ?? a}
								</option>
							))}
						</select>
					</label>
				</div>

				<div className="slider-stack" style={{ marginTop: 8 }}>
					<label className="slider-row">
						<span>物理焦距 (Focal)</span>
						<code>{optParams.focalMm}mm</code>
						<input
							type="range"
							aria-label="物理焦距"
							min={12}
							max={200}
							step={1}
							value={optParams.focalMm}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { focalMm: Number(event.target.value) }))
							}}
						/>
					</label>
					<label className="slider-row">
						<span>光圈景深 (f-Stop)</span>
						<code>f/{optParams.fStop.toFixed(1)}</code>
						<input
							type="range"
							aria-label="光圈景深"
							min={1.4}
							max={22}
							step={0.2}
							value={optParams.fStop}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { fStop: Number(event.target.value) }))
							}}
						/>
					</label>
					<label className="slider-row">
						<span>主体物距 (Dist)</span>
						<code>{optParams.subjectDistM.toFixed(1)}m</code>
						<input
							type="range"
							aria-label="主体物距"
							min={0.5}
							max={20}
							step={0.5}
							value={optParams.subjectDistM}
							onChange={(event) => {
								setStatus(applyOpticsToPanel(editor, page, panelIdx, { subjectDistM: Number(event.target.value) }))
							}}
						/>
					</label>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>2. 格内构图取景 · 四边独立出血 · 辅助线</h3>
					<span>第 {panelIdx + 1} 格</span>
				</div>

				<div className="slider-stack">
					<label className="slider-row">
						<span>格内推拉缩放</span>
						<code>{(meta.imageScale || 1).toFixed(2)}×</code>
						<input
							type="range"
							aria-label="格内推拉缩放"
							min={0.5}
							max={2.8}
							step={0.05}
							value={meta.imageScale || 1}
							onChange={(event) => updateMeta({ imageScale: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>水平平移 X</span>
						<code>{Math.round(meta.imageOffsetX || 0)}px</code>
						<input
							type="range"
							aria-label="格内水平平移"
							min={-180}
							max={180}
							step={2}
							value={meta.imageOffsetX || 0}
							onChange={(event) => updateMeta({ imageOffsetX: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>垂直平移 Y</span>
						<code>{Math.round(meta.imageOffsetY || 0)}px</code>
						<input
							type="range"
							aria-label="格内垂直平移"
							min={-180}
							max={180}
							step={2}
							value={meta.imageOffsetY || 0}
							onChange={(event) => updateMeta({ imageOffsetY: Number(event.target.value) })}
						/>
					</label>
					<label className="slider-row">
						<span>格内画面倾角</span>
						<code>{Math.round(meta.imageRotation || 0)}°</code>
						<input
							type="range"
							aria-label="格内画面倾角"
							min={-25}
							max={25}
							step={1}
							value={meta.imageRotation || 0}
							onChange={(event) => updateMeta({ imageRotation: Number(event.target.value) })}
						/>
					</label>
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 6 }}>
					<label className="remedy-btn" style={{ cursor: 'pointer', justifyContent: 'center', margin: 0 }}>
						<IconImage /> 上传本地图到此格
						<input
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={(event) => {
								const file = event.target.files?.[0]
								if (!file) return
								const reader = new FileReader()
								reader.onload = () => {
									const dataUrl = typeof reader.result === 'string' ? reader.result : ''
									if (dataUrl) {
										updateMeta({ imageDataUrl: dataUrl, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })
										setStatus(`已将图片「${file.name}」插入第 ${panelIdx + 1} 格，可直接拖拽与滚轮缩放`)
									}
								}
								reader.readAsDataURL(file)
								event.target.value = ''
							}}
						/>
					</label>
					<button
						type="button"
						onClick={() => {
							setStatus(fillRealInterrogationArtworkOnPage(editor, page))
						}}
					>
						<IconSparkles /> 填入整页AI原画
					</button>
				</div>

				<div className="bleed-grid-row" style={{ marginTop: 8 }}>
					{(['bT', 'bB', 'bL', 'bR'] as const).map((edge) => {
						const active = Boolean(geneHit?.gene[edge])
						const label = { bT: '上出血', bB: '下出血', bL: '左出血', bR: '右出血' }[edge]
						return (
							<button
								key={edge}
								type="button"
								className={active ? 'preset-pill active' : 'preset-pill'}
								onClick={() => setStatus(togglePanelBleedOnPage(editor, page, panelIdx, edge))}
							>
								{label}
							</button>
						)
					})}
					<button
						type="button"
						className={geneHit?.gene.nest ? 'preset-pill active' : 'preset-pill'}
						onClick={() => setStatus(togglePanelNestOnPage(editor, page, panelIdx))}
					>
						纵切子格
					</button>
					<button
						type="button"
						className="preset-pill"
						onClick={() => updateMeta({ imageOffsetX: 0, imageOffsetY: 0, imageScale: 1, imageRotation: 0 })}
					>
						取景复位
					</button>
				</div>

				<div className="guide-toggles" style={{ marginTop: 10 }}>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showInnerFrame)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showInnerFrame: event.target.checked }, false))
							}
						/>
						<span>显示 B4 版心安全内框与裁切角线</span>
					</label>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showRuleOfThirds)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showRuleOfThirds: event.target.checked }, false))
							}
						/>
						<span>显示格内九宫格三分构图线</span>
					</label>
					<label className="check-row">
						<input
							type="checkbox"
							checked={Boolean(overrides.showAxis180)}
							onChange={(event) =>
								setStatus(updatePageParametric(editor, page, { showAxis180: event.target.checked }, false))
							}
						/>
						<span>开启 180° 摄像机轴线与视线越轴检查 ({axisAudit.summary})</span>
					</label>
				</div>
			</section>
		</>
	)
}

export function FloatingBar(_props: { onSwitchTab?: (tab: SidebarTab) => void }) {
	const [dismissed, setDismissed] = useState(false)
	if (dismissed) return null
	return (
		<div className="canvas-context-hint-pill" onPointerDown={(e) => e.stopPropagation()}>
			<span className="hint-dot" />
			<span>
				在画格、气泡、页面或空白处 <b>右键点击</b> 使用分组菜单 · 点击页面右侧 <b>+ 续写 P2</b> 流水线继承 Context
			</span>
			<button type="button" onClick={() => setDismissed(true)} title="隐藏操作提示">
				×
			</button>
		</div>
	)
}

export function CompareModal({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
	const [mode, setMode] = useState<'roll' | 'mutate'>('roll')
	const [strength, setStrength] = useState(0.45)

	if (!editor) return null
	const page = selectedPages(editor)[0]
	if (!page) return null
	const overrides = readPageParams(page.props.mood, page.props.layoutPreset)
	const config = configFor(page.props.layoutPreset, page.props.targetPanels, overrides)
	const baseGenome = sanitize(readJson<Genome>(page.props.genomeJson, generate(page.props.seed, config).genome))
	const { top, ms } = pickLayoutBundle(page.props.seed, config, page.props.targetPanels, asScenario(page.props.scenario), {
		count: 8,
		poolSize: 36,
		mode,
		baseGenome,
		mutationStrength: strength,
	})
	const metas = readJson<PanelMeta[]>(page.props.panelsJson, [])

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box wide" onClick={(event) => event.stopPropagation()}>
				<header>
					<div className="modal-title-row">
						<h3>
							<IconGrid /> 36 种子 6 轴主编评分 8 选 1 · {page.props.title}（{SCENARIO_LABELS[page.props.scenario] ?? page.props.scenario} · {ms}ms）
						</h3>
						<div className="tabs">
							<button type="button" className={mode === 'roll' ? 'on' : ''} onClick={() => setMode('roll')}>
								随机抽样 8 套
							</button>
							<button type="button" className={mode === 'mutate' ? 'on' : ''} onClick={() => setMode('mutate')}>
								以此页基因派生 8 套
							</button>
						</div>
						{mode === 'mutate' ? (
							<label className="inline-slider">
								变异强度 {Math.round(strength * 100)}%
								<input
									type="range"
									min={0.15}
									max={0.95}
									step={0.05}
									value={strength}
									onChange={(event) => setStrength(Number(event.target.value))}
								/>
							</label>
						) : null}
					</div>
					<button type="button" onClick={onClose}>
						<IconClose /> 关闭
					</button>
				</header>
				<div className="compare-grid eight-grid">
					{top.map((candidate, rank) => {
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
							uid: candidate.seed.replace(/[^a-zA-Z0-9]/g, ''),
							title: candidate.seed,
							width: candidate.layout.width,
							height: candidate.layout.height,
							inner: candidate.layout.inner,
							panels,
							bubbles: [],
							numbers: 'badge',
							director: false,
							lineWidth: overrides.lineW,
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
									<strong>
										#{rank + 1} · 综合 {Math.round(candidate.score * 100)} 分 · {candidate.layout.panels.length} 格
									</strong>
									<span>{candidate.reasons.slice(0, 2).join(' · ')}</span>
									<small>优化：{candidate.mutations[0]}</small>
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
			model: page.model,
		})),
	)
	const activeSpread = spreads[Math.min(spreadIdx, Math.max(0, spreads.length - 1))] ?? []
	const activePanel = flatPanels[Math.min(panelStep, Math.max(0, flatPanels.length - 1))]
	const firstPageModel: PageRenderModel | undefined = activeSpread[0]?.model ?? book.pages[0]?.model

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box reader" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>
						<IconBook /> {book.spec.title} · 整书四模式预览与完稿导出
					</h3>
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
					<div className="tabs">
						{firstPageModel ? (
							<>
								<button
									type="button"
									onClick={() => exportPageSvgFile(firstPageModel, `${book.spec.title}-P1.svg`)}
								>
									<IconDownload /> 导出单页 SVG
								</button>
								<button
									type="button"
									onClick={async () => {
										const blob = await exportPagePng2400(firstPageModel, 2400)
										downloadBlob(`${book.spec.title}-P1-2400px.png`, blob, 'image/png')
									}}
								>
									<IconDownload /> 导出 2400px PNG
								</button>
							</>
						) : null}
						<button type="button" onClick={onClose}>
							<IconClose /> 关闭
						</button>
					</div>
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
						? `多模态代理就绪（支持 ${data.capabilities?.join(' / ') || 'text / vision / image'}${envKeys.length ? `；环境变量已检测到 ${envKeys.join(', ')}` : '；未填 Key 时自动启用内置中文离线引擎'}）`
						: '仅离线引擎',
				)
			})
			.catch(() => setHealth('内置离线中文模型与手绘网点引擎已就绪'))
	}, [])

	const selectPreset = (provider: ProviderId) => {
		const next = applyProviderPreset(provider)
		setForm(next)
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box settings-modal" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>
						<IconSettings /> 内置多模态模型配置中心（Text · Vision · Image）
					</h3>
					<button type="button" onClick={onClose}>
						<IconClose /> 关闭
					</button>
				</header>
				<div className="settings-form">
					<p className="health-banner">{health}</p>
					<div className="preset-bar">
						{PROVIDER_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								className={form.provider === preset.id ? 'preset-pill active' : 'preset-pill'}
								onClick={() => selectPreset(preset.id)}
							>
								{preset.label}
							</button>
						))}
					</div>
					<label className="row">
						<input
							type="checkbox"
							checked={form.useApi}
							onChange={(event) => setForm({ ...form, useApi: event.target.checked })}
						/>
						启用在线大模型 API（关闭时默认使用零配置内置中文引擎与网点生图器）
					</label>
					<div className="settings-grid-2">
						<label>
							文本服务商 (Text Provider)
							<select value={form.provider} onChange={(event) => selectPreset(event.target.value as ProviderId)}>
								{PROVIDER_PRESETS.map((preset) => (
									<option key={preset.id} value={preset.id}>
										{preset.label}
									</option>
								))}
							</select>
						</label>
						<label>
							接口 Base URL
							<input
								value={form.baseUrl}
								onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
								placeholder="https://api.openai.com/v1"
							/>
						</label>
						<label>
							API Key
							<input
								type="password"
								value={form.apiKey}
								onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
								placeholder="sk-... / AIza..."
							/>
						</label>
						<label>
							文本模型 (Text Model)
							<input
								value={form.model}
								onChange={(event) => setForm({ ...form, model: event.target.value })}
								placeholder="gpt-4o-mini / gemini-2.5-flash"
							/>
						</label>
						<label>
							视觉模型 (Vision Model)
							<input
								value={form.visionModel}
								onChange={(event) => setForm({ ...form, visionModel: event.target.value })}
								placeholder="gpt-4o / gemini-2.5-flash"
							/>
						</label>
						<label>
							图像生成模型 (Image Model)
							<input
								value={form.imageModel}
								onChange={(event) => setForm({ ...form, imageModel: event.target.value })}
								placeholder="gpt-image-1 / flux-1.1-pro"
							/>
						</label>
					</div>
					<div className="actions">
						<button
							type="button"
							className="primary"
							onClick={() => {
								saveSettings(form)
								onClose()
							}}
						>
							保存多模态配置
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
