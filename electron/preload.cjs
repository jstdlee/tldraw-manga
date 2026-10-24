const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('mangaDesktop', {
	isElectron: true,
	platform: process.platform,
	arch: process.arch,
})
