import { describe, expect, it } from 'vitest'
import { spawnBook } from './pipeline'
import { defaultBook } from '../demo/book'
import { universalPresetToBook } from '../jev/fiveStageEngine'
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
})
