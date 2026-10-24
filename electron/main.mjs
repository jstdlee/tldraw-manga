import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMangaServer } from '../server/apiHandler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let desktopServer = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
} else {
	app.whenReady().then(() => {
		void createWindow().catch((error) => {
			dialog.showErrorBox('tldraw-manga', error instanceof Error ? error.message : '无法打开窗口')
			app.quit()
		})
	})

	app.on('second-instance', () => {
		const win = BrowserWindow.getAllWindows()[0]
		if (!win) return
		if (win.isMinimized()) win.restore()
		win.focus()
	})

	app.on('window-all-closed', () => {
		const closing = desktopServer?.close() ?? Promise.resolve()
		void closing.finally(() => app.quit())
	})
}

async function loadTarget() {
	const devUrl = process.env.VITE_DEV_SERVER_URL
	if (devUrl) return { url: devUrl, origin: new URL(devUrl).origin }
	const staticRoot = path.join(app.getAppPath(), 'dist')
	if (!existsSync(path.join(staticRoot, 'index.html'))) {
		dialog.showErrorBox('tldraw-manga', '找不到 dist/index.html。先运行 npm run build。')
		app.quit()
		throw new Error('missing dist')
	}
	desktopServer = await startMangaServer({ staticRoot })
	return { url: desktopServer.url, origin: new URL(desktopServer.url).origin }
}

function allowNavigation(origin, target) {
	return target.startsWith(origin) || target.startsWith('blob:') || target.startsWith('data:')
}

function downloadName(item) {
	const raw = item.getFilename()
	if (raw && raw !== 'download') return path.basename(raw)
	const mime = item.getMimeType()
	const ext = mime.includes('html') ? 'html' : mime.includes('zip') ? 'zip' : mime.includes('json') ? 'json' : 'bin'
	return `tldraw-manga.${ext}`
}

async function createWindow() {
	const target = await loadTarget()
	const iconPath = path.join(here, '..', 'build', 'icon.png')
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 700,
		title: 'tldraw-manga — 漫画分镜工作台',
		backgroundColor: '#101216',
		autoHideMenuBar: true,
		show: false,
		...(existsSync(iconPath) ? { icon: iconPath } : {}),
		webPreferences: {
			preload: path.join(here, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})
	win.on('page-title-updated', (event) => {
		event.preventDefault()
	})
	win.once('ready-to-show', () => win.show())
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (!allowNavigation(target.origin, url)) void shell.openExternal(url)
		return { action: 'deny' }
	})
	win.webContents.on('will-navigate', (event, url) => {
		if (!allowNavigation(target.origin, url)) event.preventDefault()
	})
	win.webContents.session.on('will-download', (_event, item) => {
		const filename = downloadName(item)
		const dir = process.env.MANGA_DOWNLOAD_DIR
		if (dir) {
			item.setSavePath(path.join(dir, filename))
			return
		}
		if (!item.getFilename() || item.getFilename() === 'download') {
			item.setSaveDialogOptions({ defaultPath: filename })
		}
	})
	await win.loadURL(target.url)
}
