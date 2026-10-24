import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build')
mkdirSync(outDir, { recursive: true })

function png(size) {
	const pixels = Buffer.alloc(size * size * 3)
	const set = (x, y, r, g, b) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return
		const i = (y * size + x) * 3
		pixels[i] = r
		pixels[i + 1] = g
		pixels[i + 2] = b
	}
	const fill = (x0, y0, x1, y1, color) => {
		for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) set(x, y, color[0], color[1], color[2])
	}
	const ink = [26, 36, 44]
	const paper = [251, 250, 246]
	const red = [214, 69, 61]
	const blue = [30, 120, 200]
	fill(0, 0, size, size, [16, 18, 22])
	const m = Math.round(size * 0.12)
	fill(m, m, size - m, size - m, paper)
	const pageX = m
	const pageY = m
	const pageW = size - m * 2
	const pageH = size - m * 2
	const gutter = Math.max(3, Math.round(size * 0.018))
	const rows = [0.34, 0.33, 0.33]
	let y = pageY
	rows.forEach((share, row) => {
		const h = Math.round(pageH * share)
		const cols = row === 1 ? [0.42, 0.58] : [0.62, 0.38]
		let x = pageX + pageW
		cols.forEach((col) => {
			const w = Math.round(pageW * col)
			x -= w
			fill(x + gutter, y + gutter, x + w - gutter, y + h - gutter, row === 2 && col === cols[1] ? [244, 239, 230] : paper)
			stroke(x + gutter, y + gutter, x + w - gutter, y + h - gutter, ink, Math.max(2, Math.round(size * 0.012)))
		})
		y += h
	})
	const badge = Math.round(size * 0.11)
	disc(size - m - badge, m + badge, badge, red)
	disc(m + Math.round(size * 0.22), pageY + pageH - Math.round(size * 0.16), Math.round(size * 0.075), [255, 254, 251])
	disc(m + Math.round(size * 0.22), pageY + pageH - Math.round(size * 0.16), Math.round(size * 0.06), blue)
	return encodePng(size, pixels)

	function stroke(x0, y0, x1, y1, color, width) {
		fill(x0, y0, x1, y0 + width, color)
		fill(x0, y1 - width, x1, y1, color)
		fill(x0, y0, x0 + width, y1, color)
		fill(x1 - width, y0, x1, y1, color)
	}
	function disc(cx, cy, radius, color) {
		const r2 = radius * radius
		for (let y = cy - radius; y <= cy + radius; y += 1) {
			for (let x = cx - radius; x <= cx + radius; x += 1) {
				const dx = x - cx
				const dy = y - cy
				if (dx * dx + dy * dy <= r2) set(x, y, color[0], color[1], color[2])
			}
		}
	}
}

function encodePng(size, rgb) {
	const raw = Buffer.alloc((size * 3 + 1) * size)
	for (let y = 0; y < size; y += 1) {
		const row = y * (size * 3 + 1)
		raw[row] = 0
		rgb.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3)
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(size, 0)
	ihdr.writeUInt32BE(size, 4)
	ihdr[8] = 8
	ihdr[9] = 2
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	])
}

function chunk(type, data) {
	const head = Buffer.alloc(8)
	head.writeUInt32BE(data.length, 0)
	head.write(type, 4, 4, 'ascii')
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
	return Buffer.concat([head, data, crc])
}

function ico(images) {
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	const entries = []
	let offset = 6 + images.length * 16
	const body = []
	for (const image of images) {
		const entry = Buffer.alloc(16)
		entry[0] = image.size >= 256 ? 0 : image.size
		entry[1] = image.size >= 256 ? 0 : image.size
		entry.writeUInt16LE(1, 4)
		entry.writeUInt16LE(32, 6)
		entry.writeUInt32LE(image.png.length, 8)
		entry.writeUInt32LE(offset, 12)
		entries.push(entry)
		body.push(image.png)
		offset += image.png.length
	}
	return Buffer.concat([header, ...entries, ...body])
}

function icns(png512) {
	const type = Buffer.from('ic09')
	const length = Buffer.alloc(4)
	length.writeUInt32BE(8 + png512.length)
	const body = Buffer.concat([type, length, png512])
	const magic = Buffer.from('icns')
	const total = Buffer.alloc(4)
	total.writeUInt32BE(8 + body.length)
	return Buffer.concat([magic, total, body])
}

const sizes = [16, 32, 48, 64, 128, 256, 512]
const images = sizes.map((size) => ({ size, png: png(size) }))
writeFileSync(path.join(outDir, 'icon.png'), images.find((image) => image.size === 512).png)
writeFileSync(path.join(outDir, 'icon.ico'), ico(images.filter((image) => image.size <= 256)))
writeFileSync(path.join(outDir, 'icon.icns'), icns(images.find((image) => image.size === 512).png))
console.log('wrote build/icon.png, build/icon.ico, build/icon.icns')
