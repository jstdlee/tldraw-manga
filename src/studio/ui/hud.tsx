// =============================================================================
// hud.tsx — a tiny, generic transient toast ("heads-up display") used for brief
// completion feedback (re-propagate done, export written, preset loaded). One
// restrained macOS-style pill, bottom-center above the floating toolbar, with a
// monochrome check glyph, 13px SF Pro, translucent material and a polite
// aria-live announcement. It auto-dismisses after ~2s (or stays far longer in
// `hold` mode, for screenshots) and fades unless the OS prefers reduced motion.
//
// The component is intentionally dumb: it renders whatever toast `useHud` holds.
// All timing lives in the hook so the render stays pure and easy to reason about.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck } from './icons'

export interface ToastState {
	/** Monotonic id so each new toast re-triggers the fade-in animation. */
	id: number
	message: string
}

export interface ShowToastOptions {
	/** Keep the toast visible far longer than usual (for screenshots). */
	hold?: boolean
}

/** Default auto-dismiss, and the long hold used for screenshot deep-links. */
const AUTO_DISMISS_MS = 2000
const HOLD_MS = 600000

export interface HudController {
	toast: ToastState | null
	showToast: (message: string, options?: ShowToastOptions) => void
}

/**
 * Own the single live toast plus its dismiss timer. `showToast` replaces any
 * current toast (the latest action wins) and schedules the auto-dismiss. The
 * timer is always cleared on unmount so no setState fires after teardown.
 */
export function useHud(): HudController {
	const [toast, setToast] = useState<ToastState | null>(null)
	const timer = useRef<number | null>(null)
	const counter = useRef(0)

	const clearTimer = useCallback(() => {
		if (timer.current !== null) {
			window.clearTimeout(timer.current)
			timer.current = null
		}
	}, [])

	const showToast = useCallback(
		(message: string, options?: ShowToastOptions) => {
			clearTimer()
			counter.current += 1
			setToast({ id: counter.current, message })
			const ms = options?.hold ? HOLD_MS : AUTO_DISMISS_MS
			timer.current = window.setTimeout(() => setToast(null), ms)
		},
		[clearTimer],
	)

	useEffect(() => clearTimer, [clearTimer])

	return { toast, showToast }
}

/**
 * Render the current toast (or nothing). The aria-live region is always mounted
 * so assistive technology announces the message when it appears; `role="status"`
 * + `aria-live="polite"` keeps it non-interrupting.
 */
export function Hud({ toast }: { toast: ToastState | null }) {
	return (
		<div className="hud-region" role="status" aria-live="polite">
			{toast ? (
				<div key={toast.id} className="hud-toast">
					<span className="hud-check" aria-hidden="true">
						<IconCheck />
					</span>
					<span className="hud-msg">{toast.message}</span>
				</div>
			) : null}
		</div>
	)
}
