import { describe, expect, it } from 'vitest'
import { addRecent, shouldShowWelcome, type RecentEntry } from './welcome'

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
	const a: RecentEntry = { id: 'a', title: 'Alpha' }
	const b: RecentEntry = { id: 'b', title: 'Beta' }
	const c: RecentEntry = { id: 'c', title: 'Gamma' }

	it('prepends a new entry', () => {
		expect(addRecent([a], b).map((e) => e.id)).toEqual(['b', 'a'])
	})

	it('de-duplicates by id, moving the entry to the front', () => {
		expect(addRecent([a, b, c], b).map((e) => e.id)).toEqual(['b', 'a', 'c'])
	})

	it('caps the list length', () => {
		const list: RecentEntry[] = [a, b, c, { id: 'd', title: 'Delta' }, { id: 'e', title: 'Epsilon' }]
		const next = addRecent(list, { id: 'f', title: 'Zeta' })
		expect(next).toHaveLength(5)
		expect(next[0].id).toBe('f')
		expect(next.map((e) => e.id)).not.toContain('e')
	})

	it('does not mutate the input list', () => {
		const list: RecentEntry[] = [a]
		addRecent(list, b)
		expect(list).toEqual([a])
	})
})
