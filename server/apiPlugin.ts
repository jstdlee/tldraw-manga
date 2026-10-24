import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { handleMangaApi } from './apiHandler.mjs'

export function mangaApi(): Plugin {
	return {
		name: 'manga-api',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url?.split('?')[0] ?? ''
				if (!url.startsWith('/api/')) {
					next()
					return
				}
				void handleMangaApi(req as IncomingMessage, res as ServerResponse).catch((error: unknown) => {
					if (!res.headersSent) {
						res.statusCode = 500
						res.setHeader('content-type', 'application/json; charset=utf-8')
						res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'proxy error' }))
					}
				})
			})
		},
	}
}
