import { loadSettings, type ApiSettings } from './settings'

export async function completeText(system: string, user: string): Promise<{ text: string; offline: boolean; error?: string }> {
	const settings = loadSettings()
	if (!settings.useApi) return { text: '', offline: true }
	return postJson('/api/complete', { ...publicSettings(settings), system, user })
}

export async function generateImage(prompt: string, aspect: string): Promise<{ dataUrl: string; offline: boolean; error?: string }> {
	const settings = loadSettings()
	if (!settings.useApi) return { dataUrl: '', offline: true }
	const result = await postJson('/api/image', { ...publicSettings(settings), prompt, aspect })
	return { dataUrl: typeof result.dataUrl === 'string' ? result.dataUrl : '', offline: Boolean(result.offline), error: result.error }
}

export async function probeApi(): Promise<{ ok: boolean; detail: string }> {
	const health = await fetch('/api/health').then((response) => response.json() as Promise<{ ok?: boolean; env?: Record<string, boolean> }>).catch(() => ({ ok: false }))
	const settings = loadSettings()
	if (!settings.useApi) return { ok: Boolean(health.ok), detail: '离线网点稿已就绪。打开 API 后才会转发密钥。' }
	const ping = await completeText('Reply with the single word pong.', 'ping')
	if (ping.text) return { ok: true, detail: `已连通 ${settings.provider}。` }
	return { ok: false, detail: ping.error || '代理没有带回模型文本，画面仍会用离线稿。' }
}

function publicSettings(settings: ApiSettings) {
	return {
		provider: settings.provider,
		baseUrl: settings.baseUrl,
		apiKey: settings.apiKey,
		model: settings.model,
		imageModel: settings.imageModel,
	}
}

async function postJson(url: string, body: unknown): Promise<{ text: string; dataUrl?: string; offline: boolean; error?: string }> {
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
		const data = (await response.json()) as { text?: string; dataUrl?: string; error?: string; offline?: boolean }
		if (!response.ok) return { text: '', offline: true, error: data.error || `HTTP ${response.status}` }
		return { text: data.text || '', dataUrl: data.dataUrl, offline: Boolean(data.offline), error: data.error }
	} catch (error) {
		return { text: '', offline: true, error: error instanceof Error ? error.message : 'network' }
	}
}
