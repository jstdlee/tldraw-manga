# tldraw Manga Studio

A mouse-driven manga desk on [tldraw](https://tldraw.dev). The sample book *海鸥抢薯条 / Seagull Fries Heist* is already on the canvas: a bible, two chapters, and five B4 pages with polygon panels, vector balloons, and reading-flow lines.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (this repo uses port `43123`).

```bash
npm test
npm run build
```

## Desktop

`npm run electron:dev` starts Vite and opens the same desk in an Electron window. The packaged app serves `dist/` from `127.0.0.1` on a free port and uses the same `/api/health`, `/api/complete`, and `/api/image` handler as the dev server.

```bash
npm run electron:pack      # unpacked app under release/
npm run dist:linux-arm64   # AppImage and tar.gz for ARM64 Linux
npm run dist:win-x64       # portable exe and zip for 64-bit Windows
npm run dist:all           # both of the above
```

`electron-builder` downloads the target Electron runtime, so both `dist:linux-arm64` and `dist:win-x64` can run on an x64 Linux machine. AppImage packing needs `squashfs-tools` (and `libfuse2` to launch the image). The GitHub workflow builds Linux on `ubuntu-24.04-arm` and Windows on `windows-latest`. Artifacts land in `release/`. Icons are `build/icon.png`, `build/icon.ico`, and `build/icon.icns` (regenerate them with `node scripts/render-icon.mjs`).

Pushing to `main`, opening a pull request, or tagging `v*` runs `.github/workflows/build-desktop.yml`. That workflow lints, tests, builds the web app, then uploads the Linux ARM64 and Windows x64 packages. A `v*` tag also publishes those files on the GitHub release. You can start the same workflow by hand from the Actions tab.

HTML export, the layered zip, and the Comics JSON download use the browser download path, so they open the system save dialog in the desktop window. **复制 Spec JSON** copies the spec to the clipboard.

## What you can do with the mouse

- Drag the red gutter handles on a page to change panel size and tilt.
- Double-click a panel, then drag, scroll, or use the zoom and rotate sliders. The polygon frame stays put.
- Drag a balloon. Drag the blue tail tip toward a mouth. Double-click the words to edit them. The bar under the canvas switches style and prosody (`[冷笑]`, `[颤抖]`, `[怒吼]`, `[低语]`, `[停顿]`).
- Click a container’s right-hand dot, then another container’s left-hand dot, to pass the compiled spec downstream.
- Drop a prompt block or a character card from the left column onto the canvas.
- `🎲 换分格` scores 36 deterministic layouts locally. `四选一` shows the top four. `🧬 局部变异` nudges the current genome.
- `👁️ 阅读动线` draws the right-to-left path in red, the balloon chain in blue, and eyelines in green.
- Select a chapter or a page, then preview or export. With nothing selected, the whole book is used.

The HTML download is one file: right-to-left spreads, webtoon scroll, panel-by-panel zoom, balloon and director toggles, and a character appendix. The zip holds an OpenRaster `.ora` per page (Director, Bubbles, Ink, Art, Paper) plus SVG.

## Pictures without a key

Every render button draws an offline ink-and-screentone page. No API key is required.

To call a model, open **图像 / 文本 API** and turn the switch on. The browser sends the key only to the local Vite proxy (`/api/complete`, `/api/image`). You can also put `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `LOCAL_LLM_BASE_URL` in the environment that starts Vite. If the request fails, the page stays on the offline drawing.
