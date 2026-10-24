import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], {
	cwd: root,
	stdio: 'inherit',
	env: process.env,
})

let electron
let stopped = false

function stop(code = 0) {
	if (stopped) return
	stopped = true
	electron?.kill()
	vite.kill()
	process.exit(code)
}

vite.on('exit', (code) => {
	if (!stopped) stop(code ?? 1)
})

let viteReady = false
for (let attempt = 0; attempt < 80; attempt += 1) {
	try {
		const response = await fetch('http://127.0.0.1:43123/api/health')
		if (response.ok) {
			viteReady = true
			break
		}
	} catch {
		// Vite is still binding the port.
	}
	await delay(150)
}
if (!viteReady) {
	console.error('Vite did not open http://127.0.0.1:43123')
	stop(1)
}

electron = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/electron/cli.js', import.meta.url)), '.'], {
	cwd: root,
	stdio: 'inherit',
	env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:43123' },
})
electron.on('exit', (code) => stop(code ?? 0))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
