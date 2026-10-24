export type ProviderId = 'openai' | 'gemini' | 'openrouter' | 'deepseek' | 'local'

export interface ApiSettings {
	provider: ProviderId
	baseUrl: string
	apiKey: string
	model: string
	visionProvider: ProviderId
	visionModel: string
	imageProvider: ProviderId
	imageModel: string
	useApi: boolean
	systemAppendix: string
}

export interface ProviderPreset {
	id: ProviderId
	label: string
	baseUrl: string
	textModels: string[]
	visionModels: string[]
	imageModels: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		id: 'openai',
		label: 'OpenAI (GPT-4o / Image-1)',
		baseUrl: 'https://api.openai.com/v1',
		textModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
		visionModels: ['gpt-4o', 'gpt-4o-mini'],
		imageModels: ['gpt-image-1', 'dall-e-3'],
	},
	{
		id: 'gemini',
		label: 'Google Gemini (2.5 Flash / Imagen)',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		textModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
		visionModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
		imageModels: ['gemini-2.5-flash-image', 'imagen-3.0-generate-002'],
	},
	{
		id: 'openrouter',
		label: 'OpenRouter (Claude / Qwen-VL / Flux)',
		baseUrl: 'https://openrouter.ai/api/v1',
		textModels: ['anthropic/claude-3.7-sonnet', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
		visionModels: ['qwen/qwen-2.5-vl-72b-instruct', 'anthropic/claude-3.7-sonnet', 'openai/gpt-4o'],
		imageModels: ['black-forest-labs/flux-1.1-pro', 'gpt-image-1'],
	},
	{
		id: 'deepseek',
		label: 'DeepSeek (深度求索 V3 / R1)',
		baseUrl: 'https://api.deepseek.com/v1',
		textModels: ['deepseek-chat', 'deepseek-reasoner'],
		visionModels: ['gpt-4o', 'qwen-vl-max'],
		imageModels: ['gpt-image-1', 'flux-1-dev'],
	},
	{
		id: 'local',
		label: '本地 Ollama / vLLM / SD',
		baseUrl: 'http://127.0.0.1:11434/v1',
		textModels: ['qwen2.5:14b', 'llama3.2:latest', 'deepseek-r1:14b'],
		visionModels: ['llava:13b', 'qwen2.5-vl:7b', 'minicpm-v:latest'],
		imageModels: ['sdxl-manga-ink', 'flux-schnell-local'],
	},
]

const KEY = 'manga-studio-api-v2'

const DEFAULTS: ApiSettings = {
	provider: 'openai',
	baseUrl: 'https://api.openai.com/v1',
	apiKey: '',
	model: 'gpt-4o-mini',
	visionProvider: 'openai',
	visionModel: 'gpt-4o',
	imageProvider: 'openai',
	imageModel: 'gpt-image-1',
	useApi: false,
	systemAppendix: '保持黑白网点日漫叙事张力，右起左读，画面留白避开角色五官，拟声词与对白全中文。',
}

export function loadSettings(): ApiSettings {
	try {
		const raw = localStorage.getItem(KEY)
		if (!raw) return DEFAULTS
		return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ApiSettings>) }
	} catch {
		return DEFAULTS
	}
}

export function saveSettings(next: Partial<ApiSettings>): ApiSettings {
	const merged = { ...loadSettings(), ...next }
	try {
		localStorage.setItem(KEY, JSON.stringify(merged))
	} catch {
		// localStorage is unavailable in headless checks.
	}
	return merged
}

export function applyProviderPreset(provider: ProviderId): ApiSettings {
	const preset = PROVIDER_PRESETS.find((item) => item.id === provider) ?? PROVIDER_PRESETS[0]
	return saveSettings({
		provider: preset.id,
		baseUrl: preset.baseUrl,
		model: preset.textModels[0],
		visionProvider: preset.id === 'deepseek' ? 'openai' : preset.id,
		visionModel: preset.visionModels[0],
		imageProvider: preset.id === 'deepseek' ? 'openai' : preset.id,
		imageModel: preset.imageModels[0],
	})
}
