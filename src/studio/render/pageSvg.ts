import { boundsOf, centroid, type Pt } from '../layout/engine'
import type { PanelMeta } from '../model'
import { bubbleGroup, escapeXml, type BubbleDraw } from './bubbles'
import { renderIllustration } from './illustrator'

export interface PageBubble extends BubbleDraw {
	x: number
	y: number
	panelIndex: number
}

export interface PagePanel {
	pts: Pt[]
	meta: PanelMeta
	environment: string
	lighting: string
	energy: string
}

export interface PageRenderModel {
	uid: string
	title: string
	width: number
	height: number
	inner: { x0: number; y0: number; x1: number; y1: number }
	panels: PagePanel[]
	bubbles: PageBubble[]
	numbers: 'on' | 'in-director' | 'off'
	director: boolean
	part?: 'all' | 'art' | 'frames' | 'bubbles' | 'paper' | 'director'
}

function smoothPath(points: Pt[]): string {
	if (points.length === 0) return ''
	if (points.length === 1) return `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
	let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
	for (let index = 0; index < points.length - 1; index += 1) {
		const p0 = points[Math.max(0, index - 1)]
		const p1 = points[index]
		const p2 = points[index + 1]
		const p3 = points[Math.min(points.length - 1, index + 2)]
		const c1x = p1[0] + (p2[0] - p0[0]) / 6
		const c1y = p1[1] + (p2[1] - p0[1]) / 6
		const c2x = p2[0] - (p3[0] - p1[0]) / 6
		const c2y = p2[1] - (p3[1] - p1[1]) / 6
		d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
	}
	return d
}

function pointsAttr(pts: Pt[]): string {
	return pts.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ')
}

function coverBox(pts: Pt[], meta: PanelMeta) {
	const box = boundsOf(pts)
	const bw = Math.max(8, box.maxX - box.minX)
	const bh = Math.max(8, box.maxY - box.minY)
	const [aw, ah] = meta.aspect.split(':').map(Number)
	const imageAspect = aw > 0 && ah > 0 ? aw / ah : bw / bh
	let dw = bw * 1.24
	let dh = dw / imageAspect
	if (dh < bh * 1.24) {
		dh = bh * 1.24
		dw = dh * imageAspect
	}
	const scale = meta.imageScale || 1
	dw *= scale
	dh *= scale
	const cx = (box.minX + box.maxX) / 2 + (meta.imageOffsetX || 0)
	const cy = (box.minY + box.maxY) / 2 + (meta.imageOffsetY || 0)
	return { box, x: cx - dw / 2, y: cy - dh / 2, dw, dh, cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2 }
}

function numberBadge(pts: Pt[], n: number): string {
	const box = boundsOf(pts)
	const x = box.maxX - 18
	const y = box.minY + 18
	return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="#d6453d"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="ui-monospace, sans-serif">${n}</text></g>`
}

export function renderPageSvg(model: PageRenderModel): string {
	const uid = model.uid.replace(/[^a-zA-Z0-9_-]/g, '')
	const frames: string[] = []
	const art: string[] = []
	const numbers: string[] = []
	const labels: string[] = []
	const eyes: string[] = []
	model.panels.forEach((panel, index) => {
		const clip = `${uid}-c${index}`
		const fitted = coverBox(panel.pts, panel.meta)
		const image = panel.meta.imageDataUrl
			? `<image href="${escapeXml(panel.meta.imageDataUrl)}" x="${fitted.x.toFixed(1)}" y="${fitted.y.toFixed(1)}" width="${fitted.dw.toFixed(1)}" height="${fitted.dh.toFixed(1)}" preserveAspectRatio="xMidYMid slice"/>`
			: (() => {
					const illustration = renderIllustration({
						idPrefix: `${uid}p${index}`,
						environment: panel.meta.environment || panel.environment,
						lighting: panel.lighting,
						shot: panel.meta.shot,
						angle: panel.meta.angle,
						focal: panel.meta.focal,
						aspect: panel.meta.aspect,
						who: panel.meta.who,
						fries: panel.meta.fries,
						energy: panel.energy,
						seed: panel.meta.imageSeed,
					})
					return `<svg x="${fitted.x.toFixed(1)}" y="${fitted.y.toFixed(1)}" width="${fitted.dw.toFixed(1)}" height="${fitted.dh.toFixed(1)}" viewBox="${illustration.viewBox}" preserveAspectRatio="xMidYMid slice">${illustration.markup}</svg>`
				})()
		art.push(
			`<g clip-path="url(#${clip})"><g transform="rotate(${(panel.meta.imageRotation || 0).toFixed(2)} ${fitted.cx.toFixed(1)} ${fitted.cy.toFixed(1)})">${image}</g></g>`,
		)
		frames.push(`<polygon points="${pointsAttr(panel.pts)}" fill="none" stroke="#14181c" stroke-width="3.2" stroke-linejoin="miter"/>`)
		frames.push(`<clipPath id="${clip}"><polygon points="${pointsAttr(panel.pts)}"/></clipPath>`)
		numbers.push(numberBadge(panel.pts, index + 1))
		const box = fitted.box
		labels.push(
			`<text x="${(box.minX + 8).toFixed(1)}" y="${(box.minY + 16).toFixed(1)}" font-size="13" font-family="ui-monospace, sans-serif" fill="#1e78c8" stroke="#fff" stroke-width="3" paint-order="stroke">${escapeXml(`${panel.meta.shot} · ${panel.meta.angle} · ${panel.meta.focal}`)}</text>`,
		)
		const center = centroid(panel.pts)
		const [dx, dy] = panel.meta.eyeline
		eyes.push(
			`<line x1="${center[0].toFixed(1)}" y1="${center[1].toFixed(1)}" x2="${(center[0] + dx).toFixed(1)}" y2="${(center[1] + dy).toFixed(1)}" stroke="#1f9d55" stroke-width="2.4" marker-end="url(#${uid}-arrow)"/>`,
		)
	})
	const centers = model.panels.map((panel) => centroid(panel.pts))
	const bubbleCenters: Pt[] = model.bubbles
		.slice()
		.sort((a, b) => a.panelIndex - b.panelIndex || a.y - b.y)
		.map((bubble) => [bubble.x + bubble.w / 2, bubble.y + bubble.h / 2])
	const flow = `<path d="${smoothPath(centers)}" fill="none" stroke="#d6453d" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>`
	const chain = bubbleCenters.length > 1 ? `<path d="${smoothPath(bubbleCenters)}" fill="none" stroke="#1e78c8" stroke-width="2" stroke-dasharray="7 5" opacity=".9"/>` : ''
	const bubbleLayer = model.bubbles.map((bubble) => bubbleGroup(bubble, bubble.x, bubble.y)).join('')
	const numberLayer = numbers.join('')
	const director = `
		<g class="layer-director">
			<rect x="${model.inner.x0}" y="${model.inner.y0}" width="${model.inner.x1 - model.inner.x0}" height="${model.inner.y1 - model.inner.y0}" fill="none" stroke="#1e78c8" stroke-width="1.6" stroke-dasharray="7 5" opacity=".8"/>
			${flow}${chain}${eyes.join('')}${labels.join('')}${model.numbers === 'in-director' ? numberLayer : ''}
		</g>`
	const part = model.part ?? 'all'
	const show = (name: string) => part === 'all' || part === name
	return `<svg xmlns="http://www.w3.org/2000/svg" class="page-svg" viewBox="0 0 ${model.width} ${model.height}" width="100%" height="100%">
		<defs>
			<marker id="${uid}-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#1f9d55"/></marker>
			${frames.filter((item) => item.startsWith('<clipPath')).join('')}
		</defs>
		${show('paper') || part === 'all' ? `<rect width="${model.width}" height="${model.height}" fill="${part === 'paper' || part === 'all' ? '#fbfaf6' : 'none'}"/>` : `<rect width="${model.width}" height="${model.height}" fill="none"/>`}
		${part === 'all' ? `<text x="18" y="34" font-size="18" font-family="Iowan Old Style, Palatino, Songti SC, serif" fill="#1a242c">${escapeXml(model.title)}</text>` : ''}
		${show('art') ? art.join('') : ''}
		${show('frames') ? frames.filter((item) => item.startsWith('<polygon')).join('') : ''}
		${show('frames') && model.numbers === 'on' ? `<g class="layer-numbers">${numberLayer}</g>` : ''}
		${show('bubbles') ? `<g class="layer-bubbles">${bubbleLayer}</g>` : ''}
		${show('director') && (model.director || part === 'director') ? director : ''}
	</svg>`
}
