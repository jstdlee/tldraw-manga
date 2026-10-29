import { describe, expect, it } from 'vitest'
import { resolveInspectorTab, resolveTheoryScope, shouldAutoSwitchTab } from './inspectorModel'
import { fuzzyScore, rankCommands, scoreCommand, type Command } from './commandRegistry'
import { completedStagesFrom, deriveStageStatuses, hasStaleStage, STAGE_META } from './stageStatus'
import { buildCommands, type CommandContext } from './shell'

describe('resolveInspectorTab', () => {
	it('maps each selection kind to its tab', () => {
		expect(resolveInspectorTab('card')).toBe('cards')
		expect(resolveInspectorTab('bubble')).toBe('story')
		expect(resolveInspectorTab('panel')).toBe('camera')
		expect(resolveInspectorTab('page')).toBe('layout')
		expect(resolveInspectorTab('none')).toBe('layout')
	})

	it('does not auto-switch on an empty selection', () => {
		expect(shouldAutoSwitchTab('masters', 'none')).toBe(false)
	})

	it('auto-switches when a shape selection resolves to a different tab', () => {
		expect(shouldAutoSwitchTab('masters', 'bubble')).toBe(true)
		expect(shouldAutoSwitchTab('story', 'bubble')).toBe(false)
	})
})

describe('resolveTheoryScope', () => {
	it('maps a balloon selection to the balloon scope', () => {
		expect(resolveTheoryScope({ kind: 'bubble' })).toBe('balloon')
		expect(resolveTheoryScope({ kind: 'bubble', selectedPanel: 2 })).toBe('balloon')
	})

	it('maps a panel selection (or a page with an active panel index) to panel', () => {
		expect(resolveTheoryScope({ kind: 'panel' })).toBe('panel')
		// ?select=first-panel selects the page shape and sets selectedPanel = 0.
		expect(resolveTheoryScope({ kind: 'page', selectedPanel: 0 })).toBe('panel')
		expect(resolveTheoryScope({ kind: 'page', selectedPanel: 3 })).toBe('panel')
	})

	it('maps a page / card / empty selection with no active panel to page', () => {
		expect(resolveTheoryScope({ kind: 'page', selectedPanel: -1 })).toBe('page')
		expect(resolveTheoryScope({ kind: 'page' })).toBe('page')
		expect(resolveTheoryScope({ kind: 'card' })).toBe('page')
		expect(resolveTheoryScope({ kind: 'none', selectedPanel: null })).toBe('page')
	})
})

describe('fuzzyScore', () => {
	it('returns 0 for an empty query and null for a non-subsequence', () => {
		expect(fuzzyScore('', 'anything')).toBe(0)
		expect(fuzzyScore('zzz', 'export page')).toBeNull()
	})

	it('scores a whole-string prefix higher than a scattered match', () => {
		const prefix = fuzzyScore('exp', 'Export Page')
		const scattered = fuzzyScore('exp', 'Extra Panel X')
		expect(prefix).not.toBeNull()
		expect(scattered).not.toBeNull()
		expect(prefix as number).toBeGreaterThan(scattered as number)
	})

	it('rewards word-boundary matches', () => {
		const boundary = fuzzyScore('tt', 'Toggle Theme') // T(oggle) T(heme)
		const inner = fuzzyScore('tt', 'Settings') // se(tt)ings
		expect(boundary).not.toBeNull()
		expect(inner).not.toBeNull()
		expect(boundary as number).toBeGreaterThan(inner as number)
	})
})

describe('scoreCommand', () => {
	it('ranks a title hit above an incidental keyword hit', () => {
		const titleHit: Command = { id: 'a', title: 'Reader', group: 'View' }
		const keywordHit: Command = { id: 'b', title: 'Export HTML', group: 'Export', keywords: ['reader'] }
		const ts = scoreCommand('reader', titleHit)
		const ks = scoreCommand('reader', keywordHit)
		expect(ts).not.toBeNull()
		expect(ks).not.toBeNull()
		expect(ts as number).toBeGreaterThan(ks as number)
	})
})

describe('rankCommands', () => {
	const commands: Command[] = [
		{ id: 'theme', title: 'Toggle Theme', group: 'View' },
		{ id: 'export', title: 'Export HTML Reader', group: 'Export' },
		{ id: 'reader', title: 'Open Reader', group: 'View' },
		{ id: 'extend', title: 'Extend Next Page', group: 'Pipeline' },
	]

	it('returns all commands in registry order for an empty query', () => {
		const result = rankCommands('   ', commands)
		expect(result.map((c) => c.id)).toEqual(['theme', 'export', 'reader', 'extend'])
	})

	it('excludes non-matching commands', () => {
		const result = rankCommands('theme', commands)
		expect(result.map((c) => c.id)).toEqual(['theme'])
	})

	it('ranks the closest match first', () => {
		const result = rankCommands('reader', commands)
		expect(result[0].id).toBe('reader')
	})
})

describe('deriveStageStatuses', () => {
	it('is idle for everything with no state', () => {
		const s = deriveStageStatuses({ dirty: [] })
		expect(s[1]).toBe('idle')
		expect(hasStaleStage(s)).toBe(false)
	})

	it('marks a stage done when completed and clean', () => {
		const s = deriveStageStatuses({ dirty: [], completed: [1, 2, 3, 4, 5] })
		expect(s[3]).toBe('done')
	})

	it('marks a stage stale when it holds a dirty factor', () => {
		const s = deriveStageStatuses({ dirty: ['panelLayout'], completed: [1, 2, 3, 4, 5] })
		expect(s[3]).toBe('stale')
		expect(hasStaleStage(s)).toBe(true)
	})

	it('lets running take precedence over stale', () => {
		const s = deriveStageStatuses({ dirty: ['panelLayout'], running: [3], completed: [1, 2, 3] })
		expect(s[3]).toBe('running')
	})

	it('exposes exactly five stages of metadata', () => {
		expect(STAGE_META.map((m) => m.stage)).toEqual([1, 2, 3, 4, 5])
	})
})

describe('completedStagesFrom', () => {
	it('returns no stages when there is no evidence', () => {
		expect(
			completedStagesFrom({
				hasAssets: false,
				hasStoryboard: false,
				hasLayout: false,
				hasArt: false,
				hasLettering: false,
			}),
		).toEqual([])
	})

	it('maps each evidence flag to its stage independently', () => {
		expect(
			completedStagesFrom({
				hasAssets: true,
				hasStoryboard: false,
				hasLayout: true,
				hasArt: false,
				hasLettering: true,
			}),
		).toEqual([1, 3, 5])
	})
})

describe('buildCommands', () => {
	const baseCtx = (): CommandContext => {
		const noop = () => {}
		return {
			pages: [
				{ id: 'p1', index: 1, title: 'Opening' },
				{ id: 'p2', index: 2, title: 'Rising' },
			],
			presets: [{ id: 'noir', title: 'Rainy Interrogation' }],
			theme: 'light',
			hasEditor: true,
			focusPage: noop,
			extendPage: noop,
			switchTab: noop,
			toggleDrawer: noop,
			toggleTheme: noop,
			openReader: noop,
			openCompare: noop,
			openShortcuts: noop,
			openSettings: noop,
			exportHtml: noop,
			applyPreset: noop,
			createTextCard: noop,
			createImageCard: noop,
		}
	}

	it('builds one navigation command per page plus the five stage commands', () => {
		const commands = buildCommands(baseCtx())
		const pageCmds = commands.filter((c) => c.id.startsWith('page:'))
		const stageCmds = commands.filter((c) => c.id.startsWith('stage:'))
		expect(pageCmds).toHaveLength(2)
		expect(stageCmds).toHaveLength(5)
		expect(commands.some((c) => c.id === 'preset:noir')).toBe(true)
	})

	it('disables editor-dependent commands when there is no editor', () => {
		const commands = buildCommands({ ...baseCtx(), hasEditor: false })
		const extend = commands.find((c) => c.id === 'pipeline:extend')
		const theme = commands.find((c) => c.id === 'view:theme')
		expect(extend?.disabled).toBe(true)
		expect(theme?.disabled).toBeFalsy()
	})

	it('invokes the bound action through the command run closure', () => {
		let focused = ''
		const commands = buildCommands({ ...baseCtx(), focusPage: (id) => (focused = id) })
		commands.find((c) => c.id === 'page:p2')?.run?.()
		expect(focused).toBe('p2')
	})

	it('labels the theme command by the current theme', () => {
		expect(buildCommands(baseCtx()).find((c) => c.id === 'view:theme')?.title).toBe('Switch to Dark Theme')
		expect(buildCommands({ ...baseCtx(), theme: 'dark' }).find((c) => c.id === 'view:theme')?.title).toBe(
			'Switch to Light Theme',
		)
	})
})
