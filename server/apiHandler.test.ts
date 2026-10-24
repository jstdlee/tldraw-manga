import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { startMangaServer } from './apiHandler.mjs'

describe('shared manga API server', () => {
	it('serves health, rejects unknown routes, and reads the built files', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'manga-static-'))
		writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>desk</title>')
		writeFileSync(path.join(root, 'app.js'), 'console.log("page")')
		const server = await startMangaServer({ staticRoot: root })
		try {
			const health = await fetch(`${server.url}api/health`).then((response) => response.json())
			expect(health.ok).toBe(true)
			expect(health.offlineReady).toBe(true)
			const missing = await fetch(`${server.url}api/nope`)
			expect(missing.status).toBe(404)
			const complete = await fetch(`${server.url}api/complete`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: 'openai', user: 'ping' }),
			}).then((response) => response.json())
			expect(complete.text).toBe('')
			expect(complete.error).toContain('API key')
			const page = await fetch(`${server.url}app.js`).then((response) => response.text())
			expect(page).toContain('page')
			const spa = await fetch(`${server.url}missing/route`).then((response) => response.text())
			expect(spa).toContain('desk')
			const escape = await fetch(`${server.url}..%2Fpackage.json`)
			expect(escape.status).toBe(200)
			expect(await escape.text()).toContain('desk')
		} finally {
			await server.close()
		}
	})
})