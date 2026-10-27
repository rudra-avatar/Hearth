// Plex: the "Continue Watching" row. Sign-in is the plex.tv/link code flow (nothing typed on the TV); the server is found
// through plex.tv and reached directly, plain http on the home network when the server allows it (cheaper for the TV
// than TLS). The account token is kept in its own storage key, never in the settings (which the Debug tab shows).
//
// Everything Plex needs is sent as query parameters, so each request is a "simple" one with no CORS preflight.

import {HEARTH_VERSION} from '../config/version';
import {launchApp, appExists} from './launch';

const STATE_KEY = 'customlauncher-plex-v1';
const CACHE_KEY = 'customlauncher-plex-continue-v1';
const PLEX_TV = 'https://plex.tv';
/** the official LG Plex app; its deep link takes {"contentTarget": "plex://movie/…"} (an item's Plex guid) */
const PLEX_APP = 'cdp-30';
/** Other Plex clients to prefer, when installed, over the official app (app ids, in order). Each is launched with
 *  {ratingKey, action: 'play' | 'details'}. Empty by default; add a client here in your own build. */
export const PLEX_CLIENTS: string[] = [];

export interface PlexServer {
	name: string;
	uri: string;
	token: string;
}

interface PlexState {
	clientId: string;
	token?: string;
	server?: PlexServer;
}

export interface ContinueItem {
	key: string;            // the item's ratingKey
	guid: string;           // plex://… (empty for items without one)
	title: string;          // the show for episodes, the title otherwise
	detail: string;         // "S2 · E5 · Title" or "1h 2m left"
	imageUrl: string;       // a small 16:9 picture through the server's resizer
	progress: number;       // 0..1
}

function uuid (): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
}

function readState (): PlexState {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		const s = raw ? JSON.parse(raw) as PlexState : null;
		if (s && typeof s.clientId === 'string') return s;
	} catch { /* fall through */ }
	const fresh = {clientId: uuid()};
	writeState(fresh);
	return fresh;
}

function writeState (s: PlexState): void {
	try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Signed in and a server chosen: the server's name; otherwise null. */
export function plexServerName (): string | null {
	const s = readState();
	return s.token && s.server ? s.server.name : null;
}

export function plexSignedIn (): boolean {
	return !!readState().token;
}

export function plexSignOut (): void {
	const s = readState();
	writeState({clientId: s.clientId});
	try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

function query (params: Record<string, string | number | undefined>): string {
	return Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== '')
		.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
}

function withQuery (url: string, params: Record<string, string | number | undefined>): string {
	const q = query(params);
	return q ? url + (url.indexOf('?') === -1 ? '?' : '&') + q : url;
}

function identity (token?: string): Record<string, string | undefined> {
	return {
		'X-Plex-Product': 'Hearth',
		'X-Plex-Version': HEARTH_VERSION,
		'X-Plex-Client-Identifier': readState().clientId,
		'X-Plex-Platform': 'webOS',
		'X-Plex-Device-Name': 'Hearth (LG TV)',
		'X-Plex-Token': token
	};
}

function request<T> (method: string, url: string, timeoutMs = 10000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open(method, url, true);
		xhr.timeout = timeoutMs;
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.onload = () => {
			if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(xhr.status === 401 ? 'Plex sign-in expired' : `Plex answered ${xhr.status}`)); return; }
			try { resolve(JSON.parse(xhr.responseText) as T); } catch (e) { reject(e as Error); }
		};
		xhr.onerror = () => reject(new Error('Could not reach Plex'));
		xhr.ontimeout = () => reject(new Error('Plex took too long to answer'));
		xhr.send();
	});
}

// ---- sign-in ---------------------------------------------------------------------------------

export interface PlexPin { id: number; code: string }

export function createPin (): Promise<PlexPin> {
	return request<PlexPin>('POST', withQuery(`${PLEX_TV}/api/v2/pins`, {strong: 'false', ...identity()}));
}

/** The account token once the code has been entered at plex.tv/link, else null. */
export function checkPin (id: number): Promise<string | null> {
	return request<{authToken?: string | null}>('GET', withQuery(`${PLEX_TV}/api/v2/pins/${id}`, identity()))
		.then((p) => (p && p.authToken ? p.authToken : null));
}

interface Resource {
	name: string;
	provides?: string;
	owned?: boolean;
	httpsRequired?: boolean;
	accessToken?: string;
	connections?: {protocol: string; address: string; port: number; uri: string; local: boolean; relay: boolean}[];
}

/** Addresses to try, best first: plain http on the home network (when the server allows it), then the server's
 *  secure local address, then its remote ones. */
export function candidates (r: Resource): string[] {
	const out: string[] = [];
	const add = (u: string) => { if (out.indexOf(u) === -1) out.push(u); };
	const conns = r.connections || [];
	conns.filter((c) => c.local && !c.relay).forEach((c) => {
		if (!r.httpsRequired) add(`http://${c.address}:${c.port}`);
		add(c.uri);
	});
	conns.filter((c) => !c.local && !c.relay).forEach((c) => add(c.uri));
	return out;
}

/** Probes every address at once and takes the best one that answers. */
function reach (r: Resource, token: string): Promise<PlexServer> {
	const list = candidates(r);
	return new Promise<PlexServer>((resolve, reject) => {
		if (!list.length) { reject(new Error(`${r.name} has no address`)); return; }
		const state = list.map(() => 0);    // 0 waiting, 1 answered, -1 failed
		const decide = () => {
			for (let i = 0; i < list.length; i++) {
				if (state[i] === 0) return;
				if (state[i] === 1) { resolve({name: r.name, uri: list[i], token}); return; }
			}
			reject(new Error(`Could not reach ${r.name}`));
		};
		list.forEach((uri, i) => {
			request('GET', withQuery(`${uri}/identity`, {'X-Plex-Token': token}), 4000)
				.then(() => { state[i] = 1; decide(); }, () => { state[i] = -1; decide(); });
		});
	});
}

/** After the code was entered: keep the token and find the server. Resolves with the server's name. */
export function finishSignIn (token: string): Promise<string> {
	return request<Resource[]>('GET', withQuery(`${PLEX_TV}/api/v2/resources`, {includeHttps: 1, ...identity(token)})).then((list) => {
		const servers = (list || []).filter((r) => (r.provides || '').indexOf('server') !== -1);
		const pick = servers.filter((r) => r.owned)[0] || servers[0];
		if (!pick) throw new Error('No Plex server is linked to this account');
		return reach(pick, pick.accessToken || token);
	}).then((server) => {
		writeState({clientId: readState().clientId, token, server});
		return server.name;
	});
}

// ---- continue watching ---------------------------------------------------------------------------

interface PlexItem {
	ratingKey: string;
	guid?: string;
	type: string;
	title: string;
	grandparentTitle?: string;
	parentIndex?: number;
	index?: number;
	thumb?: string;
	art?: string;
	grandparentArt?: string;
	viewOffset?: number;
	duration?: number;
}

function minutes (ms: number): string {
	const m = Math.max(1, Math.round(ms / 60000));
	return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** What one card shows. */
export function toContinueItem (m: PlexItem, server: PlexServer, width: number, height: number): ContinueItem {
	const episode = m.type === 'episode';
	const path = episode ? (m.thumb || m.grandparentArt || m.art) : (m.art || m.thumb);
	const left = m.duration && m.viewOffset ? `${minutes(m.duration - m.viewOffset)} left` : '';
	const number = episode && m.parentIndex !== undefined && m.index !== undefined ? (m.parentIndex === 0 ? `Special ${m.index}` : `S${m.parentIndex} · E${m.index}`) : '';
	return {
		key: m.ratingKey,
		guid: m.guid || '',
		title: episode && m.grandparentTitle ? m.grandparentTitle : m.title,
		detail: [number, left].filter(Boolean).join(' · '),
		imageUrl: path ? withQuery(`${server.uri}/photo/:/transcode`, {width, height, minSize: 1, upscale: 1, url: path, 'X-Plex-Token': server.token}) : '',
		progress: m.duration && m.viewOffset ? Math.min(1, m.viewOffset / m.duration) : 0
	};
}

/** The last list shown (drawn at once when the launcher opens). */
export function cachedContinue (): ContinueItem[] {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		const list = raw ? JSON.parse(raw) as ContinueItem[] : [];
		return Array.isArray(list) ? list : [];
	} catch { return []; }
}

/** The server's Continue Watching list (at most `limit` items), saved for next time. */
export function fetchContinue (limit: number, width: number, height: number): Promise<ContinueItem[]> {
	const s = readState();
	const server = s.server;
	if (!s.token || !server) return Promise.reject(new Error('Not signed in to Plex'));
	const get = (path: string) => request<{MediaContainer?: {Metadata?: PlexItem[]}}>('GET', withQuery(`${server.uri}${path}`, {'X-Plex-Container-Size': limit, ...identity(server.token)}));
	return get('/hubs/continueWatching/items').catch(() => get('/hubs/home/continueWatching')).then((r) => {
		const items = ((r.MediaContainer && r.MediaContainer.Metadata) || []).slice(0, limit).map((m) => toContinueItem(m, server, width, height));
		try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
		return items;
	});
}

/** Opens an item: in a preferred Plex client when one is installed (playing it, or its page with `details`),
 *  otherwise the official Plex app at the item (or just the app when the item has no Plex guid). */
export function openContinue (item: ContinueItem, details = false): Promise<void> {
	const tryClients = (i: number): Promise<void> => {
		if (i >= PLEX_CLIENTS.length) {
			return launchApp(PLEX_APP, item.guid.indexOf('plex://') === 0 ? {contentTarget: item.guid} : {});
		}
		return appExists(PLEX_CLIENTS[i]).then((found) => (found
			? launchApp(PLEX_CLIENTS[i], {ratingKey: item.key, action: details ? 'details' : 'play'})
			: tryClients(i + 1)));
	};
	return tryClients(0);
}
