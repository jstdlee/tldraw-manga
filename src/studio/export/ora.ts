import { strToU8, zipSync, unzipSync, strFromU8 } from 'fflate'
import { renderPageSvg, type PageRenderModel } from '../render/pageSvg'

export function buildOpenRaster(input: {
	width: number
	height: number
	layers: Array<{ name: string; png: Uint8Array }>
	merged: Uint8Array
	thumbnail: Uint8Array
}): Uint8Array {
	const stack = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.3" w="${input.width}" h="${input.height}" xres="300" yres="300">
  <stack name="Manga Page">
    ${input.layers.map((layer, index) => `<layer name="${escapeAttr(layer.name)}" src="data/${String(index).padStart(3, '0')}.png" x="0" y="0" visibility="visible" opacity="1"/>`).join('\n    ')}
  </stack>
</image>`
	const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
		mimetype: [strToU8('image/openraster'), { level: 0 }],
	}
	files['stack.xml'] = strToU8(stack)
	files['mergedimage.png'] = input.merged
	files['Thumbnails/thumbnail.png'] = input.thumbnail
	input.layers.forEach((layer, index) => {
		files[`data/${String(index).padStart(3, '0')}.png`] = layer.png
	})
	return zipSync(files, { level: 6 })
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function svgToPng(svg: string, width: number, height: number): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
		const image = new Image()
		image.onload = () => {
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const context = canvas.getContext('2d')
			if (!context) {
				URL.revokeObjectURL(url)
				reject(new Error('canvas'))
				return
			}
			context.drawImage(image, 0, 0, width, height)
			canvas.toBlob(async (blob) => {
				URL.revokeObjectURL(url)
				if (!blob) {
					reject(new Error('png'))
					return
				}
				resolve(new Uint8Array(await blob.arrayBuffer()))
			}, 'image/png')
		}
		image.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error('svg'))
		}
		image.src = url
	})
}

export async function pageToOra(model: PageRenderModel, name: string): Promise<{ ora: Uint8Array; svg: string; name: string }> {
	const scale = 1600 / model.height
	const width = Math.max(1, Math.round(model.width * scale))
	const height = 1600
	const parts: Array<{ name: string; part: PageRenderModel['part'] }> = [
		{ name: 'Director', part: 'director' },
		{ name: 'Bubbles', part: 'bubbles' },
		{ name: 'Ink', part: 'frames' },
		{ name: 'Art', part: 'art' },
		{ name: 'Paper', part: 'background' },
	]
	const layers = []
	for (const item of parts) {
		const svg = renderPageSvg({ ...model, part: item.part, numbers: item.part === 'director' ? 'badge' : 'off', director: true })
		layers.push({ name: item.name, png: await svgToPng(svg, width, height) })
	}
	const mergedSvg = renderPageSvg({ ...model, part: 'all', numbers: 'off', director: false })
	const merged = await svgToPng(mergedSvg, width, height)
	const thumbW = 256
	const thumbnail = await svgToPng(mergedSvg, thumbW, Math.round((thumbW * height) / width))
	return { name, svg: mergedSvg, ora: buildOpenRaster({ width, height, layers, merged, thumbnail }) }
}

export async function packageLayers(pages: Array<{ name: string; model: PageRenderModel; svg: string }>): Promise<Uint8Array> {
	const files: Record<string, Uint8Array> = {}
	for (const page of pages) {
		const ora = await pageToOra(page.model, page.name)
		files[`${page.name}.ora`] = ora.ora
		files[`${page.name}.svg`] = strToU8(page.svg)
	}
	return zipSync(files, { level: 6 })
}

export function readZipText(archive: Uint8Array, name: string): string {
	const files = unzipSync(archive)
	const file = files[name]
	return file ? strFromU8(file) : ''
}

export async function exportOpenRaster(model: PageRenderModel): Promise<Uint8Array> {
	const result = await pageToOra(model, model.title || 'page')
	return result.ora
}

export function exportPageSvgFile(model: PageRenderModel, filename?: string): string {
	const svg = renderPageSvg({ ...model, part: 'all' })
	if (filename) {
		const safeName = filename.replace(/\.svg$/i, '').replace(/\s+/g, '-')
		downloadText(`${safeName}.svg`, svg, 'image/svg+xml;charset=utf-8')
	}
	return svg
}

export async function exportPagePng2400(model: PageRenderModel, filenameOrHeight?: string | number): Promise<Uint8Array> {
	const targetHeight = typeof filenameOrHeight === 'number' ? filenameOrHeight : 2400
	const scale = targetHeight / Math.max(1, model.height)
	const targetWidth = Math.max(1, Math.round(model.width * scale))
	const svg = renderPageSvg({ ...model, part: 'all' })
	const bytes = await svgToPng(svg, targetWidth, targetHeight)
	if (typeof filenameOrHeight === 'string' && filenameOrHeight) {
		const safeName = filenameOrHeight.replace(/\.png$/i, '').replace(/\s+/g, '-')
		downloadBlob(`${safeName}.png`, bytes, 'image/png')
	}
	return bytes
}

export function downloadText(name: string, content: string, type = 'text/plain;charset=utf-8'): void {
	downloadBlob(name, new Blob([content], { type }))
}

export function downloadBlob(name: string, data: Blob | Uint8Array, type = 'application/octet-stream'): void {
	const blob = data instanceof Blob ? data : new Blob([data.buffer as ArrayBuffer], { type })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = name
	document.body.appendChild(link)
	link.click()
	link.remove()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
