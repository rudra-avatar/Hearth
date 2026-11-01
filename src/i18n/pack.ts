// T2b/T4: the language in use. Three sources: English (built in), a bundled language (T4: shipped in the app as
// `languages/<code>.js`, copied into localStorage when first picked) and the user's own language file (T2b, checked by lib/langpack.ts).
// This module imports only the string table, so i18n/boot.ts can run it before any screen module reads a text.
// Read at start-up only when a language other than English was in use (one localStorage read otherwise).

import {setStrings} from './index';
import {HEARTH_VERSION} from '../config/version';

export const PACK_KEY = 'hearth-langpack-v1';
export const BUNDLED_KEY = 'hearth-langbundled-v1';
export const ACTIVE_KEY = 'hearth-langactive-v1';

export interface PackData {
	name: string;
	code: string;
	strings: Record<string, string>;
	/** keys of the English table the pack does not have (they read in English) */
	missing: number;
	/** keys of the pack the English table does not have (left out) */
	ignored: number;
}

interface Kept {name: string; code: string; strings: Record<string, string>}
interface Bundled {code: string; v: string; strings: Record<string, string>}

const read = (key: string): any => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
function readKept (): Kept | null {
	const raw = read(PACK_KEY);
	return raw && typeof raw.name === 'string' && raw.strings && typeof raw.strings === 'object' ? raw as Kept : null;
}
function readBundled (): Bundled | null {
	const raw = read(BUNDLED_KEY);
	return raw && typeof raw.code === 'string' && raw.strings && typeof raw.strings === 'object' ? raw as Bundled : null;
}
/** Name of the kept own file, or '' when none is kept. */
export function packName (): string { const k = readKept(); return k ? k.name : ''; }
export function hasPack (): boolean { return readKept() !== null; }
/** True when the bundled language `code` is stored and was copied by this Hearth version. */
export function bundledReady (code: string): boolean { const b = readBundled(); return !!b && b.code === code && b.v === HEARTH_VERSION; }

/** Strings of language `id` (`en` = null); undefined when they are not available yet. A bundled copy from an older version is used until refreshed. */
function stringsFor (id: string): Record<string, string> | null | undefined {
	if (id === 'en') return null;
	if (id === 'pack') { const k = readKept(); return k ? k.strings : undefined; }
	const b = readBundled();
	return b && b.code === id ? b.strings : undefined;
}

let applied = 'en';
/** Start-up (i18n/boot.ts, before any screen module reads a text): switch to the language that was last in use. */
export function applyKeptAtStart (): void {
	let id = 'en';
	try { id = localStorage.getItem(ACTIVE_KEY) || 'en'; } catch (e) { /* English */ }
	if (id === 'en') return;
	const s = stringsFor(id);
	if (s) { setStrings(s); applied = id; }
}
/** Makes the language named by the setting (`en`, `pack` or a bundled code) the one in use. Cheap when nothing changes; called while App renders. */
export function applyLanguage (id: string): void {
	if (id === applied) return;
	const s = stringsFor(id);
	if (s === undefined) return;                      // not loaded yet (bundled copy is fetched by App) or no kept file
	setStrings(s);
	applied = id;
	try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) { /* the choice still holds for this run */ }
}
/** After a bundled copy was refreshed: the next `applyLanguage` applies it again. */
export function reapply (): void { applied = ''; }

export function keepPack (p: PackData): boolean {
	try { localStorage.setItem(PACK_KEY, JSON.stringify({name: p.name, code: p.code, strings: p.strings})); return true; } catch (e) { return false; }
}
export function removePack (): void {
	try { localStorage.removeItem(PACK_KEY); localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* nothing */ }
	setStrings(null);
	applied = 'en';
}

/** T4: loads `languages/<code>.js` from the app folder (works on every webOS, also without root) and keeps its texts. Resolves true when they are stored. */
export function loadBundled (code: string): Promise<boolean> {
	return new Promise((resolve) => {
		if (!/^[A-Za-z0-9-]{2,12}$/.test(code)) { resolve(false); return; }
		const w = window as any;
		const s = document.createElement('script');
		const done = (ok: boolean) => { w.__hearthLang = undefined; if (s.parentNode) s.parentNode.removeChild(s); resolve(ok); };
		w.__hearthLang = (c: string, strings: Record<string, string>) => {
			try { if (c === code && strings && typeof strings === 'object') localStorage.setItem(BUNDLED_KEY, JSON.stringify({code, v: HEARTH_VERSION, strings})); } catch (e) { /* reported as not loaded */ }
		};
		s.onload = () => done(bundledReady(code));
		s.onerror = () => done(false);
		s.src = 'languages/' + code + '.js';
		document.head.appendChild(s);
	});
}
