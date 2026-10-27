export type Pt = [number, number]

export interface NestedGene {
	t: number
	s: number
	g: number
	u?: number
}

export interface PanelGene {
	nest: NestedGene | null
	bT: boolean
	bB: boolean
	bR: boolean
	bL: boolean
}

export interface RowGene {
	h: number
	s: number
	g: number
	w: number[]
	vs: { s: number; g: number }[]
	p: PanelGene[]
}

export interface Genome {
	rows: RowGene[]
}

export interface LayoutConfig {
	ratio: number
	rowMin: number
	rowMax: number
	tilt: number
	bleed: number
	nest: number
	big: number
	lineW?: number
}

export type LayoutPreset = 'seizen' | 'std' | 'action' | 'tobira'

export interface ParametricOverrides {
	ratio?: number
	rowRange?: '1-3' | '2-3' | '2-4' | '3-4'
	tilt?: number
	bleed?: number
	nest?: number
	big?: number
	lineW?: number
	mutationStrength?: number
	showInnerFrame?: boolean
	showRuleOfThirds?: boolean
	showAxis180?: boolean
}

export const PAGE_RATIOS: { id: string; label: string; ratio: number }[] = [
	{ id: 'b4', label: 'B4 Manga Manuscript (0.708)', ratio: 0.708 },
	{ id: 'a4', label: 'A4 Standard Print (0.707)', ratio: 0.707 },
	{ id: 'webtoon', label: 'Vertical Webtoon (0.563)', ratio: 0.5625 },
	{ id: 'yonkoma', label: '4-Koma Strip (0.500)', ratio: 0.5 },
	{ id: 'wide', label: 'Widescreen Spread (1.333)', ratio: 1.333 },
]

export const ROW_RANGES: { id: '1-3' | '2-3' | '2-4' | '3-4'; label: string; min: number; max: number }[] = [
	{ id: '1-3', label: '1–3 Rows (Splash / Open)', min: 1, max: 3 },
	{ id: '2-3', label: '2–3 Rows (Dynamic Action)', min: 2, max: 3 },
	{ id: '2-4', label: '2–4 Rows (Standard Narrative)', min: 2, max: 4 },
	{ id: '3-4', label: '3–4 Rows (Dense Dialogue)', min: 3, max: 4 },
]

export interface RealizedPanel {
	pts: Pt[]
	row: number
	col: number
	sub: number
}

export interface Divider {
	kind: 'row' | 'col'
	index: number
	row: number
	x: number
	y: number
}

export interface Layout {
	seed: string
	width: number
	height: number
	inner: {
		x: number
		y: number
		w: number
		h: number
		x0: number
		y0: number
		x1: number
		y1: number
	}
	panels: RealizedPanel[]
	dividers: Divider[]
	genome: Genome
}

const eps = 1e-6

export function strHash(text: string): number {
	let h = 2166136261 >>> 0
	for (let i = 0; i < text.length; i += 1) {
		h ^= text.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v))
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function norm(values: number[]): number[] {
	const cleaned = values.map((v) => Math.max(0.08, Number.isFinite(v) ? v : 0.25))
	const total = cleaned.reduce((acc, item) => acc + item, 0) || 1
	return cleaned.map((v) => v / total)
}

export function clipHalf(poly: Pt[], nx: number, ny: number, c: number): Pt[] {
	if (!poly.length) return []
	const out: Pt[] = []
	const count = poly.length
	for (let i = 0; i < count; i += 1) {
		const a = poly[i]
		const b = poly[(i + 1) % count]
		const da = nx * a[0] + ny * a[1] - c
		const db = nx * b[0] + ny * b[1] - c
		if (da <= eps) out.push(a)
		if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
			const t = da / (da - db)
			out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
		}
	}
	return out
}

export function splitPoly(poly: Pt[], nx: number, ny: number, c: number, gap: number): [Pt[], Pt[]] {
	const len = Math.hypot(nx, ny) || 1
	const ux = nx / len
	const uy = ny / len
	const d = c / len
	const half = gap / 2
	return [clipHalf(poly, ux, uy, d - half), clipHalf(poly, -ux, -uy, -(d + half))]
}

export function polyArea(poly: Pt[]): number {
	let area = 0
	for (let i = 0, n = poly.length; i < n; i += 1) {
		const [x1, y1] = poly[i]
		const [x2, y2] = poly[(i + 1) % n]
		area += x1 * y2 - x2 * y1
	}
	return Math.abs(area) / 2
}

export const polygonArea = polyArea

export function centroid(poly: Pt[]): Pt {
	let cx = 0
	let cy = 0
	let area2 = 0
	for (let i = 0, n = poly.length; i < n; i += 1) {
		const [x1, y1] = poly[i]
		const [x2, y2] = poly[(i + 1) % n]
		const cross = x1 * y2 - x2 * y1
		cx += (x1 + x2) * cross
		cy += (y1 + y2) * cross
		area2 += cross
	}
	if (Math.abs(area2) < eps) return poly[0] ?? [0, 0]
	return [cx / (3 * area2), cy / (3 * area2)]
}

export function boundsOf(poly: Pt[]): { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number } {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const [x, y] of poly) {
		if (x < minX) minX = x
		if (y < minY) minY = y
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
	}
	return { minX, minY, maxX, maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

export function pointInPoly(xOrPt: number | Pt, yOrPts: number | Pt[], maybePts?: Pt[]): boolean {
	const x = typeof xOrPt === 'number' ? xOrPt : xOrPt[0]
	const y = typeof xOrPt === 'number' ? (yOrPts as number) : xOrPt[1]
	const pts = typeof xOrPt === 'number' ? (maybePts ?? []) : (yOrPts as Pt[])
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

export function sanitize(raw: Genome | null | undefined): Genome {
	const genome = raw && typeof raw === 'object' ? clone(raw) : ({ rows: [] } as Genome)
	if (!Array.isArray(genome.rows) || !genome.rows.length) {
		genome.rows = [
			{
				h: 0.55,
				s: 0,
				g: 12,
				w: [0.5, 0.5],
				vs: [{ s: 0, g: 10 }],
				p: [
					{ nest: null, bT: false, bB: false, bR: false, bL: false },
					{ nest: null, bT: false, bB: false, bR: false, bL: false },
				],
			},
			{
				h: 0.45,
				s: 0,
				g: 12,
				w: [1],
				vs: [],
				p: [{ nest: null, bT: false, bB: false, bR: false, bL: false }],
			},
		]
	}
	const heights = norm(genome.rows.map((row) => row.h ?? 1))
	genome.rows.forEach((row, index) => {
		row.h = heights[index]
		row.s = clamp(+row.s || 0, -0.25, 0.25)
		row.g = clamp(+row.g || 13, 4, 28)
		const count = clamp(Array.isArray(row.w) ? row.w.length : Array.isArray(row.p) ? row.p.length : 1, 1, 4)
		row.w = norm((row.w ?? []).slice(0, count))
		while (row.w.length < count) row.w.push(1 / count)
		row.w = norm(row.w)
		row.vs = Array.from({ length: count - 1 }, (_, splitIndex) => ({
			s: clamp(+(row.vs?.[splitIndex]?.s ?? 0), -0.25, 0.25),
			g: clamp(+(row.vs?.[splitIndex]?.g ?? 9), 4, 24),
		}))
		row.p = Array.from({ length: count }, (_, panelIndex) => {
			const cell = row.p?.[panelIndex] ?? ({} as PanelGene)
			const nest = cell.nest
				? {
						t: clamp(+(cell.nest.t ?? cell.nest.u ?? 0.5), 0.3, 0.7),
						s: clamp(+(cell.nest.s ?? 0), -0.22, 0.22),
						g: clamp(+(cell.nest.g ?? 10), 4, 22),
					}
				: null
			return {
				nest,
				bT: index === 0 ? Boolean(cell.bT) : false,
				bB: index === genome.rows.length - 1 ? Boolean(cell.bB) : false,
				bR: panelIndex === 0 ? Boolean(cell.bR) : false,
				bL: panelIndex === count - 1 ? Boolean(cell.bL) : false,
			}
		})
	})
	genome.rows[genome.rows.length - 1].s = 0
	return genome
}

export function defaultOverridesForPreset(preset: string): Required<ParametricOverrides> {
	if (preset === 'seizen') {
		return {
			ratio: 0.708,
			rowRange: '3-4',
			tilt: 0.04,
			bleed: 0.05,
			nest: 0.08,
			big: 0.08,
			lineW: 3.0,
			mutationStrength: 0.35,
			showInnerFrame: false,
			showRuleOfThirds: false,
			showAxis180: false,
		}
	}
	if (preset === 'action') {
		return {
			ratio: 0.708,
			rowRange: '2-3',
			tilt: 0.55,
			bleed: 0.45,
			nest: 0.28,
			big: 0.35,
			lineW: 4.0,
			mutationStrength: 0.55,
			showInnerFrame: false,
			showRuleOfThirds: false,
			showAxis180: false,
		}
	}
	if (preset === 'tobira') {
		return {
			ratio: 0.708,
			rowRange: '1-3',
			tilt: 0.4,
			bleed: 0.75,
			nest: 0.1,
			big: 0.7,
			lineW: 3.6,
			mutationStrength: 0.45,
			showInnerFrame: false,
			showRuleOfThirds: false,
			showAxis180: false,
		}
	}
	return {
		ratio: 0.708,
		rowRange: '2-4',
		tilt: 0.25,
		bleed: 0.2,
		nest: 0.2,
		big: 0.2,
		lineW: 3.2,
		mutationStrength: 0.45,
		showInnerFrame: false,
		showRuleOfThirds: false,
		showAxis180: false,
	}
}

export function configFor(preset: string, targetPanels = 4, overrides?: ParametricOverrides): LayoutConfig {
	const base = defaultOverridesForPreset(preset)
	const merged = { ...base, ...(overrides ?? {}) }
	const rangeSpec = ROW_RANGES.find((r) => r.id === merged.rowRange)
	const autoMin = targetPanels <= 3 ? 2 : 3
	const autoMax = targetPanels >= 6 ? 4 : 3
	const rowMin = overrides?.rowRange && rangeSpec ? rangeSpec.min : preset === 'tobira' ? 1 : autoMin
	const rowMax = overrides?.rowRange && rangeSpec ? rangeSpec.max : preset === 'seizen' ? 4 : autoMax
	return {
		ratio: clamp(Number(merged.ratio) || 0.708, 0.45, 1.4),
		rowMin,
		rowMax: Math.max(rowMin, rowMax),
		tilt: clamp(Number(merged.tilt ?? base.tilt), 0, 1),
		bleed: clamp(Number(merged.bleed ?? base.bleed), 0, 1),
		nest: clamp(Number(merged.nest ?? base.nest), 0, 1),
		big: clamp(Number(merged.big ?? base.big), 0, 1),
		lineW: clamp(Number(merged.lineW ?? base.lineW), 1.5, 8),
	}
}

export function generate(seed: string, config: LayoutConfig): Layout {
	const r = mulberry32(strHash(String(seed)))
	const pick = <T,>(items: T[], weights: number[]): T => {
		const sum = weights.reduce((a, b) => a + b, 0)
		let roll = r() * sum
		for (let i = 0; i < items.length; i += 1) {
			roll -= weights[i]
			if (roll <= 0) return items[i]
		}
		return items[items.length - 1]
	}
	const rowOptions: number[] = []
	const rowWeights: number[] = []
	for (let k = config.rowMin; k <= config.rowMax; k += 1) {
		rowOptions.push(k)
		rowWeights.push(k === 3 ? 4 : k === 4 ? 3 : 1.6)
	}
	const rowCount = pick(rowOptions, rowWeights)
	const rawH = Array.from({ length: rowCount }, () => 0.65 + r() * 0.75)
	if (r() < 0.4 + config.big * 0.5) rawH[Math.floor(r() * rowCount)] *= 1.5 + config.big * 0.8
	const h = norm(rawH)
	const rows: RowGene[] = []
	for (let i = 0; i < rowCount; i += 1) {
		const isBigRow = h[i] > 0.37
		const cols = pick([1, 2, 3], isBigRow ? [2.8 + config.big * 3, 3.2, 1] : [1, 4.2, 2.3])
		const rawW = Array.from({ length: cols }, () => 0.65 + r() * 0.75)
		if (cols > 1 && r() < 0.5) rawW[Math.floor(r() * cols)] *= 1.55
		const w = norm(rawW)
		const slope = () => (r() < config.tilt ? (r() - 0.5) * 0.34 * (0.45 + config.tilt * 0.75) : 0)
		const vs = Array.from({ length: cols - 1 }, () => ({ s: slope(), g: 9 }))
		const p = Array.from({ length: cols }, (_, col) => {
			const canNest = cols >= 2 && w[col] < 0.55 && h[i] > 0.23
			const nest = canNest && r() < config.nest ? { t: 0.42 + r() * 0.16, s: slope() * 0.6, g: 10 } : null
			return {
				nest,
				bT: i === 0 && r() < config.bleed * 0.65,
				bB: i === rowCount - 1 && r() < config.bleed * 0.65,
				bR: col === 0 && r() < config.bleed,
				bL: col === cols - 1 && r() < config.bleed,
			}
		})
		rows.push({ h: h[i], s: i < rowCount - 1 ? slope() : 0, g: 13, w, vs, p })
	}
	return { ...realize(sanitize({ rows }), config), seed }
}

export function mutate(base: Genome, r: () => number, strength = 0.45): Genome {
	const g = sanitize(base)
	const rows = g.rows
	if (r() < strength * 0.32 && rows.length < 4) {
		const at = Math.floor(r() * rows.length)
		rows.splice(at, 0, {
			h: 0.24,
			s: (r() - 0.5) * 0.2 * strength,
			g: 13,
			w: [0.5, 0.5],
			vs: [{ s: 0, g: 9 }],
			p: [
				{ nest: null, bT: false, bB: false, bR: false, bL: false },
				{ nest: null, bT: false, bB: false, bR: false, bL: false },
			],
		})
	} else if (r() < strength * 0.28 && rows.length > 2) {
		rows.splice(Math.floor(r() * rows.length), 1)
	}
	rows.forEach((row) => {
		row.h *= Math.exp((r() - 0.5) * 0.72 * strength)
		row.s += (r() - 0.5) * 0.2 * strength
		if (r() < 0.12 * strength) row.s = 0
		if (r() < strength * 0.34 && row.w.length < 3) {
			row.w.push(0.45)
		} else if (r() < strength * 0.28 && row.w.length > 1) {
			row.w.pop()
		}
		row.w = row.w.map((v) => v * Math.exp((r() - 0.5) * 0.75 * strength))
		row.vs = (row.vs ?? []).map((v) => ({
			s: r() < 0.14 ? 0 : v.s + (r() - 0.5) * 0.2 * strength,
			g: v.g,
		}))
		row.p = (row.p ?? []).map((cell) => {
			const c = { ...(cell ?? { nest: null, bT: false, bB: false, bR: false, bL: false }) }
			if (r() < 0.2 * strength) {
				c.nest = c.nest ? null : { t: 0.44 + r() * 0.12, s: (r() - 0.5) * 0.15, g: 10 }
			} else if (c.nest) {
				c.nest = {
					...c.nest,
					t: c.nest.t + (r() - 0.5) * 0.14 * strength,
					s: c.nest.s + (r() - 0.5) * 0.14 * strength,
				}
			}
			for (const k of ['bT', 'bB', 'bR', 'bL'] as const) {
				if (r() < 0.15 * strength) c[k] = !c[k]
			}
			return c
		})
	})
	return sanitize(g)
}

export function realize(raw: Genome, config?: LayoutConfig): Omit<Layout, 'seed'> {
	const genome = sanitize(raw)
	const height = 980
	const width = Math.round(height * (config?.ratio ?? 0.708))
	const padX = Math.round(width * 0.056)
	const padT = Math.round(height * 0.049)
	const padB = Math.round(height * 0.055)
	const inner = {
		x: padX,
		y: padT,
		w: width - padX * 2,
		h: height - padT - padB,
		x0: padX,
		y0: padT,
		x1: width - padX,
		y1: height - padB,
	}
	const rows = genome.rows
	const rowCuts: { y: number; s: number; g: number }[] = []
	const dividers: Divider[] = []
	let accY = inner.y
	for (let i = 0; i < rows.length - 1; i += 1) {
		accY += rows[i].h * inner.h
		rowCuts.push({ y: accY, s: rows[i].s, g: rows[i].g })
		dividers.push({ kind: 'row', index: i, row: i, x: width / 2, y: accY })
	}
	const panels: RealizedPanel[] = []
	for (let i = 0; i < rows.length; i += 1) {
		const row = rows[i]
		const yTop = i === 0 ? inner.y : rowCuts[i - 1].y
		const yBottom = i === rows.length - 1 ? inner.y + inner.h : rowCuts[i].y
		const yMid = (yTop + yBottom) / 2
		const cols = row.w.length
		const colCuts: { x: number; ym: number; s: number; g: number }[] = []
		let accX = inner.x + inner.w
		for (let j = 0; j < cols - 1; j += 1) {
			accX -= row.w[j] * inner.w
			colCuts.push({ x: accX, ym: yMid, s: row.vs[j].s, g: row.vs[j].g })
			dividers.push({ kind: 'col', index: j, row: i, x: accX, y: yMid })
		}
		for (let j = 0; j < cols; j += 1) {
			const p = row.p[j]
			const x0 = j === cols - 1 ? (p.bL ? 0 : inner.x) : inner.x
			const x1 = j === 0 ? (p.bR ? width : inner.x + inner.w) : inner.x + inner.w
			const y0 = i === 0 ? (p.bT ? 0 : inner.y) : inner.y
			const y1 = i === rows.length - 1 ? (p.bB ? height : inner.y + inner.h) : inner.y + inner.h
			let poly: Pt[] = [
				[x0, y0],
				[x1, y0],
				[x1, y1],
				[x0, y1],
			]
			if (i > 0) {
				const c = rowCuts[i - 1]
				poly = splitPoly(poly, -c.s, 1, c.y - c.s * (width / 2), c.g)[1]
			}
			if (i < rows.length - 1) {
				const c = rowCuts[i]
				poly = splitPoly(poly, -c.s, 1, c.y - c.s * (width / 2), c.g)[0]
			}
			if (j > 0) {
				const c = colCuts[j - 1]
				poly = splitPoly(poly, 1, -c.s, c.x - c.s * c.ym, c.g)[0]
			}
			if (j < cols - 1) {
				const c = colCuts[j]
				poly = splitPoly(poly, 1, -c.s, c.x - c.s * c.ym, c.g)[1]
			}
			if (poly.length < 3) continue
			if (p.nest) {
				const box = boundsOf(poly)
				const cy = box.minY + box.h * p.nest.t
				const cx = (box.minX + box.maxX) / 2
				const [top, bottom] = splitPoly(poly, -p.nest.s, 1, cy - p.nest.s * cx, p.nest.g)
				if (top.length >= 3 && bottom.length >= 3) {
					panels.push({ pts: top, row: i, col: j, sub: 0 })
					panels.push({ pts: bottom, row: i, col: j, sub: 1 })
					continue
				}
			}
			panels.push({ pts: poly, row: i, col: j, sub: 0 })
		}
	}
	return { width, height, inner, panels, dividers, genome }
}

export function dragRowDivider(genome: Genome, index: number, dx: number, dy: number, config?: LayoutConfig): Genome {
	const next = sanitize(genome)
	if (index < 0 || index >= next.rows.length - 1) return next
	const innerH = 878
	const h0 = next.rows[index].h * innerH
	const h1 = next.rows[index + 1].h * innerH
	const nh0 = clamp(h0 + dy, 72, h0 + h1 - 72)
	const nh1 = h0 + h1 - nh0
	next.rows[index].h = nh0 / innerH
	next.rows[index + 1].h = nh1 / innerH
	next.rows[index].s = clamp(next.rows[index].s + dx / 420, -0.25, 0.25)
	void config
	return sanitize(next)
}

export function dragColDivider(
	genome: Genome,
	rowIndex: number,
	index: number,
	dx: number,
	dy: number,
	config?: LayoutConfig,
): Genome {
	const next = sanitize(genome)
	const row = next.rows[rowIndex]
	if (!row || index < 0 || index >= row.w.length - 1) return next
	const innerW = Math.round(980 * (config?.ratio ?? 0.708) * 0.888)
	const right = row.w[index] * innerW
	const left = row.w[index + 1] * innerW
	const nextRight = clamp(right - dx, 48, right + left - 48)
	const nextLeft = right + left - nextRight
	row.w[index] = nextRight / innerW
	row.w[index + 1] = nextLeft / innerW
	if (row.vs[index]) {
		row.vs[index].s = clamp(row.vs[index].s + dy / 360, -0.25, 0.25)
	}
	return sanitize(next)
}

export function locatePanelGene(genome: Genome, flatPanelIndex: number): { rowIdx: number; colIdx: number; gene: PanelGene } | null {
	let cursor = 0
	for (let r = 0; r < genome.rows.length; r += 1) {
		const row = genome.rows[r]
		for (let c = 0; c < row.p.length; c += 1) {
			const gene = row.p[c]
			const span = gene.nest ? 2 : 1
			if (flatPanelIndex >= cursor && flatPanelIndex < cursor + span) {
				return { rowIdx: r, colIdx: c, gene }
			}
			cursor += span
		}
	}
	return null
}

export function togglePanelBleed(
	raw: Genome,
	flatPanelIndex: number,
	edge: 'bT' | 'bB' | 'bL' | 'bR',
): Genome {
	const g = sanitize(raw)
	const hit = locatePanelGene(g, flatPanelIndex)
	if (!hit) return g
	hit.gene[edge] = !hit.gene[edge]
	return sanitize(g)
}

export function togglePanelNest(raw: Genome, flatPanelIndex: number): Genome {
	const g = sanitize(raw)
	const hit = locatePanelGene(g, flatPanelIndex)
	if (!hit) return g
	hit.gene.nest = hit.gene.nest ? null : { t: 0.5, s: 0, g: 10 }
	return sanitize(g)
}

export type AspectId = '16:9' | '4:3' | '1:1' | '3:4' | '9:16'

const ASPECTS: { id: AspectId; value: number }[] = [
	{ id: '16:9', value: 16 / 9 },
	{ id: '4:3', value: 4 / 3 },
	{ id: '1:1', value: 1 },
	{ id: '3:4', value: 3 / 4 },
	{ id: '9:16', value: 9 / 16 },
]

export function closestAspect(width: number, height: number): AspectId {
	const ratio = width / Math.max(1, height)
	let best = ASPECTS[0]
	let bestDelta = Number.POSITIVE_INFINITY
	for (const candidate of ASPECTS) {
		const delta = Math.abs(Math.log(ratio / candidate.value))
		if (delta < bestDelta) {
			best = candidate
			bestDelta = delta
		}
	}
	return best.id
}

export function aspectValue(aspect: string): number {
	return ASPECTS.find((item) => item.id === aspect)?.value ?? 1
}

export function pagePixelSize(): { w: number; h: number } {
	return { w: 460, h: 650 }
}
