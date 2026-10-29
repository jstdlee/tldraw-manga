import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLink'
import { nextThemePref, resolveTheme, tldrawColorScheme } from './theme'

const PRESETS = ['seagull-fries', 'noir-watchmaker', 'wutai-lundao']

describe('parseDeepLink', () => {
	it('returns an inert config for an empty query', () => {
		const cfg = parseDeepLink('', PRESETS)
		expect(cfg).toEqual({
			ephemeral: false,
			presetId: null,
			theme: null,
			inspector: null,
			masterId: null,
			selectFirstPanel: false,
			forceWelcome: false,
			demoRepropagate: false,
			hold: false,
		})
	})

	it('reads the re-propagate demo and hold flags', () => {
		const cfg = parseDeepLink('?demo=repropagate&hold=1', PRESETS)
		expect(cfg.demoRepropagate).toBe(true)
		expect(cfg.hold).toBe(true)
		expect(parseDeepLink('?demo=other', PRESETS).demoRepropagate).toBe(false)
		expect(parseDeepLink('', PRESETS).hold).toBe(false)
	})

	it('reads the welcome force flag', () => {
		expect(parseDeepLink('?welcome=1', PRESETS).forceWelcome).toBe(true)
		expect(parseDeepLink('?welcome=true', PRESETS).forceWelcome).toBe(true)
		expect(parseDeepLink('', PRESETS).forceWelcome).toBe(false)
	})

	it('resolves preset=default to the first available preset and implies ephemeral', () => {
		const cfg = parseDeepLink('?preset=default', PRESETS)
		expect(cfg.presetId).toBe('seagull-fries')
		expect(cfg.ephemeral).toBe(true)
	})

	it('keeps an explicit known preset id', () => {
		expect(parseDeepLink('?preset=wutai-lundao', PRESETS).presetId).toBe('wutai-lundao')
	})

	it('honours ephemeral=1 without a preset', () => {
		const cfg = parseDeepLink('?ephemeral=1', PRESETS)
		expect(cfg.ephemeral).toBe(true)
		expect(cfg.presetId).toBeNull()
	})

	it('maps the user-facing inspector aliases to internal tab ids', () => {
		expect(parseDeepLink('?inspector=page', PRESETS).inspector).toBe('layout')
		expect(parseDeepLink('?inspector=panel', PRESETS).inspector).toBe('camera')
		expect(parseDeepLink('?inspector=balloon', PRESETS).inspector).toBe('story')
		expect(parseDeepLink('?inspector=asset', PRESETS).inspector).toBe('cards')
		expect(parseDeepLink('?inspector=masters', PRESETS).inspector).toBe('masters')
		expect(parseDeepLink('?inspector=theory', PRESETS).inspector).toBe('theory')
		expect(parseDeepLink('?inspector=bogus', PRESETS).inspector).toBeNull()
	})

	it('validates the theme value', () => {
		expect(parseDeepLink('?theme=dark', PRESETS).theme).toBe('dark')
		expect(parseDeepLink('?theme=auto', PRESETS).theme).toBe('auto')
		expect(parseDeepLink('?theme=neon', PRESETS).theme).toBeNull()
	})

	it('reads master and select params', () => {
		const cfg = parseDeepLink('?master=tezuka&select=first-panel', PRESETS)
		expect(cfg.masterId).toBe('tezuka')
		expect(cfg.selectFirstPanel).toBe(true)
	})
})

describe('theme helpers', () => {
	it('cycles light → dark → auto → light', () => {
		expect(nextThemePref('light')).toBe('dark')
		expect(nextThemePref('dark')).toBe('auto')
		expect(nextThemePref('auto')).toBe('light')
	})

	it('resolves explicit preferences without the OS', () => {
		expect(resolveTheme('light')).toBe('light')
		expect(resolveTheme('dark')).toBe('dark')
	})

	it('maps preferences to a tldraw color scheme', () => {
		expect(tldrawColorScheme('light')).toBe('light')
		expect(tldrawColorScheme('dark')).toBe('dark')
		expect(tldrawColorScheme('auto')).toBe('system')
	})
})
