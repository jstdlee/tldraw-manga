# Architecture V2 — macOS-Native Manga Production Studio

This document plans the V2 application shell and the domain-knowledge layer that
drives the 5-stage JEV engine. It is a plan: the data libraries and pure logic in
`src/studio/library/` and `src/studio/pipeline/` land first (Pass 1), and the UI
shell described here is implemented in later passes. Nothing here changes existing
engine output unless a style master is explicitly applied.

## 1. Product goals (recap)

A polished, commercial-grade, macOS-native-feeling manga production app. Canvas is
the primary surface; operations happen through grouped, compact cascading
right-click menus rather than toolbar clutter. Production is organized page-by-page
as a forward/backward pipeline (P1 -> P2 -> P3), where each page inherits context
from the previous one and any single factor can be adjusted and re-run without
breaking downstream continuity. The engine stays strictly story-agnostic and
style-agnostic; presets and the master/theory libraries are data only.

## 2. App shell layout

```
+---------------------------------------------------------------------------+
| Title / Unified Toolbar  (traffic-light-safe left padding, 52px tall)     |
|  [<] [>]  Project Name        Stage pills: 1 2 3 4 5     [Cmd-K]  [Share] |
+------------+--------------------------------------------+-----------------+
| Source     |                                            | Inspector       |
| List       |                                            | (contextual)    |
| (sidebar,  |                                            |  tab bar:       |
|  vibrancy) |              CENTRAL CANVAS                 |  Page Panel     |
|            |              (tldraw surface)              |  Balloon Asset  |
|  Pages     |                                            |  Masters Theory |
|   P1 *     |                                            |                 |
|   P2 ~     |                                            |  (fields for    |
|   P3       |                                            |   the current   |
|            |                                            |   selection)    |
|  Assets    |                                            |                 |
|   @chars   |                                            |                 |
|   #envs    |                                            |                 |
|   #props   |                                            |                 |
+------------+--------------------------------------------+-----------------+
| Pipeline Stage Bar:  (1) Context  (2) Storyboard  (3) Layout  (4) Art ... |
|   each stage: done / stale / running status + one-click re-propagate      |
+---------------------------------------------------------------------------+
```

### 2.1 Unified title / toolbar
- One translucent bar fused with the window title (macOS unified toolbar).
- Left padding reserves room for traffic-light controls (`padding-left: 78px` on
  macOS, collapses to the standard grid elsewhere).
- Center: project name + inline Stage 1-5 segmented pills (quick jump).
- Right: Cmd-K command palette trigger, Share/Export.

### 2.2 Left source-list sidebar (NSOutlineView idiom)
- Vibrancy sidebar (`backdrop-filter: blur`, low alpha), 13px control text.
- Two top-level groups:
  - **Pages** — the pipeline. Each page row shows its index and a tiny status
    glyph (done / stale / running). Drag to reorder; the pipeline re-threads
    context inheritance (P-1 exit shot/angle/eyeline/tension -> P entry).
  - **Assets** — the discrete named reference library grouped by category
    (`@character`, `#environment`, `#prop`, `#style`), matching the engine's
    `AssetRegistry`.

### 2.3 Central canvas
- The existing tldraw surface. Grouped cascading right-click menus act on the
  selected shape(s); no new persistent toolbars.

### 2.4 Right Inspector (contextual tabs driven by selection)
The Inspector shows exactly one tab's worth of fields, chosen by what is selected:

| Selection            | Inspector tab | Shows                                                        |
| -------------------- | ------------- | ------------------------------------------------------------ |
| Page / nothing       | Page          | scenario, layout preset, target panels, reading direction    |
| Panel (card)         | Panel         | 14-factor camera/optics, McCloud transition, tension, assets |
| Balloon              | Balloon       | balloon type, prosody style, placement, reading order        |
| Asset                | Asset         | tag, category, lock tokens, reference images, used-in-panels |
| Masters pseudo-sel   | Masters       | master blend weights, per-factor lock/override               |
| Theory pseudo-sel    | Theory        | theory checklists for the current page/panel with pass/warn  |

Tabs are driven by a single selection reducer; switching selection swaps the
active tab, never stacks panels.

### 2.5 Bottom pipeline stage bar
- Compact strip with the five stages as status chips.
- Each chip: `done` (filled), `stale` (hairline + dot), `running` (progress).
- A stale chip offers one-click re-propagate that runs the factor graph's
  topological plan (section 4) from the dirtied factor forward.

### 2.6 Cmd-K command palette
- Fuzzy command list: jump to stage, apply master, insert panel layout template,
  toggle reading direction, run theory audit, export.

## 3. Factor dependency graph

Every adjustable input is a *factor*. Factors live on one of the five stages and
depend on upstream factors. Editing a factor marks all downstream factors/stages
stale (see `src/studio/pipeline/factorGraph.ts`). The canonical edges:

```
STAGE 1  styleBible ----------------------------+--> (4) artPrompt
         assets --------------------------------+--> (4) assetRefs
         readingDirection --+--> (3) panelLayout +--> (5) balloonPlacement
                            |                     +--> (5) gazeTrajectory
STAGE 2  transition -----------> (3) panelLayout
         tension -------------->(3) panelLayout
         cameraFraming --+----> (3) panelLayout
                         +----> (4) artPrompt
         wordPictureMode -+---> (4) negativeSpace
                          +---> (5) lettering
         eyeline --------------> (5) gazeTrajectory
STAGE 3  panelLayout --+------> (3) panelRects
                       +------> (4) artPrompt
         panelRects ----------> (5) balloonPlacement
STAGE 4  negativeSpace -------> (5) balloonPlacement
         artPrompt (terminal render input)
STAGE 5  lettering -----------> (5) gazeTrajectory
         balloonPlacement ----> (5) gazeTrajectory
```

`markDirty(state, factorId)` returns the transitive downstream closure;
`planRepropagation(dirtyFactors)` returns a topological order so re-runs never
process a factor before its dependencies are fresh.

## 4. How the libraries plug into the JEV engine

The domain knowledge lives in `src/studio/library/` as pure, typed, English-only
data plus `blend.ts` (pure logic). Integration is deliberately minimal and
backward-compatible:

- **Masters & theory are data.** `masters.ts` carries, per master, McCloud
  transition/word-picture weight vectors, abstraction and closure intensity,
  preferred panel-layout ids, shot vocabulary, and an explicit `jevBias`
  (layout-score weight deltas) for the engine.
- **`blend.ts`** turns a `StyleProfile` (normalized master weights) into: a style
  bible fragment (prompt tokens + line/tone rules), blended factor vectors
  (transitions, word-picture modes, shots, angles, layouts, pacing), a
  `ScenarioWeightBias` for layout scoring, per-factor overrides (lock to a master
  or a manual value), and theory-checklist evaluation results.
- **Engine wiring is one optional parameter.** `layoutScore` gains an optional
  `styleBias?: ScenarioWeightBias` (additive deltas on the per-scenario weights).
  When it is `undefined` the scoring path is byte-identical to today, so every
  existing test and output is unchanged. `pickTopLayouts` and
  `compileTensionCoupledLayout` thread the same optional bias through. A master
  therefore only ever *biases* candidate ranking; it never hardcodes a layout.

```
StyleProfile (master weights)
      |
      v
  blend.ts  --> styleBibleFragment  --> Stage 1 style bible
            --> factorVectors       --> Stage 2 candidate priors
            --> ScenarioWeightBias  --> layoutScore(styleBias?) [Stage 3]
            --> theory evaluation   --> Inspector Theory tab warnings
```

## 5. Library module map (`src/studio/library/`)

| Module               | Responsibility                                              |
| -------------------- | ----------------------------------------------------------- |
| `productionStages.ts`| Real manga production workflow + deliverables, mapped to 1-5|
| `panelLayouts.ts`    | Normalized 0-1 panel templates + reading direction + adapter|
| `shots.ts`           | Shot sizes, angles, lens presets, camera-move translations  |
| `lettering.ts`       | Balloon types, font roles, SFX styles, placement rules      |
| `tones.ts`           | Screentone & line-weight styles with prompt tokens          |
| `pacing.ts`          | Pacing/emotion strategies with panel-count/transition recs  |
| `genres.ts`          | Genre conventions (layout/pacing/tone/lettering/shot prefs) |
| `masters.ts`         | Master style library with McCloud mapping + jevBias         |
| `theory.ts`          | McCloud / Eisner / kishotenketsu / Ma / flow checklists     |
| `blend.ts`           | Pure blend/override/evaluate logic wiring into the engine   |
| `index.ts`           | Barrel re-export                                            |

`src/studio/pipeline/factorGraph.ts` holds the story-agnostic factor dependency
graph and the dirtiness/propagation functions from section 3.

## 6. Non-negotiable constraints

- 100% English in every artifact. Zero CJK characters anywhere in `src/`.
- Existing engine output is unchanged when no master is applied.
- Pure, fully unit-tested data and logic; no new runtime dependencies.
- Apple HIG light-paper default, optional true dark mode, no "AI slop".
