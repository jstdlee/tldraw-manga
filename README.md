<div align="center">

# tldraw-manga

**AI multimodal manga storyboard, polygon layout, and optical shot studio built on tldraw 5.5 and Electron (native tldraw Paper/Dark visual language · 100% English)**  
*Native tldraw Multimodal LLM (Text · Vision · Image) Manga Storyboard, Polygon Layout, Optical Shot Lab & Multi-Chapter Publishing Studio*

[![Desktop Build & Release](https://github.com/jstdlee/tldraw-manga/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/jstdlee/tldraw-manga/actions/workflows/build-desktop.yml)
[![Latest Release](https://img.shields.io/github/v/release/jstdlee/tldraw-manga?color=2f80ed&label=Release)](https://github.com/jstdlee/tldraw-manga/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Linux%20ARM64%20%7C%20Windows%20x64%20%7C%20Web-2f80ed)](#desktop-download--quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6)](https://www.typescriptlang.org/)
[![tldraw](https://img.shields.io/badge/tldraw-5.5-1a1a1a)](https://tldraw.dev)
[![Multimodal LLM](https://img.shields.io/badge/Multimodal%20LLM-Text%20%C2%B7%20Vision%20%C2%B7%20Image-10b981)](#highlights)

<p align="center">
  <a href="#highlights">Highlights</a> •
  <a href="#screenshots-of-the-progressive-manga-workflow">Screenshots</a> •
  <a href="#desktop-download--quick-start">Desktop Download & Run</a> •
  <a href="#architecture--directory-layout">Architecture</a> •
  <a href="#privacy--security">Privacy & Security</a>
</p>

![tldraw-manga native workbench with layout geometry parameters](docs/screenshots/01-overview-wiring.png)

*▲ Built on the same minimal engineering-drawing visual language as native tldraw 5.5 Paper / Dark themes (`--tl-color-panel`, `--tl-color-background`, 1px hairline dividers, monochrome SVG line icons, zero emoji clutter). Features unfold naturally along the progressive creation stages (`1. Setting Cards → 2. Layout Bench → 3. Panels & Dialogue → 4. Shot Composition → 5. Model Nodes`) and the current canvas selection, keeping the canvas as quiet and restrained as a manga artist's drafting desk.*

</div>

---

## Highlights

### 1. Native tldraw Visual Language & Contextual Progressive Disclosure
- **Native tldraw Paper / Dark dual themes**: fully aligned with tldraw 5.5 color tokens (`--tl-color-panel`, `--tl-color-background`, `--tl-color-muted-2`, `--tl-color-divider`, `--tl-color-text-1`) plus its radius and shadow specs; toggle light/dark from the top bar with live sync to the tldraw canvas.
- **Silent canvas, on-demand disclosure**: each manga page renders by default as a pristine **B4 manga manuscript sheet** (title, layout tag, panel count, and editor score only); the left inspector and the top context bar reveal exactly the pro controls the current stage needs only once you switch to that stage or select a **setting card / manuscript page / specific panel** on the canvas.

### 2. Stage 1 · Setting Cards & the Multimodal AI Bench (`1. Setting Cards`)
- **Text setting cards (`Text Card`)**: one-click **`AI Polish`**, **`AI Regenerate`**, **`Convert to Panel Prompt`**, and custom rewrite directives, plus one-click A/B rollback between the before/after versions.
- **Image reference cards (`Image Card`) & character three-view locks (`@kanta` / `@mei` / `@boss`)**: **`AI Image Repaint`** (via `/api/image`), **`Vision Reverse-Read`** (via `/api/vision` to extract appearance, composition, and lighting descriptions from a reference image), local reference uploads, and custom repaint directives.

### 3. Stage 2 · The Layout Bench, Geometry Params & 6-Axis Editor Prescriptions (`2. Layout Bench`)
- **4 classic layout presets × 5 aspect ratios × 4 row-range tiers**:
  - Presets: `Seizen ordered narrative` / `Standard shonen (std)` / `Diagonal action` / `Tobira splash page`;
  - Aspects: `B4 manga manuscript (0.708)` / `A4 international (0.707)` / `Vertical webtoon (0.500)` / `Four-panel strip (0.480)` / `Widescreen storyboard (1.500)`;
  - Row ranges: `1–3 rows` / `2–3 rows` / `2–4 rows` / `3–4 rows`.
- **Live 5-axis geometry tuning**: `Slant`, `Bleed`, `Sub-split`, `Big-panel weight`, `Line width (1.5–6px)`, plus **`Derive tuned variants from this page's genome`**.
- **36-seed 6-axis editor score (`layoutScore`) with one-click executable prescriptions**:
  - Real-time scoring on six axes: `panel-count fit / hero-panel emphasis / slant tension / vertical-horizontal rhythm / gaze landing / breakout breathing`;
  - Weak axes automatically spawn **one-click fix buttons** (e.g., **`Strengthen the final panel's page-turn hook`**, **`Widen the hero-vs-secondary panel area contrast`**, **`Inject slant and bleed dynamism`**, **`Pull the blade lines back to the ordered narrative`**) that recompute and update the canvas page instantly;
  - Open the **pick-1-of-8 candidate layout workbench** to compare and filter.

### 4. Stage 3 · Emotional Storyboard Kits, Silent Panels & 7 Vector Balloons (`3. Panels & Dialogue`)
- **6 emotional storyboard kits (`one-click emotional pacing`)**: built-in director strategies — `Establish the scene / Closing pressure / Intimate dialogue / Impact instant / Suspense reveal / Final climax` — that re-sequence the shot scale, camera pitch, focal length, and the visual-climax panel of the whole page in one click.
- **Silent panels (`Silent Panel`)**: select any panel to toggle it into a silent panel, auto-clearing its dialogue balloons, switching it to an environment empty shot / gaze beat, and recompiling the page.
- **7 parameterized vector balloons with prosody tags**: plain speech, thought cloud, caption box, dashed whisper, bursting shout, zigzag broadcast, and idiomatic manga onomatopoeia (`WHOOSH—!`, `CLICK!`, `BOOM—!!`, `GLARE—!`), with drag-anywhere tail dots and whole-page AI dialogue polish.

### 5. Stage 4 · Optical Shot Lab, Four-Side Independent Bleed & Composition Guides (`4. Shot Composition`)
- **Optical Shot Lab**: click any panel in the page (`Panel N`) to control the three physical camera parameters:
  - **Focal length (`12mm – 200mm`)**, **aperture (`f/1.4 – f/22`)**, **subject distance (`0.5m – 20m`)**;
  - Real-time physical derivation of **equivalent focal length, horizontal FOV°, derived shot scale (`EWS / WS / MS / MCU / CU / ECU`), DOF blur strength (DOF%), and perspective distortion**, live-driving the in-panel SVG framing zoom and background blur rendering.
- **In-panel fine framing, four-side independent bleed (`bT / bB / bL / bR`) & vertical sub-splits**:
  - Push-in zoom (`0.6x–2.4x`), frame tilt (`-25°~+25°`), double-click-drag panning inside the panel;
  - Independent **top (`bT`) / bottom (`bB`) / left (`bL`) / right (`bR`)** breakout bleed toggles, plus one-click vertical split of the current panel into 2 sub-panels.
- **Professional composition overlays**: toggle **`B4 safe inner margin (Safe Margin)`**, **`rule-of-thirds grid`**, **`180° axis & eyeline crossing check`**, and the **`right-to-left reading flow overlay`** on demand.

### 6. Stage 5 & Final Export · Multimodal Config, Single-Page PNG/SVG, 5-Layer ORA & the Four-Mode HTML Reader
- **Three independent multimodal model routes**: Text LLM (`/api/complete`), Vision LLM (`/api/vision`), and Image Gen (`/api/image`), with one-click presets for OpenAI / Google Gemini / OpenRouter / DeepSeek / local Ollama plus a zero-config offline hand-drawn screentone fallback.
- **Full-spec professional final export**:
  - **Single-page HD export**: one-click **`2400px print-grade PNG`** or **`lossless vector SVG`** for the current page;
  - **`.ora` (OpenRaster) 5-layer refinement package**: `ReadingFlow` (flow & composition check layer), `Bubbles` (dialogue balloon layer), `PanelBorders` (polygon border layer), `PanelArt` (panel art layer), `Paper` (manuscript paper base layer) — drag it straight into **Clip Studio Paint / Krita / GIMP** for layered refinement;
  - **Single-file offline `.html` four-mode reader**: embeds `manga right-to-left spread`, `vertical webtoon scroll`, `guided panel-by-panel zoom`, and `character & world bible` modes.

---

## Screenshots of the Progressive Manga Workflow

### 1 · The Layout Bench (`2. Layout Bench`), 5 geometry sliders, the 6-axis editor score & one-click prescriptions

With a manga page selected at the `2. Layout Bench` stage, the left rail precisely presents the 4 layout presets, aspect ratios, 5 geometry sliders, and the **6-axis editor score + one-click fix buttons** (e.g., `Strengthen the final panel's page-turn hook` at the bottom):

![Stage 2: layout workbench with 6-axis editor prescriptions](docs/screenshots/01-overview-wiring.png)

---

### 2 · The Setting Card workbench (`1. Setting Cards`), panel optical push-in & the progressive context bar

Selecting a setting card or clicking a specific panel on the canvas makes the left inspector and the floating top bar reveal either the card's AI shortcuts (`AI Polish` / `Vision Reverse-Read` / `AI Image Repaint`) or the current panel's **optical focal length (`12–200mm`), aperture (`f/1.4–f/22`), and silent-panel toggle**:

![Stage 1 & 4: setting card AI workbench with per-panel optical linkage](docs/screenshots/02-card-ai-workbench.png)

---

### 3 · The pick-1-of-8 candidate layout workbench with 36-seed 6-axis editor scoring

Click **`Score 8 candidates`** and, within milliseconds, the system derives 36 polygon panel plans from the current genome or by global sampling, filters out the Top 8 candidate layouts, and shows each plan's editor score rationale and optimization advice; click any card to apply it losslessly:

![Stage 2: 36-seed 6-axis pick-1-of-8 workbench](docs/screenshots/03-compare-layout-modal.png)

---

### 4 · The built-in multimodal model configuration center (Text · Vision · Image)

Click the model status pill in the top bar or open the `5. Model Nodes` tab to independently configure the **text model (Text LLM)**, **vision model (Vision LLM)**, and **image generation model (Image Model)**, with one-click switching across 5 major provider presets:

![Stage 5: built-in multimodal model configuration center](docs/screenshots/04-llm-settings-modal.png)

---

### 5 · The whole-book four-mode reader & single-page `2400px PNG / SVG` final export

Click **`Whole-Book Preview`** in the top bar to interactively preview the `manga right-to-left spread`, `vertical webtoon scroll`, `guided panel-by-panel zoom`, and `character & world bible` modes inside the app, or export the current page directly as `2400px PNG`, `single-page SVG`, a `.ora` 5-layer package, or a single-file offline `.html` reader:

![Stage 6: whole-book four-mode preview and final export](docs/screenshots/05-html-reader-export.png)

---

## Desktop Download & Quick Start

### 1. Download the standalone desktop build (`Release v0.2.0`)

This project ships a GitHub Actions multi-architecture pipeline that automatically builds standalone **Linux ARM64** and **Windows x64** desktop apps (bundling local static assets and the `/api/complete`, `/api/vision`, `/api/image` multimodal proxy services):

| Platform & Arch | Package | Download | Notes |
| :--- | :--- | :--- | :--- |
| **Linux ARM64** (`aarch64`) | `.AppImage` | [**tldraw-manga-0.2.0-arm64.AppImage**](https://github.com/jstdlee/tldraw-manga/releases/download/v0.2.0/tldraw-manga-0.2.0-arm64.AppImage) | Single file, no install; run directly after `chmod +x` |
| **Linux ARM64** (`aarch64`) | `.tar.gz` | [**tldraw-manga-0.2.0-arm64.tar.gz**](https://github.com/jstdlee/tldraw-manga/releases/download/v0.2.0/tldraw-manga-0.2.0-arm64.tar.gz) | Extract and run `./tldraw-manga` |
| **Windows x64** (`64-bit`) | Portable `.exe` | [**tldraw-manga.0.2.0.exe**](https://github.com/jstdlee/tldraw-manga/releases/download/v0.2.0/tldraw-manga.0.2.0.exe) | Portable single file; double-click to launch |
| **Windows x64** (`64-bit`) | `.zip` | [**tldraw-manga-0.2.0-win.zip**](https://github.com/jstdlee/tldraw-manga/releases/download/v0.2.0/tldraw-manga-0.2.0-win.zip) | No-install, extract-and-run archive |

> For every release and its checksums, visit the [**GitHub Releases page**](https://github.com/jstdlee/tldraw-manga/releases).

---

### 2. Local web development & running

Requirements: **Node.js >= 20** (Node 22 / 24 recommended).

```bash
# 1. Clone the repo and install dependencies
git clone https://github.com/jstdlee/tldraw-manga.git
cd tldraw-manga
npm install

# 2. Start the local dev server
npm run dev
```

Common quality checks and build commands:

```bash
npm run lint     # Run oxlint static checks
npm test         # Run Vitest unit tests (panel geometry, export package integrity, and Text/Vision/Image route tests)
npm run build    # TypeScript type check + production frontend build (dist/)
```

---

### 3. Electron desktop development & cross-platform packaging

```bash
# Start the Electron desktop dev environment (auto-launches Vite and the local multimodal API proxy)
npm run electron:dev

# Build the Linux ARM64 desktop package (output in release/)
npm run dist:linux-arm64

# Build the Windows x64 desktop package (output in release/)
npm run dist:win-x64

# Build both Linux ARM64 and Windows x64 in one shot
npm run dist:all
```

---

## Architecture & Directory Layout

```text
tldraw-manga/
├── electron/
│   ├── main.mjs                  # Electron main process: embedded loopback HTTP server and /api/* multimodal proxy
│   └── preload.cjs               # Secure context bridge (contextIsolation: true)
├── server/
│   ├── apiHandler.mjs            # Text (/api/complete), vision (/api/vision), and image-gen (/api/image) local proxy with offline fallback
│   └── apiPlugin.ts              # Vite dev & preview middleware mount
├── src/
│   ├── App.tsx                   # Native tldraw dual-theme studio shell and component mounting
│   └── studio/
│       ├── demo/book.ts          # "The Seagull Fries Heist": full script, setting cards, image reference cards, and onomatopoeia
│       ├── editor/pipeline.ts    # Setting-card/panel-page AI pipelines, emotional storyboard strategies, one-click editor fixes, and optical linkage
│       ├── layout/
│       │   ├── engine.ts         # Deterministic polygon panel generation, 5 aspect ratios, four-side bleed, vertical sub-splits, and genome mutation
│       │   └── score.ts          # 6-axis editor score (layoutScore) and one-click executable fix prescriptions
│       ├── optics/
│       │   └── lens.ts           # Optical Shot Lab: focal length (12-200mm) / aperture / subject distance → FOV / shot scale / DOF physical derivation
│       ├── render/
│       │   ├── illustrator.ts    # Zero-key offline black-and-white screentone, character three-view, and optical DOF blur rendering engine
│       │   ├── bubbles.ts        # 7 parameterized vector balloons, tail paths, and manga onomatopoeia rendering
│       │   └── pageSvg.ts        # Manuscript SVG composition (with <clipPath> frame matrices, four-side bleed, and composition guides)
│       ├── shapes/               # Custom tldraw shapes: MangaContainer / MangaCard / MangaBubble / MangaPrompt
│       ├── spec/compile.ts       # Auto-compile ComicsSpec v1 JSON along the canvas wiring topology
│       ├── export/
│       │   ├── htmlReader.ts     # Single-file, multi-chapter, interactive four-mode HTML reader generator
│       │   └── ora.ts            # OpenRaster (.ora) 5-layer refinement package, 2400px PNG, and SVG exporter
│       └── ui/
│           ├── icons.tsx        # 16×16 1.5px monochrome SVG line icon set (zero emoji)
│           └── chrome.tsx       # Progressive 5-stage workbench, context inspector, pick-1-of-8 candidate modal, and four-mode preview modal
└── .github/workflows/
    └── build-desktop.yml         # GitHub Actions auto-test, cross-platform build, and Release publishing pipeline
```

---

## Privacy & Security

- **Zero cloud telemetry**: canvas state stays in the browser or desktop app's local IndexedDB; exported `.html`, `.ora`, `.png`, `.svg`, and `.json` files are generated entirely on your machine.
- **Keys never touch disk or leave the loopback**: Text / Vision / Image API keys entered in the UI live only in local `localStorage` and are sent only to the loopback interface (`127.0.0.1`'s `/api/complete`, `/api/vision`, and `/api/image`); you can also inject them via system environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `LOCAL_LLM_BASE_URL`) — they never pass through any third-party relay server.
