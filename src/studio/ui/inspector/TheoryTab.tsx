// =============================================================================
// TheoryTab.tsx — Inspector "Theory" reference tab.
// Pass 3B ships this as a clean, read-only placeholder that surfaces the comics
// theory library (data from src/studio/library/theory.ts), grouped by framework.
// Live pass/warn checklist evaluation for the current page/panel is wired in the
// next pass.
// =============================================================================

import { THEORY_ITEMS, type TheoryFramework } from '../../library/theory'

const FRAMEWORK_LABELS: Partial<Record<TheoryFramework, string>> = {
	mccloud: 'McCloud · Understanding Comics',
	eisner: 'Eisner · Sequential Art',
	kishotenketsu: 'Kishotenketsu · Four-Act Structure',
	ma: 'Ma · The Pause Between',
	flow: 'Reading Flow & Gaze',
	composition: 'Composition & Staging',
	montage: 'Montage & Juxtaposition',
}

export function TheoryTab() {
	const frameworks = Array.from(new Set(THEORY_ITEMS.map((item) => item.framework)))

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Comics Theory</h3>
					<span>{THEORY_ITEMS.length} principles</span>
				</div>
				<p className="side-hint">
					Checklists derived from McCloud, Eisner, kishotenketsu, Ma and reading-flow theory. The next
					pass evaluates each item against the selected page or panel and reports pass / warn inline.
				</p>
			</section>

			{frameworks.map((framework) => (
				<section key={framework} className="side-section">
					<div className="sec-head">
						<h3>{FRAMEWORK_LABELS[framework] ?? framework}</h3>
					</div>
					<div className="theory-list">
						{THEORY_ITEMS.filter((item) => item.framework === framework).map((item) => (
							<div key={item.id} className="theory-row">
								<strong>{item.title}</strong>
								<p>{item.explanation}</p>
							</div>
						))}
					</div>
				</section>
			))}
		</div>
	)
}
