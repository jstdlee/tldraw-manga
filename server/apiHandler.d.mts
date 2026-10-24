import type { IncomingMessage, Server, ServerResponse } from 'node:http'

export function handleMangaApi(req: IncomingMessage, res: ServerResponse): Promise<void>

export interface MangaServer {
	server: Server
	port: number
	url: string
	close(): Promise<void>
}

export function startMangaServer(options: { staticRoot: string }): Promise<MangaServer>
