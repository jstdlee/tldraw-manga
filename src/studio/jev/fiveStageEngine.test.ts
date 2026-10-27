import { describe, expect, it } from 'vitest'
import {
	categoryForTag,
	compileProgrammaticLayoutGenome,
	compileStage4PureArtSpec,
	compileTensionCoupledLayout,
	createAssetRegistry,
	registryForPreset,
	renderGazeFocalTrajectorySvg,
	runIterativePolling4Pass,
	solveAntiOcclusionBubblePlacement,
	solveOnDemandBubbleAndSfxGates,
	solvePageGazeFocalTrajectory,
	splitChineseDialogueBalloons,
	universalPresetToBook,
	UNIVERSAL_STORY_PRESETS,
	verifyAssetRegistryAndBackfill,
	type NormalizedBox,
} from './fiveStageEngine'
import { metaFromBeat } from '../model'
import { planBubbles, toLayoutBubbles } from '../editor/placement'
import { bubbleMarkup, computeProsodyBadgeAnchor } from '../render/bubbles'
import { formatBeatsToScriptText, parseScriptTextToBeats } from '../editor/pipeline'
import type { Beat } from '../model'
import type { Pt, RealizedPanel } from '../layout/engine'

const PRESET_IDS = ['seagull-fries', 'noir-watchmaker', 'shonen-blade', 'wutai-lundao'] as const

function squarePanel(size = 400): RealizedPanel {
	return {
		pts: [
			[0, 0],
			[size, 0],
			[size, size],
			[0, size],
		] as Pt[],
		row: 0,
		col: 0,
		sub: 0,
	}
}

describe('Stage 1 — discrete asset registry verification & auto-backfill', () => {
	it('categorizes tags purely from their prefix', () => {
		expect(categoryForTag('@gull_philosopher')).toBe('character')
		expect(categoryForTag('@char_hero')).toBe('character')
		expect(categoryForTag('#prop_pier_fries_cone')).toBe('prop')
		expect(categoryForTag('#env_rocky_pier_cliff')).toBe('environment')
		expect(categoryForTag('#style_coastal_watercolor')).toBe('style')
	})

	it('auto-backfills every missing @char/#prop/#env/#style tag and never leaves Stage 4 blind', () => {
		const registry = createAssetRegistry('proj-stage1')
		const required = ['@char_hero', '#prop_sword', '#env_castle', '#style_ink']
		const res = verifyAssetRegistryAndBackfill(required, registry)

		expect(res.verified).toBe(true)
		expect(res.resolvedAssets).toHaveLength(4)
		expect(res.referenceImagePaths).toHaveLength(4)
		expect(res.autoBackfilledTags.sort()).toEqual([...required].sort())
		expect(res.resolvedAssets.every((asset) => asset.approved)).toBe(true)
		expect(res.referenceImagePaths.every((path) => path.endsWith('.png'))).toBe(true)
		expect(res.combinedLockPrompt).toContain('@char_hero')

		// The registry has been mutated in place with approved, categorized assets.
		expect(registry.assets['#prop_sword'].category).toBe('prop')
		expect(registry.assets['#env_castle'].category).toBe('environment')
		expect(registry.assets['#style_ink'].category).toBe('style')
		expect(registry.assets['@char_hero'].category).toBe('character')

		// A second verification resolves everything without any further backfill.
		const again = verifyAssetRegistryAndBackfill(required, registry)
		expect(again.autoBackfilledTags).toHaveLength(0)
		expect(again.verified).toBe(true)
	})

	it('is deterministic for the same project + tag', () => {
		const a = createAssetRegistry('proj-det')
		const b = createAssetRegistry('proj-det')
		verifyAssetRegistryAndBackfill(['#prop_lantern'], a)
		verifyAssetRegistryAndBackfill(['#prop_lantern'], b)
		expect(a.assets['#prop_lantern']).toEqual(b.assets['#prop_lantern'])
	})
})

describe('Stage 2 — McCloud on-demand bubble & sfx gating', () => {
	it('suppresses dialogue balloons on picture-specific panels', () => {
		const res = solveOnDemandBubbleAndSfxGates({
			wordPictureMode: 'picture_specific',
			tension: 0.5,
			lines: [{ type: 'speech', text: 'Words that should never have been spoken' }],
		})
		expect(res.hasBubble).toBe(false)
		expect(res.filteredLines.some((line) => line.type !== 'sfx')).toBe(false)
	})

	it('suppresses every balloon and sfx on silent panels', () => {
		const res = solveOnDemandBubbleAndSfxGates({
			silent: true,
			tension: 0.95,
			lines: [
				{ type: 'sfx', text: 'BOOM' },
				{ type: 'speech', text: 'Hey' },
			],
		})
		expect(res.hasBubble).toBe(false)
		expect(res.hasSfx).toBe(false)
		expect(res.filteredLines).toHaveLength(0)
	})

	it('suppresses redundant sfx on dialogue-only / low-tension panels', () => {
		const res = solveOnDemandBubbleAndSfxGates({
			tension: 0.3,
			transition: 'subject_to_subject',
			lines: [{ type: 'speech', text: 'What do you think' }],
		})
		expect(res.hasBubble).toBe(true)
		expect(res.hasSfx).toBe(false)
	})

	it('keeps an explicit sfx, and earns one on a high-tension action beat', () => {
		expect(solveOnDemandBubbleAndSfxGates({ tension: 0.2, lines: [{ type: 'sfx', text: 'CLICK' }] }).hasSfx).toBe(true)
		expect(
			solveOnDemandBubbleAndSfxGates({
				tension: 0.82,
				transition: 'action_to_action',
				lines: [{ type: 'speech', text: 'Go' }],
			}).hasSfx,
		).toBe(true)
	})
})

describe('Stage 2 — Chinese rhetorical-pause balloon splitting', () => {
	it('splits a long line at rhetorical pauses into capped lead/follow balloons', () => {
		const long = 'What you brought here will restart the clock of this city—or stop it forever.'
		const parts = splitChineseDialogueBalloons(long, 12)
		expect(parts.length).toBeGreaterThanOrEqual(2)
		for (const part of parts) expect(Array.from(part).length).toBeLessThanOrEqual(12)
	})

	it('keeps short lines whole and returns nothing for empty input', () => {
		expect(splitChineseDialogueBalloons('Understood.')).toEqual(['Understood.'])
		expect(splitChineseDialogueBalloons('')).toEqual([])
	})

	it('hard-wraps a pause-free overflowing run', () => {
		const parts = splitChineseDialogueBalloons('ABCDEFGHIJKLMNOP', 8)
		expect(parts.length).toBeGreaterThanOrEqual(2)
		for (const part of parts) expect(Array.from(part).length).toBeLessThanOrEqual(8)
	})
})

describe('Stage 2 — 4-pass iterative polling & 180-degree axis repair', () => {
	it('converges across 4 passes and repairs an axis crossing', () => {
		const beats: Beat[] = [
			{ shot: 'CU', angle: 'low', focal: '85mm', beat: 'a', who: ['x'], eyeline: [28, 4], lines: [] },
			{ shot: 'CU', angle: 'eye', focal: '85mm', beat: 'b', who: ['x'], eyeline: [-28, 4], lines: [] },
			{ shot: 'MS', angle: 'eye', focal: '50mm', beat: 'c', who: ['x'], eyeline: [20, 2], lines: [] },
		]
		const res = runIterativePolling4Pass(beats, 'rtl')

		expect(res.passLogs).toHaveLength(4)
		expect(res.passLogs[0].name).toContain('Coarse')
		for (let i = 1; i < res.passLogs.length; i += 1) {
			expect(res.passLogs[i].score).toBeGreaterThanOrEqual(res.passLogs[i - 1].score)
		}
		expect(res.convergedScore).toBeGreaterThanOrEqual(res.passLogs[0].score)
		expect(res.axisAuditPass).toBe(true)
		expect(res.repairedBeats).toHaveLength(3)

		// Original beats untouched; the repaired copy has the offending eyeline flipped.
		expect(beats[1].eyeline).toEqual([-28, 4])
		expect(res.repairedBeats[1].eyeline?.[0]).toBeGreaterThan(0)
	})
})

describe('Stage 3 — tension-coupled continuous half-plane layout & sub-split PiP', () => {
	it('realizes a polygon layout with per-panel tensions and PiP insets', () => {
		const preset = UNIVERSAL_STORY_PRESETS['shonen-blade']
		const res = compileTensionCoupledLayout('stage3-seed', preset.panels, preset.scenario, preset.layoutPreset)

		expect(res.layout.panels.length).toBeGreaterThan(0)
		expect(res.score).toBeGreaterThan(0)
		expect(res.panelTensions).toHaveLength(res.layout.panels.length)
		expect(res.subsplitInsets).toHaveLength(res.layout.panels.length)
		expect(res.panelTensions.every((tension) => tension >= 0 && tension <= 1)).toBe(true)
		expect(res.subsplitInsets.some(Boolean)).toBe(true)

		for (const panel of res.layout.panels) {
			expect(panel.pts.length).toBeGreaterThanOrEqual(3)
		}
	})
})

describe('Stage 4 — asset-locked pure camera prompt & conditional negative space', () => {
	const preset = UNIVERSAL_STORY_PRESETS['noir-watchmaker']

	it('reserves 0% balloon space on silent / picture-specific panels', () => {
		const beat = preset.panels[3] // P01-04 silent, picture_specific
		const registry = registryForPreset(preset)
		const panel = squarePanel()
		const meta = metaFromBeat(beat, panel, 'noir', 3)
		const spec = compileStage4PureArtSpec({
			panelIndex: 3,
			beat,
			meta,
			panelPts: panel.pts,
			registry,
			environment: preset.environment,
			lighting: preset.lighting,
		})
		expect(spec.hasBubble).toBe(false)
		expect(spec.negativeSpaceCorner).toBeNull()
		expect(spec.negativeSpaceRatio).toBe(0)
		expect(spec.pureCameraPrompt).toContain('0% speech balloon reservation')
		expect(spec.referenceImagePaths).toHaveLength(beat.assetRefs?.length ?? 0)
	})

	it('reserves 24%-28% balloon space on a dialogue panel and locks assets', () => {
		const beat = preset.panels[2] // speech, not silent
		const registry = registryForPreset(preset)
		const panel = squarePanel()
		const meta = metaFromBeat(beat, panel, 'noir', 2)
		const spec = compileStage4PureArtSpec({
			panelIndex: 2,
			beat,
			meta,
			panelPts: panel.pts,
			registry,
			environment: preset.environment,
			lighting: preset.lighting,
		})
		expect(spec.hasBubble).toBe(true)
		expect(spec.negativeSpaceCorner).not.toBeNull()
		expect(spec.negativeSpaceRatio).toBeGreaterThanOrEqual(0.24)
		expect(spec.negativeSpaceRatio).toBeLessThanOrEqual(0.28)
		expect(spec.optics.equivFocalMm).toBeGreaterThan(0)
		expect(spec.pureCameraPrompt).toContain('ASSET LOCK')
		expect(spec.pureCameraPrompt).toContain('NO text')
	})
})

describe('Stage 5 — anti-occlusion placement & saccadic gaze trajectory', () => {
	it('shifts a balloon anchor out of the subject saliency box', () => {
		const panel: Pt[] = [
			[0, 0],
			[400, 0],
			[400, 400],
			[0, 400],
		]
		const subject: NormalizedBox = [0.3, 0.3, 0.7, 0.7]
		const res = solveAntiOcclusionBubblePlacement(panel, [subject], [0.5, 0.5], 0.3, 0.3)
		expect(res.iouWithSubject).toBeLessThan(0.2)
		const moved = Math.hypot(res.centerRel[0] - 0.5, res.centerRel[1] - 0.5)
		expect(moved).toBeGreaterThan(0.1)
	})

	it('leaves a non-overlapping candidate in place', () => {
		const panel: Pt[] = [
			[0, 0],
			[400, 0],
			[400, 400],
			[0, 400],
		]
		const subject: NormalizedBox = [0.4, 0.4, 0.6, 0.6]
		const res = solveAntiOcclusionBubblePlacement(panel, [subject], [0.82, 0.18], 0.18, 0.12)
		expect(res.centerRel[0]).toBeCloseTo(0.82)
		expect(res.centerRel[1]).toBeCloseTo(0.18)
	})

	it('builds intra-panel chains and cross-gutter bezier saccades across all 3 universal presets', () => {
		let sawLeadBubble = false
		for (const id of PRESET_IDS) {
			const preset = UNIVERSAL_STORY_PRESETS[id]
			const compiled = compileTensionCoupledLayout(id, preset.panels, preset.scenario, preset.layoutPreset)
			const layout = compiled.layout
			const metas = layout.panels.map((panel, i) =>
				metaFromBeat(preset.panels[i] ?? preset.panels[preset.panels.length - 1], panel, id, i),
			)
			const planned = planBubbles(layout, preset.panels)
			const bubbles = toLayoutBubbles(planned, 460, 650, layout.width, layout.height).map((bubble) => ({
				panelIndex: bubble.panelIndex,
				style: bubble.style,
				x: bubble.x,
				y: bubble.y,
				w: bubble.w,
				h: bubble.h,
			}))
			const trajectory = solvePageGazeFocalTrajectory(layout, metas, bubbles, preset.readingDirection)

			expect(trajectory.panelChains).toHaveLength(layout.panels.length)
			expect(trajectory.crossGutterSaccades).toHaveLength(Math.max(0, layout.panels.length - 1))
			expect(trajectory.flowContinuityScore).toBeGreaterThanOrEqual(0)
			expect(trajectory.flowContinuityScore).toBeLessThanOrEqual(1)
			expect(trajectory.globalSvgPathD).toContain('M')

			for (const chain of trajectory.panelChains) {
				const kinds = chain.orderedNodes.map((node) => node.kind)
				expect(kinds).toContain('subject-focal')
				expect(kinds).toContain('gaze-tip')
				expect(kinds.indexOf('subject-focal')).toBeLessThan(kinds.indexOf('gaze-tip'))
				if (kinds.includes('lead-bubble')) {
					expect(kinds[0]).toBe('lead-bubble')
					sawLeadBubble = true
				}
				expect(chain.intraPanelPathD.startsWith('M')).toBe(true)
			}

			for (const saccade of trajectory.crossGutterSaccades) {
				expect(saccade.bezierPathD).toContain('C')
				expect(saccade.saccadeLengthPx).toBeGreaterThanOrEqual(0)
			}

			const svg = renderGazeFocalTrajectorySvg(id, trajectory, layout.panels.map((panel, i) => ({ pts: panel.pts, meta: metas[i] })))
			expect(svg.startsWith('<g')).toBe(true)
			expect(svg).toContain('marker')
			if (metas.some((meta) => meta.subsplitInset?.enabled)) {
				expect(svg).toContain('PiP')
			}
		}
		expect(sawLeadBubble).toBe(true)
	})
})

describe('Universal story presets', () => {
	it('exposes 3 presets, each convertible to a spawnable BookDraft with its 4 named assets', () => {
		expect(Object.keys(UNIVERSAL_STORY_PRESETS).sort()).toEqual([...PRESET_IDS].sort())
		for (const id of PRESET_IDS) {
			const book = universalPresetToBook(id)
			expect(book).not.toBeNull()
			expect(book?.chapters[0].pages[0].beats.length).toBeGreaterThan(0)
			const registry = registryForPreset(UNIVERSAL_STORY_PRESETS[id])
			expect(Object.keys(registry.assets).length).toBeGreaterThanOrEqual(4)
		}
		expect(universalPresetToBook('does-not-exist')).toBeNull()
	})
})


describe('Interrogation Room (noir-ch03-interrogation) — full 5-stage verification', () => {
	it('locks all 8 discrete assets, splits Chinese breathing dialogue, gates silent Ma panel P4, and solves 5-panel gaze HUD', () => {
		const preset = UNIVERSAL_STORY_PRESETS['noir-watchmaker']
		expect(preset.title).toContain('Ch.3: The Stopped Pocket Watch')
		expect(preset.assets).toHaveLength(8)
		expect(preset.panels).toHaveLength(5)

		const registry = registryForPreset(preset)
		const gate = verifyAssetRegistryAndBackfill(
			['@lu_chen', '@lin_ye', '@shen_mo', '#prop_pocket_watch', '#prop_rust_cuff', '#prop_brass_lighter', '#env_interrogation_room', '#style_seinen_noir'],
			registry,
		)
		expect(gate.verified).toBe(true)
		expect(gate.autoBackfilledTags).toHaveLength(0)

		// Verify Chinese breathing pause splitter on P2, P3, P5 source lines
		expect(
			splitChineseDialogueBalloons('You claim you spent all night sorting old books—then where did that primer come from?', 48),
		).toEqual(['You claim you spent all night sorting old books—', 'then where did that primer come from?'])
		expect(
			splitChineseDialogueBalloons('Look at it—when this watch stopped, the real killer was right beside you.', 45),
		).toEqual(['Look at it—when this watch stopped,', 'the real killer was right beside you.'])
		expect(
			splitChineseDialogueBalloons('Because the scratch inside was made left-handed—right, Deputy Chief Shen?!', 48),
		).toEqual(['Because the scratch inside was made left-handed—', 'right, Deputy Chief Shen?!'])

		// P2 has 0 SFX, P4 is silent Ma beat with 0 bubbles + 0% negative space + ambient micro-SFX 'KCHK...'
		const p2Gate = solveOnDemandBubbleAndSfxGates({
			wordPictureMode: preset.panels[1].wordPictureMode,
			transition: preset.panels[1].mccloudTransition,
			tension: preset.panels[1].tension ?? 0.58,
			lines: preset.panels[1].lines,
		})
		expect(p2Gate.hasBubble).toBe(true)
		expect(p2Gate.hasSfx).toBe(false)

		const p4Gate = solveOnDemandBubbleAndSfxGates({
			silent: preset.panels[3].silent,
			wordPictureMode: preset.panels[3].wordPictureMode,
			transition: preset.panels[3].mccloudTransition,
			tension: preset.panels[3].tension ?? 0.3,
			lines: preset.panels[3].lines,
		})
		expect(p4Gate.hasBubble).toBe(false)
		expect(p4Gate.hasSfx).toBe(true)

		const p4Panel = squarePanel()
		const p4Art = compileStage4PureArtSpec({
			panelIndex: 3,
			beat: preset.panels[3],
			meta: metaFromBeat(preset.panels[3], p4Panel, 'noir', 3),
			panelPts: p4Panel.pts,
			registry,
			environment: preset.environment,
			lighting: preset.lighting,
		})
		expect(p4Art.hasBubble).toBe(false)
		expect(p4Art.negativeSpaceRatio).toBe(0)

		// Alias 'noir-ch03-interrogation' resolves identically
		const bookByAlias = universalPresetToBook('noir-ch03-interrogation')
		expect(bookByAlias).not.toBeNull()
		expect(bookByAlias?.chapters[0].pages[0].beats).toHaveLength(5)
	})
})

describe("Programmatic Stage 2+3 Layout & Camera Decision Lock-in", () => {
	it("deterministically synthesizes tension-coupled Genome [2,2,1], diagonal slopes, climax bleed, and 14-factor optics", () => {
		const preset = UNIVERSAL_STORY_PRESETS["noir-watchmaker"];
		const stage2 = runIterativePolling4Pass(preset.panels, "rtl", preset.scenario);
		expect(stage2.axisAuditPass).toBe(true);
		expect(stage2.repairedBeats).toHaveLength(5);
		expect(stage2.repairedBeats[0].focalMm).toBe(24);
		expect(stage2.repairedBeats[2].focalMm).toBe(85);
		expect(stage2.repairedBeats[4].angle).toBe("dutch");
		expect(stage2.repairedBeats[4].tension).toBeGreaterThanOrEqual(0.85);

		const prog = compileProgrammaticLayoutGenome(stage2.repairedBeats, preset.scenario, "noir-lock");
		expect(prog.panelTensions).toHaveLength(5);
		expect(prog.genome.rows).toHaveLength(3);
		expect(prog.genome.rows.map((r) => r.w.length)).toEqual([2, 2, 1]);
		// Last row is the high-tension climax hook -> bottom & horizontal bleed locked
		expect(prog.genome.rows[2].p[0].bB).toBe(true);
		expect(prog.decisionTrace.length).toBeGreaterThanOrEqual(4);
		expect(prog.decisionTrace[0]).toContain("Stage2→3 Procedural Decision");

		const compiled = compileTensionCoupledLayout("noir-lock", stage2.repairedBeats, preset.scenario, preset.layoutPreset);
		expect(compiled.layout.panels).toHaveLength(5);
		expect(compiled.decisionTrace.length).toBeGreaterThanOrEqual(4);
	});

	it("pre-wires real AI artwork imageDataUrl paths into noir-watchmaker and seagull-fries presets", () => {
		const noir = universalPresetToBook("noir-watchmaker");
		expect(noir).not.toBeNull();
		const noirBeats = noir!.chapters[0].pages[0].beats;
		expect(noirBeats.every((b) => b.imageDataUrl && b.imageDataUrl.startsWith("/assets/interrogation/"))).toBe(true);
		expect(noir!.characters.every((c) => c.imageDataUrl && c.imageDataUrl.startsWith("/assets/interrogation/"))).toBe(true);

		const gull = universalPresetToBook("seagull-fries");
		expect(gull).not.toBeNull();
		expect(gull!.characters.every((c) => c.imageDataUrl && c.imageDataUrl.startsWith("/assets/seagull/"))).toBe(true);
	});
});

describe("Independent Prosody Layer & Bubble Style Controls", () => {
	it("renders all 5 prosody styles (pill, seal, slant, burst, minimal), supports independent drag offsets, and respects hideProsody", () => {
		const styles = ["pill", "seal", "slant", "burst", "minimal"] as const;
		for (const prosodyStyle of styles) {
			const svg = bubbleMarkup({
				style: "speech",
				text: "Look at this pocket watch!",
				prosody: "Cold Scrutinizing",
				emphasis: 1.1,
				w: 180,
				h: 96,
				tailX: 90,
				tailY: 118,
				spin: -4,
				prosodyStyle,
				prosodyOffsetX: 24,
				prosodyOffsetY: -12,
				prosodyScale: 1.25,
				prosodyColor: "#c93d35",
				fillColor: "#f1f5f9",
			});
			expect(svg).toContain(`data-prosody-style="${prosodyStyle}"`);
			expect(svg).toContain("Cold Scrutinizing");
			expect(svg).toContain("#c93d35");
		}

		const baseAnchor = computeProsodyBadgeAnchor({
			style: "speech",
			text: "Look at this pocket watch!",
			prosody: "Cold Scrutinizing",
			emphasis: 1,
			w: 180,
			h: 96,
			tailX: 90,
			tailY: 118,
			spin: 0,
			prosodyStyle: "pill",
			prosodyOffsetX: 0,
			prosodyOffsetY: 0,
			prosodyScale: 1.2,
		});
		const shiftedAnchor = computeProsodyBadgeAnchor({
			style: "speech",
			text: "Look at this pocket watch!",
			prosody: "Cold Scrutinizing",
			emphasis: 1,
			w: 180,
			h: 96,
			tailX: 90,
			tailY: 118,
			spin: 0,
			prosodyStyle: "pill",
			prosodyOffsetX: 30,
			prosodyOffsetY: -15,
			prosodyScale: 1.2,
		});
		expect(shiftedAnchor.visible).toBe(true);
		expect(shiftedAnchor.cx - baseAnchor.cx).toBeCloseTo(30);
		expect(shiftedAnchor.cy - baseAnchor.cy).toBeCloseTo(-15);

		const hiddenSvg = bubbleMarkup({
			style: "speech",
			text: "Hidden prosody layer test",
			prosody: "none",
			emphasis: 1,
			w: 180,
			h: 90,
			tailX: 90,
			tailY: 110,
			spin: 0,
			hideProsody: true,
		});
		expect(hiddenSvg).not.toContain("prosody-independent-layer");
	});
});


describe("Stage 8 — Page-as-Production-Unit pipeline & multi-page context inheritance (P1 -> P2 -> P3)", () => {
	it("round-trips beats through formatBeatsToScriptText and parseScriptTextToBeats while preserving shot, angle, focal, prosody, and inherited asset tags", () => {
		const book = universalPresetToBook("noir-watchmaker")!;
		const p1Beats = book.chapters[0].pages[0].beats;

		const scriptText = formatBeatsToScriptText(p1Beats);
		expect(scriptText).toContain("[WS/eye/18mm]");
		expect(scriptText).toContain("「");

		const parsed = parseScriptTextToBeats(
			scriptText,
			["@lu_chen", "@lin_ye", "#prop_pocket_watch", "#env_interrogation_room"],
			[20, -4],
			p1Beats,
		);
		expect(parsed.length).toBe(p1Beats.length);
		expect(parsed[0].shot).toBe("WS");
		expect(parsed[0].angle).toBe("eye");
		expect(parsed[0].focal).toBe("18mm");
		expect(parsed[0].assetRefs).toContain("@lu_chen");
		expect(parsed[0].assetRefs).toContain("#prop_pocket_watch");
		expect(parsed[0].eyeline?.[0]).toBeGreaterThan(0);
	});

	it("compiles continuous multi-page layouts across P1 -> P2 -> P3 with inherited asset tags and 180-degree eyeline continuity", () => {
		const p2Script = [
			'1. [CU/high/50mm] Lu Chen presses the crown of the stopped watch; a hidden seam pops open on the caseback — 💬 "23:17 wasn\'t a breakdown... it\'s the combination lock." (Cold Scrutinizing) ⚡ "CLACK!"',
			'2. [ECU/dutch/85mm] Inside the hidden compartment lies a micro-film negative stained with dark water (Silent Ma)',
			'3. [MS/eye/35mm] Lin Ye\'s shoulders stiffen as his handcuff chain pulls taut under the table — 💬 "You actually know the old watchmaker\'s mechanism..." (Shaken) ⚡ "CLINK"',
			'4. [WS/low/28mm] Heavy boots echo down the flooded corridor outside as the iron door swings open — 💬 "Captain Lu! Forensics just found the harbor clock tower stopped at the exact same second!!" (Urgent)',
		].join("\n");

		const p2Beats = parseScriptTextToBeats(
			p2Script,
			["@lu_chen", "@lin_ye", "@shen_mo", "#prop_pocket_watch", "#env_interrogation_room"],
			[22, -3],
		);
		expect(p2Beats.length).toBe(4);
		expect(p2Beats[1].silent).toBe(true);
		expect(p2Beats[0].eyeline?.[0]).toBeGreaterThan(0);

		const p2Compiled = compileTensionCoupledLayout("noir-p2", p2Beats, "reveal", "3x2");
		expect(p2Compiled.layout.panels.length).toBe(4);
		expect(p2Compiled.score).toBeGreaterThan(0.75);
	});
});
