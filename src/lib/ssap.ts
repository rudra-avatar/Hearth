// EXPERIMENTAL: the app list without root, through the TV's own remote-control service (SSAP, the protocol LG's phone
// remote uses). The page opens a WebSocket to the TV itself, pairs once (the TV shows an "allow" message; press OK), keeps
// the key in this app's web storage, and asks for the list of launch points. Written from the public protocol; no code
// from other projects. It may not work on every TV or firmware (ports and certificates differ): any failure just means
// the built-in list stays in use. Needs "LG Connect Apps" switched on in the TV's own settings.

import {lunaCall} from './luna';
import {closedError, isEarlyClose, registerMessage, variantOf} from './ssapreg';
import type {Variant} from './ssapreg';
import {askViaService, pairViaService, summaryOf, variantAt} from './ssapsvc';
import type {SvcRoute} from './ssapsvc';

type Json = Record<string, unknown>;

export interface TvLaunchPoint {id: string; title: string; icon?: string; removable?: boolean}

const STORE = 'hearth-ssap';
const PAIR_WAIT_MS = 65000;

interface Saved {url: string; key: string; m?: Variant; svc?: SvcRoute}

const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');

function loadSaved (): Saved | null {
	try { const s = JSON.parse(window.localStorage.getItem(STORE) || 'null') as Saved | null; return s && s.url && s.key ? {url: s.url, key: s.key, m: variantOf(s.m), svc: s.svc && s.svc.port ? s.svc : undefined} : null; } catch { return null; }
}

function saveKey (s: Saved | null): void {
	try { if (s) window.localStorage.setItem(STORE, JSON.stringify(s)); else window.localStorage.removeItem(STORE); } catch { /* ignore */ }
}

/** Has this TV been paired (a key is saved)? */
export function tvPaired (): boolean { return loadSaved() !== null; }

/** Forget the saved pairing. */
export function forgetTv (): void { saveKey(null); }

function findIp (): Promise<string> {
	return lunaCall<Json>('luna://com.webos.service.connectionmanager/getStatus', {}, 5000).then((r) => {
		const wired = (r.wired || {}) as Json;
		const wifi = (r.wifi || {}) as Json;
		const pick = wired.state === 'connected' && wired.ipAddress ? wired.ipAddress : wifi.ipAddress || wired.ipAddress;
		return pick ? String(pick) : '';
	}).catch(() => '');
}

/** Addresses to try, best first: plain port 3000, then the encrypted port 3001 (newer firmware), on the TV itself. */
export function endpoints (ip: string): string[] {
	const list = ['ws://127.0.0.1:3000'];
	if (ip) list.push('ws://' + ip + ':3000');
	list.push('wss://127.0.0.1:3001');
	if (ip) list.push('wss://' + ip + ':3001');
	return list;
}

/** Opens a socket; rejects when it cannot open within `ms`. */
function openSocket (url: string, ms = 4000): Promise<WebSocket> {
	return new Promise<WebSocket>((resolve, reject) => {
		let done = false;
		let ws: WebSocket;
		const finish = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); fn(); };
		const timer = window.setTimeout(() => finish(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error('no answer')); }), ms);
		try { ws = new WebSocket(url); } catch (e) { finish(() => reject(e)); return; }
		ws.onopen = () => finish(() => resolve(ws));
		ws.onerror = () => finish(() => reject(new Error('refused')));
		ws.onclose = () => finish(() => reject(new Error('closed')));
	});
}

function parse (data: unknown): Json | null {
	try { return JSON.parse(String(data)) as Json; } catch { return null; }
}

/** Registers with the TV. With a saved key the TV accepts silently; without one it shows the prompt and waits for OK. */
function register (ws: WebSocket, key: string, ms: number, variant: Variant): Promise<{key: string; prompted: boolean}> {
	return new Promise((resolve, reject) => {
		let prompted = false;
		let replied = false;
		const timer = window.setTimeout(() => reject(new Error(prompted ? 'nobody pressed OK on the TV in time' : 'the TV did not answer')), ms);
		ws.onmessage = (ev) => {
			const m = parse(ev.data);
			if (!m) return;
			replied = true;
			const p = (m.payload || {}) as Json;
			if (m.type === 'response' && p.pairingType) prompted = true;
			if (m.type === 'registered') { window.clearTimeout(timer); resolve({key: String(p['client-key'] || ''), prompted}); }
			if (m.type === 'error') { window.clearTimeout(timer); reject(new Error(String(m.error || 'the TV refused'))); }
		};
		ws.onclose = (ev) => { window.clearTimeout(timer); reject(closedError(ev && ev.code, replied)); };
		ws.send(registerMessage(key, variant));
	});
}

let counter = 0;

function request (ws: WebSocket, uri: string, ms = 8000): Promise<Json> {
	const id = 'hearth_' + (++counter);
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error('the TV did not answer')), ms);
		ws.onmessage = (ev) => {
			const m = parse(ev.data);
			if (!m || m.id !== id) return;
			window.clearTimeout(timer);
			if (m.type === 'error') reject(new Error(String(m.error || 'error')));
			else resolve((m.payload || {}) as Json);
		};
		ws.send(JSON.stringify({id, type: 'request', uri, payload: {}}));
	});
}

/** S3: pairs through the helper service (it can set the Origin header the TV checks). Saves the key and the route. */
function pairViaHelper (): Promise<void> {
	return pairViaService(PAIR_WAIT_MS).then((r) => {
		if (!r.key || !r.route) throw new Error(summaryOf(r.results) || 'no answer');
		saveKey({url: 'service', key: r.key, m: variantAt(r.route.reg), svc: {port: r.route.port, tls: r.route.tls, origin: r.route.origin}});
	});
}

/** Pairs with this TV: tries each address; the TV shows an "allow" message and the person presses OK. Saves the key.
 *  S3: when the TV closes the page's connection without a word (or no port opens), the helper service tries next. */
export function pairWithTv (): Promise<void> {
	return pairViaPage().catch((e) => {
		if (!isEarlyClose(e) && msg(e).indexOf('no remote-control port') !== 0) return Promise.reject(e);
		return pairViaHelper().catch((e2) => Promise.reject(new Error(msg(e) + ' Helper service: ' + msg(e2))));
	});
}

function pairViaPage (): Promise<void> {
	return findIp().then((ip) => {
		const known = loadSaved();
		const urls = endpoints(ip);
		if (known && urls.indexOf(known.url) > 0) urls.splice(urls.indexOf(known.url), 1);
		if (known) urls.unshift(known.url);
		const tryNext = (i: number, last: string): Promise<void> => {
			if (i >= urls.length) return Promise.reject(new Error(last || 'no remote-control port could be opened. Is "LG Connect Apps" on in the TV settings (Network or Connection > Mobile Connection Management)?'));
			const url = urls[i];
			const key = known && known.url === url ? known.key : '';
			const first: Variant = key ? variantOf(known && known.m) : 'new';
			const finish = (ws: WebSocket, r: {key: string}, variant: Variant): void => {
				ws.close();
				if (!r.key) throw new Error('the TV gave no key');
				saveKey({url, key: r.key, m: variant});
			};
			return openSocket(url).then((ws) => register(ws, key, PAIR_WAIT_MS, first).then((r) => finish(ws, r, first), (e) => {
				try { ws.close(); } catch { /* ignore */ }
				// S1: the TV closed the connection without a word: try the old request once on a fresh socket
				if (first === 'new' && isEarlyClose(e)) return openSocket(url).then((ws2) => register(ws2, key, PAIR_WAIT_MS, 'old').then((r) => finish(ws2, r, 'old'), (e2) => { try { ws2.close(); } catch { /* ignore */ } throw e2; }));
				throw e;
			})).catch((e) => {
				// a refusal or timeout at the prompt is final; a closed port means try the next address
				const text = msg(e);
				if (text === 'refused' || text === 'closed' || text === 'no answer') return tryNext(i + 1, '');
				return Promise.reject(e);
			});
		};
		return tryNext(0, '');
	});
}

const toPoints = (raw: unknown): TvLaunchPoint[] => {
	if (!Array.isArray(raw)) throw new Error('the TV gave no list');
	return (raw as Json[]).map((p) => ({
		id: String(p.id || ''),
		title: String(p.title || ''),
		icon: String(p.largeIcon || p.icon || '') || undefined,
		removable: typeof p.removable === 'boolean' ? p.removable : undefined
	}));
};

/** The TV's launch points, read with the saved key (no prompt). Rejects when not paired or the TV does not answer. */
export function listTvApps (): Promise<TvLaunchPoint[]> {
	const saved = loadSaved();
	if (!saved) return Promise.reject(new Error('not paired'));
	const svc = saved.svc;
	if (svc) {
		return askViaService(svc, saved.key, variantOf(saved.m), 'ssap://com.webos.applicationManager/listLaunchPoints').then((payload) => {
			if (!payload) { forgetTv(); throw new Error('the TV asked to pair again: use the Options row once more'); }
			return toPoints(payload.launchPoints);
		});
	}
	return openSocket(saved.url).catch(() => openSocket(saved.url)).then((ws) => register(ws, saved.key, 8000, variantOf(saved.m)).then((r) => {
		if (r.prompted) { forgetTv(); throw new Error('the TV asked to pair again: use the Options row once more'); }
		return request(ws, 'ssap://com.webos.applicationManager/listLaunchPoints');
	}).then((payload) => {
		ws.close();
		return toPoints(payload.launchPoints);
	}, (e) => { try { ws.close(); } catch { /* ignore */ } throw e; }));
}

/** A launch point's icon path as an address the page can load (file paths become file:// addresses). */
export function iconAddress (path: string): string | undefined {
	if (/^(https?|file|data):/.test(path)) return path;
	if (path.charAt(0) === '/') return 'file://' + encodeURI(path);
	return undefined;
}

/** 'ok' = loaded, 'fail' = the page cannot show it, 'slow' = no answer yet (P93: a slow TV is not a broken picture). */
export function iconLoads (src: string, ms = 1500): Promise<'ok' | 'fail' | 'slow'> {
	return new Promise<'ok' | 'fail' | 'slow'>((resolve) => {
		const img = new Image();
		const timer = window.setTimeout(() => resolve('slow'), ms);
		img.onload = () => { window.clearTimeout(timer); resolve(img.naturalWidth > 0 ? 'ok' : 'fail'); };
		img.onerror = () => { window.clearTimeout(timer); resolve('fail'); };
		img.src = src;
	});
}
