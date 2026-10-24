import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mangaApi } from './server/apiPlugin.ts'

export default defineConfig({
	plugins: [react(), mangaApi()],
	server: {
		port: 43123,
		host: '127.0.0.1',
		strictPort: true,
	},
	preview: {
		port: 43123,
		host: '127.0.0.1',
		strictPort: true,
	},
})