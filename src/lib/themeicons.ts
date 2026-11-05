// P81: the app pictures of the loaded theme. Read from the kept theme folder once when the theme is loaded, shrunk to small
// pictures and kept as one localStorage entry (read the first time a tile asks for one; nothing when no theme has icons).

import {iconFromFile} from './customicon';
import {THEME_STORE} from './themecmd';
import {log} from './log';
import type {ThemeData} from './themefile';

const KEY = 'hearth-theme-icons-v1';
let cache: Record<string, string> | null = null;

/** The theme's picture for an app id, or undefined. */
export function themeIcon (id: string): string | undefined {
	if (cache === null) {
		try { const raw = localStorage.getItem(KEY); cache = raw ? JSON.parse(raw) : {}; } catch (e) { cache = {}; }
		// P94a: one Debug line per start (a loaded theme with no kept pictures is the case to look for)
		const n = Object.keys(cache!).length;
		let active = false;
		try { active = !!localStorage.getItem('hearth-theme-active-v1'); } catch (e) { /* nothing */ }
		if (n || active) log(`theme icons: ${n} in storage${active && !n ? ' (a theme is loaded but none are kept)' : ''}`);
	}
	return cache![id];
}

// P94a: the theme's pictures come first in the storage. When they do not fit, the TV-icon copies (P91) and then the mono
// conversions are given up (both are made again later); the pictures stay in memory for this session even if nothing fits.
const GIVE_UP_FIRST = ['hearth-ssap-icondata-v1', 'hearth-mono-v3'];

/** Keeps the pictures (null = none). False when they could not be kept in the storage (storage full). */
export function setThemeIcons (map: Record<string, string> | null): boolean {
	cache = map || {};
	if (!map || !Object.keys(map).length) { try { localStorage.removeItem(KEY); } catch (e) { /* nothing */ } return true; }
	const text = JSON.stringify(map);
	for (let i = 0; i <= GIVE_UP_FIRST.length; i++) {
		try { localStorage.setItem(KEY, text); if (i) log(`theme icons: stored after freeing ${i} other ${i === 1 ? 'copy' : 'copies'}`); return true; } catch (e) { /* full */ }
		if (i < GIVE_UP_FIRST.length) { try { localStorage.removeItem(GIVE_UP_FIRST[i]); } catch (e) { /* nothing */ } }
	}
	try { localStorage.removeItem(KEY); } catch (e) { /* nothing */ }
	return false;
}

/** Reads the theme's icon files (three at a time). `wanted` = the app ids on this TV: other icons are skipped (empty = all). Returns how many could not be read or kept. */
export function buildThemeIcons (theme: ThemeData, wanted: string[]): Promise<number> {
	const all = theme.icons || [];
	const list = wanted.length ? all.filter((i) => wanted.indexOf(i.app) !== -1) : all;
	if (!list.length) { setThemeIcons(null); return Promise.resolve(0); }
	const map: Record<string, string> = {};
	let failed = 0;
	const step = (from: number): Promise<number> => {
		if (from >= list.length) {
			if (!setThemeIcons(map)) { log('theme: the icons did not fit into the storage'); return Promise.resolve(list.length); }
			return Promise.resolve(failed);
		}
		return Promise.all(list.slice(from, from + 3).map((i) => iconFromFile(`${THEME_STORE}/current/${i.file}`).then((d) => { map[i.app] = d; }, (e: Error) => { failed++; log(`theme: icon ${i.file} not read: ${e && e.message ? e.message : 'failed'}`); }))).then(() => step(from + 3));
	};
	return step(0);
}
