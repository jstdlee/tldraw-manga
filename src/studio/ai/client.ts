import { loadSettings } from './settings'

export async function askText(system: string, user: string, fallback: () => string): Promise<string> {
	const settings = loadSettings()
	if (!settings.useApi) return fallback()
	const fullSystem = settings.systemAppendix ? `${system}\nAdditional directive: ${settings.systemAppendix}` : system
	try {
		const response = await fetch('/api/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...settings, system: fullSystem, user }),
		})
		if (!response.ok) return fallback()
		const data = (await response.json()) as { text?: string }
		return data.text?.trim() || fallback()
	} catch {
		return fallback()
	}
}

export async function askVision(input: {
	imageDataUrl?: string
	title: string
	tag?: string
	body?: string
	customPrompt?: string
}): Promise<{ analysis: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Vision (${settings.visionModel})` : `Built-in Vision engine (${settings.visionModel})`
	const prompt = [
		'You are a manga visual director and character-design reverse-engineering expert. Analyze this reference/character sheet image in concise, professional language and output:',
		'1) Character/scene appearance anchors (hair color, costume, props, silhouette traits)',
		'2) Shot scale and composition tension (viewpoint, focal length, negative space)',
		'3) Screentone and ink-line notes plus image-generation prompt advice',
		input.customPrompt ? `User focus directive: ${input.customPrompt}` : '',
		`Card title: ${input.title} ${input.tag ?? ''}; existing description: ${input.body ?? ''}`,
	]
		.filter(Boolean)
		.join('\n')

	const offlineVisionFallback = () => {
		const focus = input.customPrompt ? ` (per directive "${input.customPrompt}")` : ''
		if (input.tag?.includes('kanta') || input.title.includes('Kanta')) {
			return `[Vision Reverse-Read${focus}]\n• Appearance anchors: @kanta messy black hair, deep-blue hoodie, goggles at the collar, a bandage on his right cheek, holding a red-and-white striped fry box.\n• Composition & light: low-angle MCU at 35mm, hard noon light on the breakwater, 22% negative space reserved top-right for the speech balloon.\n• Ink & tone: bold G-pen outlines, 40% gray screentone in the shadows, spot vermilion reserved for the fry box and the goggle glints.`
		}
		if (input.tag?.includes('mei') || input.title.includes('Mei')) {
			return `[Vision Reverse-Read${focus}]\n• Appearance anchors: @mei neat short hair with a hairpin, pale trench coat lifted by the sea wind, a film camera slung across her body, a calm restrained gaze.\n• Composition & light: eye-level MS at 50mm, sea backlight rimming the coat and hair with highlight edges, safe balloon zone reserved top-left.\n• Ink & tone: fine maru-pen hair strokes, 25% gradated screentone on the coat, reinforcing the deadpan still-frame contrast.`
		}
		if (input.tag?.includes('boss') || input.title.includes('Boss')) {
			return `[Vision Reverse-Read${focus}]\n• Appearance anchors: @boss a huge silver-backed gull, an old cross scar over its left eye, a metal band on its left foot, wings spread across the full top bleed.\n• Composition & light: extreme 18mm wide low angle, hard radiating speed lines converging on the hooked beak, maximum pressure.\n• Ink & tone: Araki-style hard hatching shadows + negative space reserved for the burst onomatopoeia "BOOM—!!".`
		}
		return `[Vision Reverse-Read · ${input.title}${focus}]\n• Visual subject: ${input.body ? input.body.slice(0, 64) : 'a high-contrast black-and-white manga reference frame with clearly separated primary and secondary silhouettes'}.\n• Camera language: 35mm narrative medium shot, foreground leading lines converging on the visual center, negative space reserved upper-right for the speech balloon.\n• Style lock: black-and-white ink lines + two-layer gray screentone + spot vermilion accents; absolutely no garbled AI lettering in frame.`
	}

	if (!settings.useApi) {
		return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
	}
	try {
		const response = await fetch('/api/vision', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				provider: settings.visionProvider || settings.provider,
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl,
				visionModel: settings.visionModel,
				imageDataUrl: input.imageDataUrl || '',
				prompt,
			}),
		})
		if (!response.ok) return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
		const data = (await response.json()) as { text?: string }
		return {
			analysis: data.text?.trim() || offlineVisionFallback(),
			modelUsed: modelLabel,
		}
	} catch {
		return { analysis: offlineVisionFallback(), modelUsed: modelLabel }
	}
}

export async function polishCardText(input: {
	kind: string
	title: string
	body: string
	tag?: string
	customPrompt?: string
}): Promise<{ text: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `Built-in text model (${settings.model})`
	const system = 'You are a seasoned manga scriptwriter and storyboard design consultant. Polish the user\'s card copy for stronger imagery, camera tension, and character recognizability. Output the polished body text directly, with no pleasantries.'
	const user = [
		`Card type: ${input.kind}, title: ${input.title} ${input.tag ?? ''}`,
		`Original content: ${input.body}`,
		input.customPrompt ? `User rewrite directive: ${input.customPrompt}` : 'Strengthen visual detail, action and expression, screentone lighting, and manga panel storytelling.',
	].join('\n')

	const fallback = () => {
		const customNote = input.customPrompt ? ` | sharpened per directive "${input.customPrompt}"` : ''
		if (input.kind === 'character') {
			return `${input.body.replace(/\n*\[AI Polish.*$/s, '')}\n[AI Polish${customNote}] Three-view anchors locked: costume folds sway with the wind direction, close-up panels stress eye highlights and micro-expressions at the mouth, and cross-panel entrances keep accessories and hair 100% consistent.`
		}
		if (input.kind === 'world' || input.kind === 'environment') {
			return `${input.body.replace(/\n*\[AI Scene Deepening.*$/s, '')}\n[AI Scene Deepening${customNote}] Distant views gain aerial perspective and layered sea-mist screentone; near views foreground the ground-shadow cut lines; reserve 20% negative space upper-right for the speech balloon.`
		}
		if (input.kind === 'image') {
			return `${input.body.replace(/\n*\[AI Image Prompt Polish.*$/s, '')}\n[AI Image Prompt Polish${customNote}] Japanese black-and-white manga manuscript, sharp G-pen ink lines, 60L gray screentone gradation, spot vermilion accents, dramatic backlit silhouettes, 12% bleed margins, no text and no bubbles.`
		}
		return `${input.body.replace(/\n*\[AI Script Refinement.*$/s, '')}\n[AI Script Refinement${customNote}] Pacing goes still-to-motion: open with a relaxed 35mm eye-level everyday beat, cut into the flashpoint with an extreme 18mm low angle, and slot one wordless still frame right before the climax panel to max out the tension.`
	}

	const text = await askText(system, user, fallback)
	return { text, modelUsed: modelLabel }
}

export async function regenerateCardText(input: {
	kind: string
	title: string
	body: string
	tag?: string
	customPrompt?: string
	variantSeed?: number
}): Promise<{ text: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `Built-in text model (${settings.model})`
	const variants = [
		'Version A (hot-blooded tension): push wide-angle perspective, radiating speed lines, and high-impact action freeze-frames; keep dialogue short and punchy.',
		'Version B (cold suspense): use high-contrast black shadows and Dutch-angle framing; build pressure through eye close-ups and still environment beats.',
		'Version C (deadpan theater): set up an epic mood with serious framing, then snap the next panel back to an absurd everyday reaction for maximum contrast.',
	]
	const chosen = variants[(input.variantSeed ?? Math.floor(Date.now() / 1000)) % variants.length]
	const system = 'You are the lead manga storyboard artist. Regenerate a creative new version of this card\'s setting or storyboard description and output the body text directly.'
	const user = `Title: ${input.title}\nOriginal: ${input.body}\nRegeneration direction: ${input.customPrompt || chosen}`

	const fallback = () => {
		const direction = input.customPrompt ? `custom direction "${input.customPrompt}"` : chosen.split(':')[0]
		if (input.kind === 'character') {
			return `${input.title} (${direction} regeneration): bold silhouette with signature features legible in a distant view; action beats use exaggerated foreshortening, while still panels keep the fine lashes and hair highlights.`
		}
		if (input.kind === 'image') {
			return `[AI Regenerated Visual Reference · ${direction}] Refined black-and-white manga design sheet, clean decisive ink lines, key light cast from 45° upper left, pristine negative-space background, foregrounding the dramatic clash between character and core prop.`
		}
		return `[AI Regenerated · ${direction}]\n${input.body.split('\n')[0]}\nNew storyboard direction: beat one establishes the atmosphere in a wide shot, beat two locks the gaze duel in close-up, beat three detonates the core conflict in a slanted full panel, and the tail panel leaves a suspense hook.`
	}

	const text = await askText(system, user, fallback)
	return { text, modelUsed: modelLabel }
}

export async function cardToPanelPrompt(input: {
	title: string
	body: string
	tag?: string
	customPrompt?: string
}): Promise<{ prompt: string; modelUsed: string }> {
	const settings = loadSettings()
	const modelLabel = settings.useApi ? `Text LLM (${settings.model})` : `Built-in storyboard compiler (${settings.model})`
	const system = 'Convert the card content into a structured manga image-generation and storyboard prompt (including: shot scale and camera placement, focal length, character appearance locks, lighting and screentone, safe negative space, and negative constraints).'
	const user = `Title: ${input.title}\nContent: ${input.body}\nExtra requirements: ${input.customPrompt || 'standard right-to-left manga page flow'}`
	const fallback = () =>
		[
			`[Storyboard Image Prompt · ${input.title}]`,
			`• Camera: medium close-up (MCU) · 18mm wide low angle · gaze lead toward lower left`,
			`• Character & frame: ${input.tag ? `${input.tag} appearance locked, ` : ''}${input.body.slice(0, 72)}`,
			input.customPrompt ? `• Custom style directive: ${input.customPrompt}` : `• Ink style: black G-pen bold lines + 45% gray screentone + spot vermilion highlights`,
			`• Composition margin: 12% trim bleed included; reserve 20% clean negative space upper-right for the speech balloon; no text or garbled glyphs`,
		].join('\n')
	const prompt = await askText(system, user, fallback)
	return { prompt, modelUsed: modelLabel }
}

export async function askImage(
	prompt: string,
	aspect: string,
	referenceImagePaths?: string[],
): Promise<string> {
	const settings = loadSettings()
	if (!settings.useApi) return ''
	try {
		const response = await fetch('/api/image', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...settings,
				provider: settings.imageProvider || settings.provider,
				imageModel: settings.imageModel,
				prompt,
				aspect,
				referenceImagePaths: Array.isArray(referenceImagePaths) ? referenceImagePaths.filter(Boolean) : [],
			}),
		})
		if (!response.ok) return ''
		const data = (await response.json()) as { dataUrl?: string }
		return data.dataUrl || ''
	} catch {
		return ''
	}
}
