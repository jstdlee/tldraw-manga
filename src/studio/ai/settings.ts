export type ProviderId = 'openai' | 'gemini' | 'openrouter' | 'local'

export interface ApiSettings {
	useApi: boolean
	provider: ProviderId
	baseUrl: string
	apiKey: string
	model: string
	imageModel: string
}

const KEY = 'tldraw-manga-settings'

export const DEFAULT_SETTINGS: ApiSettings = {
	useApi: false,
	provider: 'openai',
	baseUrl: '',
	apiKey: '',
	model: 'gpt-4o-mini',
	imageModel: 'gpt-image-1',
}

export function loadSettings(): ApiSettings {
	try {
		const raw = localStorage.getItem(KEY)
		if (!raw) return { ...DEFAULT_SETTINGS }
		return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ApiSettings>) }
	} catch {
		return { ...DEFAULT_SETTINGS }
	}
}

export function saveSettings(settings: ApiSettings) {
	localStorage.setItem(KEY, JSON.stringify(settings))
}
