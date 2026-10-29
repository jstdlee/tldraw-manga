import { describe, expect, it } from 'vitest'
import { addRecent, coerceRecentEntry, MAX_RECENT, MAX_THUMBNAIL_BYTES, relativeTime, shouldShowWelcome, type RecentEntry } from './welcome'

/** Build a full RecentEntry with sensible defaults, overridable per field. */
function mk(id: string, title: string, over: Partial<RecentEntry> = {}): RecentEntry {
	return { id, title, kind: 'preset', lastOpened: 0, pageCount: 0, ...over }
}

describe('shouldShowWelcome', () => {
	const base = { forced: false, hasPresetDeepLink: false, hasStoredDocument: false, showAtLaunch: true }

	it('shows on a fresh start with the default preference', () => {
		expect(shouldShowWelcome(base)).toBe(true)
	})

	it('forces open even when a document or preset exists', () => {
		expect(shouldShowWelcome({ ...base, forced: true, hasStoredDocument: true })).toBe(true)
		expect(shouldShowWelcome({ ...base, forced: true, hasPresetDeepLink: true })).toBe(true)
		expect(shouldShowWelcome({ ...base, forced: true, showAtLaunch: false })).toBe(true)
	})

	it('stays hidden when a preset deep link is loading', () => {
		expect(shouldShowWelcome({ ...base, hasPresetDeepLink: true })).toBe(false)
	})

	it('stays hidden when a stored document already has work', () => {
		expect(shouldShowWelcome({ ...base, hasStoredDocument: true })).toBe(false)
	})

	it('honours the stored "show at launch" preference on an empty start', () => {
		expect(shouldShowWelcome({ ...base, showAtLaunch: false })).toBe(false)
		expect(shouldShowWelcome({ ...base, showAtLaunch: true })).toBe(true)
	})
})

describe('addRecent', () => {
	const a = mk('a', 'Alpha')
	const b = mk('b', 'Beta')
	const c = mk('c', 'Gamma')

	it('prepends a new entry', () => {
		expect(addRecent([a], b).map((e) => e.id)).toEqual(['b', 'a'])
	})

	it('de-duplicates by id, moving the entry to the front', () => {
		expect(addRecent([a, b, c], b).map((e) => e.id)).toEqual(['b', 'a', 'c'])
	})

	it('caps the list length at MAX_RECENT (8)', () => {
		const list = Array.from({ length: MAX_RECENT }, (_, i) => mk(`e${i}`, `Entry ${i}`))
		const next = addRecent(list, mk('new', 'Newest'))
		expect(next).toHaveLength(MAX_RECENT)
		expect(next[0].id).toBe('new')
		expect(next.map((e) => e.id)).not.toContain(`e${MAX_RECENT - 1}`)
	})

	it('does not mutate the input list', () => {
		const list: RecentEntry[] = [a]
		addRecent(list, b)
		expect(list).toEqual([a])
	})

	it('preserves a prior thumbnail when the re-opened entry carries none', () => {
		const withThumb = mk('a', 'Alpha', { thumbnail: 'data:image/jpeg;base64,xxx' })
		const next = addRecent([withThumb], mk('a', 'Alpha Renamed'))
		expect(next[0].title).toBe('Alpha Renamed')
		expect(next[0].thumbnail).toBe('data:image/jpeg;base64,xxx')
	})

	it('lets a fresh thumbnail override the prior one', () => {
		const withThumb = mk('a', 'Alpha', { thumbnail: 'data:old' })
		const next = addRecent([withThumb], mk('a', 'Alpha', { thumbnail: 'data:new' }))
		expect(next[0].thumbnail).toBe('data:new')
	})
})

describe('coerceRecentEntry', () => {
	it('accepts a well-formed entry', () => {
		const raw = { id: 'x', title: 'X', kind: 'document', lastOpened: 123, pageCount: 4 }
		expect(coerceRecentEntry(raw)).toEqual(raw)
	})

	it('migrates a legacy { id, title } row with safe defaults', () => {
		expect(coerceRecentEntry({ id: 'x', title: 'X' })).toEqual({ id: 'x', title: 'X', kind: 'document', lastOpened: 0, pageCount: 0 })
	})

	it('rejects rows missing an id or title', () => {
		expect(coerceRecentEntry({ title: 'no id' })).toBeNull()
		expect(coerceRecentEntry({ id: 'no-title' })).toBeNull()
		expect(coerceRecentEntry({ id: '', title: 'empty id' })).toBeNull()
		expect(coerceRecentEntry(null)).toBeNull()
		expect(coerceRecentEntry('string')).toBeNull()
	})

	it('falls back to document for an unknown kind and clamps a bad page count', () => {
		const entry = coerceRecentEntry({ id: 'x', title: 'X', kind: 'bogus', pageCount: -3, lastOpened: 'nope' })
		expect(entry?.kind).toBe('document')
		expect(entry?.pageCount).toBe(0)
		expect(entry?.lastOpened).toBe(0)
	})

	it('drops an over-cap thumbnail but keeps the rest of the entry', () => {
		const huge = 'x'.repeat(MAX_THUMBNAIL_BYTES + 1)
		const entry = coerceRecentEntry({ id: 'x', title: 'X', thumbnail: huge })
		expect(entry).not.toBeNull()
		expect(entry?.thumbnail).toBeUndefined()
	})

	it('keeps a within-cap thumbnail', () => {
		const entry = coerceRecentEntry({ id: 'x', title: 'X', thumbnail: 'data:ok' })
		expect(entry?.thumbnail).toBe('data:ok')
	})
})

describe('relativeTime', () => {
	const now = 1_000_000_000_000
	const min = 60_000
	const hour = 60 * min
	const day = 24 * hour

	it('reads just now under a minute and for future timestamps', () => {
		expect(relativeTime(now - 5_000, now)).toBe('just now')
		expect(relativeTime(now + 10_000, now)).toBe('just now')
		expect(relativeTime(Number.NaN, now)).toBe('just now')
	})

	it('reads minutes, hours and days', () => {
		expect(relativeTime(now - 2 * min, now)).toBe('2 m ago')
		expect(relativeTime(now - 3 * hour, now)).toBe('3 h ago')
		expect(relativeTime(now - 5 * day, now)).toBe('5 d ago')
	})

	it('reads weeks, months and years', () => {
		expect(relativeTime(now - 14 * day, now)).toBe('2 w ago')
		expect(relativeTime(now - 60 * day, now)).toBe('2 mo ago')
		expect(relativeTime(now - 400 * day, now)).toBe('1 y ago')
	})
})
