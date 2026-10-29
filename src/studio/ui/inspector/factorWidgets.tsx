// =============================================================================
// factorWidgets.tsx — small, monochrome presentational widgets shared by the
// Masters, Theory and Panel inspector tabs: a horizontal bar chart (accent +
// greys only, no colour), a factor-source badge (auto / master / manual), a
// compact lock toggle and a theory-status glyph. Pure/stateless.
// =============================================================================

import type { FactorSource } from '../../pipeline/panelFactors'
import type { TheoryStatus } from '../../library/blend'
import { IconLock, IconUnlock } from '../icons'

export interface BarDatum {
	label: string
	value: number
}

/**
 * A compact horizontal bar chart. Bars are greyscale; the single largest bar is
 * tinted with the accent so the dominant factor reads at a glance. Values are
 * normalized to the largest datum, so any weight scale works.
 */
export function MonoBarChart({ data, maxRows = 6 }: { data: BarDatum[]; maxRows?: number }) {
	const rows = data
		.filter((d) => Number.isFinite(d.value) && d.value > 0)
		.sort((a, b) => b.value - a.value)
		.slice(0, maxRows)
	if (!rows.length) return <p className="side-hint">No weighted factors.</p>
	const peak = rows[0].value
	return (
		<div className="mc-barchart" role="img" aria-label="Factor weight distribution">
			{rows.map((row, idx) => (
				<div key={row.label} className="mc-bar-row">
					<span className="mc-bar-label">{row.label}</span>
					<span className="mc-bar-track">
						<span
							className={`mc-bar-fill ${idx === 0 ? 'peak' : ''}`}
							style={{ width: `${Math.max(4, Math.round((row.value / peak) * 100))}%` }}
						/>
					</span>
					<span className="mc-bar-value">{Math.round(row.value * 100)}</span>
				</div>
			))}
		</div>
	)
}

const SOURCE_LABEL: Record<FactorSource, string> = {
	auto: 'Auto',
	master: 'Master',
	manual: 'Manual',
}

/** A tiny badge showing where a factor's value came from. */
export function SourceBadge({ source }: { source: FactorSource }) {
	return <span className={`source-badge source-${source}`}>{SOURCE_LABEL[source]}</span>
}

/** A compact lock toggle; locked factors survive re-runs and master application. */
export function LockToggle({ locked, onToggle, label }: { locked: boolean; onToggle: () => void; label: string }) {
	return (
		<button
			type="button"
			className={locked ? 'factor-lock locked' : 'factor-lock'}
			aria-pressed={locked}
			title={locked ? `${label} is locked — survives re-runs` : `Lock ${label} so re-runs keep it`}
			aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
			onClick={onToggle}
		>
			{locked ? <IconLock /> : <IconUnlock />}
		</button>
	)
}

const STATUS_GLYPH: Record<TheoryStatus, string> = { pass: '●', warn: '▲', info: '○' }
const STATUS_TITLE: Record<TheoryStatus, string> = {
	pass: 'Satisfied',
	warn: 'Needs review',
	info: 'Visual judgement',
}

/** A small monochrome glyph for a theory checklist's auto status. */
export function TheoryStatusGlyph({ status }: { status: TheoryStatus }) {
	return (
		<span className={`theory-status status-${status}`} title={STATUS_TITLE[status]} aria-label={STATUS_TITLE[status]}>
			{STATUS_GLYPH[status]}
		</span>
	)
}
