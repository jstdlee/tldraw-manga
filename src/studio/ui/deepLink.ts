// =============================================================================
// deepLink.ts — pure parsing of URL query parameters into a startup config.
//
// Deep links let the studio be opened in a precise state (used by automated
// snapshots, shared review links and the headless renderer). Everything here is
// pure: `parseDeepLink` takes the raw `location.search` string plus the list of
// available preset ids and returns a normalized config. The side effects
// (store mode, preset load, inspector tab, selection) are applied in App.tsx.
//
// Supported params:
//   ?ephemeral=1            use an in-memory store (no IndexedDB persistence)
//   ?preset=<id>            load a universal preset on mount (implies ephemeral);
//                           'default' resolves to the first available preset
//   ?theme=light|dark|auto  initial appearance (overrides the stored preference)
//   ?inspector=page|panel|balloon|asset|masters|theory  open that Inspector tab
//   ?master=<id>            open the Masters tab with that master pre-selected
//   ?select=first-panel     preselect the first page's first panel on mount
//   ?welcome=1              force the first-run welcome sheet open (screenshots)
//   ?demo=repropagate       after load, mark the first page stale and re-propagate
//                           once so the completion toast can be screenshotted
//   ?hold=1                 keep the transient toast visible far longer (screenshots)
// =============================================================================

import type { InspectorTab } from './inspectorModel'

export type ThemePref = 'light' | 'dark' | 'auto'

export interface DeepLinkConfig {
	/** Use an in-memory store instead of the persisted IndexedDB store. */
	ephemeral: boolean
	/** Resolved preset id to load on mount, or null for none. */
	presetId: string | null
	/** Initial theme preference, or null to fall back to the stored preference. */
	theme: ThemePref | null
	/** Inspector tab to open on mount, or null. */
	inspector: InspectorTab | null
	/** Master id to pre-select in the Masters tab, or null. */
	masterId: string | null
	/** Whether to preselect the first page's first panel. */
	selectFirstPanel: boolean
	/** Force the welcome sheet open regardless of stored document / preference. */
	forceWelcome: boolean
	/** Trigger one re-propagate of the first page after load (toast screenshots). */
	demoRepropagate: boolean
	/** Hold transient HUD toasts open far longer than usual (screenshots). */
	hold: boolean
}

/** Map the user-facing `?inspector=` values to internal Inspector tab ids. */
const INSPECTOR_ALIAS: Record<string, InspectorTab> = {
	page: 'layout',
	layout: 'layout',
	panel: 'camera',
	camera: 'camera',
	balloon: 'story',
	story: 'story',
	asset: 'cards',
	assets: 'cards',
	cards: 'cards',
	masters: 'masters',
	master: 'masters',
	theory: 'theory',
}

function isThemePref(value: string): value is ThemePref {
	return value === 'light' || value === 'dark' || value === 'auto'
}

/**
 * Parse a `location.search` string into a {@link DeepLinkConfig}.
 * @param search the raw query string, e.g. `"?preset=default&theme=dark"`.
 * @param presetIds available preset ids, in display order; used to resolve
 *   `preset=default` to the first preset and to validate an explicit id.
 */
export function parseDeepLink(search: string, presetIds: readonly string[]): DeepLinkConfig {
	const params = new URLSearchParams(search)

	const rawPreset = params.get('preset')
	let presetId: string | null = null
	if (rawPreset) {
		if (rawPreset === 'default') presetId = presetIds[0] ?? null
		else if (presetIds.includes(rawPreset)) presetId = rawPreset
		else presetId = rawPreset // unknown id is passed through; the loader reports it
	}

	// A preset link implies an ephemeral store so the shared/snapshot state is
	// deterministic and never collides with (or stalls on) a persisted document.
	const ephemeral = params.get('ephemeral') === '1' || params.get('ephemeral') === 'true' || presetId !== null

	const rawTheme = params.get('theme')
	const theme = rawTheme && isThemePref(rawTheme) ? rawTheme : null

	const rawInspector = params.get('inspector')
	const inspector = rawInspector ? INSPECTOR_ALIAS[rawInspector.toLowerCase()] ?? null : null

	const masterId = params.get('master')
	const selectFirstPanel = params.get('select') === 'first-panel'
	const forceWelcome = params.get('welcome') === '1' || params.get('welcome') === 'true'
	const demoRepropagate = params.get('demo') === 'repropagate'
	const hold = params.get('hold') === '1' || params.get('hold') === 'true'

	return {
		ephemeral,
		presetId,
		theme,
		inspector,
		masterId: masterId || null,
		selectFirstPanel,
		forceWelcome,
		demoRepropagate,
		hold,
	}
}
