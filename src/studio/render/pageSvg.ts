import { boundsOf, centroid, type Pt } from '../layout/engine'
import type { PanelMeta } from '../model'
import { auditCameraAxis } from '../optics/shotLab'
import { bubbleMarkup, escapeXml, type BubbleDraw } from './bubbles'
import { renderIllustration } from './illustrator'

export interface PagePanel {
	pts: Pt[]
	meta: PanelMeta
	environment: string
	lighting: string
	energy: string
}

export interface PageBubble extends BubbleDraw {
	panelIndex: number
	x: number
	y: number
}

export interface PageRenderModel {
	uid: string
	title: string
	width: number
	height: number
	inner: {
		x?: number
		y?: number
		w?: number
		h?: number
		x0?: number
		y0?: number
		x1?: number
		y1?: number
	}
	panels: PagePanel[]
	bubbles: PageBubble[]
	numbers: 'off' | 'on' | 'corner' | 'badge' | 'in-director'
	director: boolean
	lineWidth?: number
	showInnerFrame?: boolean
	showRuleOfThirds?: boolean
	showAxis180?: boolean
	selectedPanel?: number
	part?: 'all' | 'background' | 'art' | 'frames' | 'bubbles' | 'director'
}

export function renderPageSvg(model: PageRenderModel): string {
	const part = model.part ?? 'all'
	const includeBg = part === 'all' || part === 'background'
	const includeArt = part === 'all' || part === 'art'
	const includeFrames = part === 'all' || part === 'frames'
	const includeBubbles = part === 'all' || part === 'bubbles'
	const includeDirector = (part === 'all' && model.director) || part === 'director'
	const strokeW = model.lineWidth ?? 3.2

	const defs: string[] = [
		`<marker id="${model.uid}-arr-r" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c93d35"/></marker>`,
		`<marker id="${model.uid}-arr-b" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/></marker>`,
		`<marker id="${model.uid}-arr-g" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#15803d"/></marker>`,
		`<marker id="${model.uid}-arr-w" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d97706"/></marker>`,
	]

	const artLayers: string[] = []
	const frameLayers: string[] = []
	const centers: Pt[] = []

	model.panels.forEach((panel, index) => {
		const clipId = `${model.uid}-clip-${index}`
		const polyPoints = panel.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
		defs.push(`<clipPath id="${clipId}"><polygon points="${polyPoints}"/></clipPath>`)
		const box = boundsOf(panel.pts)
		const center = centroid(panel.pts)
		centers.push(center)

		if (includeArt) {
			const tx = panel.meta.imageOffsetX
			const ty = panel.meta.imageOffsetY
			const scale = panel.meta.imageScale || 1
			const rot = panel.meta.imageRotation || 0
			const cx = box.minX + box.w / 2
			const cy = box.minY + box.h / 2
			const xform = `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${scale.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`
			if (panel.meta.imageDataUrl) {
				artLayers.push(
					`<g clip-path="url(#${clipId})"><rect x="${box.minX}" y="${box.minY}" width="${box.w}" height="${box.h}" fill="#f8f7f4"/><g transform="${xform}"><image href="${panel.meta.imageDataUrl}" x="${box.minX}" y="${box.minY}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid slice"/></g></g>`,
				)
			} else {
				const art = renderIllustration({
					idPrefix: `${model.uid}-p${index}`,
					environment: panel.environment,
					lighting: panel.lighting,
					shot: panel.meta.shot,
					angle: panel.meta.angle,
					focal: panel.meta.focal,
					focalMm: panel.meta.focalMm,
					fStop: panel.meta.fStop,
					silent: panel.meta.silent,
					aspect: panel.meta.aspect,
					who: panel.meta.who,
					fries: panel.meta.fries,
					energy: panel.energy,
					seed: panel.meta.imageSeed,
				})
				artLayers.push(
					`<g clip-path="url(#${clipId})"><g transform="${xform}"><svg x="${box.minX.toFixed(1)}" y="${box.minY.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" viewBox="${art.viewBox}" preserveAspectRatio="xMidYMid slice">${art.markup}</svg></g></g>`,
				)
			}
		}

		if (includeFrames) {
			frameLayers.push(`<polygon points="${polyPoints}" fill="none" stroke="#18222c" stroke-width="${strokeW.toFixed(1)}" stroke-linejoin="miter"/>`)

			if (model.showRuleOfThirds) {
				const isTarget = model.selectedPanel === undefined || model.selectedPanel < 0 || model.selectedPanel === index
				const gridOpacity = isTarget ? '0.65' : '0.28'
				const x1 = box.minX + box.w / 3
				const x2 = box.minX + (box.w * 2) / 3
				const y1 = box.minY + box.h / 3
				const y2 = box.minY + (box.h * 2) / 3
				frameLayers.push(
					`<g clip-path="url(#${clipId})" opacity="${gridOpacity}" pointer-events="none">
						<line x1="${x1.toFixed(1)}" y1="${box.minY.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${box.maxY.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 4"/>
						<line x1="${x2.toFixed(1)}" y1="${box.minY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${box.maxY.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 4"/>
						<line x1="${box.minX.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${box.maxX.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 4"/>
						<line x1="${box.minX.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${box.maxX.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 4"/>
						<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="3.2" fill="#2563eb"/>
						<circle cx="${x2.toFixed(1)}" cy="${y1.toFixed(1)}" r="3.2" fill="#2563eb"/>
						<circle cx="${x1.toFixed(1)}" cy="${y2.toFixed(1)}" r="3.2" fill="#2563eb"/>
						<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3.2" fill="#2563eb"/>
					</g>`,
				)
			}

			if (model.numbers === 'badge') {
				frameLayers.push(
					`<g transform="translate(${(box.maxX - 18).toFixed(1)} ${(box.minY + 18).toFixed(1)})"><circle r="12" fill="#18222c"/><text y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#ffffff">${index + 1}</text></g>`,
				)
			} else if (model.numbers === 'corner' || model.numbers === 'on') {
				const focalText = panel.meta.focalMm ? `${panel.meta.focalMm}mm` : panel.meta.focal
				const silentTag = panel.meta.silent ? ' · 静帧' : ''
				const tagText = `${index + 1} · ${panel.meta.shot}/${focalText}${silentTag}`
				const tagW = Math.max(54, tagText.length * 6.8 + 10)
				frameLayers.push(
					`<g transform="translate(${(box.maxX - tagW - 6).toFixed(1)} ${(box.minY + 6).toFixed(1)})"><rect width="${tagW.toFixed(0)}" height="18" rx="3" fill="#ffffff" fill-opacity=".86" stroke="#18222c" stroke-width="0.9"/><text x="${(tagW / 2).toFixed(0)}" y="12.5" text-anchor="middle" font-size="9.5" font-weight="600" fill="#18222c">${escapeXml(tagText)}</text></g>`,
				)
			}
		}
	})

	if (includeFrames && model.showInnerFrame) {
		const x = model.inner.x ?? model.inner.x0 ?? 39
		const y = model.inner.y ?? model.inner.y0 ?? 48
		const w = model.inner.w ?? (model.inner.x1 !== undefined ? model.inner.x1 - x : model.width - x * 2)
		const h = model.inner.h ?? (model.inner.y1 !== undefined ? model.inner.y1 - y : model.height - y * 2)
		const tick = 14
		frameLayers.push(
			`<g pointer-events="none">
				<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#0284c7" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.85"/>
				<path d="M${x - tick} ${y} H${x - 3} M${x} ${y - tick} V${y - 3}" stroke="#0284c7" stroke-width="1.3"/>
				<path d="M${x + w + 3} ${y} H${x + w + tick} M${x + w} ${y - tick} V${y - 3}" stroke="#0284c7" stroke-width="1.3"/>
				<path d="M${x - tick} ${y + h} H${x - 3} M${x} ${y + h + 3} V${y + h + tick}" stroke="#0284c7" stroke-width="1.3"/>
				<path d="M${x + w + 3} ${y + h} H${x + w + tick} M${x + w} ${y + h + 3} V${y + h + tick}" stroke="#0284c7" stroke-width="1.3"/>
				<rect x="${x + 6}" y="${y - 17}" width="112" height="15" rx="2" fill="#0284c7"/>
				<text x="${x + 62}" y="${y - 6.5}" text-anchor="middle" font-size="9" font-weight="600" fill="#ffffff">B4 版心安全裁切线</text>
			</g>`,
		)
	}

	if (includeFrames && model.showAxis180) {
		const metas = model.panels.map((p) => p.meta)
		const audit = auditCameraAxis(metas)
		const axisNodes: string[] = []
		model.panels.forEach((panel, index) => {
			const [cx, cy] = centers[index] ?? [0, 0]
			const [dx, dy] = panel.meta.eyeline ?? [0, 0]
			axisNodes.push(
				`<line x1="${(cx - 38).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + 38).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#0f766e" stroke-width="1.5" stroke-dasharray="3 3"/>`,
			)
			if (Math.hypot(dx, dy) > 2) {
				axisNodes.push(
					`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + dx * 2.2).toFixed(1)}" y2="${(cy + dy * 2.2).toFixed(1)}" stroke="#2563eb" stroke-width="2.4" marker-end="url(#${model.uid}-arr-b)"/>`,
				)
			}
		})
		audit.crossings.forEach((cross) => {
			const a = centers[cross.fromPanel - 1]
			const b = centers[cross.toPanel - 1]
			if (a && b) {
				const mx = (a[0] + b[0]) / 2
				const my = (a[1] + b[1]) / 2
				axisNodes.push(
					`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#d97706" stroke-width="2.6" stroke-dasharray="6 4" marker-end="url(#${model.uid}-arr-w)"/>`,
					`<g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><rect x="-46" y="-11" width="92" height="22" rx="4" fill="#d97706"/><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">180° 越轴警告</text></g>`,
				)
			}
		})
		frameLayers.push(`<g pointer-events="none">${axisNodes.join('')}</g>`)
	}

	const silentSet = new Set(
		model.panels
			.map((p, idx) => (p.meta.silent ? idx : -1))
			.filter((idx) => idx >= 0),
	)

	const bubbleLayers = includeBubbles
		? model.bubbles
				.filter((b) => !silentSet.has(b.panelIndex))
				.map(
					(bubble) =>
						`<g transform="translate(${bubble.x.toFixed(1)} ${bubble.y.toFixed(1)})">${bubbleMarkup(bubble)}</g>`,
				)
		: []

	const directorLayers: string[] = []
	if (includeDirector && centers.length) {
		for (let i = 0; i < centers.length - 1; i += 1) {
			const [x1, y1] = centers[i]
			const [x2, y2] = centers[i + 1]
			directorLayers.push(
				`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c93d35" stroke-width="3.2" stroke-dasharray="9 6" marker-end="url(#${model.uid}-arr-r)"/>`,
			)
		}
		centers.forEach(([x, y], index) => {
			const [dx, dy] = model.panels[index]?.meta.eyeline ?? [0, 0]
			if (Math.hypot(dx, dy) > 2) {
				directorLayers.push(
					`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + dx * 2).toFixed(1)}" y2="${(y + dy * 2).toFixed(1)}" stroke="#2563eb" stroke-width="2.6" marker-end="url(#${model.uid}-arr-b)"/>`,
				)
			}
			directorLayers.push(
				`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="15" fill="#c93d35" stroke="#ffffff" stroke-width="2"/><text y="5" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">${index + 1}</text></g>`,
			)
		})
		for (let i = 0; i < model.bubbles.length - 1; i += 1) {
			const a = model.bubbles[i]
			const b = model.bubbles[i + 1]
			if (silentSet.has(a.panelIndex) || silentSet.has(b.panelIndex)) continue
			directorLayers.push(
				`<line x1="${(a.x + a.w / 2).toFixed(1)}" y1="${(a.y + a.h / 2).toFixed(1)}" x2="${(b.x + b.w / 2).toFixed(1)}" y2="${(b.y + b.h / 2).toFixed(1)}" stroke="#15803d" stroke-width="2.2" stroke-dasharray="4 4" marker-end="url(#${model.uid}-arr-g)"/>`,
			)
		}
	}

	const bg = includeBg ? `<rect width="${model.width}" height="${model.height}" fill="#ffffff"/>` : ''
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.width} ${model.height}" class="page-svg"><defs>${defs.join('')}</defs>${bg}<g class="layer-art">${artLayers.join('')}</g><g class="layer-frames">${frameLayers.join('')}</g><g class="layer-bubbles">${bubbleLayers.join('')}</g><g class="layer-director">${directorLayers.join('')}</g></svg>`
}
