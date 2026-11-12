// Media shelves below the home row: the part shared by every app that can fill them. Nothing in here knows Plex.
//
// A "shelf source" is one app whose items can be shown on the home screen and opened in that app: PlxNative today
// (lib/plexsource.ts). To add another one (Jellyfin, Emby, ...):
//   1. lib/<app>.ts: read the app's server replies into ShelfItem lists (pure, tested like scripts/test-plex.mjs)
//   2. lib/<app>source.ts: a function that returns a ShelfSource (fetch, image address, launch parameters)
//   3. its sign-in kept apart from the settings (like lib/plexstore.ts) and its own sign-in screen if it needs one
//   4. its rows in a group of the Widgets tab (lib/prefs.ts, LAYOUT) and in WIDGET_GROUPS there, so they stay when the clock is off
//   5. app.tsx: useShelves(source, ...) and add its views to the `shelves` list passed to Home
// Home navigation (lib/shelfnav.ts), the row of posters (components/MediaShelf.tsx), the refresh timing and the saved copy
// (hooks/useShelves.ts, this file) and opening an item (`openItem`) are shared and need no change.

import {appExists, launchApp} from './launch';

export interface ShelfItem {
	/** the item's id in its app, as the app's launch parameters want it (checked by the source when it reads a reply) */
	key: string;
	/** kind of item ('movie', 'episode', 'season', 'show', ...): a source may open some kinds differently */
	type: string;
	/** first line under the poster */
	title: string;
	/** second line ('' = none) */
	subtitle: string;
	/** where the source finds the poster (a server path); turned into an address by `ShelfSource.image` */
	thumb: string;
	/** 0..1 how far it was watched, 0 when not started */
	progress: number;
}

/** What one source fetched: its lists by id ('continue', 'recent', ...) and for which account or server. */
export interface ShelfSet {
	/** the server (or account) the items came from: a copy saved for another one is not shown */
	origin: string;
	/** when they were read (ms since 1970) */
	at: number;
	lists: Record<string, ShelfItem[]>;
}

export type ShelfAction = 'play' | 'open';

/** One app that fills shelves. Built from the current sign-in and settings each time they change. */
export interface ShelfSource {
	/** stable id: names the saved copy ('plxnative') */
	id: string;
	/** the app items open in, and its name for messages */
	appId: string;
	appName: string;
	/** signed in, a server chosen, at least one list on: the shelves can be fetched */
	ready: boolean;
	/** the server or account the shelves belong to (see ShelfSet.origin) */
	origin: string;
	/** changes whenever what `fetch` asks for changes (server address, sign-in, lists): the refresh starts over */
	sig: string;
	/** the lists that are switched on, in the order they show, with their headings */
	lists: {id: string; title: string}[];
	/** fetches the lists that are on. Rejects with `{status}`: 401 = the sign-in is no longer valid, 0 = no answer */
	fetch: () => Promise<ShelfSet>;
	/** called once when the server did not answer (its address may have changed); resolves when it was handled */
	recover?: () => Promise<void>;
	/** the poster's address at this size ('' = none: the title is drawn instead) */
	image: (item: ShelfItem, width: number, height: number) => string;
	/** the launch parameters that open the item in the app */
	launch: (item: ShelfItem) => object;
}

/** Shelves younger than this are not fetched again. */
export const SHELF_FRESH_MS = 10 * 60 * 1000;
/** After coming back from another app, shelves older than this are fetched again (something was probably watched). */
export const SHELF_RETURN_MS = 60 * 1000;
/** Older saved shelves are not shown at all. */
export const SHELF_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const SHELF_MAX = 20;
/** Waits after failed fetches in a row: 2 minutes, 10 minutes, then every 30 minutes. */
export const RETRY_MS = [120000, 600000, 1800000];

export const shelfCacheKey = (sourceId: string): string => `customlauncher-shelves-${sourceId}-v1`;

const KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? x as Record<string, unknown> : {});
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** A key safe to hand to an app (letters, digits and _ . : - only). */
export function validKey (key: string): boolean {
	return KEY_RE.test(key);
}

export function isFreshSet (s: ShelfSet | null, origin: string, now: number, maxAge: number = SHELF_FRESH_MS): boolean {
	return !!s && s.origin === origin && s.at <= now && now - s.at < maxAge;
}

/** The saved shelves when they are for this origin and not too old to show, else null. */
export function usableSet (s: ShelfSet | null, origin: string, now: number): ShelfSet | null {
	return s && s.origin === origin && s.at <= now && now - s.at < SHELF_SHOWN_MS ? s : null;
}

function cleanItems (x: unknown): ShelfItem[] {
	if (!Array.isArray(x)) return [];
	return x.map(obj).map((m) => ({
		key: str(m.key), type: str(m.type), title: str(m.title).slice(0, 200), subtitle: str(m.subtitle).slice(0, 200), thumb: str(m.thumb).slice(0, 500),
		progress: Math.max(0, Math.min(1, typeof m.progress === 'number' && isFinite(m.progress) ? m.progress : 0))
	})).filter((m) => validKey(m.key)).slice(0, SHELF_MAX);
}

/** Reads a saved copy (from localStorage), checking every field; null when it is not one. */
export function readSet (raw: string | null): ShelfSet | null {
	let d: Record<string, unknown> | null = null;
	try { d = raw ? obj(JSON.parse(raw)) : null; } catch { d = null; }
	if (!d || typeof d.origin !== 'string' || typeof d.at !== 'number') return null;
	const lists: Record<string, ShelfItem[]> = {};
	const src = obj(d.lists);
	Object.keys(src).forEach((k) => { if (KEY_RE.test(k)) lists[k] = cleanItems(src[k]); });
	return {origin: d.origin, at: d.at, lists};
}

export function retryWait (failuresInARow: number): number {
	return RETRY_MS[Math.max(0, Math.min(failuresInARow, RETRY_MS.length - 1))];
}

export interface RefreshMoment {
	/** a list was switched on or off, or the origin changed, since the last plan */
	changed: boolean;
	/** the first plan since Hearth started */
	first: boolean;
	known: ShelfSet | null;
	origin: string;
	now: number;
	/** how long after start background work waits (TIMING.backgroundWorkMs) */
	startMs: number;
}

/** How long to wait before the next fetch. A changed choice: at once. Back from another app with shelves older than a minute: at
 *  once. Fresh shelves: until they are 10 minutes old. Otherwise: after the start-up work at start, at once later. */
export function refreshWait (m: RefreshMoment): number {
	if (m.changed) return 300;
	if (!m.first && !isFreshSet(m.known, m.origin, m.now, SHELF_RETURN_MS)) return 800;
	if (m.known && isFreshSet(m.known, m.origin, m.now)) return Math.max(0, SHELF_FRESH_MS - (m.now - m.known.at));
	return m.first ? m.startMs : 800;
}

/** What a failed fetch leads to. 401: the sign-in is no longer valid (stop, say so once). 0 (no answer) the first time: let the
 *  source recover (look the server up again). Anything else: try again later. */
export function failureStep (status: number, recoveredAlready: boolean): 'expired' | 'recover' | 'retry' {
	if (status === 401) return 'expired';
	if (status === 0 && !recoveredAlready) return 'recover';
	return 'retry';
}

/** A shelf as the home screen draws it (components/MediaShelf.tsx): built by hooks/useShelves.ts from a source and its lists. */
export interface ShelfView {
	/** unique on the home screen: '<source id>:<list id>' */
	id: string;
	title: string;
	items: ShelfItem[];
	/** when the items were fetched (ShelfSet.at): a poster that failed is tried again once this changes */
	rev: number;
	/** the poster address ('' = none: the title is drawn instead) */
	image: (item: ShelfItem) => string;
	/** OK on an item */
	open: (item: ShelfItem) => void;
}

/** The poster address to use. `failedAt` is the `rev` (fetch) in which the poster last failed, 0 for never.
 *  - never failed: the address as it is (no reload on later fetches)
 *  - failed in this fetch: '' (the title is drawn on the tile instead of a broken picture)
 *  - failed in an earlier fetch: the address with a marker naming that fetch, so the TV asks the server again instead of keeping
 *    the failure; the marker stays the same until the poster fails again, so a poster that came back is not reloaded each time. */
export function posterSrc (src: string, rev: number, failedAt: number): string {
	if (!src || !failedAt) return src;
	if (failedAt === rev) return '';
	return src + (src.indexOf('?') === -1 ? '?' : '&') + 'hearthRetry=' + failedAt;
}

/** Forgets a source's saved shelves (after signing out). */
export function forgetSet (sourceId: string): void {
	try { localStorage.removeItem(shelfCacheKey(sourceId)); } catch { /* ignore */ }
}

/** Opens an item in its app. A failed launch tells whether the app is missing (`onError` gets 'missing' or 'failed'). */
export function openItem (source: ShelfSource, item: ShelfItem, onError: (why: 'missing' | 'failed') => void): void {
	launchApp(source.appId, source.launch(item)).catch(() => appExists(source.appId).then((there) => onError(there ? 'failed' : 'missing')));
}
