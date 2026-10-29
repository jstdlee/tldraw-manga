// =============================================================================
// MastersTab.tsx — Inspector "Masters" reference tab.
// Pass 3B ships this as a clean, read-only placeholder that surfaces the master
// style library (data from src/studio/library/masters.ts). The blend-weight
// sliders and per-factor lock/override controls are wired in the next pass.
// =============================================================================

import { MASTERS } from '../../library/masters'
import { IconSparkles } from '../icons'

export function MastersTab() {
	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Master Style Library</h3>
					<span>{MASTERS.length} masters</span>
				</div>
				<p className="side-hint">
					Blend master style profiles to bias the JEV engine toward a transition grammar, abstraction
					level and layout vocabulary. Applying a master only biases candidate ranking; it never
					hardcodes a layout. Blend-weight sliders and per-factor locks arrive in the next pass.
				</p>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Available Masters</h3>
					<span>Reference</span>
				</div>
				<div className="master-list">
					{MASTERS.map((master) => (
						<div key={master.id} className="master-row">
							<div className="master-row-head">
								<strong>{master.name}</strong>
								<span className="master-meta">{master.region} · {master.era}</span>
							</div>
							<p className="master-trait">{master.signatureTraits[0]}</p>
							<div className="master-chips">
								<span className="inspector-chip">
									<IconSparkles /> abstraction {Math.round(master.mccloud.abstraction * 100)}%
								</span>
								<span className="inspector-chip">closure {Math.round(master.mccloud.closureIntensity * 100)}%</span>
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
