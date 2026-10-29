import type { ProsodyStyle } from '../model'

export interface BubbleDraw {
	style: string
	text: string
	prosody: string
	emphasis: number
	w: number
	h: number
	tailX: number
	tailY: number
	spin: number
	prosodyStyle?: ProsodyStyle | string
	prosodyOffsetX?: number
	prosodyOffsetY?: number
	prosodyScale?: number
	prosodyColor?: string
	fillColor?: string
	fontWeight?: number
	hideProsody?: boolean
	/** True while the live canvas shape is the active selection (never set by static/export renders). */
	selected?: boolean
}

export interface ProsodyBadgeAnchor {
	cx: number
	cy: number
	bw: number
	bh: number
	style: ProsodyStyle
	color: string
	scale: number
	visible: boolean
}

export function escapeXml(value: string): string {
	return String(value ?? '').replace(/[&<>"']/g, (character) => {
		if (character === '&') return '&amp;'
		if (character === '<') return '&lt;'
		if (character === '>') return '&gt;'
		if (character === '"') return '&quot;'
		return '&#39;'
	})
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v))
}

function wrap(text: string, maxUnits: number): string[] {
	const raw = String(text ?? '').trim()
	if (!raw.length) return ['…']
	const lines: string[] = []
	const limit = Math.max(6, maxUnits)
	for (const paragraph of raw.split(/\n+/)) {
		const hasSpaces = paragraph.includes(' ') && /^[\x00-\x7F\s“”‘’—…·「」『』]+$/.test(paragraph)
		if (hasSpaces) {
			const words = paragraph.split(/\s+/).filter(Boolean)
			let current = ''
			for (const word of words) {
				const candidate = current ? `${current} ${word}` : word
				if (candidate.length <= limit || !current) {
					current = candidate
				} else {
					lines.push(current)
					current = word
				}
			}
			if (current) lines.push(current)
		} else {
			const chars = Array.from(paragraph)
			for (let index = 0; index < chars.length; index += limit) {
				lines.push(chars.slice(index, index + limit).join(''))
			}
		}
	}
	return lines.slice(0, 6)
}

function tailPolygon(w: number, h: number, tailX: number, tailY: number, bgFill: string, stroke: string): string {
	const cx = w / 2
	const cy = h / 2
	const dx = tailX - cx
	const dy = tailY - cy
	const len = Math.hypot(dx, dy) || 1
	if (len < Math.min(w, h) * 0.42) return ''
	const ux = dx / len
	const uy = dy / len
	const rx = w / 2
	const ry = h / 2
	const er = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry))
	const bx = cx + ux * er * 0.86
	const by = cy + uy * er * 0.86
	const px = -uy
	const py = ux
	return `<polygon points="${(bx + px * 9).toFixed(1)},${(by + py * 9).toFixed(1)} ${(bx - px * 9).toFixed(1)},${(by - py * 9).toFixed(1)} ${tailX.toFixed(1)},${tailY.toFixed(1)}" fill="${bgFill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/>`
}

function textBlock(
	text: string,
	w: number,
	h: number,
	emphasis: number,
	weight: number,
	fillColor = '#1a242c',
	style = 'speech',
): string {
	const raw = String(text ?? '').trim()
	const isLatin = /^[\x00-\x7F\s“”‘’—…·]+$/.test(raw)
	const isRect = style === 'caption' || style === 'broadcast'
	const usableW = isRect ? Math.max(40, w - 22) : Math.max(40, w * 0.80)
	const usableH = isRect ? Math.max(24, h - 16) : Math.max(24, h * 0.78)
	const charCount = Math.max(1, Array.from(raw).length)
	const baseFont = clamp((emphasis >= 1.2 ? 14 : 11.8) * clamp(emphasis || 1, 0.8, 1.35), 9.5, 18)
	let font = baseFont
	if (charCount > 28) font = Math.min(font, isLatin ? 10.2 : 11.0)
	if (charCount > 45) font = Math.min(font, isLatin ? 9.6 : 10.2)
	const glyphW = isLatin ? font * 0.54 : font * 1.02
	const maxCharsPerLine = Math.max(6, Math.floor(usableW / glyphW))
	const lines = wrap(raw, maxCharsPerLine)
	const lineH = font * 1.22
	if (lines.length * lineH > usableH && lines.length > 1) {
		font = Math.max(8.8, (usableH / (lines.length * 1.22)))
	}
	const finalLineH = font * 1.22
	const start = h / 2 - ((lines.length - 1) * finalLineH) / 2 + font * 0.34
	const tspans = lines
		.map((line, index) => `<tspan x="${(w / 2).toFixed(1)}" y="${(start + index * finalLineH).toFixed(1)}">${escapeXml(line)}</tspan>`)
		.join('')
	return `<text class="bubble-text-layer" text-anchor="middle" font-family="Hiragino Sans, PingFang SC, Noto Serif SC, Noto Sans SC, sans-serif" font-size="${font.toFixed(1)}" font-weight="${weight}" fill="${fillColor}">${tspans}</text>`
}

export function normalizeProsodyStyle(raw?: string): ProsodyStyle {
	if (raw === 'seal' || raw === 'slant' || raw === 'burst' || raw === 'minimal' || raw === 'off') {
		return raw
	}
	return 'pill'
}

export function defaultProsodyColorForStyle(style: ProsodyStyle, custom?: string): string {
	if (custom && custom.trim()) return custom.trim()
	if (style === 'seal') return '#c93d35'
	if (style === 'slant') return '#18222c'
	if (style === 'burst') return '#c93d35'
	if (style === 'minimal') return '#0f172a'
	return '#1e78c8'
}

export function inferProsodyStyleFromText(prosody?: string, explicitStyle?: string): ProsodyStyle {
	if (explicitStyle && explicitStyle.trim()) return normalizeProsodyStyle(explicitStyle)
	const text = (prosody ?? '').trim()
	if (!text) return 'pill'
	if (text.includes('thunder') || text.includes('roar') || text.includes('shout') || text.includes('burst')) return 'burst'
	if (text.includes('narrat') || text.includes('caption') || text.includes('measured') || text.includes('seal')) return 'seal'
	if (text.includes('sneer') || text.includes('sharp') || text.includes('press') || text.includes('scrutin')) return 'slant'
	if (text.includes('whisper') || text.includes('pause') || text.includes('soft')) return 'minimal'
	return 'pill'
}

export function computeProsodyBadgeAnchor(bubble: BubbleDraw): ProsodyBadgeAnchor {
	const style = inferProsodyStyleFromText(bubble.prosody, bubble.prosodyStyle)
	const scale = clamp(bubble.prosodyScale || 1, 0.65, 2.0)
	const w = Math.max(48, bubble.w)
	const h = Math.max(36, bubble.h)
	const textLen = Math.max(2, Array.from((bubble.prosody || '').trim()).length)
	const bw = (textLen * 11.5 + 22) * scale
	const bh = 20 * scale
	// Default anchor sits near top-left/top-center of the bubble frame, offset by prosodyOffsetX/Y
	const defaultCx = clamp(bw / 2 + 6, 28, w - 16)
	const defaultCy = -8
	const ox = Number.isFinite(bubble.prosodyOffsetX) ? (bubble.prosodyOffsetX as number) : 0
	const oy = Number.isFinite(bubble.prosodyOffsetY) ? (bubble.prosodyOffsetY as number) : 0
	const cx = clamp(defaultCx + ox, -w * 0.35, w * 1.35)
	const cy = clamp(defaultCy + oy, -h * 0.6, h * 1.35)
	const visible = Boolean((bubble.prosody || '').trim()) && style !== 'off' && !bubble.hideProsody
	return {
		cx,
		cy,
		bw,
		bh,
		style,
		color: defaultProsodyColorForStyle(style, bubble.prosodyColor),
		scale,
		visible,
	}
}

export function renderProsodyBadgeSvg(bubble: BubbleDraw): string {
	const anchor = computeProsodyBadgeAnchor(bubble)
	if (!anchor.visible) return ''
	const { cx, cy, bw, bh, style, color, scale } = anchor
	const rawText = (bubble.prosody || '').trim()
	const fs = (10.5 * scale).toFixed(1)

	if (style === 'seal') {
		const x = (cx - bw / 2).toFixed(1)
		const y = (cy - bh / 2).toFixed(1)
		const ix = (cx - bw / 2 + 2.2).toFixed(1)
		const iy = (cy - bh / 2 + 2.2).toFixed(1)
		const iw = Math.max(8, bw - 4.4).toFixed(1)
		const ih = Math.max(6, bh - 4.4).toFixed(1)
		return `<g class="prosody-independent-layer" data-prosody-style="seal" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"><rect x="${x}" y="${y}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2.5" fill="#fffdf7" stroke="${color}" stroke-width="2"/><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="1.2" fill="none" stroke="${color}" stroke-width="0.8" stroke-dasharray="3 1.5"/><text x="${cx.toFixed(1)}" y="${(cy + 3.8 * scale).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="${color}" font-family="Hiragino Sans, PingFang SC, Noto Serif SC, serif">[${escapeXml(rawText)}]</text></g>`
	}

	if (style === 'slant') {
		const hw = bw / 2
		const hh = bh / 2
		const skew = 4.5 * scale
		const pts = [
			`${(cx - hw + skew).toFixed(1)},${(cy - hh).toFixed(1)}`,
			`${(cx + hw + skew).toFixed(1)},${(cy - hh).toFixed(1)}`,
			`${(cx + hw - skew).toFixed(1)},${(cy + hh).toFixed(1)}`,
			`${(cx - hw - skew).toFixed(1)},${(cy + hh).toFixed(1)}`,
		].join(' ')
		return `<g class="prosody-independent-layer" data-prosody-style="slant" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"><polygon points="${pts}" fill="${color}" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/><text x="${cx.toFixed(1)}" y="${(cy + 3.8 * scale).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fef3c7" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif">[${escapeXml(rawText)}]</text></g>`
	}

	if (style === 'burst') {
		const spikes = 14
		const rx = bw * 0.58
		const ry = bh * 0.72
		const pts: string[] = []
		for (let i = 0; i < spikes; i += 1) {
			const ang = (i / spikes) * Math.PI * 2
			const rad = i % 2 === 0 ? 1.15 : 0.78
			pts.push(`${(cx + Math.cos(ang) * rx * rad).toFixed(1)},${(cy + Math.sin(ang) * ry * rad).toFixed(1)}`)
		}
		return `<g class="prosody-independent-layer" data-prosody-style="burst" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"><polygon points="${pts.join(' ')}" fill="${color}" stroke="#fffefb" stroke-width="1.6" stroke-linejoin="round"/><text x="${cx.toFixed(1)}" y="${(cy + 3.8 * scale).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#fffefb" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif">[${escapeXml(rawText)}]</text></g>`
	}

	if (style === 'minimal') {
		return `<g class="prosody-independent-layer" data-prosody-style="minimal" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"><text x="${cx.toFixed(1)}" y="${(cy + 3.8 * scale).toFixed(1)}" text-anchor="middle" font-size="${(11 * scale).toFixed(1)}" font-weight="800" fill="${color}" stroke="#fffefb" stroke-width="3.6" paint-order="stroke" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif">[${escapeXml(rawText)}]</text></g>`
	}

	// Default: 'pill'. A custom user color always wins (deliberate choice). Otherwise it's a
	// calm monochrome hairline chip, and only lights up with the app accent while the bubble
	// is the active canvas selection — never in exported/static art, which never sets `selected`.
	const hasCustomColor = Boolean(bubble.prosodyColor && bubble.prosodyColor.trim())
	const pillFill = hasCustomColor ? color : bubble.selected ? '#0066cc' : '#fbfbfd'
	const pillStroke = hasCustomColor ? '#fffefb' : bubble.selected ? '#0066cc' : '#d2d2d7'
	const pillTextFill = hasCustomColor || bubble.selected ? '#fffefb' : '#1d1d1f'
	return `<g class="prosody-independent-layer" data-prosody-style="pill" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"><rect x="${(cx - bw / 2).toFixed(1)}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="1.2"/><text x="${cx.toFixed(1)}" y="${(cy + 3.8 * scale).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${pillTextFill}" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif">[${escapeXml(rawText)}]</text></g>`
}

export function bubbleMarkup(bubble: BubbleDraw): string {
	const { style, w, h, emphasis } = bubble
	const bgFill = bubble.fillColor && bubble.fillColor.trim() ? bubble.fillColor.trim() : '#fffefb'
	const isDarkBg = bgFill.toLowerCase() === '#18222c' || bgFill.toLowerCase() === '#0f172a'
	const stroke =
		emphasis >= 1.2 || style === 'shout'
			? '#d6453d'
			: isDarkBg
				? '#f8fafc'
				: '#1a242c'
	const textFill =
		style === 'shout' && !isDarkBg
			? '#b91c1c'
			: isDarkBg
				? '#f8fafc'
				: '#1a242c'
	const sw = emphasis >= 1.2 ? 3.4 : 2.4
	let body = ''
	if (style === 'caption') {
		body = `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4" fill="${bgFill}" stroke="${stroke}" stroke-width="${sw}"/>`
	} else if (style === 'broadcast') {
		body = `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="${bgFill}" stroke="${stroke}" stroke-width="${sw}"/><rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`
	} else if (style === 'shout') {
		const cx = w / 2
		const cy = h / 2
		const points = Array.from({ length: 16 }, (_, index) => {
			const angle = (Math.PI * 2 * index) / 16 - Math.PI / 2
			const rx = index % 2 ? w * 0.36 : w * 0.5
			const ry = index % 2 ? h * 0.34 : h * 0.5
			return `${(cx + Math.cos(angle) * rx).toFixed(1)},${(cy + Math.sin(angle) * ry).toFixed(1)}`
		}).join(' ')
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY, bgFill, stroke)}<polygon points="${points}" fill="${bgFill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>`
	} else if (style === 'sfx') {
		const font = Math.max(22, Math.min(46, w * 0.34 * emphasis))
		const sfxColor =
			bubble.fillColor && bubble.fillColor.trim() && bubble.fillColor !== '#fffefb'
				? bubble.fillColor.trim()
				: '#d6453d'
		body = `<text x="${(w / 2).toFixed(1)}" y="${(h * 0.72).toFixed(1)}" text-anchor="middle" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif" font-size="${font.toFixed(1)}" font-weight="900" fill="${sfxColor}" stroke="#fffefb" stroke-width="5" paint-order="stroke">${escapeXml(bubble.text || 'BOOM!!')}</text>`
	} else if (style === 'thought') {
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY, bgFill, stroke)}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="${bgFill}" stroke="${stroke}" stroke-width="${sw}"/><circle cx="${(bubble.tailX * 0.35 + w * 0.2).toFixed(1)}" cy="${(h + 8).toFixed(1)}" r="5" fill="${bgFill}" stroke="${stroke}" stroke-width="2"/><circle cx="${(bubble.tailX * 0.45 + w * 0.12).toFixed(1)}" cy="${(h + 18).toFixed(1)}" r="3" fill="${bgFill}" stroke="${stroke}" stroke-width="1.6"/>`
	} else {
		const dash = style === 'whisper' ? ' stroke-dasharray="6 4"' : ''
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY, bgFill, stroke)}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="${bgFill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`
	}
	const label = renderProsodyBadgeSvg(bubble)
	const weight =
		bubble.fontWeight && bubble.fontWeight >= 400
			? bubble.fontWeight
			: style === 'shout'
				? 800
				: 600
	const words = style === 'sfx' ? '' : textBlock(bubble.text, w, h, emphasis, weight, textFill, style)
	return `${body}${words}${label}`
}

export function bubbleGroup(bubble: BubbleDraw, x: number, y: number): string {
	const spin = bubble.style === 'sfx' ? bubble.spin || -8 : bubble.spin
	return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${spin.toFixed(2)} ${(bubble.w / 2).toFixed(1)} ${(bubble.h / 2).toFixed(1)})">${bubbleMarkup(bubble)}</g>`
}
