import { aspectValue, mulberry32, strHash } from '../layout/engine'

export interface IllustrationInput {
	idPrefix: string
	environment: string
	lighting: string
	shot: string
	angle: string
	focal: string
	aspect: string
	who: string[]
	fries: string
	energy: string
	seed: string
}

export interface ActorSlot {
	x: number
	y: number
	scale: number
}

const SKIN = '#f3d2b5'
const INK = '#1a242c'
const HAIR = '#1c1c1c'
const JACKET = '#d6453d'
const PAPER = '#f7f4ee'

function slotsFor(environment: string): Record<string, ActorSlot> {
	if (environment === 'sunset-roof') {
		return {
			kanta: { x: 420, y: 790, scale: 1.12 },
			mei: { x: 600, y: 770, scale: 1.05 },
			boss: { x: 780, y: 300, scale: 0.72 },
		}
	}
	if (environment === 'storm-pier') {
		return {
			kanta: { x: 350, y: 810, scale: 1.16 },
			mei: { x: 530, y: 795, scale: 1.02 },
			boss: { x: 690, y: 360, scale: 1.5 },
		}
	}
	if (environment === 'neon-rain' || environment === 'noir') {
		return {
			kanta: { x: 390, y: 820, scale: 1.18 },
			mei: { x: 640, y: 800, scale: 1.04 },
			boss: { x: 520, y: 340, scale: 1.1 },
		}
	}
	if (environment === 'classroom' || environment === 'konbini') {
		return {
			kanta: { x: 360, y: 800, scale: 1.12 },
			mei: { x: 620, y: 785, scale: 1.04 },
			boss: { x: 820, y: 260, scale: 0.55 },
		}
	}
	return {
		kanta: { x: 370, y: 830, scale: 1.18 },
		mei: { x: 700, y: 805, scale: 1.04 },
		boss: { x: 545, y: 390, scale: 1.32 },
	}
}

function backdrop(environment: string, prefix: string, seed: string): string {
	const random = mulberry32(strHash(`${seed}:${environment}`))
	const sky = `${prefix}-sky`
	if (environment === 'neon-rain') {
		const drops = Array.from({ length: 46 }, () => {
			const x = random() * 1000
			const y = random() * 1000
			return `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - 18).toFixed(0)}" y2="${(y + 46).toFixed(0)}" stroke="#b7f6ff" stroke-width="1.4" opacity=".55"/>`
		}).join('')
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141824"/><stop offset="1" stop-color="#07080d"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<rect x="40" y="180" width="70" height="220" fill="#ff2d95" opacity=".85"/>
			<rect x="780" y="120" width="46" height="280" fill="#22e0ff" opacity=".8"/>
			<rect x="180" y="80" width="120" height="18" fill="#22e0ff"/>
			<rect x="620" y="240" width="90" height="14" fill="#ff2d95"/>
			<path d="M0 620 H1000 L1000 1100 H0 Z" fill="#121722"/>
			<path d="M0 700 H1000" stroke="#22e0ff" stroke-width="3" opacity=".35"/>
			${drops}
			<rect x="40" y="640" width="70" height="40" fill="#ff2d95" opacity=".25"/>
			<rect x="780" y="640" width="46" height="50" fill="#22e0ff" opacity=".2"/>
		`
	}
	if (environment === 'noir') {
		return `
			<rect x="-400" y="-400" width="1800" height="1800" fill="#0e1116"/>
			<polygon points="180,0 260,0 80,1000 -40,1000" fill="#f4f1ea" opacity=".85"/>
			<polygon points="640,0 700,0 860,1000 760,1000" fill="#f4f1ea" opacity=".35"/>
			<rect x="300" y="160" width="180" height="260" fill="none" stroke="#f4f1ea" stroke-width="8"/>
			<path d="M0 780 H1000" stroke="#f4f1ea" stroke-width="6"/>
			<rect x="0" y="780" width="1000" height="320" fill="#08090c"/>
		`
	}
	if (environment === 'sunset-roof') {
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb15a"/><stop offset=".55" stop-color="#e25b3a"/><stop offset="1" stop-color="#6a3148"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<circle cx="760" cy="210" r="70" fill="#ffd7a1"/>
			<path d="M0 640 H1000 L1000 1100 H0 Z" fill="#2c3544"/>
			<rect x="120" y="470" width="90" height="170" fill="#1b2330"/>
			<rect x="800" y="500" width="70" height="140" fill="#1b2330"/>
			<ellipse cx="180" cy="470" rx="54" ry="16" fill="none" stroke="#1b2330" stroke-width="8"/>
			<rect x="168" y="430" width="8" height="50" fill="#1b2330"/>
			<path d="M0 700 H1000" stroke="#f2c14e" stroke-width="4" opacity=".4"/>
		`
	}
	if (environment === 'storm-pier') {
		const drops = Array.from({ length: 36 }, () => {
			const x = random() * 1100
			const y = random() * 900
			return `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - 30).toFixed(0)}" y2="${(y + 70).toFixed(0)}" stroke="#d5e7f5" stroke-width="1.6" opacity=".45"/>`
		}).join('')
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2430"/><stop offset="1" stop-color="#46586a"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<polygon points="120,40 210,40 40,980" fill="#e9f4ff" opacity=".85"/>
			<path d="M0 560 Q250 500 500 560 T1000 540 V1100 H0 Z" fill="#0e2a3a"/>
			<path d="M0 620 Q250 580 500 630 T1000 600" fill="none" stroke="#9fd0e6" stroke-width="6" opacity=".45"/>
			<rect x="80" y="700" width="18" height="180" fill="#1a242c"/>
			<rect x="220" y="720" width="18" height="180" fill="#1a242c"/>
			<rect x="80" y="690" width="520" height="16" fill="#2a3844"/>
			${drops}
		`
	}
	if (environment === 'dawn-beach') {
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d7c4"/><stop offset=".5" stop-color="#f2b48a"/><stop offset="1" stop-color="#87c4dd"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<circle cx="180" cy="260" r="48" fill="#fff1d6"/>
			<path d="M0 560 Q300 500 560 560 T1000 540 V760 H0 Z" fill="#3d86a8"/>
			<path d="M0 760 H1000 V1100 H0 Z" fill="#efd7ae"/>
			<path d="M40 800 H220 M300 860 H520" stroke="#e7c98a" stroke-width="3"/>
		`
	}
	if (environment === 'konbini') {
		return `
			<rect x="-400" y="-400" width="1800" height="1800" fill="#e7f6ef"/>
			<rect x="0" y="0" width="220" height="1000" fill="#d7efe4"/>
			<rect x="70" y="120" width="90" height="18" fill="#1e78c8"/>
			<rect x="70" y="160" width="90" height="18" fill="#d6453d"/>
			<rect x="70" y="200" width="90" height="18" fill="#e2a122"/>
			<rect x="760" y="80" width="160" height="520" fill="#f7f4ee" stroke="${INK}" stroke-width="4"/>
			<rect x="780" y="120" width="120" height="16" fill="#1e78c8"/>
			<rect x="780" y="160" width="120" height="16" fill="#d6453d"/>
			<rect x="780" y="200" width="120" height="16" fill="#e2a122"/>
			<path d="M0 820 H1000" stroke="#b7d4c6" stroke-width="8"/>
			<rect x="0" y="820" width="1000" height="280" fill="#f4fbf7"/>
		`
	}
	if (environment === 'platform') {
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b089"/><stop offset="1" stop-color="#5c6b86"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<rect x="-20" y="430" width="1040" height="120" fill="#c4553a"/>
			<rect x="40" y="455" width="70" height="40" fill="#1a242c"/>
			<rect x="180" y="455" width="70" height="40" fill="#1a242c"/>
			<rect x="320" y="455" width="70" height="40" fill="#1a242c"/>
			<path d="M0 760 H1000" stroke="#e2b84a" stroke-width="8"/>
			<rect x="0" y="780" width="1000" height="320" fill="#3a4654"/>
			<rect x="0" y="860" width="1000" height="10" fill="#1a242c"/>
		`
	}
	if (environment === 'shrine') {
		return `
			<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7eee9"/><stop offset="1" stop-color="#b7c4bc"/></linearGradient>
			<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
			<rect x="250" y="250" width="28" height="430" fill="#8d1d1d"/>
			<rect x="720" y="250" width="28" height="430" fill="#8d1d1d"/>
			<rect x="200" y="230" width="600" height="26" fill="#8d1d1d"/>
			<rect x="230" y="200" width="540" height="16" fill="#1a242c"/>
			<path d="M180 760 H820" stroke="#6d6458" stroke-width="18"/>
			<circle cx="160" cy="180" r="70" fill="#fff" opacity=".35"/>
			<circle cx="300" cy="140" r="90" fill="#fff" opacity=".28"/>
		`
	}
	if (environment === 'classroom') {
		return `
			<rect x="-400" y="-400" width="1800" height="1800" fill="#f3efe4"/>
			<rect x="620" y="80" width="280" height="360" fill="#cfe4f2" stroke="${INK}" stroke-width="6"/>
			<path d="M760 80 V440" stroke="#fff" stroke-width="8" opacity=".7"/>
			<rect x="80" y="620" width="220" height="18" fill="#8a5a3a"/>
			<rect x="120" y="638" width="16" height="90" fill="#8a5a3a"/>
			<rect x="250" y="638" width="16" height="90" fill="#8a5a3a"/>
			<rect x="360" y="680" width="220" height="16" fill="#8a5a3a"/>
			<path d="M0 860 H1000" stroke="#e4d7c4" stroke-width="10"/>
		`
	}
	const planks = Array.from({ length: 8 }, (_, index) => `<path d="M0 ${760 + index * 22} H1000" stroke="#e7c98a" stroke-width="2" opacity=".55"/>`).join('')
	return `
		<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd4ef"/><stop offset=".45" stop-color="#f6d7b8"/><stop offset="1" stop-color="#f3c99a"/></linearGradient>
		<rect x="-400" y="-400" width="1800" height="1800" fill="url(#${sky})"/>
		<circle cx="210" cy="180" r="42" fill="#fff6df"/>
		<path d="M0 520 Q240 470 520 530 T1000 500 V700 H0 Z" fill="#2f6f93"/>
		<path d="M0 580 Q260 540 540 590 T1000 560" fill="none" stroke="#d7f2ff" stroke-width="5" opacity=".7"/>
		<path d="M0 700 H1000 V1100 H0 Z" fill="#e7d2a8"/>
		${planks}
		<rect x="80" y="430" width="14" height="280" fill="#5b4636"/>
		<rect x="230" y="450" width="14" height="260" fill="#5b4636"/>
		<path d="M70 500 H250" stroke="#5b4636" stroke-width="6"/>
		<g transform="translate(690 560)">
			<path d="M-70 40 H150 L120 0 H-40 Z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>
			<path d="M-70 40 H150" stroke="${JACKET}" stroke-width="10"/>
			<path d="M-40 0 Q40 -70 120 0" fill="${JACKET}" stroke="${INK}" stroke-width="4"/>
			<path d="M-10 0 Q40 -46 90 0" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
			<rect x="-20" y="40" width="90" height="46" fill="#f4e2a8" stroke="${INK}" stroke-width="3"/>
		</g>
	`
}

function hairFront(): string {
	return `<path d="M-26 -112 Q-18 -146 2 -138 Q22 -150 28 -108 Q8 -124 -26 -112" fill="${HAIR}"/><path d="M-20 -128 L-32 -112 M2 -146 L-2 -128 M18 -132 L30 -114" stroke="${HAIR}" stroke-width="5" stroke-linecap="round"/>`
}

function face(turn: 'front' | 'side' | 'back'): string {
	if (turn === 'back') return `<ellipse cx="0" cy="-108" rx="22" ry="24" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>${hairFront()}<path d="M-20 -96 Q0 -80 20 -96" fill="${HAIR}"/>`
	const shift = turn === 'side' ? 8 : 0
	return `
		<ellipse cx="0" cy="-108" rx="22" ry="24" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
		${hairFront()}
		<path d="M${-12 + shift} -108 Q${-7 + shift} -116 ${-2 + shift} -108" fill="none" stroke="${INK}" stroke-width="2.4"/>
		${turn === 'front' ? `<path d="M6 -108 Q11 -116 16 -108" fill="none" stroke="${INK}" stroke-width="2.4"/>` : ''}
		<path d="M${-3 + shift} -94 H${8 + shift}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
		<circle cx="${18}" cy="-100" r="1.6" fill="#c4553a"/>
	`
}

function friesBox(x: number, y: number, rot: number): string {
	return `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-10 0 L-14 -26 Q0 -32 14 -26 L10 0 Z" fill="#f4e2a8" stroke="${INK}" stroke-width="2.4"/><path d="M-12 -18 H12 M-11 -10 H11" stroke="${JACKET}" stroke-width="2.4"/><path d="M-6 -26 L-4 -38 M0 -28 L1 -40 M5 -26 L8 -36" stroke="#e2b84a" stroke-width="2.6" stroke-linecap="round"/></g>`
}

export function drawKanta(x: number, y: number, scale: number, turn: 'front' | 'side' | 'back', withFries: boolean): string {
	return `<g transform="translate(${x} ${y}) scale(${scale})" stroke-linejoin="round">
		<ellipse cx="0" cy="6" rx="34" ry="7" fill="#000" opacity=".12"/>
		<path d="M-12 -28 L-16 4 M12 -28 L18 4" stroke="#243140" stroke-width="8" stroke-linecap="round"/>
		<path d="M-24 -86 L-28 -30 Q0 -16 28 -30 L24 -86 Z" fill="${JACKET}" stroke="${INK}" stroke-width="3"/>
		<path d="M-8 -82 L0 -46 L8 -82" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
		${face(turn)}
		${withFries ? friesBox(24, -52, -12) : ''}
	</g>`
}

export function drawMei(x: number, y: number, scale: number, turn: 'front' | 'side' | 'back'): string {
	const bob = turn === 'back'
		? `<path d="M-24 -128 Q0 -146 24 -128 L26 -78 Q0 -64 -26 -78 Z" fill="#3a2a22"/>`
		: `<path d="M-26 -130 Q0 -150 26 -128 L24 -74 Q0 -62 -24 -76 Z" fill="#3a2a22"/><path d="M-18 -92 Q-26 -70 -10 -66" fill="#3a2a22"/>`
	return `<g transform="translate(${x} ${y}) scale(${scale})" stroke-linejoin="round">
		<ellipse cx="0" cy="6" rx="30" ry="6" fill="#000" opacity=".12"/>
		<path d="M-10 -24 L-12 4 M10 -24 L14 4" stroke="#2c3544" stroke-width="7" stroke-linecap="round"/>
		<path d="M-22 -84 L-20 -28 H20 L22 -84 Z" fill="#1e78c8" stroke="${INK}" stroke-width="3"/>
		<path d="M-24 -70 H24 V-28 H-24 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
		<path d="M-24 -70 H24 M-24 -56 H24 M-24 -42 H24" stroke="${JACKET}" stroke-width="3"/>
		<ellipse cx="0" cy="-108" rx="21" ry="23" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
		${bob}
		${turn === 'back' ? '' : `<path d="M${turn === 'side' ? -2 : -10} -108 Q${turn === 'side' ? 4 : -4} -116 ${turn === 'side' ? 10 : 2} -108" fill="none" stroke="${INK}" stroke-width="2.3"/>${turn === 'front' ? '<path d="M6 -108 Q12 -116 18 -108" fill="none" stroke="#1a242c" stroke-width="2.3"/>' : ''}<circle cx="12" cy="-98" r="1.5" fill="#1a242c"/>`}
	</g>`
}

export function drawGull(x: number, y: number, scale: number, turn: 'front' | 'side' | 'back', withFries: boolean): string {
	const faceBits = turn === 'back'
		? ''
		: `<circle cx="${turn === 'side' ? 26 : 24}" cy="-10" r="2.4" fill="${INK}"/><path d="M16 -18 L30 -16" stroke="${INK}" stroke-width="2.4"/><path d="M18 -14 L30 -12" stroke="${JACKET}" stroke-width="2"/>`
	return `<g transform="translate(${x} ${y}) scale(${scale})" stroke-linejoin="round">
		<path d="M-8 -4 Q-70 -48 -96 -8 Q-40 -16 -6 2" fill="#e8eef5" stroke="${INK}" stroke-width="3"/>
		<path d="M8 -2 Q62 -46 92 -4 Q40 -8 8 4" fill="#e8eef5" stroke="${INK}" stroke-width="3"/>
		<ellipse cx="0" cy="0" rx="40" ry="18" fill="#f7f9fc" stroke="${INK}" stroke-width="3"/>
		<circle cx="24" cy="-6" r="12" fill="#f7f9fc" stroke="${INK}" stroke-width="3"/>
		<path d="M32 -8 L52 -2 L32 0" fill="#e2a122" stroke="${INK}" stroke-width="2"/>
		${faceBits}
		${withFries ? friesBox(48, 8, 20) : ''}
	</g>`
}

function propMarkup(fries: string, cast: Record<string, ActorSlot>): string {
	if (fries === 'kanta' && cast.kanta) return ''
	if (fries === 'gull' && cast.boss) return ''
	if (fries === 'air') {
		const a = cast.kanta ?? { x: 400, y: 700, scale: 1 }
		const b = cast.boss ?? { x: 560, y: 420, scale: 1 }
		return friesBox((a.x + b.x) / 2, (a.y + b.y) / 2 - 80, -28)
	}
	if (fries === 'jar') {
		const x = ((cast.kanta?.x ?? 420) + (cast.mei?.x ?? 600)) / 2
		const y = (cast.kanta?.y ?? 790) - 10
		return `<g transform="translate(${x} ${y})"><path d="M-16 0 L-12 -28 H12 L16 0 Z" fill="#d7eef8" stroke="${INK}" stroke-width="3"/><rect x="-8" y="-36" width="16" height="8" fill="#e2b84a" stroke="${INK}" stroke-width="2"/><path d="M-8 0 H8" stroke="${INK}" stroke-width="2"/></g>`
	}
	if (fries === 'feather') {
		const x = cast.kanta?.x ?? 480
		const y = (cast.kanta?.y ?? 760) - 150
		return `<g transform="translate(${x} ${y}) rotate(-24)"><path d="M0 -30 Q16 -8 0 28 Q-16 -8 0 -30" fill="#f7f9fc" stroke="${INK}" stroke-width="2"/><path d="M0 -24 V22" stroke="${INK}" stroke-width="1.4"/></g>`
	}
	return ''
}

function lightingOverlay(lighting: string, prefix: string): string {
	const id = `${prefix}-light`
	if (lighting === 'rim') return `<radialGradient id="${id}" cx=".7" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset="1" stop-color="#1a242c" stop-opacity=".28"/></radialGradient><rect x="-400" y="-400" width="1800" height="1800" fill="url(#${id})"/>`
	if (lighting === 'backlight') return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#1a242c" stop-opacity=".2"/></linearGradient><rect x="-400" y="-400" width="1800" height="1800" fill="url(#${id})"/>`
	if (lighting === 'underlight') return `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb15a" stop-opacity=".4"/><stop offset=".45" stop-color="#000" stop-opacity="0"/></linearGradient><rect x="-400" y="-400" width="1800" height="1800" fill="url(#${id})"/>`
	if (lighting === 'neon-bounce') return `<linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff2d95" stop-opacity=".28"/><stop offset="1" stop-color="#22e0ff" stop-opacity=".22"/></linearGradient><rect x="-400" y="-400" width="1800" height="1800" fill="url(#${id})"/>`
	if (lighting === 'screentone') return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="${INK}" opacity=".45"/></pattern><rect x="-400" y="-400" width="1800" height="1800" fill="url(#${id})" opacity=".35"/>`
	return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r=".9" fill="${INK}" opacity=".28"/></pattern><rect x="0" y="680" width="1000" height="420" fill="url(#${id})" opacity=".45"/>`
}

function speedLines(energy: string, seed: string): string {
	if (energy !== 'action' && energy !== 'impact') return ''
	const random = mulberry32(strHash(`${seed}:speed`))
	const cx = 480 + random() * 80
	const cy = 420 + random() * 80
	return Array.from({ length: energy === 'impact' ? 28 : 16 }, (_, index) => {
		const angle = (index / 18) * Math.PI * 2 + random()
		const inner = 80 + random() * 40
		const outer = 420 + random() * 180
		const x1 = cx + Math.cos(angle) * inner
		const y1 = cy + Math.sin(angle) * inner
		const x2 = cx + Math.cos(angle) * outer
		const y2 = cy + Math.sin(angle) * outer
		return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${energy === 'impact' ? 3 : 1.6}" opacity=".35"/>`
	}).join('')
}

function focusPoint(who: string[], actors: Record<string, ActorSlot>, shot: string): { x: number; y: number } {
	if (shot === 'EWS' || who.length === 0) return { x: 520, y: 520 }
	const actor = actors[who[0]] ?? { x: 500, y: 760, scale: 1 }
	const head = who[0] === 'boss' ? 10 : 108
	if (shot === 'CU' || shot === 'ECU' || shot === 'MCU') return { x: actor.x, y: actor.y - head * actor.scale }
	if (shot === 'MS') return { x: actor.x, y: actor.y - 48 * actor.scale }
	return { x: actor.x, y: actor.y - 20 * actor.scale }
}

function frame(focus: { x: number; y: number }, shot: string, aspect: string, angle: string, focal: string) {
	const base = shot === 'EWS' ? 980 : shot === 'WS' ? 680 : shot === 'MS' ? 460 : shot === 'MCU' ? 330 : shot === 'CU' ? 230 : 140
	const lens = focal === '18mm' ? 1.24 : focal === '85mm' ? 0.78 : focal === '35mm' ? 1.08 : 1
	const size = base * lens
	const ratio = aspectValue(aspect)
	const w = size
	const h = size / ratio
	const yBias = angle === 'low' ? 0.66 : angle === 'high' || angle === 'bird' ? 0.32 : 0.48
	return { x: focus.x - w / 2, y: focus.y - h * yBias, w, h }
}

function actorId(name: string, index: number): string {
	const value = name.toLowerCase()
	if (value.includes('kanta') || name.includes('勘')) return 'kanta'
	if (value.includes('mei') || name.includes('芽')) return 'mei'
	if (value.includes('boss') || name.includes('鸥') || value.includes('gull')) return 'boss'
	return index % 2 === 0 ? 'kanta' : 'mei'
}

export function renderIllustration(input: IllustrationInput): { viewBox: string; markup: string } {
	const slots = slotsFor(input.environment)
	const distant = input.who.length === 0
	const names = distant ? ['kanta'] : input.who.map((name, index) => actorId(name, index))
	const cast: Record<string, ActorSlot> = {}
	for (const name of names) {
		const slot = slots[name] ?? { x: 500, y: 800, scale: 1 }
		cast[name] = distant ? { ...slot, scale: slot.scale * 0.42, y: slot.y - 40 } : slot
	}
	const people = [
		cast.kanta ? drawKanta(cast.kanta.x, cast.kanta.y, cast.kanta.scale, 'front', input.fries === 'kanta') : '',
		cast.mei ? drawMei(cast.mei.x, cast.mei.y, cast.mei.scale, 'front') : '',
		cast.boss ? drawGull(cast.boss.x, cast.boss.y, cast.boss.scale, 'front', input.fries === 'gull') : '',
	].join('')
	const dutch = input.angle === 'dutch' ? ` transform="rotate(-8 500 560)"` : ''
	const focus = focusPoint(distant ? [] : input.who, distant ? {} : cast, input.shot)
	const box = frame(input.shot === 'EWS' ? { x: 520, y: 520 } : focus, input.shot, input.aspect, input.angle, input.focal)
	const markup = `
		<g${dutch}>
			${backdrop(input.environment, input.idPrefix, input.seed)}
			${people}
			${propMarkup(input.fries, cast)}
		</g>
		${lightingOverlay(input.lighting, input.idPrefix)}
		${speedLines(input.energy, input.seed)}
	`
	return { viewBox: `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`, markup }
}

export function characterSheetSvg(tag: string): string {
	const name = tag.replace('@', '')
	const draw = (turn: 'front' | 'side' | 'back', x: number) => {
		if (name === 'boss') return drawGull(x, 78, 0.85, turn, false)
		if (name === 'mei') return drawMei(x, 128, 0.72, turn)
		return drawKanta(x, 128, 0.72, turn, false)
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 150">
		<rect width="360" height="150" fill="#f4efe6"/>
		${draw('front', 60)}${draw('side', 180)}${draw('back', 300)}
		<text x="60" y="146" text-anchor="middle" font-size="11" fill="#5c6b76">正</text>
		<text x="180" y="146" text-anchor="middle" font-size="11" fill="#5c6b76">侧</text>
		<text x="300" y="146" text-anchor="middle" font-size="11" fill="#5c6b76">背</text>
	</svg>`
}
