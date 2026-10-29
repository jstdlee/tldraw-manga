// =============================================================================
// welcome.ts — pure state for the first-run welcome sheet.
//
// The sheet shows on a genuinely fresh start (no persisted document and no
// `?preset=` deep link), can be forced with `?welcome=1` (for screenshots), and
// otherwise respects the user's "Show at launch" preference. The recent-document
// list and the launch preference persist in localStorage; every pure helper here
// is unit-tested, and the thin storage wrappers guard against a missing `window`.
// =============================================================================

export interface WelcomeDecisionInput {
	/** `?welcome=1` was present — always show, overriding every other signal. */
	forced: boolean
	/** A `?preset=` deep link is loading a document, so the sheet stays hidden. */
	hasPresetDeepLink: boolean
	/** A persisted document already has shapes on the canvas. */
	hasStoredDocument: boolean
	/** The stored "Show at launch" preference (defaults to true on a fresh install). */
	showAtLaunch: boolean
}

/**
 * Decide whether the welcome sheet opens on mount. Precedence:
 *   1. `?welcome=1` forces it open (screenshots / support).
 *   2. A preset deep link or an existing document keeps it closed.
 *   3. Otherwise honour the stored "Show at launch" preference.
 */
export function shouldShowWelcome(input: WelcomeDecisionInput): boolean {
	if (input.forced) return true
	if (input.hasPresetDeepLink) return false
	if (input.hasStoredDocument) return false
	return input.showAtLaunch
}

/** A recently opened preset / document, shown in the welcome sheet's Recent list. */
export interface RecentEntry {
	id: string
	title: string
}

/** Default and hard cap on how many recent entries the sheet lists. */
export const MAX_RECENT = 5

/**
 * Add an entry to the front of the recent list, de-duplicating by id and keeping
 * at most `max` entries. Pure: returns a new array and never mutates the input.
 */
export function addRecent(list: readonly RecentEntry[], entry: RecentEntry, max = MAX_RECENT): RecentEntry[] {
	const deduped = [entry, ...list.filter((item) => item.id !== entry.id)]
	return deduped.slice(0, Math.max(0, max))
}

const SHOW_AT_LAUNCH_KEY = 'manga-welcome-show-at-launch'
const RECENT_KEY = 'manga-recent-documents'

/** Load the "Show at launch" preference, defaulting to true when unset. */
export function loadShowAtLaunch(): boolean {
	if (typeof window === 'undefined') return true
	try {
		const stored = window.localStorage.getItem(SHOW_AT_LAUNCH_KEY)
		if (stored === 'false') return false
		return true
	} catch {
		return true
	}
}

/** Persist the "Show at launch" preference; a storage failure is ignored. */
export function saveShowAtLaunch(value: boolean): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(SHOW_AT_LAUNCH_KEY, value ? 'true' : 'false')
	} catch {
		// Ignore storage failures — the in-memory state stays authoritative.
	}
}

/** Load the recent-documents list, tolerating missing / malformed storage. */
export function loadRecent(): RecentEntry[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = window.localStorage.getItem(RECENT_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		const entries: RecentEntry[] = []
		for (const item of parsed) {
			if (item && typeof item === 'object') {
				const id = (item as Record<string, unknown>).id
				const title = (item as Record<string, unknown>).title
				if (typeof id === 'string' && typeof title === 'string') entries.push({ id, title })
			}
		}
		return entries.slice(0, MAX_RECENT)
	} catch {
		return []
	}
}

/** Push an entry onto the recent list and persist it; returns the new list. */
export function pushRecent(entry: RecentEntry): RecentEntry[] {
	const next = addRecent(loadRecent(), entry)
	if (typeof window !== 'undefined') {
		try {
			window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
		} catch {
			// Ignore storage failures.
		}
	}
	return next
}
