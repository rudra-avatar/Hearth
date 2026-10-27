// Available apps. Two providers:
//
//  1. Catalogue (default, no root): config/catalog.ts filtered by getAppLoadStatus.
//  2. Homebrew Channel (opt-in, rooted TVs only): the Homebrew Channel's service runs
//     shell commands as root for any app that asks. With the user's consent (an option
//     in Settings, off by default) we use it to run `luna-send listLaunchPoints`, which
//     gives the live list with LG's own titles, and to read each icon as base64. If the
//     service isn't there, we fall back to the catalogue.

import {APP_CATALOG, type CatalogApp} from '../config/catalog';
import {APP_ID, LUNA} from '../config/constants';
import {isWebOS, lunaCall, type LunaResponse} from './luna';
import {appExists} from './launch';
import {noteExec, rootState, type RootState} from './failure';
import {listTvApps, iconAddress, iconLoads} from './ssap';
import {APPS_CACHE_KEY, deserializeApps, serializeApps} from './appcache';
import {ICON_STAMPS_KEY, iconIsFresh, parseStamps, stampCommand} from './iconstamps';

export interface AppEntry {
	id: string;
	title: string;
	/** image URL (relative asset path or data: URI); undefined → monogram */
	iconUrl?: string;
	/** where the icon file is on the TV (homebrew list only); lets the app cache find it again */
	iconPath?: string;
	/** LG's own "can be removed" flag for this app (homebrew list only) */
	removable?: boolean;
	color?: string;
}

export type AppSource = 'catalog' | 'homebrew' | 'tv';

export interface AppList {
	apps: AppEntry[];
	/** where the list actually came from (homebrew falls back to catalog) */
	source: AppSource;
}

const ICON_DIR = 'icons/apps/';

/** `liveOnly`: when the Homebrew list can't be read, fail instead of falling back to the (smaller) catalogue.
 *  Used when a saved full list is already on screen, which must not be replaced by the catalogue. */
export function listApps (liveOnly: boolean = false, useTv: boolean = false): Promise<AppList> {
	if (!isWebOS()) return Promise.resolve({apps: catalogEntries(APP_CATALOG), source: 'catalog'});
	const catalog = () => listViaCatalog().then((apps): AppList => ({apps, source: 'catalog'}));
	const brew = listViaHomebrew().then((apps): AppList => ({apps, source: 'homebrew'}));
	// EXPERIMENTAL, no root: when the Homebrew list is not available, ask the TV itself (ssap.ts), if the person turned that on
	const live = useTv ? brew.catch(() => listViaTv().then((apps): AppList => ({apps, source: 'tv'}))) : brew;
	return liveOnly ? live : live.catch(catalog);
}

// ---------- provider 1: catalogue ----------

function catalogEntries (apps: CatalogApp[]): AppEntry[] {
	return apps.map((a) => ({
		id: a.id,
		title: a.title,
		iconUrl: a.icon ? ICON_DIR + a.icon : undefined,
		color: a.color
	}));
}

function listViaCatalog (): Promise<AppEntry[]> {
	return Promise.all(APP_CATALOG.map((a) => appExists(a.id)))
		.then((present) => catalogEntries(APP_CATALOG.filter((_, i) => present[i])));
}

// ---------- provider 3 (experimental): the TV's remote-control service, no root ----------

function listViaTv (): Promise<AppEntry[]> {
	return listTvApps().then((points) => {
		const shown = points.filter((p) => p.id && p.title && HIDDEN_IDS.indexOf(p.id) === -1);
		if (!shown.length) throw new Error('no launch points');
		const entries = shown.map((p): AppEntry => {
			const known = APP_CATALOG.find((c) => c.id === p.id);
			return {
				id: p.id,
				title: known ? known.title : p.title,
				// a bundled icon is certain to show; otherwise the TV's own picture, kept only if the page can load it (below)
				iconUrl: known && known.icon ? ICON_DIR + known.icon : p.icon ? iconAddress(p.icon) : undefined,
				removable: p.removable,
				color: known && known.color
			};
		});
		return Promise.all(entries.map((e) => (e.iconUrl && e.iconUrl.indexOf(ICON_DIR) !== 0 ? iconLoads(e.iconUrl) : Promise.resolve(true))))
			.then((good) => entries.map((e, i) => (good[i] ? e : {...e, iconUrl: undefined})));
	});
}

// ---------- provider 2: Homebrew Channel (opt-in) ----------

interface ExecResponse extends LunaResponse { stdoutString?: string; }
interface LaunchPoint { id: string; title: string; largeIcon?: string; icon?: string; removable?: boolean; }

/** Apps LG lists but that make no sense on a launcher (ourselves, promos). */
const HIDDEN_IDS = [APP_ID, 'google.assistant.promo', 'com.webos.app.discovery'];

const ICON_CACHE_KEY = 'launcher-icon-cache-v1';

/** Icon paths must be plain absolute paths. Anything else (quotes, spaces, control
 *  characters, shell syntax) is skipped rather than passed to a root shell. */
const SAFE_PATH = /^\/[A-Za-z0-9._\/+@-]+$/;

/** Quote a value for a POSIX shell. Defence in depth: paths are also validated. */
export function shellQuote (value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Run a shell command as root through the Homebrew Channel service; resolves with stdout. */
export function exec (command: string, timeoutMs = 8000): Promise<string> {
	return lunaCall<ExecResponse>(LUNA.homebrewExec, {command}, timeoutMs).then(
		(r) => { noteExec(); return r.stdoutString || ''; },
		(error) => { noteExec(error); throw error; }
	);
}

/** One tiny command to learn whether this TV can run commands at all (used when Settings opens, not at start). */
export function probeRoot (): Promise<RootState> {
	if (!isWebOS()) return Promise.resolve('unknown');
	return exec('true', 5000).then(() => rootState(), () => rootState());
}

function listViaHomebrew (): Promise<AppEntry[]> {
	return exec("luna-send -n 1 luna://com.webos.applicationManager/listLaunchPoints '{}'")
		.then((out) => {
			const parsed = JSON.parse(out) as {launchPoints?: LaunchPoint[]};
			const points = (parsed.launchPoints || []).filter((p) => p.id && p.title && HIDDEN_IDS.indexOf(p.id) === -1);
			if (!points.length) throw new Error('no launch points');
			return loadIcons(points).then((icons) => points.map((p) => {
				const known = APP_CATALOG.find((c) => c.id === p.id);
				return {
					id: p.id,
					// the catalogue's titles are shorter than LG's ("IPTV Player" vs "webOS IPTV Player")
					title: known ? known.title : p.title,
					iconUrl: icons[p.id] || (known && known.icon ? ICON_DIR + known.icon : undefined),
					iconPath: p.largeIcon || p.icon,
					removable: typeof p.removable === 'boolean' ? p.removable : undefined,
					color: known && known.color
				};
			}));
		});
}

/** Icons are read this many per shell command: one big command for every icon timed out on TVs with many apps,
 *  which left letters instead of icons. */
export const ICON_BATCH = 4;

type IconJob = {id: string; path: string};

/** One shell round-trip for up to ICON_BATCH icons ("<index> <base64>" per line). Icons are requested by *index*,
 *  so app IDs never reach the shell. Resolves with the icons it got; never rejects. */
function readIcons (jobs: IconJob[]): Promise<Record<number, string>> {
	// busybox base64 has no -w, so strip newlines
	const script = jobs
		.map((m, i) => `printf '%d ' ${i}; base64 ${shellQuote(m.path)} 2>/dev/null | tr -d '\\n'; echo`)
		.join('; ');
	return exec(script, 8000).then((out) => {
		const got: Record<number, string> = {};
		for (const line of out.split('\n')) {
			const match = /^(\d+) ([A-Za-z0-9+\/=]+)$/.exec(line);
			if (match && jobs[Number(match[1])]) got[Number(match[1])] = `data:image/png;base64,${match[2]}`;
		}
		return got;
	}).catch(() => ({}));
}

/** Each icon file's size and change time, in one command (see iconstamps.ts). Resolves with {} when it can't. */
function readStamps (paths: string[]): Promise<Record<string, string>> {
	if (!paths.length) return Promise.resolve({});
	return exec(stampCommand(paths.map(shellQuote)), 8000).then(parseStamps, () => ({}));
}

/** Read the icons as data URIs, cached in localStorage by path. A cached icon is used only while its file's size and
 *  change time are the ones saved with it, so an app update with a new icon at the same path shows the new one.
 *  Batches of ICON_BATCH, run one after another; an icon missing from its batch is asked for once more on its own.
 *  The cache is saved after every batch, so a slow TV keeps what it has already read. */
function loadIcons (points: LaunchPoint[]): Promise<Record<string, string>> {
	const paths: string[] = [];
	for (const p of points) {
		const path = p.largeIcon || p.icon;
		if (path && SAFE_PATH.test(path) && paths.indexOf(path) === -1) paths.push(path);
	}
	return readStamps(paths).then((now) => loadIconsWith(points, now));
}

function loadIconsWith (points: LaunchPoint[], now: Record<string, string>): Promise<Record<string, string>> {
	const cache = readIconCache();
	const saved = readIconStamps();
	const result: Record<string, string> = {};
	const missing: IconJob[] = [];
	for (const p of points) {
		const path = p.largeIcon || p.icon;
		if (!path || !SAFE_PATH.test(path)) continue;
		if (cache[path] && iconIsFresh(path, now, saved)) result[p.id] = cache[path];
		else missing.push({id: p.id, path});
	}
	if (!missing.length) return Promise.resolve(result);

	const keep = (): void => {
		// keep only the icons of apps that are still installed, so the cache does not grow past the storage limit
		const kept: Record<string, string> = {};
		const keptStamps: Record<string, string> = {};
		for (const p of points) {
			const path = p.largeIcon || p.icon;
			if (path && cache[path]) {
				kept[path] = cache[path];
				if (saved[path]) keptStamps[path] = saved[path];
			}
		}
		writeIconCache(kept);
		writeIconStamps(keptStamps);
	};
	const store = (job: IconJob, url: string): void => {
		result[job.id] = url;
		cache[job.path] = url;
		if (now[job.path]) saved[job.path] = now[job.path];
		else delete saved[job.path];
	};

	const batches: IconJob[][] = [];
	for (let i = 0; i < missing.length; i += ICON_BATCH) batches.push(missing.slice(i, i + ICON_BATCH));
	return batches.reduce((chain, batch) => chain.then(() => readIcons(batch).then((got) => {
		const lost: IconJob[] = [];
		batch.forEach((job, i) => { if (got[i]) store(job, got[i]); else lost.push(job); });
		// per-icon retry, one command each
		return lost.reduce((c, job) => c.then(() => readIcons([job]).then((one) => { if (one[0]) store(job, one[0]); })), Promise.resolve());
	}).then(keep)), Promise.resolve()).then(() => result, () => result);
}

/** The app list as last seen, for an instant first paint (empty the first time). */
export function cachedApps (): AppEntry[] {
	try {
		const icons = readIconCache();
		return deserializeApps(localStorage.getItem(APPS_CACHE_KEY), (path) => icons[path]);
	} catch { return []; }
}

export function cacheApps (apps: AppEntry[]): void {
	try { localStorage.setItem(APPS_CACHE_KEY, serializeApps(apps)); }
	catch { /* quota exceeded: the next start just waits for the real list */ }
}

function readIconCache (): Record<string, string> {
	try { return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}'); }
	catch { return {}; }
}

function writeIconCache (cache: Record<string, string>): void {
	try { localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache)); }
	catch { /* quota exceeded: icons will simply be re-fetched next time */ }
}

function readIconStamps (): Record<string, string> {
	try { return JSON.parse(localStorage.getItem(ICON_STAMPS_KEY) || '{}'); }
	catch { return {}; }
}

function writeIconStamps (stamps: Record<string, string>): void {
	try { localStorage.setItem(ICON_STAMPS_KEY, JSON.stringify(stamps)); }
	catch { /* quota exceeded: icons are read again next time, which is harmless */ }
}
