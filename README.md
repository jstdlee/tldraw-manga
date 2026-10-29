<div align="center">

# tldraw-manga

**A canvas-first, macOS-native manga production studio — Scott McCloud comics theory in the loop, a page-by-page five-stage pipeline, and factor-level control over every decision.**

*Built on React 19 · tldraw 5 · Vite · TypeScript. Story-agnostic and style-agnostic: the engine is generic, the presets are pure data.*

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![tldraw](https://img.shields.io/badge/tldraw-5-1a1a1a)](https://tldraw.dev)
[![Tests](https://img.shields.io/badge/tests-Vitest-6da55f)](https://vitest.dev)

</div>

---

## Overview

tldraw-manga turns a manga storyboard into a connected production pipeline you drive directly on an infinite canvas. Every page is a production unit that flows forward (P1 → P2 → P3) and inherits context — settings, named reference assets, continuity — from the page before it. Operations happen in place through grouped, compact, Figma-grade right-click context menus and a contextual Inspector, not through a wall of toolbar buttons.

The engine is deliberately generic. There is no story-specific logic baked into decision-making; universal presets are data that bias the generic engine, and nothing in the pipeline hardcodes a particular series, character, or art style.

The visual language follows the Apple Human Interface Guidelines: a light paper default, an optional true dark mode, the SF Pro system font stack, 13 px controls, hairline dividers, monochrome SVG line icons, and calm 150–200 ms transitions. No neon gradients, no rainbow badges, no decorative emoji in the chrome.

---

## The Five-Stage Pipeline

Production is organized as five stages. Each stage — and each individual factor inside a stage — is independently adjustable and independently re-runnable, and editing one factor marks everything downstream of it stale without destroying it.

| Stage | Name | What it produces |
| :---: | :--- | :--- |
| **1** | Context & Assets | The style bible and the discrete, named reference assets (`@character`, `#environment`, `#prop`, style) used for image-to-image consistency. |
| **2** | Content & Storyboard | Page and scene content, tension curve, and storyboard specs via the JEV decision engine — iterative polling with progressive filtering convergence and condition-gated factor expansion. |
| **3** | Layout | The plot-coupled panel layout: a tension-coupled genome solver that sizes rows, column widths and diagonal slant to the beat. |
| **4** | Art | The asset-locked, pure-art prompt for each panel, with multi-image references. Recompiling a prompt never regenerates existing artwork. |
| **5** | Lettering | Balloons, lettering and reading flow placed against the current layout. |

### Scott McCloud, as decision dimensions

McCloud's framework is central and encoded as checklists and decision dimensions rather than decoration: **closure** and the gutter; the **six panel-to-panel transitions** (moment-to-moment, action-to-action, subject-to-subject, scene-to-scene, aspect-to-aspect, non-sequitur); the **seven word-picture combinations** (word-specific, picture-specific, duo-specific, additive, parallel, montage, interdependent); **amplification through simplification** (iconic abstraction); the **five choices of making comics** (moment, frame, image, word, flow); and **time as space** with the infinite canvas.

### Factor-level editing, stale state, and one-click re-propagation

The pipeline is a factor graph. When you change one factor — a panel's shot scale, the pacing strategy, a master-style blend — the studio computes its downstream closure and marks exactly those factors (and therefore those stages) stale. The bottom **Stage Bar** reflects each stage's live status: *idle*, *up to date*, *needs re-propagate*, or *running*.

**Re-propagate** (⌘⇧R, or the Stage Bar button) recomputes only the stale, derivable stages — Stage 3 layout, Stage 4 prompts, Stage 5 lettering — in topological order, one stage at a time with a visible running indicator. User-owned artwork (uploaded images, pan/zoom/rotation) is always preserved; **re-propagation never regenerates images**. A runner that fails leaves its factors stale for a retry rather than clearing them.

---

## Shell Layout

A three-pane macOS shell wraps the canvas:

- **Top bar** — minimal by design: source-list toggle, document title and active page, a centered command field, the live status line, Reader, Export, a theme cycle, and the Inspector toggle. An unobtrusive status dot opens model settings.
- **Left source list** (⌘1) — an outline view with three groups: **Pipeline** (the page chain with per-page status and inheritance), **Assets** (the discrete named reference registry grouped by character / environment / prop / style), and **Library** (reference tabs).
- **Right Inspector** (⌘2) — a single contextual panel, never a stack. Its tab follows the canvas selection and offers six tabs: **Page**, **Panel**, **Balloon**, **Asset**, **Masters**, **Theory**. The Page tab hosts a compact **Pipeline** disclosure that runs any stage operator for the current page — run one stage, or run a stage and everything downstream — each a single click with a live status dot.
- **Bottom Stage Bar** — the five stage chips with live status and the Re-propagate action.
- **Command palette** (⌘K) — fuzzy-ranked access to every action: page navigation, the stage operators, preset loading, view toggles, export, and re-propagation.
- **Welcome sheet** — a restrained first-run sheet (⌘⇧N) offering a curated preset, a new blank story, or a recent document; it remembers its "Show at launch" preference.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `⌘K` | Open the command palette |
| `⌘/` | Keyboard shortcuts sheet |
| `⌘⇧N` | Open the welcome sheet |
| `⌘,` | Model settings |
| `⌘1` | Toggle the left source list |
| `⌘2` | Toggle the right Inspector |
| `⌘E` | Extend the pipeline with the next page |
| `⌘R` | Open the book reader |
| `⌘⇧E` | Export the standalone HTML reader |
| `⌘⇧R` | Re-propagate stale stages (images untouched) |
| Right-click | Grouped context menu for a panel, bubble, page, or the canvas |

---

## Deep-Link Parameters

Deep links open the studio in a precise state — used by automated snapshots, shared review links, and the headless renderer. Parsing is pure (`src/studio/ui/deepLink.ts`).

| Parameter | Values | Effect |
| :--- | :--- | :--- |
| `ephemeral` | `1` / `true` | Use an in-memory store (no IndexedDB persistence). |
| `preset` | `<id>` / `default` | Load a universal preset on mount (implies `ephemeral`); `default` resolves to the first preset. |
| `theme` | `light` / `dark` / `auto` | Initial appearance, overriding the stored preference. |
| `inspector` | `page` / `panel` / `balloon` / `asset` / `masters` / `theory` | Open that Inspector tab on mount. |
| `master` | `<id>` | Open the Masters tab with that master pre-selected. |
| `select` | `first-panel` | Preselect the first page's first panel. |
| `welcome` | `1` / `true` | Force the welcome sheet open (for screenshots). |
| `demo` | `repropagate` | After load, mark the first page stale and run one re-propagate so the completion toast can be captured. |
| `hold` | `1` / `true` | Keep the transient HUD toast visible far longer (for a clean still). |

---

## Knowledge Library

A story-agnostic, well-researched knowledge layer lives in `src/studio/library/` and biases the generic engine without ever changing output when unused. All lists below are generated from the data files.

### Masters (24)

Osamu Tezuka · Akira Toriyama · Takehiko Inoue · Katsuhiro Otomo · Naoki Urasawa · Kentaro Miura · Hirohiko Araki · Eiichiro Oda · Rumiko Takahashi · Moebius (Jean Giraud) · Hergé · Frank Miller · Jack Kirby · Will Eisner · Chris Ware · Taiyo Matsumoto · Inio Asano · Tsutomu Nihei · Junji Ito · Hayao Miyazaki · He Youzhi · Goseki Kojima · Hiroaki Samura · Yoshihiro Togashi

### Panel Layouts (14)

4-Koma Strip · 3-Tier Grid · 6-Panel Grid · Splash Page · Double-Page Spread · Diagonal Action Cut · Inset Panel · Broken-Border Panel · Borderless Bleed · Vertical Webtoon Stack · Staircase · Widescreen Strip · Kakekomi Irregular · Eisner Open Panel

### Genres (13)

Shonen · Seinen · Shojo · Josei · Gekiga · Horror Manga · Sports Manga · Franco-Belgian Bande Dessinée · American Superhero · Alternative / Indie Comics · Webtoon Vertical Scroll · Chinese Lianhuanhua · Chinese Ink Wash (Shuimo) Comics

### Lettering & Balloons (12)

Speech Balloon · Thought Cloud · Whisper Balloon · Shout / Burst Balloon · Electronic / Radio Balloon · Narration Caption Box · Off-Panel Balloon · Linked Balloons · Monologue Box · Integrated Hand-Lettered Onomatopoeia · Western Block SFX · Ink-Brush SFX

### Tone & Line Styles (10)

Ligne Claire · Feathered Hatching · Cross-Hatching · Gekiga Heavy Blacks · Dot Screentone · Gradient Tone · Ink Wash · Speed Lines · Focus Lines · Beta Flat Black

### Pacing Strategies (8)

Decompression · Compression · Ma (Silent Beat) · Reveal / Page-Turn · Crescendo · Cooldown · Comedic Beat Timing · Action Rhythm

### Production Stages (11)

Concept & Name (Plot Draft) · Script · Thumbnails (Nemu) · Storyboard · Layout & Pencils · Inks · Screentone · Flats & Coloring · Lettering · Finishing & QA · Export & Delivery

### Theory Frameworks (7 frameworks · 20 items)

Frameworks: McCloud · Eisner · Kishōtenketsu · Ma · Flow · Composition · Montage.

Items: Closure · Six Panel-to-Panel Transitions · Seven Word-Picture Combinations · Amplification Through Simplification · Five Choices of Making Comics · Time as Space · Infinite Canvas · Masking Effect · Sequential Art · Timing · Panel as Container / Frame as Device · Kishōtenketsu · Ma (Negative-Space Beat) · 180-Degree Rule · Reading Flow (Z-Path) · Juxtaposition (Kuleshov-like) · Page-Turn Reveal · Gutter Width as Time · Establishing Shot · Rule of Thirds / Focal Hierarchy

---

## Development

Requirements: **Node.js ≥ 20** (Node 22 / 24 recommended).

```bash
npm install        # Install dependencies
npm run dev        # Start the Vite dev server
npm run lint       # Run oxlint static checks
npm test           # Run the Vitest unit suite
npm run build      # tsc -b (strict) + production Vite build to dist/
```

Electron desktop development and packaging:

```bash
npm run electron:dev        # Vite + the local multimodal API proxy, in Electron
npm run dist:linux-arm64    # Build the Linux ARM64 desktop package (release/)
npm run dist:win-x64        # Build the Windows x64 desktop package (release/)
npm run dist:all            # Build both in one shot
```

---

## Architecture

```text
src/
├── App.tsx                         # Studio shell: panes, deep-link mount, command context, theme
└── studio/
    ├── editor/
    │   ├── pipeline.ts             # Page pipeline, asset registry, stage runners, context inheritance
    │   └── stageOps.ts             # Per-page operator actions (run stage N / run from here forward)
    ├── jev/fiveStageEngine.ts      # JEV five-stage decision engine and universal preset data
    ├── library/                    # Story-agnostic knowledge: masters, layouts, genres, lettering,
    │                               #   tones, pacing, production stages, theory, blend
    ├── pipeline/
    │   ├── factorGraph.ts          # The factor dependency graph and downstream closure
    │   ├── dirtyStore.ts           # Serializable per-page stale/running state
    │   ├── repropagate.ts          # Pure topological re-propagation executor (sync + async)
    │   ├── pageMeta.ts             # Bridge between the pure stores and a tldraw page's meta
    │   ├── masterFactors.ts        # Master-style blend → per-panel JEV factor values
    │   └── panelFactors.ts         # Per-panel factor source / lock state
    ├── layout/                     # Deterministic polygon layout engine and six-axis editorial score
    ├── optics/shotLab.ts           # Focal length / aperture / distance → FOV, shot scale, DOF
    ├── render/                     # Offline screentone illustrator, vector balloons, page SVG
    ├── shapes/                     # Custom tldraw shapes: container, card, bubble, prompt
    ├── spec/compile.ts             # Compile the canvas into a ComicsSpec book model
    ├── export/                     # Standalone HTML reader, ORA package, PNG / SVG exporters
    └── ui/
        ├── chrome.tsx              # Top bar, canvas chrome overrides, Compare / Reader / Settings modals
        ├── shell.tsx               # Command palette, Stage Bar, shortcuts sheet, welcome sheet, command builder
        ├── sourceList.tsx          # Left source list (Pipeline / Assets / Library)
        ├── inspector/              # The six Inspector tabs + factor-editing widgets
        ├── commandRegistry.ts      # Pure fuzzy ranking for the command palette
        ├── stageStatus.ts          # Derive the five stage-bar statuses from the dirty set
        ├── deepLink.ts             # Pure deep-link parsing
        ├── welcome.ts              # Pure welcome-sheet decision + recent-document store
        └── theme.ts                # Light / Dark / Auto appearance preference
```

---

## Privacy & Security

- **Local-first.** Canvas state stays in the browser or desktop app's IndexedDB; exported `.html`, `.ora`, `.png`, `.svg`, and `.json` files are generated entirely on your machine.
- **Keys stay on the loopback.** Text / Vision / Image API keys entered in the UI live only in local storage and are sent only to the local `/api/*` proxy; they can also be injected via environment variables and never pass through a third-party relay. With no key configured, a zero-config offline engine and screentone renderer take over.
