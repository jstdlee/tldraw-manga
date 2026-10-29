import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mangaApi } from './server/apiPlugin.ts'

export default defineConfig({
	plugins: [react(), mangaApi()],
	build: {
		// Split the heavy third-party libraries into their own long-lived vendor
		// chunks (Vite 8 / Rolldown codeSplitting groups) so the app code and the
		// on-demand chunks — the lazy Masters/Theory inspector tabs and the HTML
		// exporter + zip library — are not bundled behind them.
		// See https://rolldown.rs/reference/OutputOptions.codeSplitting
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						// React runtime first so it is deduped out of the tldraw chunk.
						{ name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
						// tldraw is by far the largest dependency; isolate it on its own.
						{ name: 'vendor-tldraw', test: /node_modules[\\/](tldraw|@tldraw)[\\/]/, priority: 1 },
						// Everything else third-party.
						{ name: 'vendor', test: /node_modules[\\/]/, priority: 0 },
					],
				},
			},
		},
		// The isolated tldraw runtime alone is legitimately larger than the 500 kB
		// default advisory. Raise the warning threshold just past that single vendor
		// chunk so a real regression in our own code still trips the warning.
		chunkSizeWarningLimit: 1800,
	},
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