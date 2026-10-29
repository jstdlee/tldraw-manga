// =============================================================================
// AssetTab.tsx — Inspector "Asset" tab (Stage 1 context & reference assets).
// Create text / visual reference cards on the canvas, run the card-scoped AI
// quick actions (polish / regenerate / vision / redraw) that back multi-image
// image-to-image consistency, and inspect the binding of the selected asset card
// (tag, category, lock state). Moved out of the legacy left drawer.
// =============================================================================

import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import {
	applySelectedCardAiAction,
	createImageCardOnCanvas,
	createTextCardOnCanvas,
	polishPageWithAi,
} from '../../editor/pipeline'
import { categoryForTag } from '../../jev/fiveStageEngine'
import { CARD, type MangaCard } from '../../shapes/schema'
import { IconEye, IconImage, IconLock, IconPlus, IconRefresh, IconSend, IconSparkles, IconUser, IconWand } from '../icons'

const CATEGORY_LABEL: Record<string, string> = {
	character: 'Character',
	environment: 'Environment',
	prop: 'Prop',
	style: 'Style',
}

export function AssetTab({ editor, setStatus }: { editor: Editor | null; setStatus: (value: string) => void }) {
	const [prompt, setPrompt] = useState('')

	const selectedCard = useValue<MangaCard | null>(
		'inspector-selected-card',
		() => {
			if (!editor) return null
			return editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD) ?? null
		},
		[editor],
	)

	const runCardOrPage = async (action: 'polish' | 'regenerate' | 'vision' | 'redraw') => {
		if (!editor) return
		const card = editor.getSelectedShapes().find((s): s is MangaCard => s.type === CARD)
		if (card) {
			setStatus(await applySelectedCardAiAction(editor, card, action, prompt))
		} else if (action === 'polish') {
			setStatus(await polishPageWithAi(editor, prompt))
		} else {
			setStatus('Select a reference card to run this action')
		}
	}

	return (
		<div className="inspector-body">
			{selectedCard ? (
				<section className="side-section">
					<div className="sec-head">
						<h3>Selected Asset</h3>
						<span>{CATEGORY_LABEL[categoryForTag(selectedCard.props.tag || '@asset')] ?? 'Asset'}</span>
					</div>
					<div className="form-row">
						<label>Tag</label>
						<input
							type="text"
							value={selectedCard.props.tag}
							placeholder="@character / #env / #prop"
							onChange={(event) =>
								editor?.updateShape<MangaCard>({ id: selectedCard.id, type: CARD, props: { tag: event.target.value } })
							}
						/>
					</div>
					<div className="form-row">
						<label>Name</label>
						<input
							type="text"
							value={selectedCard.props.title}
							onChange={(event) =>
								editor?.updateShape<MangaCard>({ id: selectedCard.id, type: CARD, props: { title: event.target.value } })
							}
						/>
					</div>
					<div className="form-row stacked">
						<label>Visual Lock Tokens</label>
						<textarea
							rows={3}
							value={selectedCard.props.body}
							placeholder="Describe the canonical look used for image-to-image reference."
							onChange={(event) =>
								editor?.updateShape<MangaCard>({ id: selectedCard.id, type: CARD, props: { body: event.target.value } })
							}
						/>
					</div>
					<button
						type="button"
						className={selectedCard.props.locked ? 'inspector-toggle active' : 'inspector-toggle'}
						onClick={() =>
							editor?.updateShape<MangaCard>({
								id: selectedCard.id,
								type: CARD,
								props: { locked: !selectedCard.props.locked },
							})
						}
					>
						<IconLock /> {selectedCard.props.locked ? 'Locked for I2I reference' : 'Lock for I2I reference'}
					</button>
				</section>
			) : (
				<section className="side-section">
					<div className="sec-head">
						<h3>Reference Assets</h3>
						<span>Stage 1</span>
					</div>
					<p className="side-hint">
						Place discrete named reference cards on the canvas and lock them as image-to-image anchors.
						Select a card to edit its tag, name and visual lock tokens.
					</p>
				</section>
			)}

			<section className="side-section">
				<div className="sec-head">
					<h3>New Reference Card</h3>
					<span>Text / Visual</span>
				</div>
				<div className="card-spawn-grid">
					<button
						type="button"
						className="spawn-card-btn text-card-btn"
						onClick={() => {
							if (!editor) return
							createTextCardOnCanvas(editor, 'note', 'Reference Card', 'Describe a scene beat, character, world rule or motif.')
							setStatus('Created text reference card on canvas')
						}}
					>
						<strong>
							<IconPlus /> Text Card
						</strong>
						<small>Character / story / world · text LLM polish and regenerate</small>
					</button>
					<button
						type="button"
						className="spawn-card-btn img-card-btn"
						onClick={() => {
							if (!editor) return
							createImageCardOnCanvas(
								editor,
								'image',
								'Visual Reference Card',
								'#reference',
								'Describe the reference art, framing and tone for image-to-image.',
							)
							setStatus('Created visual reference card on canvas')
						}}
					>
						<strong>
							<IconImage /> Image Card
						</strong>
						<small>Reference art / concept · vision analysis and AI render</small>
					</button>
				</div>
				<button
					type="button"
					className="inspector-row-btn"
					onClick={() => {
						if (!editor) return
						createImageCardOnCanvas(editor, 'character', 'Character Turnaround Sheet', '@character', 'Front, three-quarter and side views on a neutral background for a canonical character lock.')
						setStatus('Placed character turnaround sheet on canvas')
					}}
				>
					<IconUser /> New Character Turnaround Sheet
				</button>
			</section>

			<section className="side-section">
				<div className="sec-head">
					<h3>AI Quick Actions</h3>
					<span>A/B reversible diff</span>
				</div>
				<div className="quick-ai-grid">
					<button type="button" onClick={() => void runCardOrPage('polish')}>
						<IconSparkles /> AI Polish
					</button>
					<button type="button" onClick={() => void runCardOrPage('regenerate')}>
						<IconRefresh /> Regenerate
					</button>
					<button type="button" onClick={() => void runCardOrPage('vision')}>
						<IconEye /> Vision Analyze
					</button>
					<button type="button" onClick={() => void runCardOrPage('redraw')}>
						<IconWand /> Redraw Art
					</button>
				</div>
				<div className="quick-prompt-row">
					<input
						type="text"
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						placeholder="Custom directive (e.g. cyberpunk rain, heighten low-angle tension)..."
					/>
					<button type="button" onClick={() => void runCardOrPage('polish')}>
						<IconSend /> Run
					</button>
				</div>
			</section>
		</div>
	)
}
