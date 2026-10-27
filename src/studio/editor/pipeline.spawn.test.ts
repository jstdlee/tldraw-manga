import { describe, expect, it } from 'vitest'
import { buildCanvasAssetRegistryForPage, readPageContext, spawnBook, spawnStage1AssetSheetCardsOnCanvas } from './pipeline'
import { defaultBook } from '../demo/book'
import { compileStage4PureArtSpec, universalPresetToBook } from '../jev/fiveStageEngine'
import { CARD, CONTAINER } from '../shapes/schema'
import type { PagePipelineContext } from '../model'

interface MockShape {
	id: string
	type: string
	x: number
	y: number
	parentId?: string
	props: Record<string, unknown>
}

/**
 * Minimal in-memory tldraw Editor supporting exactly the method surface that the
 * canvas-seeding path (spawnBook -> createPageShape -> spawnPageBubbles ->
 * extendNextPageFromPage -> wire) touches. Any missing method surfaces as a real
 * test failure rather than being masked.
 */
function makeEditor() {
	const shapes = new Map<string, MockShape>()
	let selection: string[] = []
	const editor = {
		createShape(shape: Partial<MockShape> & { id: string; type: string }) {
			shapes.set(shape.id, { x: 0, y: 0, props: {}, ...shape } as MockShape)
		},
		updateShape(shape: Partial<MockShape> & { id: string }) {
			const cur = shapes.get(shape.id)
			if (cur) shapes.set(shape.id, { ...cur, ...shape, props: { ...cur.props, ...(shape.props ?? {}) } })
		},
		getShape(id: string) {
			return shapes.get(id)
		},
		getCurrentPageShapeIds() {
			return new Set(shapes.keys())
		},
		getCurrentPageShapes() {
			return [...shapes.values()]
		},
		getSortedChildIdsForParent(parentId: string) {
			return [...shapes.values()].filter((s) => s.parentId === parentId).map((s) => s.id)
		},
		getSelectedShapes() {
			return selection.map((id) => shapes.get(id)).filter(Boolean)
		},
		deleteShapes(ids: string[]) {
			ids.forEach((id) => shapes.delete(id))
		},
		createBindings() {
			/* bindings are not asserted on */
		},
		select(...ids: string[]) {
			selection = ids
		},
		zoomToFit() {
			/* no-op in headless */
		},
		zoomToBounds() {
			/* no-op in headless */
		},
	}
	// Cast through unknown: the mock is a structural subset of the real Editor.
	return { editor: editor as unknown as Parameters<typeof spawnBook>[0], shapes }
}

function pagesOf(shapes: Map<string, MockShape>) {
	return [...shapes.values()]
		.filter((s) => s.type === CONTAINER && s.props.role === 'page')
		.sort((a, b) => Number(a.props.pageIndex || 0) - Number(b.props.pageIndex || 0))
}

describe('spawnBook clean 2-page pipeline', () => {
	it('seeds exactly two pages and zero Bible / Chapter / Card clutter (noir preset)', () => {
		const { editor, shapes } = makeEditor()
		const book = universalPresetToBook('noir-watchmaker')!
		spawnBook(editor, book)

		const all = [...shapes.values()]
		// No Story Bible, no Chapter containers, no scattered reference cards.
		expect(all.some((s) => s.type === CONTAINER && s.props.role === 'bible')).toBe(false)
		expect(all.some((s) => s.type === CONTAINER && s.props.role === 'chapter')).toBe(false)
		expect(all.some((s) => s.type === CARD)).toBe(false)

		const pages = pagesOf(shapes)
		expect(pages).toHaveLength(2)

		const [p1, p2] = pages
		// Page 1 at the clean top-left origin.
		expect(p1.x).toBe(80)
		expect(p1.y).toBe(80)
		// Page 2 extended horizontally to the right of Page 1, same row.
		expect(p2.x).toBeGreaterThan(p1.x)
		expect(p2.y).toBe(p1.y)

		// A pipeline continuity link (arrow) connects the pages.
		expect(all.some((s) => s.type === 'arrow')).toBe(true)
	})

	it('stores reference assets in page context and inherits them P1 -> P2', () => {
		const { editor, shapes } = makeEditor()
		spawnBook(editor, universalPresetToBook('noir-watchmaker')!)
		const [p1, p2] = pagesOf(shapes)

		const ctx1 = JSON.parse(p1.props.contextJson as string) as PagePipelineContext
		const ctx2 = JSON.parse(p2.props.contextJson as string) as PagePipelineContext

		// Locked assets live in the context (not as canvas cards) and are non-empty.
		expect(ctx1.lockedAssetTags.length).toBeGreaterThan(0)
		// Page 2 inherits from Page 1 and carries the same locked asset set forward.
		expect(ctx2.inheritedFromPageIndex).toBe(1)
		expect(ctx2.parentPageId).toBe(p1.id)
		for (const tag of ctx1.lockedAssetTags) {
			expect(ctx2.lockedAssetTags).toContain(tag)
		}
	})

	it('also produces a clean 2-page pipeline for the default (non-noir) book', () => {
		const { editor, shapes } = makeEditor()
		spawnBook(editor, defaultBook())

		const all = [...shapes.values()]
		expect(all.some((s) => s.type === CARD)).toBe(false)
		expect(all.some((s) => s.type === CONTAINER && s.props.role !== 'page')).toBe(false)

		const pages = pagesOf(shapes)
		expect(pages).toHaveLength(2)
		expect(pages[0].x).toBe(80)
		expect(pages[0].y).toBe(80)

		// Cast-derived character tags are locked into Page 1 context.
		const ctx1 = JSON.parse(pages[0].props.contextJson as string) as PagePipelineContext
		expect(ctx1.lockedAssetTags.length).toBeGreaterThan(0)
	})

	it('spawns a complete 3-page Shan-Shui pipeline (P1 -> P2 -> P3) with context inheritance for wutai-lundao', () => {
		const { editor, shapes } = makeEditor()
		const book = universalPresetToBook('wutai-lundao')!
		spawnBook(editor, book)

		const pages = pagesOf(shapes)
		expect(pages).toHaveLength(3)
		const [p1, p2, p3] = pages
		expect(p1.props.pageIndex).toBe(1)
		expect(p2.props.pageIndex).toBe(2)
		expect(p3.props.pageIndex).toBe(3)
		expect(p2.x).toBeGreaterThan(p1.x)
		expect(p3.x).toBeGreaterThan(p2.x)

		const ctx1 = JSON.parse(p1.props.contextJson as string) as PagePipelineContext
		const ctx2 = JSON.parse(p2.props.contextJson as string) as PagePipelineContext
		const ctx3 = JSON.parse(p3.props.contextJson as string) as PagePipelineContext
		expect(ctx1.lockedAssetTags).toContain('@ding_yuanying')
		expect(ctx1.lockedAssetTags).toContain('@master_zhixuan')
		expect(ctx2.inheritedFromPageIndex).toBe(1)
		expect(ctx3.inheritedFromPageIndex).toBe(2)
		expect(ctx3.lockedAssetTags).toContain('@ding_yuanying')
	})
	it('dynamically binds custom user MangaCard reference sheets and fixed scene #env into Stage 4 Multi-Image I2I for ANY story', async () => {
		const { editor, shapes } = makeEditor()
		spawnBook(editor, defaultBook())
		const [p1] = pagesOf(shapes)

		// Place a custom user character sheet card and a custom prop sheet card on the canvas
		editor.createShape({
			id: 'shape:custom-hero-card' as never,
			type: CARD,
			x: -300,
			y: 80,
			props: {
				kind: 'character',
				title: 'Astronaut Lin',
				tag: '@astro_lin',
				body: 'silver orbital pressure suit, cracked gold visor, tether hook',
				locked: true,
				imageDataUrl: '/assets/custom/sheet_astro_lin.png',
			},
		})
		editor.createShape({
			id: 'shape:custom-env-card' as never,
			type: CARD,
			x: -300,
			y: 380,
			props: {
				kind: 'image',
				title: 'Orbital Airlock Bay 09',
				tag: '#env_airlock_bay09',
				body: 'cylindrical zero-g airlock with octagonal viewport and amber warning strobes',
				locked: true,
				imageDataUrl: '/assets/custom/sheet_env_airlock_bay09.png',
			},
		})

		const ctx = readPageContext(editor, p1 as never)
		expect(ctx.lockedAssetTags).toContain('@astro_lin')
		expect(ctx.lockedAssetTags).toContain('#env_airlock_bay09')

		const registry = buildCanvasAssetRegistryForPage(editor, p1 as never, ctx)
		expect(registry.assets['@astro_lin']?.filePath).toBe('/assets/custom/sheet_astro_lin.png')
		expect(registry.assets['#env_airlock_bay09']?.filePath).toBe('/assets/custom/sheet_env_airlock_bay09.png')

		const spec = compileStage4PureArtSpec({
			panelIndex: 0,
			beat: {
				shot: 'MS',
				angle: 'eye',
				focal: '35mm',
				beat: 'Astronaut Lin checks the pressure seal inside the airlock.',
				who: ['@astro_lin'],
				assetRefs: ['@astro_lin'],
				lines: [],
			},
			meta: {
				shot: 'MS',
				angle: 'eye',
				focal: '35mm',
				aspect: '4:3',
				beat: 'Astronaut Lin checks the pressure seal inside the airlock.',
				who: ['@astro_lin'],
				assetRefs: ['@astro_lin', '#env_airlock_bay09'],
				imageSeed: 'test-seed',
				silent: false,
				environment: 'airlock_bay09',
				imageOffsetX: 0,
				imageOffsetY: 0,
				imageScale: 1,
				imageRotation: 0,
				 focalMm: 35,
				fStop: 2.8,
				sensor: 'ff35',
			} as never,
			panelPts: [[0, 0], [320, 0], [320, 220], [0, 220]],
			registry,
			environment: 'airlock_bay09',
			lighting: 'rim',
		})
		expect(spec.referenceImagePaths).toContain('/assets/custom/sheet_astro_lin.png')
		expect(spec.referenceImagePaths).toContain('/assets/custom/sheet_env_airlock_bay09.png')
		expect(spec.pureCameraPrompt).toContain('Reference Image #1 = @astro_lin')
		expect(spec.pureCameraPrompt).toContain('Reference Image #2 = #env_airlock_bay09')

		const msg = await spawnStage1AssetSheetCardsOnCanvas(editor, p1 as never, false)
		expect(msg).toContain('Stage 1 Reference Asset Sheet cards')
	})
})
