import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { isContainer, isPrompt } from './guards'

export function wireShapes(editor: Editor, fromId: TLShapeId, toId: TLShapeId) {
	const from = editor.getShape(fromId)
	const to = editor.getShape(toId)
	if (!from || !to || fromId === toId) return
	if (!isContainer(from) && !isPrompt(from)) return
	if (!isContainer(to) && !isPrompt(to)) return
	const fromBounds = editor.getShapePageBounds(fromId)
	const toBounds = editor.getShapePageBounds(toId)
	if (!fromBounds || !toBounds) return
	const x1 = fromBounds.maxX
	const y1 = (fromBounds.minY + fromBounds.maxY) / 2
	const x2 = toBounds.minX
	const y2 = (toBounds.minY + toBounds.maxY) / 2
	const id = createShapeId()
	editor.createShape({
		id,
		type: 'arrow',
		parentId: editor.getCurrentPageId(),
		x: x1,
		y: y1,
		props: {
			color: 'blue',
			size: 's',
			arrowheadStart: 'dot',
			arrowheadEnd: 'arrow',
			start: { x: 0, y: 0 },
			end: { x: x2 - x1, y: y2 - y1 },
			bend: 0,
		},
	})
	editor.createBindings([
		{
			type: 'arrow',
			fromId: id,
			toId: fromId,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 1, y: 0.5 },
				isExact: false,
				isPrecise: true,
				snap: 'edge',
			},
		},
		{
			type: 'arrow',
			fromId: id,
			toId: toId,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0, y: 0.5 },
				isExact: false,
				isPrecise: true,
				snap: 'edge',
			},
		},
	])
}
