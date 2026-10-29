// =============================================================================
// BalloonTab.tsx — Inspector "Balloon" tab (Stage 5 lettering & reading flow).
// Balloon type, prosody style/color, placement and the per-page balloon layer
// list with show/hide toggles for bubbles, prosody, SFX and the reading-flow
// overlay. Moved out of the legacy left drawer's Script section.
// =============================================================================

import { useValue, type Editor } from 'tldraw'
import { BUBBLE_LABELS } from '../../demo/book'
import { addBubbleToPage, addStandaloneProsodyToPage } from '../../editor/pipeline'
import { PROSODY_STYLE_LABELS, type BubbleStyle, type ProsodyStyle } from '../../model'
import { BUBBLE, CONTAINER, type MangaBubble, type MangaContainer } from '../../shapes/schema'
import { IconBolt, IconBubble, IconEye, IconTag } from '../icons'

const BUBBLES: BubbleStyle[] = ['speech', 'thought', 'caption', 'whisper', 'shout', 'broadcast', 'sfx']
const PROSODY_STYLES: ProsodyStyle[] = ['pill', 'seal', 'slant', 'burst', 'minimal', 'off']

export function BalloonTab({
	editor,
	page,
	setStatus,
}: {
	editor: Editor | null
	page: MangaContainer | null
	setStatus: (value: string) => void
}) {
	const bubbles = useValue<MangaBubble[]>(
		'inspector-page-bubbles',
		() => {
			if (!editor || !page) return []
			return editor
				.getSortedChildIdsForParent(page.id)
				.map((id) => editor.getShape(id))
				.filter((s): s is MangaBubble => s?.type === BUBBLE)
		},
		[editor, page],
	)

	const selectedBubbleId = useValue<string | null>(
		'inspector-selected-bubble',
		() => editor?.getSelectedShapes().find((s) => s.type === BUBBLE)?.id ?? null,
		[editor],
	)

	if (!editor || !page) {
		return (
			<div className="inspector-body">
				<section className="side-section">
					<div className="sec-head">
						<h3>Balloons & Lettering</h3>
						<span>Select a page</span>
					</div>
					<p className="side-hint">Select a page or balloon on the canvas to edit speech balloons, prosody tags and the reading flow.</p>
				</section>
			</div>
		)
	}

	const panelIdx = page.props.selectedPanel >= 0 ? page.props.selectedPanel : 0

	return (
		<div className="inspector-body">
			<section className="side-section">
				<div className="sec-head">
					<h3>Layers · {bubbles.length} balloons</h3>
					<span>Reading flow</span>
				</div>
				<div className="preset-pill-row">
					<button
						type="button"
						className={page.props.showBubblesLayer !== false ? 'preset-pill active' : 'preset-pill'}
						onClick={() =>
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showBubblesLayer: page.props.showBubblesLayer === false } })
						}
					>
						<IconBubble /> Bubbles {page.props.showBubblesLayer !== false ? 'On' : 'Off'}
					</button>
					<button
						type="button"
						className={page.props.showProsodyLayer !== false ? 'preset-pill active' : 'preset-pill'}
						onClick={() =>
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showProsodyLayer: page.props.showProsodyLayer === false } })
						}
					>
						<IconTag /> Prosody {page.props.showProsodyLayer !== false ? 'On' : 'Off'}
					</button>
					<button
						type="button"
						className={page.props.showSfxLayer !== false ? 'preset-pill active' : 'preset-pill'}
						onClick={() =>
							editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showSfxLayer: page.props.showSfxLayer === false } })
						}
					>
						<IconBolt /> SFX {page.props.showSfxLayer !== false ? 'On' : 'Off'}
					</button>
					<button
						type="button"
						className={page.props.showFlow ? 'preset-pill active' : 'preset-pill'}
						onClick={() => editor.updateShape<MangaContainer>({ id: page.id, type: CONTAINER, props: { showFlow: !page.props.showFlow } })}
					>
						<IconEye /> Flow {page.props.showFlow ? 'On' : 'Off'}
					</button>
				</div>
				<div className="quick-ai-grid" style={{ marginTop: 6 }}>
					<button
						type="button"
						onClick={() => {
							addBubbleToPage(editor, page, panelIdx, 'speech', 'Hold on—!', 'Cold Scrutinizing', 'pill')
							setStatus(`Added a speech balloon to panel #${panelIdx + 1}`)
						}}
					>
						<IconBubble /> Add Speech Balloon
					</button>
					<button
						type="button"
						onClick={() => {
							addStandaloneProsodyToPage(editor, page, panelIdx, 'Cold Scrutinizing', 'seal', 'CLACK!')
							setStatus(`Added a prosody / SFX tag to panel #${panelIdx + 1}`)
						}}
					>
						<IconTag /> Add Prosody / SFX
					</button>
				</div>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>Balloon List</h3>
					<span>Draggable · editable</span>
				</div>
				{bubbles.length === 0 ? (
					<p className="side-hint">No balloons on this page yet. Add one above or from a panel's context menu.</p>
				) : (
					<div className="balloon-list">
						{bubbles.map((b, bIdx) => (
							<div key={b.id} className={`balloon-row ${b.id === selectedBubbleId ? 'active' : ''}`}>
								<div className="balloon-row-head">
									<strong onClick={() => editor.select(b.id)}>
										#{bIdx + 1} · panel {b.props.panelIndex + 1} · {BUBBLE_LABELS[b.props.bubble] ?? b.props.bubble}
									</strong>
									<div className="balloon-row-actions">
										<button type="button" className="link-btn" onClick={() => editor.select(b.id)}>
											Focus
										</button>
										<button type="button" className="link-btn danger" onClick={() => editor.deleteShapes([b.id])}>
											Delete
										</button>
									</div>
								</div>
								<div className="balloon-row-grid-2">
									<input
										type="text"
										value={b.props.text}
										placeholder="Dialogue text / SFX..."
										onChange={(e) => editor.updateShape<MangaBubble>({ id: b.id, type: BUBBLE, props: { text: e.target.value } })}
									/>
									<input
										type="text"
										value={b.props.prosody}
										placeholder="Prosody label (e.g. Cold Scrutinizing)"
										onChange={(e) => editor.updateShape<MangaBubble>({ id: b.id, type: BUBBLE, props: { prosody: e.target.value } })}
									/>
								</div>
								<div className="balloon-row-grid-3">
									<select
										aria-label={`Balloon ${bIdx + 1} shape`}
										value={b.props.bubble}
										onChange={(e) => editor.updateShape<MangaBubble>({ id: b.id, type: BUBBLE, props: { bubble: e.target.value as BubbleStyle } })}
									>
										{BUBBLES.map((st) => (
											<option key={st} value={st}>
												{BUBBLE_LABELS[st] ?? st}
											</option>
										))}
									</select>
									<select
										aria-label={`Balloon ${bIdx + 1} prosody style`}
										value={(b.props.prosodyStyle as ProsodyStyle) || 'pill'}
										onChange={(e) => editor.updateShape<MangaBubble>({ id: b.id, type: BUBBLE, props: { prosodyStyle: e.target.value as ProsodyStyle } })}
									>
										{PROSODY_STYLES.map((ps) => (
											<option key={ps} value={ps}>
												{PROSODY_STYLE_LABELS[ps]}
											</option>
										))}
									</select>
									<select
										aria-label={`Balloon ${bIdx + 1} prosody color`}
										value={b.props.prosodyColor || ''}
										onChange={(e) => editor.updateShape<MangaBubble>({ id: b.id, type: BUBBLE, props: { prosodyColor: e.target.value } })}
									>
										<option value="">Default</option>
										<option value="#0066cc">Cobalt Blue</option>
										<option value="#c93d35">Crimson Seal</option>
										<option value="#18222c">Sumi Ink</option>
										<option value="#0f766e">Teal Ink</option>
										<option value="#d97706">Amber Gold</option>
									</select>
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	)
}
