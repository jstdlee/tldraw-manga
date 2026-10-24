export type Pt = [number, number]

export type PanelGene = {
	nest: { u: number } | null
	bT: boolean
	bB: boolean
	bR: boolean
	bL: boolean
}

export type RowGene = {
	colW: number[]
	colTilt: number[]
	panels: PanelGene[]
}

export type Genome = {
	rowW: number[]
	rowTilt: number[]
	rows: RowGene[]
}

export type LayoutConfig = {
	ratio: number
	rowMin: number
	rowMax: number
	tilt: number
	bleed: number
	nest: number
	big: number
}

export type LayoutPreset = 'seizen' | 'std' | 'action' | 'tobira'

export type RealizedPanel = {
	pts: Pt[]
	row: number
	col: number
}

export type Divider = {
	kind: 'row' | 'col'
	index: number
	row: number
	x: number
	y: number
}

export type Layout = {
	seed: string
	genome: Genome
	width: number
	height: number
	inner: { x0: number; y0: number; x1: number; y1: number }
	panels: RealizedPanel[]
	dividers: Divider[]
}

const PAGE_H = 1000
const MARGIN_X = 50
const MARGIN_Y = 56

export function strHash(value: string): number {
	let hash = 2166136261
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

export function mulberry32(value: number): () => number {
	let state = value
	return function random() {
		state |= 0
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function irnd(random: () => number, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
}

function wpick(random: () => number, weights: number[]): number {
	const total = weights.reduce((sum, item) => sum + item, 0)
	let value = random() * total
	for (let i = 0; i < weights.length; i += 1) {
		value -= weights[i]
		if (value < 0) return i
	}
	return weights.length - 1
}

function hLine(yLeft: number, yRight: number, width: number) {
	return { y0: yLeft, m: (yRight - yLeft) / width }
}

function vLine(xa: number, ya: number, xb: number, yb: number) {
	const k = (xb - xa) / (yb - ya || 1e-6)
	return { x0: xa - k * ya, k }
}

function vVert(x: number) {
	return { x0: x, k: 0 }
}

function isect(horizontal: { y0: number; m: number }, vertical: { x0: number; k: number }): Pt {
	const denom = 1 - vertical.k * horizontal.m
	const x = Math.abs(denom) < 1e-6 ? vertical.x0 : (vertical.x0 + vertical.k * horizontal.y0) / denom
	const y = horizontal.y0 + horizontal.m * x
	return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0]
}

function offH(line: { y0: number; m: number }, distance: number) {
	return { y0: line.y0 + distance, m: line.m }
}

function offV(line: { x0: number; k: number }, distance: number) {
	return { x0: line.x0 + distance, k: line.k }
}

function quad(
	top: { y0: number; m: number },
	bottom: { y0: number; m: number },
	right: { x0: number; k: number },
	left: { x0: number; k: number },
): Pt[] {
	return [isect(top, left), isect(top, right), isect(bottom, right), isect(bottom, left)]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function blankPanel(): PanelGene {
	return { nest: null, bT: false, bB: false, bR: false, bL: false }
}

export function sanitize(genome: Genome | null | undefined): Genome {
	const source = genome?.rows?.length ? genome : fallbackGenome()
	const rows = source.rows.map((row) => {
		const count = Math.max(1, Math.min(4, row?.colW?.length || row?.panels?.length || 1))
		return {
			colW: Array.from({ length: count }, (_, index) => positive(row.colW?.[index], 1)),
			colTilt: Array.from({ length: Math.max(0, count - 1) }, (_, index) => clamp(row.colTilt?.[index] ?? 0, -1, 1)),
			panels: Array.from({ length: count }, (_, index) => cleanPanel(row.panels?.[index])),
		}
	})
	return {
		rowW: rows.map((_, index) => positive(source.rowW?.[index], 1)),
		rowTilt: rows.slice(1).map((_, index) => clamp(source.rowTilt?.[index] ?? 0, -1, 1)),
		rows,
	}
}

function positive(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && (value as number) > 0.05 ? (value as number) : fallback
}

function cleanPanel(panel: Partial<PanelGene> | undefined): PanelGene {
	const u = panel?.nest?.u
	return {
		nest: Number.isFinite(u) ? { u: clamp(u as number, 0.3, 0.7) } : null,
		bT: Boolean(panel?.bT),
		bB: Boolean(panel?.bB),
		bR: Boolean(panel?.bR),
		bL: Boolean(panel?.bL),
	}
}

function fallbackGenome(): Genome {
	return {
		rowW: [1, 1],
		rowTilt: [0],
		rows: [
			{ colW: [1, 1], colTilt: [0], panels: [blankPanel(), blankPanel()] },
			{ colW: [1], colTilt: [], panels: [blankPanel()] },
		],
	}
}

export function randomGenome(random: () => number, config: LayoutConfig): Genome {
	const rowCount = irnd(random, config.rowMin, config.rowMax)
	const rowW = Array.from({ length: rowCount }, () => 0.65 + random())
	let bigRow = -1
	if (rowCount > 1 && random() < config.big) {
		bigRow = irnd(random, 0, rowCount - 1)
		rowW[bigRow] *= 1.8 + config.big * 1.5
	}
	const rowTilt = Array.from({ length: Math.max(0, rowCount - 1) }, () => (random() * 2 - 1) * config.tilt)
	const sum = rowW.reduce((total, weight) => total + weight, 0)
	const rows: RowGene[] = []
	for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
		const share = rowW[rowIndex] / sum
		const w1 = 0.55 + config.big * 2.2 + (rowIndex === bigRow ? 2.6 : 0) + (share > 0.45 ? 1.3 : 0)
		const columnCount = wpick(random, [w1, 1.5, 1.05]) + 1
		const colW = Array.from({ length: columnCount }, () => 0.7 + random())
		const colTilt = Array.from({ length: Math.max(0, columnCount - 1) }, () => (random() * 2 - 1) * config.tilt)
		const panels = Array.from({ length: columnCount }, () => ({
			nest: random() < config.nest * (columnCount === 1 ? 0.45 : 1) ? { u: 0.38 + random() * 0.24 } : null,
			bT: random() < config.bleed,
			bB: random() < config.bleed,
			bR: random() < config.bleed * 0.9,
			bL: random() < config.bleed * 0.9,
		}))
		rows.push({ colW, colTilt, panels })
	}
	return { rowW, rowTilt, rows }
}

export function realize(raw: Genome, config: LayoutConfig): Omit<Layout, 'seed'> {
	const genome = sanitize(raw)
	const height = PAGE_H
	const width = Math.round(height * config.ratio)
	const outside = 14
	const rowGap = 16
	const colGap = 9
	const inner = { x0: MARGIN_X, y0: MARGIN_Y, x1: width - MARGIN_X, y1: height - MARGIN_Y }
	const innerHeight = inner.y1 - inner.y0
	const innerWidth = inner.x1 - inner.x0
	const rowCount = genome.rows.length
	const sum = genome.rowW.reduce((total, weight) => total + weight, 0)
	const rowHeights = genome.rowW.map((weight) => (weight / sum) * innerHeight)
	const rowBounds = [inner.y0]
	rowHeights.forEach((rowHeight) => rowBounds.push(rowBounds[rowBounds.length - 1] + rowHeight))
	const rowLines = [hLine(inner.y0, inner.y0, width)]
	for (let i = 1; i < rowCount; i += 1) {
		const distance = (genome.rowTilt[i - 1] || 0) * 0.42 * Math.min(rowHeights[i - 1], rowHeights[i])
		rowLines.push(hLine(rowBounds[i] - distance, rowBounds[i] + distance, width))
	}
	rowLines.push(hLine(inner.y1, inner.y1, width))

	const panels: RealizedPanel[] = []
	const dividers: Divider[] = []
	for (let i = 1; i < rowCount; i += 1) {
		const line = rowLines[i]
		const x = width / 2
		dividers.push({ kind: 'row', index: i - 1, row: i - 1, x, y: line.y0 + line.m * x })
	}

	for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
		const row = genome.rows[rowIndex]
		const topLine = rowLines[rowIndex]
		const bottomLine = rowLines[rowIndex + 1]
		const columnCount = row.colW.length
		const columnSum = row.colW.reduce((total, weight) => total + weight, 0)
		const widths = row.colW.map((weight) => (weight / columnSum) * innerWidth)
		const xBounds = [inner.x1]
		widths.forEach((columnWidth) => xBounds.push(xBounds[xBounds.length - 1] - columnWidth))
		const topY = topLine.y0 + (topLine.m * width) / 2
		const bottomY = bottomLine.y0 + (bottomLine.m * width) / 2
		const verticalLines = [vVert(inner.x1)]
		for (let columnIndex = 1; columnIndex < columnCount; columnIndex += 1) {
			const distance = (row.colTilt[columnIndex - 1] || 0) * 0.3 * Math.min(widths[columnIndex - 1], widths[columnIndex])
			verticalLines.push(vLine(xBounds[columnIndex] - distance, topY, xBounds[columnIndex] + distance, bottomY))
			const line = verticalLines[verticalLines.length - 1]
			const midY = (topY + bottomY) / 2
			dividers.push({
				kind: 'col',
				index: columnIndex - 1,
				row: rowIndex,
				x: line.x0 + line.k * midY,
				y: midY,
			})
		}
		verticalLines.push(vVert(inner.x0))

		for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
			const panel = row.panels[columnIndex]
			const isTop = rowIndex === 0
			const isBottom = rowIndex === rowCount - 1
			const isRight = columnIndex === 0
			const isLeft = columnIndex === columnCount - 1
			const top = isTop && panel.bT ? hLine(-outside, -outside, width) : offH(topLine, rowIndex > 0 ? rowGap / 2 : 0)
			const bottom = isBottom && panel.bB ? hLine(height + outside, height + outside, width) : offH(bottomLine, rowIndex < rowCount - 1 ? -rowGap / 2 : 0)
			const right = isRight && panel.bR ? vVert(width + outside) : offV(verticalLines[columnIndex], columnIndex > 0 ? -colGap / 2 : 0)
			const left = isLeft && panel.bL ? vVert(-outside) : offV(verticalLines[columnIndex + 1], columnIndex < columnCount - 1 ? colGap / 2 : 0)
			if (panel.nest && rowHeights[rowIndex] > 160) {
				const split = panel.nest.u
				const gap = (columnCount === 1 ? rowGap : colGap) / 2
				const middle = hLine(
					lerp(top.y0, bottom.y0, split),
					lerp(top.y0 + top.m * width, bottom.y0 + bottom.m * width, split),
					width,
				)
				panels.push({ pts: quad(top, offH(middle, -gap), right, left), row: rowIndex, col: columnIndex })
				panels.push({ pts: quad(offH(middle, gap), bottom, right, left), row: rowIndex, col: columnIndex })
			} else {
				panels.push({ pts: quad(top, bottom, right, left), row: rowIndex, col: columnIndex })
			}
		}
	}
	return { genome, width, height, inner, panels, dividers }
}

export function generate(seed: string, config: LayoutConfig): Layout {
	const random = mulberry32(strHash(seed))
	const genome = randomGenome(random, config)
	return { seed, ...realize(genome, config) }
}

function jit(random: () => number, value: number, amount: number, min: number, max: number): number {
	return clamp(value + (random() * 2 - 1) * amount, min, max)
}

export function mutate(genome: Genome, random: () => number, strength: number): Genome {
	const next = sanitize(structuredClone(genome))
	next.rowW = next.rowW.map((weight) => jit(random, weight, 0.55 * strength, 0.3, 3.2))
	next.rowTilt = next.rowTilt.map((tilt) => jit(random, tilt, 0.55 * strength, -1, 1))
	next.rows.forEach((row) => {
		row.colW = row.colW.map((weight) => jit(random, weight, 0.5 * strength, 0.35, 3))
		row.colTilt = row.colTilt.map((tilt) => jit(random, tilt, 0.5 * strength, -1, 1))
		row.panels.forEach((panel) => {
			if (panel.nest) panel.nest.u = jit(random, panel.nest.u, 0.14 * strength, 0.3, 0.7)
		})
	})
	const pickRow = () => irnd(random, 0, next.rows.length - 1)
	if (random() < strength * 0.55) {
		const row = next.rows[pickRow()]
		const panel = row.panels[irnd(random, 0, row.panels.length - 1)]
		panel.nest = panel.nest ? null : { u: 0.38 + random() * 0.24 }
	}
	if (random() < strength * 0.5) {
		const row = next.rows[pickRow()]
		const columnCount = row.colW.length
		const canAdd = columnCount < 3
		const canRemove = columnCount > 1
		if (canRemove && (!canAdd || random() < 0.5)) {
			const columnIndex = irnd(random, 0, columnCount - 1)
			row.colW.splice(columnIndex, 1)
			row.panels.splice(columnIndex, 1)
			if (row.colTilt.length) row.colTilt.splice(Math.min(columnIndex, row.colTilt.length - 1), 1)
		} else if (canAdd) {
			const columnIndex = irnd(random, 0, columnCount)
			row.colW.splice(columnIndex, 0, 0.7 + random())
			row.panels.splice(columnIndex, 0, { nest: null, bT: random() < 0.2, bB: random() < 0.2, bR: random() < 0.2, bL: random() < 0.2 })
			row.colTilt.splice(Math.min(columnIndex, row.colTilt.length), 0, (random() * 2 - 1) * 0.4)
		}
	}
	if (random() < strength * 0.6) {
		const rowIndex = pickRow()
		const row = next.rows[rowIndex]
		const columnIndex = irnd(random, 0, row.panels.length - 1)
		const panel = row.panels[columnIndex]
		const sides: Array<'bT' | 'bB' | 'bR' | 'bL'> = []
		if (rowIndex === 0) sides.push('bT')
		if (rowIndex === next.rows.length - 1) sides.push('bB')
		if (columnIndex === 0) sides.push('bR')
		if (columnIndex === row.panels.length - 1) sides.push('bL')
		if (sides.length) {
			const side = sides[irnd(random, 0, sides.length - 1)]
			panel[side] = !panel[side]
		}
	}
	if (random() < strength * strength * 0.45) {
		if (next.rows.length > 1 && random() < 0.5) {
			const rowIndex = irnd(random, 0, next.rows.length - 1)
			next.rows.splice(rowIndex, 1)
			next.rowW.splice(rowIndex, 1)
			if (next.rowTilt.length) next.rowTilt.splice(Math.min(rowIndex, next.rowTilt.length - 1), 1)
		} else if (next.rows.length < 4) {
			const source = structuredClone(next.rows[irnd(random, 0, next.rows.length - 1)])
			const rowIndex = irnd(random, 0, next.rows.length)
			next.rows.splice(rowIndex, 0, source)
			next.rowW.splice(rowIndex, 0, 0.65 + random())
			next.rowTilt.splice(Math.min(rowIndex, next.rowTilt.length), 0, (random() * 2 - 1) * 0.4)
		}
	}
	return sanitize(next)
}

export function dragRowDivider(genome: Genome, index: number, dx: number, dy: number, config: LayoutConfig): Genome {
	const next = sanitize(genome)
	if (index < 0 || index >= next.rowW.length - 1) return next
	const height = PAGE_H
	const innerH = height - MARGIN_Y * 2
	const sum = next.rowW.reduce((total, weight) => total + weight, 0)
	const h0 = (next.rowW[index] / sum) * innerH
	const h1 = (next.rowW[index + 1] / sum) * innerH
	const nh0 = clamp(h0 + dy, 72, h0 + h1 - 72)
	const nh1 = h0 + h1 - nh0
	next.rowW[index] = nh0
	next.rowW[index + 1] = nh1
	const scale = 0.42 * Math.min(h0, h1)
	next.rowTilt[index] = clamp((next.rowTilt[index] ?? 0) + dx / Math.max(24, scale), -1, 1)
	void config
	return next
}

export function dragColDivider(
	genome: Genome,
	rowIndex: number,
	index: number,
	dx: number,
	dy: number,
	config: LayoutConfig,
): Genome {
	const next = sanitize(genome)
	const row = next.rows[rowIndex]
	if (!row || index < 0 || index >= row.colW.length - 1) return next
	const width = Math.round(PAGE_H * config.ratio)
	const innerW = width - MARGIN_X * 2
	const sum = row.colW.reduce((total, weight) => total + weight, 0)
	const right = (row.colW[index] / sum) * innerW
	const left = (row.colW[index + 1] / sum) * innerW
	const nextRight = clamp(right + dx, 48, right + left - 48)
	const nextLeft = right + left - nextRight
	row.colW[index] = nextRight
	row.colW[index + 1] = nextLeft
	const scale = 0.3 * Math.min(right, left)
	row.colTilt[index] = clamp((row.colTilt[index] ?? 0) + dy / Math.max(24, scale), -1, 1)
	return next
}

export function boundsOf(pts: Pt[]): { minX: number; maxX: number; minY: number; maxY: number } {
	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	for (const [x, y] of pts) {
		minX = Math.min(minX, x)
		maxX = Math.max(maxX, x)
		minY = Math.min(minY, y)
		maxY = Math.max(maxY, y)
	}
	return { minX, maxX, minY, maxY }
}

export function polygonArea(pts: Pt[]): number {
	const sum = pts.reduce((total, point, index) => {
		const next = pts[(index + 1) % pts.length]
		return total + point[0] * next[1] - next[0] * point[1]
	}, 0)
	return Math.abs(sum) / 2
}

export function pointInPoly(x: number, y: number, pts: Pt[]): boolean {
	let inside = false
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
		const xi = pts[i][0]
		const yi = pts[i][1]
		const xj = pts[j][0]
		const yj = pts[j][1]
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi
		if (intersect) inside = !inside
	}
	return inside
}

export function centroid(pts: Pt[]): Pt {
	const xs = pts.reduce((sum, point) => sum + point[0], 0) / pts.length
	const ys = pts.reduce((sum, point) => sum + point[1], 0) / pts.length
	return [xs, ys]
}

const ASPECTS = [
	{ id: '16:9', value: 16 / 9 },
	{ id: '4:3', value: 4 / 3 },
	{ id: '1:1', value: 1 },
	{ id: '3:4', value: 3 / 4 },
	{ id: '9:16', value: 9 / 16 },
] as const

export type AspectId = (typeof ASPECTS)[number]['id']

export function closestAspect(width: number, height: number): AspectId {
	const ratio = Math.max(width, 1) / Math.max(height, 1)
	let best: (typeof ASPECTS)[number] = ASPECTS[2]
	let bestDistance = Infinity
	for (const item of ASPECTS) {
		const distance = Math.abs(Math.log(item.value) - Math.log(ratio))
		if (distance < bestDistance) {
			best = item
			bestDistance = distance
		}
	}
	return best.id
}

export function aspectValue(id: string): number {
	return ASPECTS.find((item) => item.id === id)?.value ?? 1
}

const PRESETS: Record<LayoutPreset, Omit<LayoutConfig, 'ratio'>> = {
	seizen: { rowMin: 2, rowMax: 3, tilt: 0.08, bleed: 0.05, nest: 0.04, big: 0.18 },
	std: { rowMin: 2, rowMax: 3, tilt: 0.36, bleed: 0.22, nest: 0.28, big: 0.55 },
	action: { rowMin: 2, rowMax: 4, tilt: 0.84, bleed: 0.42, nest: 0.36, big: 0.78 },
	tobira: { rowMin: 1, rowMax: 2, tilt: 0.2, bleed: 0.7, nest: 0.1, big: 0.95 },
}

export function configFor(preset: string, targetPanels: number): LayoutConfig {
	const key: LayoutPreset = preset === 'seizen' || preset === 'action' || preset === 'tobira' || preset === 'std' ? preset : 'std'
	const base = PRESETS[key]
	if (key === 'tobira') return { ...base, ratio: 0.708 }
	const rows = clamp(Math.round(Math.max(3, targetPanels) / 2.15), 1, 4)
	return {
		...base,
		ratio: 0.708,
		rowMin: Math.max(1, rows - (key === 'seizen' ? 0 : 1)),
		rowMax: Math.min(4, Math.max(base.rowMax, rows + (key === 'action' ? 1 : 0))),
	}
}

export function pagePixelSize(): { w: number; h: number } {
	const h = 640
	return { w: Math.round(h * 0.708), h }
}
