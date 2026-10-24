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

function wrap(text: string, maxChars: number): string[] {
	const chars = Array.from(text.trim())
	if (!chars.length) return ['…']
	const lines: string[] = []
	const size = Math.max(4, maxChars)
	for (let index = 0; index < chars.length; index += size) lines.push(chars.slice(index, index + size).join(''))
	return lines.slice(0, 4)
}

function tailPolygon(w: number, h: number, tailX: number, tailY: number): string {
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
	return `<polygon points="${(bx + px * 9).toFixed(1)},${(by + py * 9).toFixed(1)} ${(bx - px * 9).toFixed(1)},${(by - py * 9).toFixed(1)} ${tailX.toFixed(1)},${tailY.toFixed(1)}" fill="#fffefb" stroke="#1a242c" stroke-width="2.2" stroke-linejoin="round"/>`
}

function textBlock(text: string, w: number, h: number, emphasis: number, weight: number): string {
	const font = Math.max(11, Math.min(28, (emphasis >= 1.2 ? 18 : 14) * (w / 130)))
	const lines = wrap(text, Math.max(4, Math.floor(w / (font * 0.95))))
	const start = h / 2 - ((lines.length - 1) * font * 1.15) / 2
	const tspans = lines
		.map((line, index) => `<tspan x="${(w / 2).toFixed(1)}" y="${(start + index * font * 1.15).toFixed(1)}">${escapeXml(line)}</tspan>`)
		.join('')
	return `<text text-anchor="middle" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif" font-size="${font.toFixed(1)}" font-weight="${weight}" fill="#1a242c">${tspans}</text>`
}

export function bubbleMarkup(bubble: BubbleDraw): string {
	const { style, w, h, emphasis } = bubble
	const stroke = emphasis >= 1.2 || style === 'shout' ? '#d6453d' : '#1a242c'
	const sw = emphasis >= 1.2 ? 3.4 : 2.4
	let body = ''
	if (style === 'caption') {
		body = `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4" fill="#fffefb" stroke="${stroke}" stroke-width="${sw}"/>`
	} else if (style === 'broadcast') {
		body = `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="#fffefb" stroke="${stroke}" stroke-width="${sw}"/><rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`
	} else if (style === 'shout') {
		const cx = w / 2
		const cy = h / 2
		const points = Array.from({ length: 16 }, (_, index) => {
			const angle = (Math.PI * 2 * index) / 16 - Math.PI / 2
			const rx = index % 2 ? w * 0.36 : w * 0.5
			const ry = index % 2 ? h * 0.34 : h * 0.5
			return `${(cx + Math.cos(angle) * rx).toFixed(1)},${(cy + Math.sin(angle) * ry).toFixed(1)}`
		}).join(' ')
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY)}<polygon points="${points}" fill="#fffefb" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"/>`
	} else if (style === 'sfx') {
		const font = Math.max(22, Math.min(46, w * 0.34 * emphasis))
		body = `<text x="${(w / 2).toFixed(1)}" y="${(h * 0.72).toFixed(1)}" text-anchor="middle" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif" font-size="${font.toFixed(1)}" font-weight="900" fill="#d6453d" stroke="#fffefb" stroke-width="5" paint-order="stroke">${escapeXml(bubble.text || 'ドン')}</text>`
	} else if (style === 'thought') {
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY)}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="#fffefb" stroke="${stroke}" stroke-width="${sw}"/><circle cx="${(bubble.tailX * 0.35 + w * 0.2).toFixed(1)}" cy="${(h + 8).toFixed(1)}" r="5" fill="#fffefb" stroke="${stroke}" stroke-width="2"/><circle cx="${(bubble.tailX * 0.45 + w * 0.12).toFixed(1)}" cy="${(h + 18).toFixed(1)}" r="3" fill="#fffefb" stroke="${stroke}" stroke-width="1.6"/>`
	} else {
		const dash = style === 'whisper' ? ' stroke-dasharray="6 4"' : ''
		body = `${tailPolygon(w, h, bubble.tailX, bubble.tailY)}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="#fffefb" stroke="${stroke}" stroke-width="${sw}"${dash}/>`
	}
	const label = bubble.prosody
		? `<text x="4" y="-4" font-size="11" font-family="Hiragino Sans, PingFang SC, Noto Sans SC, sans-serif" fill="#1e78c8">[${escapeXml(bubble.prosody)}]</text>`
		: ''
	const words = style === 'sfx' ? '' : textBlock(bubble.text, w, h, emphasis, style === 'shout' ? 800 : 600)
	return `${label}${body}${words}`
}

export function bubbleGroup(bubble: BubbleDraw, x: number, y: number): string {
	const spin = bubble.style === 'sfx' ? bubble.spin || -8 : bubble.spin
	return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${spin.toFixed(2)} ${(bubble.w / 2).toFixed(1)} ${(bubble.h / 2).toFixed(1)})">${bubbleMarkup(bubble)}</g>`
}
