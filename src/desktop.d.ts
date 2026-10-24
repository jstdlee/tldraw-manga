interface MangaDesktopInfo {
	isElectron: boolean
	platform: string
	arch: string
}

interface Window {
	mangaDesktop?: MangaDesktopInfo
}
