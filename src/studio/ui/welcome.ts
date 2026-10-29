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

/** What a recent entry reopens: a bundled preset, a persisted document, or a blank start. */
export type RecentKind = 'preset' | 'document' | 'blank'

/** A recently opened preset / document / blank start, shown in the Recent list. */
export interface RecentEntry {
	/** Stable id used to dedupe and to reopen (preset id, or the document store key). */
	id: string
	/** Display title — the story / document title, or the first page title. */
	title: string
	/** How to reopen this entry. */
	kind: RecentKind
	/** Epoch ms of the last time this entry was opened; drives relative-time labels. */
	lastOpened: number
	/** Number of pages at last capture, shown as a compact hint. */
	pageCount: number
	/** Optional downscaled first-page preview as a data URL (kept small; see cap). */
	thumbnail?: string
}

/** Default and hard cap on how many recent entries the sheet lists. */
export const MAX_RECENT = 8

/**
 * Hard cap on a persisted thumbnail's data-URL length. Anything larger is dropped
 * silently so one oversized preview can never bloat localStorage or crash the quota.
 */
export const MAX_THUMBNAIL_BYTES = 20_000

/**
 * Add an entry to the front of the recent list, de-duplicating by id and keeping
 * at most `max` entries. When an entry re-opens an id already present and carries
 * no fresh thumbnail, the prior thumbnail is preserved so a cheap re-open does not
 * blank the preview. Pure: returns a new array and never mutates the input.
 */
export function addRecent(list: readonly RecentEntry[], entry: RecentEntry, max = MAX_RECENT): RecentEntry[] {
	const prior = list.find((item) => item.id === entry.id)
	const merged = prior && entry.thumbnail === undefined && prior.thumbnail !== undefined ? { ...entry, thumbnail: prior.thumbnail } : entry
	const deduped = [merged, ...list.filter((item) => item.id !== entry.id)]
	return deduped.slice(0, Math.max(0, max))
}

/**
 * Format `fromMs` relative to `nowMs` as a compact, human label ('just now',
 * '2 m ago', '3 h ago', '5 d ago', '2 w ago', '4 mo ago', '1 y ago'). Pure;
 * future or malformed timestamps collapse to 'just now'.
 */
export function relativeTime(fromMs: number, nowMs: number): string {
	const diff = nowMs - fromMs
	if (!Number.isFinite(diff) || diff < 60_000) return 'just now'
	const minutes = Math.floor(diff / 60_000)
	if (minutes < 60) return `${minutes} m ago`
	const hours = Math.floor(diff / 3_600_000)
	if (hours < 24) return `${hours} h ago`
	const days = Math.floor(diff / 86_400_000)
	if (days < 7) return `${days} d ago`
	const weeks = Math.floor(days / 7)
	if (weeks < 5) return `${weeks} w ago`
	const months = Math.floor(days / 30)
	if (months < 12) return `${months} mo ago`
	return `${Math.floor(days / 365)} y ago`
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

/**
 * Validate and normalise one persisted record into a `RecentEntry`, or return
 * null if it is unusable. Legacy `{ id, title }` rows (the pre-v3 shape) are
 * migrated with safe defaults; an oversized thumbnail is dropped, never kept.
 */
export function coerceRecentEntry(raw: unknown): RecentEntry | null {
	if (!raw || typeof raw !== 'object') return null
	const rec = raw as Record<string, unknown>
	const id = rec.id
	const title = rec.title
	if (typeof id !== 'string' || id.length === 0) return null
	if (typeof title !== 'string') return null
	const kind: RecentKind = rec.kind === 'preset' || rec.kind === 'document' || rec.kind === 'blank' ? rec.kind : 'document'
	const lastOpened = typeof rec.lastOpened === 'number' && Number.isFinite(rec.lastOpened) ? rec.lastOpened : 0
	const pageCount =
		typeof rec.pageCount === 'number' && Number.isFinite(rec.pageCount) && rec.pageCount >= 0 ? Math.floor(rec.pageCount) : 0
	const entry: RecentEntry = { id, title, kind, lastOpened, pageCount }
	if (typeof rec.thumbnail === 'string' && rec.thumbnail.length > 0 && rec.thumbnail.length <= MAX_THUMBNAIL_BYTES) {
		entry.thumbnail = rec.thumbnail
	}
	return entry
}

/** Load the recent-documents list, tolerating missing / malformed / legacy storage. */
export function loadRecent(): RecentEntry[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = window.localStorage.getItem(RECENT_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		const entries: RecentEntry[] = []
		for (const item of parsed) {
			const entry = coerceRecentEntry(item)
			if (entry) entries.push(entry)
		}
		return entries.slice(0, MAX_RECENT)
	} catch {
		return []
	}
}

/** Persist a recent list; a storage failure is ignored. Returns the list unchanged. */
export function saveRecent(list: readonly RecentEntry[]): RecentEntry[] {
	const next = list.slice(0, MAX_RECENT)
	if (typeof window !== 'undefined') {
		try {
			window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
		} catch {
			// Ignore storage failures — the in-memory state stays authoritative.
		}
	}
	return next
}

/** Push an entry onto the recent list and persist it; returns the new list. */
export function pushRecent(entry: RecentEntry): RecentEntry[] {
	return saveRecent(addRecent(loadRecent(), entry))
}

/** Remove the entry with `id` from the recent list and persist; returns the new list. */
export function removeRecent(id: string): RecentEntry[] {
	return saveRecent(loadRecent().filter((item) => item.id !== id))
}

/** Clear every recent entry and persist the empty list. */
export function clearRecent(): RecentEntry[] {
	return saveRecent([])
}
