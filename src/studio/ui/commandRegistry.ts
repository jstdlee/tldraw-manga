// =============================================================================
// commandRegistry.ts — pure fuzzy search and ranking for the Cmd-K command
// palette. The registry itself is assembled in the UI layer (it closes over the
// editor); this module only defines the Command shape and the ranking logic so
// the ranking is deterministic and unit-testable with no React or editor.
// =============================================================================

export type CommandGroup = 'Pipeline' | 'Stage' | 'Page' | 'Panel' | 'Masters' | 'Theory' | 'View' | 'Export' | 'Create'

export interface Command {
	id: string
	title: string
	subtitle?: string
	group: CommandGroup
	/** Keyboard shortcut hint, already formatted (e.g. "⌘K"). */
	shortcut?: string
	/** Extra terms that should match this command but are not shown as the title. */
	keywords?: string[]
	/** Side-effecting action. Not used by the ranking logic. */
	run?: () => void
	/** When true the command is shown but cannot be invoked (e.g. needs a selection). */
	disabled?: boolean
}

/**
 * Fuzzy subsequence score of `query` against `text`. Returns null when `query`
 * is not a subsequence of `text`. Higher is a better match. Rewards:
 * contiguous runs, matches at word boundaries, and a whole-string prefix;
 * lightly penalises large gaps and very long targets.
 */
export function fuzzyScore(query: string, text: string): number | null {
	const q = query.trim().toLowerCase()
	if (!q) return 0
	const t = text.toLowerCase()
	if (!t) return null

	let score = 0
	let ti = 0
	let prev = -2
	let run = 0
	for (let qi = 0; qi < q.length; qi += 1) {
		const ch = q[qi]
		let found = -1
		for (let j = ti; j < t.length; j += 1) {
			if (t[j] === ch) {
				found = j
				break
			}
		}
		if (found === -1) return null

		let pts = 1
		if (found === prev + 1) {
			run += 1
			pts += 3 + run
		} else {
			run = 0
			const gap = found - (prev + 1)
			pts -= Math.min(gap, 6) * 0.3
		}
		const before = found > 0 ? t[found - 1] : ''
		if (found === 0 || before === ' ' || before === '-' || before === '_' || before === '·' || before === '/') {
			pts += 5
		}
		score += pts
		prev = found
		ti = found + 1
	}

	if (t.startsWith(q)) score += 8
	// Favour shorter, tighter matches when scores are otherwise close.
	score += Math.max(0, 6 - t.length * 0.03)
	return score
}

/**
 * Best fuzzy score of `query` across a command's title, keywords and group.
 * Title matches dominate; keyword/group matches are discounted so a title hit
 * always outranks an incidental keyword hit of the same shape.
 */
export function scoreCommand(query: string, command: Command): number | null {
	const q = query.trim()
	if (!q) return 0

	let best: number | null = fuzzyScore(q, command.title)
	const consider = (text: string | undefined, factor: number) => {
		if (!text) return
		const s = fuzzyScore(q, text)
		if (s === null) return
		const adjusted = s * factor
		if (best === null || adjusted > best) best = adjusted
	}
	if (command.subtitle) consider(command.subtitle, 0.6)
	for (const keyword of command.keywords ?? []) consider(keyword, 0.7)
	consider(command.group, 0.5)
	return best
}

/**
 * Filter + rank commands for a query. An empty query returns the commands in
 * their given (registry) order. Otherwise only matching commands are returned,
 * highest score first; ties keep registry order for a stable, predictable list.
 */
export function rankCommands(query: string, commands: Command[]): Command[] {
	const q = query.trim()
	if (!q) return [...commands]

	const scored: Array<{ command: Command; score: number; index: number }> = []
	commands.forEach((command, index) => {
		const score = scoreCommand(q, command)
		if (score !== null) scored.push({ command, score, index })
	})
	scored.sort((a, b) => (b.score - a.score) || (a.index - b.index))
	return scored.map((entry) => entry.command)
}
