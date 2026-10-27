import type { Focal, PanelMeta, Shot } from '../model'

export type SensorId = 'ff' | 's35' | 'm43'

export interface SensorSpec {
	id: SensorId
	name: string
	label: string
	shortLabel: string
	widthMm: number
	heightMm: number
	crop: number
	cocMm: number
}

export const SENSOR_MAP: Record<SensorId, SensorSpec> = {
	ff: {
		id: 'ff',
		name: 'Full Frame (36×24mm)',
		label: 'Full Frame (36×24mm)',
		shortLabel: 'FF 36×24',
		widthMm: 36,
		heightMm: 24,
		crop: 1.0,
		cocMm: 0.03,
	},
	s35: {
		id: 's35',
		name: 'Super 35 (24.9×14mm)',
		label: 'Super 35 (24.9×14mm)',
		shortLabel: 'S35 24.9×14',
		widthMm: 24.9,
		heightMm: 14,
		crop: 1.45,
		cocMm: 0.021,
	},
	m43: {
		id: 'm43',
		name: 'Micro Four Thirds (17.3×13mm)',
		label: 'Micro Four Thirds (17.3×13mm)',
		shortLabel: 'M4/3 17.3×13',
		widthMm: 17.3,
		heightMm: 13,
		crop: 2.08,
		cocMm: 0.015,
	},
}

export const SENSORS: SensorSpec[] & Record<SensorId, SensorSpec> = Object.assign(
	[SENSOR_MAP.ff, SENSOR_MAP.s35, SENSOR_MAP.m43],
	SENSOR_MAP,
)

export interface OpticalInput {
	sensor: SensorId
	focalMm: number
	fStop: number
	subjectDistM: number
	bgDistM: number
}

export interface OpticalReadout {
	sensor: SensorSpec
	focalMm: number
	equivFocalMm: number
	eqFocalMm: number
	fStop: number
	subjectDistM: number
	bgDistM: number
	hfovDeg: number
	hFovDeg: number
	vfovDeg: number
	fieldWidthM: number
	hyperfocalM: number
	dofNearM: number
	dofFarM: number
	dofTotalM: number
	bgBlurDiscMm: number
	blurPercent: number
	derivedShot: Shot
	shotLabelZh: string
	dofLabelZh: string
	derivedFocal: Focal
	directorNote: string
	promptFragment: string
	promptClause: string
}

const SHOT_ZH: Record<Shot, string> = {
	EWS: 'Extreme Wide (EWS)',
	WS: 'Wide (WS)',
	MS: 'Medium (MS)',
	MCU: 'Medium Close (MCU)',
	CU: 'Close-up (CU)',
	ECU: 'Extreme Close-up (ECU)',
}

export function defaultOpticsForMeta(meta?: Partial<PanelMeta>): OpticalInput {
	const focalMap: Record<Focal, number> = {
		'18mm': 18,
		'35mm': 35,
		'50mm': 50,
		'85mm': 85,
	}
	const distMap: Record<Shot, number> = {
		EWS: 12.0,
		WS: 4.8,
		MS: 2.1,
		MCU: 1.3,
		CU: 0.85,
		ECU: 0.5,
	}
	const fStopMap: Record<Shot, number> = {
		EWS: 8.0,
		WS: 5.6,
		MS: 2.8,
		MCU: 2.0,
		CU: 1.8,
		ECU: 1.4,
	}
	const shot = meta?.shot ?? 'MS'
	const focal = meta?.focal ?? '35mm'
	return {
		sensor: meta?.sensor ?? 'ff',
		focalMm: meta?.focalMm ?? focalMap[focal] ?? 35,
		fStop: meta?.fStop ?? fStopMap[shot] ?? 2.8,
		subjectDistM: meta?.subjectDistM ?? distMap[shot] ?? 2.1,
		bgDistM: meta?.bgDistM ?? Math.max(4, (distMap[shot] ?? 2.1) * 4.5),
	}
}

export function computeOptics(input: OpticalInput): OpticalReadout {
	const sensor = SENSOR_MAP[input.sensor] ?? SENSOR_MAP.ff
	const focalMm = Math.min(200, Math.max(12, Number(input.focalMm) || 35))
	const fStop = Math.min(22, Math.max(1.2, Number(input.fStop) || 2.8))
	const subjectDistM = Math.min(50, Math.max(0.35, Number(input.subjectDistM) || 2.0))
	const bgDistM = Math.min(120, Math.max(subjectDistM + 0.2, Number(input.bgDistM) || subjectDistM * 3))

	const equivFocalMm = Math.round(focalMm * sensor.crop)
	const hfovRad = 2 * Math.atan(sensor.widthMm / (2 * focalMm))
	const vfovRad = 2 * Math.atan(sensor.heightMm / (2 * focalMm))
	const hfovDeg = Number(((hfovRad * 180) / Math.PI).toFixed(1))
	const vfovDeg = Number(((vfovRad * 180) / Math.PI).toFixed(1))

	const fieldWidthM = Number((2 * subjectDistM * Math.tan(hfovRad / 2)).toFixed(2))

	const hyperfocalMm = (focalMm * focalMm) / (fStop * sensor.cocMm) + focalMm
	const hyperfocalM = Number((hyperfocalMm / 1000).toFixed(2))

	const sMm = subjectDistM * 1000
	const dofNearMm = (hyperfocalMm * sMm) / (hyperfocalMm + Math.max(1, sMm - focalMm))
	const dofFarMm = sMm >= hyperfocalMm ? Number.POSITIVE_INFINITY : (hyperfocalMm * sMm) / Math.max(1, hyperfocalMm - (sMm - focalMm))

	const dofNearM = Number((dofNearMm / 1000).toFixed(2))
	const dofFarM = Number.isFinite(dofFarMm) ? Number((dofFarMm / 1000).toFixed(2)) : 999
	const dofTotalM = Number.isFinite(dofFarMm) ? Number(Math.max(0.01, (dofFarMm - dofNearMm) / 1000).toFixed(2)) : 999

	const bgMm = bgDistM * 1000
	const mag = focalMm / Math.max(1, sMm - focalMm)
	const apertureDiaMm = focalMm / fStop
	const bgBlurDiscMm = Number((apertureDiaMm * mag * (1 - sMm / bgMm)).toFixed(2))
	const blurPercent = Math.min(100, Math.max(0, Math.round((bgBlurDiscMm / 1.8) * 100)))

	let derivedShot: Shot = 'MS'
	if (fieldWidthM <= 0.45) derivedShot = 'ECU'
	else if (fieldWidthM <= 0.85) derivedShot = 'CU'
	else if (fieldWidthM <= 1.45) derivedShot = 'MCU'
	else if (fieldWidthM <= 2.8) derivedShot = 'MS'
	else if (fieldWidthM <= 6.2) derivedShot = 'WS'
	else derivedShot = 'EWS'

	let derivedFocal: Focal = '50mm'
	if (equivFocalMm <= 24) derivedFocal = '18mm'
	else if (equivFocalMm <= 42) derivedFocal = '35mm'
	else if (equivFocalMm <= 65) derivedFocal = '50mm'
	else derivedFocal = '85mm'

	const perspectiveNote =
		equivFocalMm <= 24
			? 'Ultra-wide exaggerated perspective with maximum foreground tension, ideal for speed lines and impact panels'
			: equivFocalMm <= 42
				? 'Humanist wide-angle narrative, balancing action against environmental space'
				: equivFocalMm <= 65
					? 'Standard focal length with natural perspective, ideal for steady dialogue and eye-line duels'
					: 'Telephoto spatial compression that strips away background noise and homes in on micro-expression pressure'

	const dofNote =
		dofTotalM < 0.5
			? `Ultra-shallow depth of field (${dofTotalM}m), background blur ${blurPercent}%`
			: dofTotalM < 2.5
				? `Moderately shallow depth of field (${dofTotalM}m), clean subject-background separation`
				: 'Deep focus, fully sharp, all environmental detail retained'

	const dofLabelZh = dofTotalM < 0.5 ? `Ultra-shallow ${blurPercent}%` : dofTotalM < 2.5 ? `Shallow ${blurPercent}%` : 'Deep focus, all sharp'
	const directorNote = `${perspectiveNote}; ${dofNote}.`
	const promptFragment = `${sensor.shortLabel} sensor, ${focalMm}mm (equiv ${equivFocalMm}mm) f/${fStop}, HFOV ${hfovDeg}deg, subject at ${subjectDistM}m, DOF ${dofNearM}m-${dofFarM >= 900 ? 'inf' : `${dofFarM}m`}, background blur ${blurPercent}%, ${derivedShot} framing`

	return {
		sensor,
		focalMm,
		equivFocalMm,
		eqFocalMm: equivFocalMm,
		fStop,
		subjectDistM,
		bgDistM,
		hfovDeg,
		hFovDeg: hfovDeg,
		vfovDeg,
		fieldWidthM,
		hyperfocalM,
		dofNearM,
		dofFarM,
		dofTotalM,
		bgBlurDiscMm,
		blurPercent,
		derivedShot,
		shotLabelZh: SHOT_ZH[derivedShot] ?? derivedShot,
		dofLabelZh,
		derivedFocal,
		directorNote,
		promptFragment,
		promptClause: promptFragment,
	}
}

export interface AxisAuditItem {
	fromPanel: number
	toPanel: number
	crossed: boolean
	note: string
}

export function auditCameraAxis(metas: PanelMeta[]): { crossings: AxisAuditItem[]; pass: boolean; summary: string } {
	const crossings: AxisAuditItem[] = []
	for (let idx = 1; idx < metas.length; idx += 1) {
		const prev = metas[idx - 1]
		const curr = metas[idx]
		if (!prev || !curr) continue
		const prevDx = prev.eyeline?.[0] ?? 0
		const currDx = curr.eyeline?.[0] ?? 0
		const samePair = prev.who.some((w) => curr.who.includes(w))
		const neutralBridge = prev.angle === 'bird' || curr.angle === 'bird' || prev.shot === 'EWS' || curr.shot === 'EWS'
		const flipped = prevDx * currDx < -18 && samePair && !neutralBridge
		if (flipped) {
			crossings.push({
				fromPanel: idx,
				toPanel: idx + 1,
				crossed: true,
				note: `Eyeline direction flips between panels ${idx}→${idx + 1} (${prevDx > 0 ? 'rightward' : 'leftward'} → ${currDx > 0 ? 'rightward' : 'leftward'}), likely crossing the 180° axis`,
			})
		}
	}
	const pass = crossings.length === 0
	const summary = pass ? 'Axis consistent, no crossings' : `Found ${crossings.length} likely 180° axis crossing(s)`
	return {
		crossings,
		pass,
		summary,
	}
}
