import type { CompiledBook } from '../spec/compile'
import { SCENARIO_LABELS } from '../demo/book'

export function readerHtml(book: CompiledBook): string {
	const payload = {
		title: book.spec.title,
		subtitle: book.spec.style.preset,
		bible: book.spec.bible,
		chapters: book.spec.chapters.map((chapter) => ({
			title: chapter.title,
			mood: chapter.overrides.mood,
			environment: chapter.overrides.environment,
			pages: chapter.pages.map((page) => {
				const rendered = book.pages.find((item) => item.id === page.id)
				return {
					id: page.id,
					title: rendered?.specTitle ?? `P${page.index}`,
					svg: rendered?.svg ?? '',
					width: page.layout.width,
					height: page.layout.height,
					panels: rendered?.panels ?? [],
					scenario: SCENARIO_LABELS[page.scenario] ?? page.scenario,
					score: page.score,
				}
			}),
		})),
		sheets: book.spec.bible.characters.map((character, index) => ({
			...character,
			svg: book.sheets[index] ?? '',
		})),
	}
	const json = JSON.stringify(payload).replace(/</g, '\\u003c')
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(book.spec.title)}</title>
<style>
:root { color-scheme: light; --ink:#1a242c; --paper:#e7eef2; --sheet:#fbfaf6; --red:#d6453d; --blue:#1e78c8; --line:#c5d0d8; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--paper); color: var(--ink); font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif; }
body { display: grid; grid-template-columns: 220px 1fr; min-height: 100%; }
aside { border-right: 1px solid var(--line); background: #f7fafc; overflow: auto; padding: 16px 12px 32px; }
aside h1 { font-family: Palatino, "Songti SC", serif; font-size: 22px; margin: 0 0 4px; }
aside .sub { color: #5c6b76; font-size: 12px; margin-bottom: 14px; }
.ch { margin: 12px 0 6px; font-size: 13px; font-weight: 700; }
button.page, button.mode, button.tog { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 6px 10px; font: inherit; cursor: pointer; }
button.page { display: block; width: 100%; text-align: left; border-radius: 8px; margin: 4px 0; }
button.page.on, button.mode.on, button.tog.on { background: var(--ink); color: #fff; border-color: var(--ink); }
main { display: flex; flex-direction: column; min-width: 0; min-height: 100vh; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.9); position: sticky; top: 0; z-index: 2; }
.bar .spacer { flex: 1; }
#stage { flex: 1; min-height: 0; position: relative; }
.spread { height: calc(100vh - 58px); display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 18px; align-items: center; }
.sheet { background: var(--sheet); box-shadow: 0 16px 40px rgba(20,32,40,.12); border: 1px solid #d5ddd4; }
.sheet svg { display: block; width: 100%; height: auto; }
.blank { height: 70vh; display: grid; place-items: center; color: #8aa; letter-spacing: .2em; }
.web { max-width: 760px; margin: 0 auto; padding: 18px 14px 64px; display: flex; flex-direction: column; gap: 22px; }
.web header { font-size: 13px; color: #5c6b76; }
.guide { height: calc(100vh - 58px); position: relative; overflow: hidden; background: #12181d; }
.guide-mover { position: absolute; left: 0; top: 0; width: 460px; transform-origin: 0 0; transition: transform .45s ease; }
.guide-cap { position: absolute; left: 16px; right: 16px; bottom: 16px; color: #fff; background: rgba(20,32,40,.72); padding: 10px 12px; border-radius: 10px; }
.guide-cap b { color: #ffb4ae; }
.nav { position: absolute; inset: 0; display: flex; }
.nav button { flex: 1; background: transparent; border: 0; color: transparent; cursor: pointer; }
body[data-bubbles="0"] .layer-bubbles { display: none; }
body[data-director="0"] .layer-director { display: none; }
.appendix { max-width: 880px; margin: 0 auto; padding: 28px 18px 80px; }
.card { display: grid; grid-template-columns: 280px 1fr; gap: 16px; background: #fff; border: 1px solid var(--line); padding: 12px; margin: 12px 0; }
.card svg { width: 100%; height: auto; background: #f4efe6; }
.tag { color: var(--red); font-weight: 700; }
@media (max-width: 800px) {
  body { grid-template-columns: 1fr; }
  aside { max-height: 34vh; }
  .spread { grid-template-columns: 1fr; height: auto; }
  .card { grid-template-columns: 1fr; }
}
</style>
</head>
<body data-bubbles="1" data-director="0">
<aside>
  <h1 id="title"></h1>
  <div class="sub" id="sub"></div>
  <div id="toc"></div>
</aside>
<main>
  <div class="bar">
    <button class="mode on" data-mode="spread">Right-to-Left Spread</button>
    <button class="mode" data-mode="webtoon">Webtoon Scroll</button>
    <button class="mode" data-mode="guided">Guided Panel Zoom</button>
    <span class="spacer"></span>
    <button class="tog on" id="bub">Speech Balloons</button>
    <button class="tog" id="dir">Director & Flow Overlays</button>
    <button class="tog" id="app">Character & World Bible</button>
  </div>
  <div id="stage">${book.pages[0]?.svg ?? ''}</div>
</main>
<script id="book" type="application/json">${json}</script>
<script>
const book = JSON.parse(document.getElementById('book').textContent)
const pages = book.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ ...page, chapter: chapter.title, mood: chapter.mood, environment: chapter.environment })))
let mode = 'spread'
let spread = 0
let cursor = 0
let panel = 0
let appendix = false
const stage = document.getElementById('stage')
document.getElementById('title').textContent = book.title
document.getElementById('sub').textContent = book.subtitle + ' · ' + pages.length + ' pages'
const toc = document.getElementById('toc')
book.chapters.forEach((chapter) => {
  const h = document.createElement('div')
  h.className = 'ch'
  h.textContent = chapter.title
  toc.appendChild(h)
  chapter.pages.forEach((page) => {
    const index = pages.findIndex((item) => item.id === page.id)
    const button = document.createElement('button')
    button.className = 'page'
    button.textContent = page.title
    button.onclick = () => { cursor = index; spread = Math.floor(index / 2); panel = 0; appendix = false; render() }
    toc.appendChild(button)
  })
})
document.querySelectorAll('.mode').forEach((button) => button.onclick = () => { mode = button.dataset.mode; appendix = false; render() })
document.getElementById('bub').onclick = (event) => { const on = document.body.dataset.bubbles !== '1'; document.body.dataset.bubbles = on ? '1' : '0'; event.currentTarget.classList.toggle('on', on) }
document.getElementById('dir').onclick = (event) => { const on = document.body.dataset.director !== '1'; document.body.dataset.director = on ? '1' : '0'; event.currentTarget.classList.toggle('on', on) }
document.getElementById('app').onclick = (event) => { appendix = !appendix; event.currentTarget.classList.toggle('on', appendix); render() }
function render() {
  document.querySelectorAll('.mode').forEach((button) => button.classList.toggle('on', button.dataset.mode === mode))
  document.querySelectorAll('button.page').forEach((button, index) => button.classList.toggle('on', index === cursor))
  if (appendix) return renderBible()
  if (mode === 'spread') return renderSpread()
  if (mode === 'webtoon') return renderWeb()
  return renderGuide()
}
function renderSpread() {
  const right = pages[spread * 2]
  const left = pages[spread * 2 + 1]
  cursor = spread * 2
  stage.innerHTML = '<div class="spread"><div class="sheet">' + (left ? left.svg : '<div class="blank">Blank page</div>') + '</div><div class="sheet">' + (right ? right.svg : '<div class="blank">Inside front cover</div>') + '</div></div><div class="nav"><button id="next"></button><button id="prev"></button></div>'
  document.getElementById('next').onclick = () => { if (spread < Math.ceil(pages.length / 2) - 1) { spread += 1; render() } }
  document.getElementById('prev').onclick = () => { if (spread > 0) { spread -= 1; render() } }
}
function renderWeb() {
  stage.innerHTML = '<div class="web">' + pages.map((page) => '<section><header>' + page.chapter + ' · ' + page.title + ' · ' + page.scenario + '</header><div class="sheet">' + page.svg + '</div></section>').join('') + '</div>'
}
function renderGuide() {
  const page = pages[cursor] || pages[0]
  if (!page) { stage.innerHTML = ''; return }
  const item = page.panels[panel] || page.panels[0]
  stage.innerHTML = '<div class="guide"><div class="guide-mover" id="mover">' + page.svg + '</div><div class="guide-cap"><b>' + (item ? item.n : 1) + ' / ' + page.panels.length + '</b> · ' + page.chapter + ' ' + page.title + '<br>' + (item ? item.shot + ' · ' + item.angle + ' · ' + item.focal + ' · ' + item.beat : '') + '</div><div class="nav"><button id="prevp"></button><button id="nextp"></button></div></div>'
  const mover = document.getElementById('mover')
  const svg = mover.querySelector('svg')
  svg.style.width = '460px'
  svg.style.height = 'auto'
  requestAnimationFrame(() => focusPanel(page, item, mover))
  document.getElementById('prevp').onclick = () => step(-1)
  document.getElementById('nextp').onclick = () => step(1)
}
function focusPanel(page, item, mover) {
  if (!item) return
  const viewport = mover.parentElement
  const mw = 460
  const sx = mw / page.width
  const bw = Math.max(12, (item.maxX - item.minX) * sx)
  const bh = Math.max(12, (item.maxY - item.minY) * sx)
  const scale = Math.min(viewport.clientWidth * 0.84 / bw, viewport.clientHeight * 0.72 / bh)
  const cx = ((item.minX + item.maxX) / 2) * sx
  const cy = ((item.minY + item.maxY) / 2) * sx
  mover.style.transform = 'translate(' + (viewport.clientWidth / 2 - cx * scale) + 'px,' + (viewport.clientHeight / 2 - cy * scale) + 'px) scale(' + scale + ')'
}
function step(dir) {
  const page = pages[cursor]
  if (!page) return
  panel += dir
  if (panel >= page.panels.length) { panel = 0; cursor = Math.min(pages.length - 1, cursor + 1); spread = Math.floor(cursor / 2) }
  if (panel < 0) { cursor = Math.max(0, cursor - 1); spread = Math.floor(cursor / 2); panel = Math.max(0, (pages[cursor].panels.length || 1) - 1) }
  render()
}
function renderBible() {
  const people = book.sheets.map((person) => '<article class="card"><div>' + person.svg + '</div><div><div class="tag">' + person.tag + ' ' + person.name + '</div><p>' + person.appearance + '</p><p>Voice: ' + person.voice + (person.locked ? ' · appearance locked' : '') + '</p></div></article>').join('')
  stage.innerHTML = '<div class="appendix"><h2>Character & World Bible</h2><p>' + book.bible.worldRules + '</p><p>' + book.bible.story + '</p>' + people + '</div>'
}
addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); mode === 'guided' ? step(1) : (spread = Math.min(Math.ceil(pages.length / 2) - 1, spread + 1), cursor = spread * 2, render()) }
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); mode === 'guided' ? step(-1) : (spread = Math.max(0, spread - 1), cursor = spread * 2, render()) }
  if (event.key === '1') { mode = 'spread'; render() }
  if (event.key === '2') { mode = 'webtoon'; render() }
  if (event.key === '3') { mode = 'guided'; render() }
})
render()
</script>
</body>
</html>`
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>]/g, (character) => (character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'))
}
