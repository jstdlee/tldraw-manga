// =============================================================================
// theme.ts — appearance preference model. The studio supports three choices
// that cycle in order: Light → Dark → Auto. "Auto" follows the OS appearance
// via `prefers-color-scheme`. The chosen preference persists in localStorage;
// the resolved concrete theme ('light' | 'dark') is what the UI and tldraw
// actually render. All functions guard against a missing `window` so the module
// is safe to import in a non-DOM (test) environment.
// =============================================================================

import type { ThemePref } from './deepLink'

export type { ThemePref }
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'manga-theme-pref'
const ORDER: readonly ThemePref[] = ['light', 'dark', 'auto']

/** The next preference in the Light → Dark → Auto cycle. */
export function nextThemePref(pref: ThemePref): ThemePref {
	const index = ORDER.indexOf(pref)
	return ORDER[(index + 1) % ORDER.length]
}

/** Whether the OS currently prefers a dark appearance. */
export function prefersDark(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
	return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve a preference to the concrete theme the UI should render. */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
	if (pref === 'auto') return prefersDark() ? 'dark' : 'light'
	return pref
}

/** Load the stored preference, defaulting to 'auto' when none is set. */
export function loadThemePref(): ThemePref {
	if (typeof window === 'undefined') return 'auto'
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
	} catch {
		// localStorage can throw in private-mode / sandboxed contexts; ignore.
	}
	return 'auto'
}

/** Persist the preference; a storage failure is silently ignored. */
export function saveThemePref(pref: ThemePref): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, pref)
	} catch {
		// Ignore storage failures — the in-memory state remains authoritative.
	}
}

/** The tldraw user-preferences color scheme for a given appearance preference. */
export function tldrawColorScheme(pref: ThemePref): 'light' | 'dark' | 'system' {
	return pref === 'auto' ? 'system' : pref
}

/** Human label for the appearance preference (used in tooltips / commands). */
export function themeLabel(pref: ThemePref): string {
	return pref === 'light' ? 'Light' : pref === 'dark' ? 'Dark' : 'Auto'
}
