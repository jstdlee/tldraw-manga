import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
}

export async function handleMangaApi(req, res) {
	const url = (req.url || '/').split('?')[0]
	if (url === '/api/health' && req.method === 'GET') {
		send(res, 200, {
			ok: true,
			offlineReady: true,
			capabilities: ['text', 'vision', 'image'],
			env: {
				openai: Boolean(process.env.OPENAI_API_KEY),
				gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
				openrouter: Boolean(process.env.OPENROUTER_API_KEY),
				deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
			},
		})
		return
	}
	if (req.method !== 'POST' || (url !== '/api/complete' && url !== '/api/image' && url !== '/api/vision')) {
		send(res, 404, { error: 'not found' })
		return
	}
	const body = await readBody(req)
	if (url === '/api/complete') {
		send(res, 200, await complete(body))
		return
	}
	if (url === '/api/vision') {
		send(res, 200, await analyzeVision(body))
		return
	}
	send(res, 200, await drawRemote(body))
}

export function startMangaServer({ staticRoot }) {
	const root = path.resolve(staticRoot)
	const server = createServer((req, res) => {
		const url = (req.url || '/').split('?')[0]
		if (url.startsWith('/api/')) {
			void handleMangaApi(req, res).catch((error) => {
				if (!res.headersSent) send(res, 500, { error: error instanceof Error ? error.message : 'proxy error' })
			})
			return
		}
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			send(res, 405, { error: 'method not allowed' })
			return
		}
		serveStatic(req, res, root, url)
	})
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			const port = typeof address === 'object' && address ? address.port : 0
			resolve({
				server,
				port,
				url: `http://127.0.0.1:${port}/`,
				close() {
					return new Promise((done, fail) => {
						server.close((error) => (error ? fail(error) : done()))
					})
				},
			})
		})
	})
}

function serveStatic(req, res, root, urlPath) {
	const requested = safeFile(root, urlPath)
	const file = requested && existsSync(requested) && statSync(requested).isFile() ? requested : path.join(root, 'index.html')
	if (!existsSync(file)) {
		send(res, 404, { error: 'not found' })
		return
	}
	const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
	res.statusCode = 200
	res.setHeader('content-type', type)
	res.setHeader('cache-control', 'no-cache')
	if (req.method === 'HEAD') {
		res.end()
		return
	}
	createReadStream(file).pipe(res)
}

function safeFile(root, urlPath) {
	let decoded = urlPath
	try {
		decoded = decodeURIComponent(urlPath)
	} catch {
		return null
	}
	const relative = decoded.replace(/^\/+/, '')
	if (!relative) return path.join(root, 'index.html')
	const full = path.resolve(root, relative)
	if (full !== root && !full.startsWith(root + path.sep)) return null
	return full
}

async function complete(body) {
	const provider = body.provider || 'openai'
	const key = body.apiKey || keyFor(provider)
	if (!key && provider !== 'local') return { text: '', error: 'No API key configured; automatically fell back to the built-in offline model.' }
	const system = body.system || ''
	const user = body.user || ''
	if (provider === 'gemini') {
		const model = body.model || 'gemini-2.5-flash'
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }] }),
			signal: AbortSignal.timeout(45000),
		})
		const data = await response.json()
		const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
		return text ? { text } : { text: '', error: data.error?.message || 'Gemini returned no text' }
	}
	const base = baseFor(provider, body.baseUrl)
	const response = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: body.model || 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user },
			],
		}),
		signal: AbortSignal.timeout(45000),
	})
	const data = await response.json()
	const text = data.choices?.[0]?.message?.content || ''
	return text ? { text } : { text: '', error: data.error?.message || 'The model returned no text' }
}

async function analyzeVision(body) {
	const provider = body.provider || 'openai'
	const key = body.apiKey || keyFor(provider)
	if (!key && provider !== 'local') return { text: '', error: 'No Vision API key configured; used the built-in Vision analysis engine.' }
	const prompt = body.prompt || 'Analyze this manga/reference image: character appearance traits, costume anchors, shot scale, lighting mood, and storyboard composition suggestions.'
	const imageDataUrl = body.imageDataUrl || ''
	if (provider === 'gemini') {
		const model = body.visionModel || body.model || 'gemini-2.5-flash'
		const parts = [{ text: prompt }]
		const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
		if (match) {
			parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
		}
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
			signal: AbortSignal.timeout(45000),
		})
		const data = await response.json()
		const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
		return text ? { text } : { text: '', error: data.error?.message || 'Gemini Vision returned no analysis' }
	}
	const base = baseFor(provider, body.baseUrl)
	const content = [{ type: 'text', text: prompt }]
	if (imageDataUrl) {
		content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
	}
	const response = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: body.visionModel || body.model || 'gpt-4o',
			messages: [{ role: 'user', content }],
		}),
		signal: AbortSignal.timeout(45000),
	})
	const data = await response.json()
	const text = data.choices?.[0]?.message?.content || ''
	return text ? { text } : { text: '', error: data.error?.message || 'The Vision model returned no analysis text' }
}

async function drawRemote(body) {
	const provider = body.provider || 'openai'
	const key = body.apiKey || keyFor(provider)
	const prompt = body.prompt || ''
	if (!key && provider !== 'local') return { dataUrl: '', error: 'No image-generation API key configured; rendered with the built-in screentone hand-drawn engine.' }
	if (provider === 'gemini') {
		const model = body.imageModel || 'gemini-2.5-flash-image'
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
			}),
			signal: AbortSignal.timeout(60000),
		})
		const data = await response.json()
		const inline = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData
		if (!inline?.data) return { dataUrl: '', error: data.error?.message || 'Gemini returned no image' }
		return { dataUrl: `data:${inline.mimeType || 'image/png'};base64,${inline.data}` }
	}
	const base = baseFor(provider, body.baseUrl)
	const response = await fetch(`${base}/images/generations`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: body.imageModel || 'gpt-image-1',
			prompt,
			size: openAiSize(body.aspect || '1:1', body.imageModel || ''),
		}),
		signal: AbortSignal.timeout(60000),
	})
	const data = await response.json()
	const first = data.data?.[0]
	if (first?.b64_json) return { dataUrl: `data:image/png;base64,${first.b64_json}` }
	if (first?.url) return { dataUrl: first.url }
	return { dataUrl: '', error: data.error?.message || 'The image endpoint returned no data' }
}

function keyFor(provider) {
	if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
	if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || ''
	if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || ''
	if (provider === 'local') return process.env.LOCAL_API_KEY || ''
	return process.env.OPENAI_API_KEY || ''
}

function baseFor(provider, requested) {
	if (requested) return requested.replace(/\/$/, '')
	if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
	if (provider === 'deepseek') return 'https://api.deepseek.com/v1'
	if (provider === 'local') return process.env.LOCAL_LLM_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:11434/v1'
	return 'https://api.openai.com/v1'
}

function openAiSize(aspect, model) {
	const dalle = model.includes('dall-e')
	if (aspect === '9:16' || aspect === '3:4') return dalle ? '1024x1792' : '1024x1536'
	if (aspect === '16:9' || aspect === '4:3') return dalle ? '1792x1024' : '1536x1024'
	return '1024x1024'
}

function send(res, status, body) {
	res.statusCode = status
	res.setHeader('content-type', 'application/json; charset=utf-8')
	res.end(JSON.stringify(body))
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = []
		req.on('data', (chunk) => {
			chunks.push(chunk)
			if (chunks.reduce((sum, item) => sum + item.length, 0) > 2_500_000) {
				reject(new Error('body too large'))
				req.destroy()
			}
		})
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
			} catch (error) {
				reject(error)
			}
		})
		req.on('error', reject)
	})
}
