import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { bookFromText } from '../demo/book'
import { buildOpenRaster } from './ora'
import { readerHtml } from './htmlReader'
import { configFor, generate } from '../layout/engine'
import { renderPageSvg } from '../render/pageSvg'
import type { CompiledBook } from '../spec/compile'

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))

describe('exports', () => {
	it('packs an OpenRaster archive with a stored mimetype', () => {
		const archive = buildOpenRaster({
			width: 10,
			height: 12,
			layers: [
				{ name: 'Bubbles', png },
				{ name: 'Art', png },
			],
			merged: png,
			thumbnail: png,
		})
		const files = unzipSync(archive)
		expect(strFromU8(files.mimetype)).toBe('image/openraster')
		expect(strFromU8(files['stack.xml'])).toContain('Bubbles')
		expect(strFromU8(files['stack.xml'])).toContain('Art')
		expect(files['data/000.png']).toBeTruthy()
	})

	it('writes a standalone reader with three modes and the bible', () => {
		const book = bookFromText('seagull steals the fries')
		const page = book.chapters[0].pages[0]
		const layout = generate(page.seed, configFor(page.layoutPreset, page.targetPanels))
		const svg = renderPageSvg({
			uid: 'p',
			title: 'P1',
			width: layout.width,
			height: layout.height,
			inner: layout.inner,
			panels: layout.panels.slice(0, 1).map((panel) => ({
				pts: panel.pts,
				meta: {
					imageSeed: 's',
					imageOffsetX: 0,
					imageOffsetY: 0,
					imageScale: 1,
					imageRotation: 0,
					aspect: '3:4',
					shot: 'WS',
					angle: 'eye',
					focal: '35mm',
					beat: 'Wind',
					who: ['kanta'],
					fries: 'kanta',
					eyeline: [8, -4],
					imageDataUrl: '',
					environment: '',
				},
				environment: 'boardwalk',
				lighting: 'hard-noon',
				energy: 'calm',
			})),
			bubbles: [],
			numbers: 'in-director',
			director: true,
		})
		const compiled = {
			spec: {
				version: 'comics-spec/1' as const,
				title: book.title,
				compiledAt: '',
				bible: {
					story: book.story,
					worldRules: book.world,
					stylePreset: book.stylePreset,
					characters: book.characters.map((character) => ({ ...character, reference: '3-view' })),
				},
				style: { preset: book.stylePreset, ink: 'Ink', tone: 'Screentone' },
				chapters: [
					{
						id: 'c',
						title: book.chapters[0].title,
						index: 1,
						overrides: { mood: 'Salt Wind', environment: 'boardwalk', lighting: 'hard-noon' },
						context: [],
						pages: [
							{
								id: 'p',
								index: 1,
								scenario: page.scenario,
								layoutPreset: page.layoutPreset,
								dialogueDensity: page.dialogueDensity,
								targetPanels: page.targetPanels,
								score: 0.8,
								seed: page.seed,
								layout: { width: layout.width, height: layout.height, inner: layout.inner, panels: [] },
								storyBoxes: [],
							},
						],
					},
				],
			},
			pages: [{ id: 'p', chapterTitle: book.chapters[0].title, specTitle: 'P1', svg, model: {} as CompiledBook['pages'][number]['model'], width: layout.width, height: layout.height, panels: [] }],
			sheets: [],
		} satisfies CompiledBook
		const html = readerHtml(compiled)
		expect(html).toContain('Right-to-Left Spread')
		expect(html).toContain('Webtoon Scroll')
		expect(html).toContain('Guided Panel Zoom')
		expect(html).toContain('Character & World Bible')
		expect(html).toContain('@kanta')
		expect(html).toContain('<svg')
	})
})
