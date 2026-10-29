// =============================================================================
// shell.tsx — macOS-native app-shell chrome built on the pure modules:
//   - CommandPalette   (Cmd-K) over commandRegistry.rankCommands
//   - StageBar         (bottom) over stageStatus.deriveStageStatuses
//   - ShortcutsSheet   (Cmd-/) static keyboard reference
//   - buildCommands    assembles the live Command[] closing over the editor
// The ranking, tab-resolution and status derivation live in their own pure,
// unit-tested modules; this file only renders them and wires side effects.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { rankCommands, type Command, type CommandGroup } from './commandRegistry'
import { APP_STAGES, STAGE_META, hasStaleStage, type StageStatus } from './stageStatus'
import type { AppStage } from '../library/productionStages'
import type { InspectorTab } from './inspectorModel'
import { STAGE_OPS } from '../editor/stageOps'
import { IconBubble, IconCamera, IconClose, IconFileText, IconGrid, IconPlus, IconSettings, IconSparkles } from './icons'
import type { RecentEntry } from './welcome'

// -----------------------------------------------------------------------------
// Command builder
// -----------------------------------------------------------------------------

export interface PagePick {
	id: string
	index: number
	title: string
}

export interface PresetPick {
	id: string
	title: string
}

export interface CommandContext {
	pages: PagePick[]
	presets: PresetPick[]
	theme: 'light' | 'dark'
	hasEditor: boolean
	/** True when the active page has stale factors that can be re-propagated. */
	canRepropagate?: boolean
	repropagate?: () => void
	/** Run a single stage's operator action for the active page. */
	runStage?: (stage: AppStage) => void
	/** Run every stage from stage 1 forward for the active page (full compile). */
	runPipeline?: () => void
	/** Open the welcome sheet (preset browser / blank / recent). */
	openWelcome?: () => void
	focusPage: (id: string) => void
	extendPage: () => void
	switchTab: (tab: InspectorTab) => void
	/** Toggle the right Inspector panel (Cmd-2). */
	toggleDrawer: () => void
	/** Toggle the left source-list sidebar (Cmd-1). */
	toggleSidebar?: () => void
	toggleTheme: () => void
	openReader: () => void
	openCompare: () => void
	openShortcuts: () => void
	openSettings: () => void
	exportHtml: () => void
	applyPreset: (id: string) => void
	createTextCard: () => void
	createImageCard: () => void
}

/** Inspector-tab labels used by Stage commands, aligned with the 5-stage model. */
const STAGE_TAB: Record<AppStage, { tab: InspectorTab; label: string }> = {
	1: { tab: 'cards', label: 'Stage 1 · Context & Assets' },
	2: { tab: 'layout', label: 'Stage 2 · Content & Storyboard' },
	3: { tab: 'layout', label: 'Stage 3 · Layout' },
	4: { tab: 'camera', label: 'Stage 4 · Art' },
	5: { tab: 'story', label: 'Stage 5 · Lettering & Balloons' },
}

/**
 * Assemble the live command list. Pure apart from the side-effecting `run`
 * closures it embeds; the ordering here is the registry order the palette falls
 * back to for an empty query.
 */
export function buildCommands(ctx: CommandContext): Command[] {
	const commands: Command[] = []

	for (const page of ctx.pages) {
		commands.push({
			id: `page:${page.id}`,
			title: `Go to Page P${page.index}`,
			subtitle: page.title,
			group: 'Pipeline',
			keywords: ['page', 'focus', 'navigate', `p${page.index}`],
			run: () => ctx.focusPage(page.id),
		})
	}
	commands.push({
		id: 'pipeline:extend',
		title: 'Extend Next Page',
		subtitle: 'New page inheriting the current context',
		group: 'Pipeline',
		shortcut: '⌘E',
		keywords: ['add', 'new page', 'inherit', 'continuation'],
		disabled: !ctx.hasEditor,
		run: ctx.extendPage,
	})
	if (ctx.repropagate) {
		commands.push({
			id: 'pipeline:repropagate',
			title: 'Re-propagate Stale Stages',
			subtitle: 'Recompute downstream stages · never regenerates images',
			group: 'Pipeline',
			shortcut: '⌘⇧R',
			keywords: ['stale', 'propagate', 'recompute', 'refresh', 'downstream', 'dirty'],
			disabled: !ctx.canRepropagate,
			run: ctx.repropagate,
		})
	}
	if (ctx.runPipeline) {
		commands.push({
			id: 'op:pipeline:all',
			title: 'Compile Full Pipeline for Page',
			subtitle: 'Materialize assets, then run storyboard → layout → lettering',
			group: 'Pipeline',
			keywords: ['run', 'all', 'compile', 'everything', 'pipeline', 'build'],
			disabled: !ctx.hasEditor,
			run: ctx.runPipeline,
		})
	}
	if (ctx.runStage) {
		for (const op of STAGE_OPS) {
			commands.push({
				id: `op:stage:${op.stage}`,
				title: `Run Stage ${op.stage} · ${op.title}`,
				subtitle: op.summary,
				group: 'Pipeline',
				keywords: ['run', 'stage', 'operator', 'block', String(op.stage), op.title.toLowerCase()],
				disabled: !ctx.hasEditor,
				run: () => ctx.runStage?.(op.stage),
			})
		}
	}

	for (const stage of APP_STAGES) {
		const info = STAGE_TAB[stage]
		commands.push({
			id: `stage:${stage}`,
			title: `Open ${info.label}`,
			group: 'Stage',
			shortcut: `⌘${stage}`,
			keywords: ['inspector', 'stage', String(stage)],
			run: () => ctx.switchTab(info.tab),
		})
	}

	commands.push(
		{
			id: 'create:text-card',
			title: 'New Text Reference Card',
			group: 'Create',
			keywords: ['card', 'note', 'reference', 'text'],
			disabled: !ctx.hasEditor,
			run: ctx.createTextCard,
		},
		{
			id: 'create:image-card',
			title: 'New Image Reference Card',
			group: 'Create',
			keywords: ['card', 'image', 'asset', 'i2i', 'reference'],
			disabled: !ctx.hasEditor,
			run: ctx.createImageCard,
		},
	)

	if (ctx.openWelcome) {
		commands.push({
			id: 'masters:open-preset',
			title: 'Open Preset…',
			subtitle: 'Browse the universal story presets',
			group: 'Masters',
			keywords: ['preset', 'open', 'browse', 'library', 'story', 'start'],
			run: ctx.openWelcome,
		})
	}
	for (const preset of ctx.presets) {
		commands.push({
			id: `preset:${preset.id}`,
			title: `Load Preset · ${preset.title}`,
			group: 'Masters',
			keywords: ['preset', 'story', 'master', 'style', 'template'],
			disabled: !ctx.hasEditor,
			run: () => ctx.applyPreset(preset.id),
		})
	}

	if (ctx.toggleSidebar) {
		commands.push({
			id: 'view:sourcelist',
			title: 'Toggle Source List',
			group: 'View',
			shortcut: '⌘1',
			keywords: ['pages', 'pipeline', 'assets', 'library', 'left', 'hide', 'show'],
			run: ctx.toggleSidebar,
		})
	}
	commands.push(
		{
			id: 'view:inspector',
			title: 'Toggle Inspector',
			group: 'View',
			shortcut: '⌘2',
			keywords: ['panel', 'drawer', 'right', 'hide', 'show'],
			run: ctx.toggleDrawer,
		},
		{
			id: 'view:theme',
			title: ctx.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme',
			group: 'View',
			keywords: ['dark', 'light', 'appearance', 'theme'],
			run: ctx.toggleTheme,
		},
		{
			id: 'view:compare',
			title: 'Compare Layout Candidates',
			group: 'View',
			keywords: ['layout', '8', 'candidates', 'score'],
			disabled: !ctx.hasEditor,
			run: ctx.openCompare,
		},
		{
			id: 'view:reader',
			title: 'Open Reader',
			group: 'View',
			shortcut: '⌘R',
			keywords: ['preview', 'book', 'read', 'spread'],
			disabled: !ctx.hasEditor,
			run: ctx.openReader,
		},
		{
			id: 'view:settings',
			title: 'Model Settings',
			group: 'View',
			shortcut: '⌘,',
			keywords: ['api', 'model', 'provider', 'llm', 'vision', 'image', 'settings'],
			run: ctx.openSettings,
		},
		{
			id: 'view:shortcuts',
			title: 'Keyboard Shortcuts',
			group: 'View',
			shortcut: '⌘/',
			keywords: ['keys', 'help', 'hotkeys', 'bindings'],
			run: ctx.openShortcuts,
		},
		{
			id: 'export:html',
			title: 'Export HTML Reader',
			group: 'Export',
			shortcut: '⌘⇧E',
			keywords: ['download', 'standalone', 'web', 'reader'],
			disabled: !ctx.hasEditor,
			run: ctx.exportHtml,
		},
	)

	if (ctx.openWelcome) {
		commands.push({
			id: 'view:welcome',
			title: 'Welcome',
			subtitle: 'Start from a preset, a blank story, or a recent document',
			group: 'View',
			shortcut: '⌘⇧N',
			keywords: ['welcome', 'start', 'new', 'home', 'getting started', 'first run'],
			run: ctx.openWelcome,
		})
	}

	return commands
}

// -----------------------------------------------------------------------------
// Command palette (Cmd-K)
// -----------------------------------------------------------------------------

const GROUP_ORDER: CommandGroup[] = ['Pipeline', 'Stage', 'Create', 'Masters', 'View', 'Export', 'Page', 'Panel', 'Theory']

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
	const [query, setQuery] = useState('')
	const [active, setActive] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const ranked = useMemo(() => rankCommands(query, commands), [query, commands])

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		setActive(0)
	}, [query])

	useEffect(() => {
		const node = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`)
		node?.scrollIntoView({ block: 'nearest' })
	}, [active])

	const invoke = (command: Command | undefined) => {
		if (!command || command.disabled) return
		onClose()
		command.run?.()
	}

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setActive((prev) => (ranked.length ? (prev + 1) % ranked.length : 0))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setActive((prev) => (ranked.length ? (prev - 1 + ranked.length) % ranked.length : 0))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			invoke(ranked[active])
		} else if (event.key === 'Escape') {
			event.preventDefault()
			onClose()
		}
	}

	// Group ranked commands while preserving rank order within each group header.
	const grouped = useMemo(() => {
		const map = new Map<CommandGroup, Command[]>()
		for (const command of ranked) {
			const list = map.get(command.group) ?? []
			list.push(command)
			map.set(command.group, list)
		}
		const order = query.trim()
			? Array.from(map.keys())
			: GROUP_ORDER.filter((group) => map.has(group))
		return order.map((group) => ({ group, items: map.get(group) ?? [] }))
	}, [ranked, query])

	// Flat index map so arrow navigation lines up with the rendered rows.
	let flatIndex = -1

	return (
		<div className="cmdk-backdrop" onClick={onClose}>
			<div
				className="cmdk-panel"
				role="dialog"
				aria-modal="true"
				aria-label="Command palette"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="cmdk-input-row">
					<svg className="tl-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
						<line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					</svg>
					<input
						ref={inputRef}
						type="text"
						className="cmdk-input"
						placeholder="Search commands, pages, presets…"
						aria-label="Search commands"
						role="combobox"
						aria-expanded="true"
						aria-controls="cmdk-list"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={onKeyDown}
					/>
					<kbd className="cmdk-esc">esc</kbd>
				</div>
				<div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
					{ranked.length === 0 ? (
						<div className="cmdk-empty">No matching commands</div>
					) : (
						grouped.map(({ group, items }) => (
							<div key={group} className="cmdk-group">
								<div className="cmdk-group-label">{group}</div>
								{items.map((command) => {
									flatIndex += 1
									const index = flatIndex
									return (
										<div
											key={command.id}
											data-cmd-index={index}
											className={`cmdk-row ${index === active ? 'active' : ''} ${command.disabled ? 'disabled' : ''}`}
											role="option"
											aria-selected={index === active}
											aria-disabled={command.disabled}
											onMouseEnter={() => setActive(index)}
											onClick={() => invoke(command)}
										>
											<span className="cmdk-title">{command.title}</span>
											{command.subtitle ? <span className="cmdk-sub">{command.subtitle}</span> : null}
											{command.shortcut ? <kbd className="cmdk-shortcut">{command.shortcut}</kbd> : null}
										</div>
									)
								})}
							</div>
						))
					)}
				</div>
			</div>
		</div>
	)
}

// -----------------------------------------------------------------------------
// Bottom pipeline stage bar
// -----------------------------------------------------------------------------

const STAGE_ICON: Record<AppStage, ReactElement> = {
	1: <IconFileText />,
	2: <IconBubble />,
	3: <IconGrid />,
	4: <IconCamera />,
	5: <IconSettings />,
}

const STATUS_LABEL: Record<StageStatus, string> = {
	idle: 'Not started',
	done: 'Up to date',
	stale: 'Needs re-propagate',
	running: 'Running',
}

export function StageBar({
	statuses,
	activeStage,
	onFocusStage,
	onRepropagate,
}: {
	statuses: Record<AppStage, StageStatus>
	activeStage: AppStage | null
	onFocusStage: (stage: AppStage) => void
	onRepropagate: () => void
}) {
	const stale = hasStaleStage(statuses)
	return (
		<footer className="stagebar" role="toolbar" aria-label="Pipeline stages">
			<div className="stagebar-chips">
				{STAGE_META.map((meta) => {
					const status = statuses[meta.stage]
					return (
						<button
							key={meta.stage}
							type="button"
							className={`stage-chip status-${status} ${activeStage === meta.stage ? 'focused' : ''}`}
							title={`Stage ${meta.stage} · ${meta.title} — ${STATUS_LABEL[status]}`}
							aria-label={`Stage ${meta.stage} ${meta.title}, ${STATUS_LABEL[status]}`}
							onClick={() => onFocusStage(meta.stage)}
						>
							<span className="stage-icon" aria-hidden="true">
								{STAGE_ICON[meta.stage]}
							</span>
							<span className="stage-num">{meta.stage}</span>
							<span className="stage-title">{meta.title}</span>
							<span className={`stage-dot dot-${status}`} aria-hidden="true" />
						</button>
					)
				})}
			</div>
			{stale ? (
				<button type="button" className="stagebar-repropagate" onClick={onRepropagate}>
					<IconSparkles /> Re-propagate
				</button>
			) : null}
		</footer>
	)
}

// -----------------------------------------------------------------------------
// Keyboard shortcuts sheet (Cmd-/)
// -----------------------------------------------------------------------------

const SHORTCUT_SECTIONS: Array<{ title: string; rows: Array<{ keys: string; label: string }> }> = [
	{
		title: 'Global',
		rows: [
			{ keys: '⌘K', label: 'Command palette' },
			{ keys: '⌘/', label: 'Keyboard shortcuts' },
			{ keys: '⌘⇧N', label: 'Welcome sheet' },
			{ keys: '⌘,', label: 'Model settings' },
			{ keys: '⌘1', label: 'Toggle source list' },
			{ keys: '⌘2', label: 'Toggle Inspector' },
		],
	},
	{
		title: 'Pipeline',
		rows: [
			{ keys: '⌘E', label: 'Extend next page' },
			{ keys: '⌘⇧R', label: 'Re-propagate stale stages' },
			{ keys: '⌘R', label: 'Open reader' },
			{ keys: '⌘⇧E', label: 'Export HTML reader' },
		],
	},
	{
		title: 'Canvas',
		rows: [
			{ keys: 'Right-click', label: 'Grouped context menu for a panel, bubble, page or canvas' },
			{ keys: 'Scroll / Drag', label: 'Zoom and pan a panel image when selected' },
		],
	},
]

// -----------------------------------------------------------------------------
// First-run welcome sheet
// -----------------------------------------------------------------------------

export interface WelcomePreset {
	id: string
	title: string
	subtitle: string
}

interface WelcomeItem {
	key: string
	run: () => void
}

/**
 * First-run welcome sheet (Apple-style centered sheet over a dimmed canvas).
 * Three ways in: start from a curated preset, open a blank story, or reopen a
 * recent document. Fully keyboard-driven (↑/↓ to move, Enter to open, Esc to
 * dismiss) and remembers the "Show at launch" preference. The Recent section is
 * hidden when empty.
 */
export function WelcomeSheet({
	presets,
	recent,
	showAtLaunch,
	onToggleShowAtLaunch,
	onPickPreset,
	onPickRecent,
	onBlank,
	onClose,
}: {
	presets: WelcomePreset[]
	recent: RecentEntry[]
	showAtLaunch: boolean
	onToggleShowAtLaunch: (value: boolean) => void
	onPickPreset: (id: string) => void
	onPickRecent: (id: string) => void
	onBlank: () => void
	onClose: () => void
}) {
	// Flat, ordered list of every actionable row so ↑/↓/Enter line up with render.
	const items: WelcomeItem[] = useMemo(() => {
		const list: WelcomeItem[] = presets.map((preset) => ({ key: `preset:${preset.id}`, run: () => onPickPreset(preset.id) }))
		list.push({ key: 'blank', run: onBlank })
		for (const entry of recent) list.push({ key: `recent:${entry.id}`, run: () => onPickRecent(entry.id) })
		return list
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [presets, recent])

	const [active, setActive] = useState(0)
	const panelRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		panelRef.current?.focus()
	}, [])

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault()
			onClose()
		} else if (event.key === 'ArrowDown') {
			event.preventDefault()
			setActive((prev) => (items.length ? (prev + 1) % items.length : 0))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setActive((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			items[active]?.run()
		}
	}

	const indexOf = (key: string) => items.findIndex((item) => item.key === key)

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box welcome-sheet"
				role="dialog"
				aria-modal="true"
				aria-label="Welcome to Manga Studio"
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={onKeyDown}
				onClick={(event) => event.stopPropagation()}
			>
				<button type="button" className="welcome-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
					<IconClose />
				</button>
				<header className="welcome-head">
					<h2>Manga Studio</h2>
					<p>A canvas-first manga production desk — Scott McCloud theory in the loop, page-by-page pipeline, factor-level control.</p>
				</header>

				<section className="welcome-section">
					<h3 className="welcome-label">Start from a preset</h3>
					<div className="welcome-presets">
						{presets.map((preset) => {
							const index = indexOf(`preset:${preset.id}`)
							return (
								<button
									key={preset.id}
									type="button"
									className={`welcome-card ${index === active ? 'active' : ''}`}
									onMouseEnter={() => setActive(index)}
									onClick={() => onPickPreset(preset.id)}
								>
									<strong>{preset.title}</strong>
									<span>{preset.subtitle}</span>
								</button>
							)
						})}
					</div>
				</section>

				<section className="welcome-section">
					<button
						type="button"
						className={`welcome-blank ${indexOf('blank') === active ? 'active' : ''}`}
						onMouseEnter={() => setActive(indexOf('blank'))}
						onClick={onBlank}
					>
						<IconPlus /> New blank story
						<span>One empty page with default settings</span>
					</button>
				</section>

				{recent.length ? (
					<section className="welcome-section">
						<h3 className="welcome-label">Recent</h3>
						<div className="welcome-recent">
							{recent.map((entry) => {
								const index = indexOf(`recent:${entry.id}`)
								return (
									<button
										key={entry.id}
										type="button"
										className={`welcome-recent-row ${index === active ? 'active' : ''}`}
										onMouseEnter={() => setActive(index)}
										onClick={() => onPickRecent(entry.id)}
									>
										{entry.title}
									</button>
								)
							})}
						</div>
					</section>
				) : null}

				<div className="welcome-foot">
					<label className="welcome-check">
						<input type="checkbox" checked={showAtLaunch} onChange={(event) => onToggleShowAtLaunch(event.target.checked)} />
						Show at launch
					</label>
					<span className="welcome-tip">
						Press <kbd>⌘K</kbd> any time for the command palette
					</span>
				</div>
			</div>
		</div>
	)
}

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box shortcuts-sheet" onClick={(event) => event.stopPropagation()}>
				<header>
					<h3>Keyboard Shortcuts</h3>
					<button type="button" onClick={onClose}>
						Close
					</button>
				</header>
				<div className="shortcuts-grid">
					{SHORTCUT_SECTIONS.map((section) => (
						<section key={section.title} className="shortcuts-section">
							<h4>{section.title}</h4>
							{section.rows.map((row) => (
								<div key={row.label} className="shortcut-row">
									<span>{row.label}</span>
									<kbd>{row.keys}</kbd>
								</div>
							))}
						</section>
					))}
				</div>
			</div>
		</div>
	)
}
