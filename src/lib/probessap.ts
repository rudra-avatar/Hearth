// Probe tests 14-23 (Tests tab only): can a web app on this TV reach LG's remote-control protocol (SSAP) on the TV
// itself, pair without a computer, and read the full app list? Nothing is changed on the TV. Pairing shows a normal
// "allow connection" prompt on screen. The saved key is only in this app's web storage (hearth-probe-ssap).

import {lunaCall} from './luna';
import type {ProbeResult, ProbeTest} from './probe';
import {closedError, isEarlyClose, registerMessage, variantOf} from './ssapreg';
import type {Variant} from './ssapreg';
import {askViaService, pairViaService, summaryOf, variantAt} from './ssapsvc';
import type {SvcRoute} from './ssapsvc';

type Json = Record<string, unknown>;

const KEY_STORE = 'hearth-probe-ssap';

const clip = (text: string, n = 230): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const ok = (text: string): ProbeResult => ({ok: true, text: clip('OK: ' + text)});
const no = (text: string): ProbeResult => ({ok: false, text: clip('FAILED: ' + text)});
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const hide = (url: string): string => url.replace(/\/\/[^/:]+/, '//<tv>');

let ownIp = '';

/** The TV's own address, from the connection manager (a public call). */
function findIp (): Promise<string> {
	if (ownIp) return Promise.resolve(ownIp);
	return lunaCall<Json>('luna://com.webos.service.connectionmanager/getStatus', {}, 5000).then((r) => {
		const wired = (r.wired || {}) as Json;
		const wifi = (r.wifi || {}) as Json;
		const pick = wired.state === 'connected' && wired.ipAddress ? wired.ipAddress : wifi.ipAddress || wired.ipAddress;
		ownIp = pick ? String(pick) : '';
		return ownIp;
	});
}

function endpoints (ip: string): string[] {
	const list = ['ws://127.0.0.1:3000'];
	if (ip) list.push('ws://' + ip + ':3000');
	list.push('wss://127.0.0.1:3001');
	if (ip) list.push('wss://' + ip + ':3001');
	return list;
}

/** Opens a socket; rejects when it cannot open within `ms` (closed port, refused certificate, or no answer). */
function openSocket (url: string, ms = 4000): Promise<WebSocket> {
	return new Promise<WebSocket>((resolve, reject) => {
		let done = false;
		let ws: WebSocket;
		const finish = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); fn(); };
		const timer = window.setTimeout(() => finish(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error('no answer')); }), ms);
		try { ws = new WebSocket(url); } catch (e) { finish(() => reject(e)); return; }
		ws.onopen = () => finish(() => resolve(ws));
		ws.onerror = () => finish(() => reject(new Error('refused or closed')));
		ws.onclose = () => finish(() => reject(new Error('closed')));
	});
}

function parse (data: unknown): Json | null {
	try { return JSON.parse(String(data)) as Json; } catch { return null; }
}

/** register with PROMPT pairing; resolves with the client key. `onPrompt` runs when the TV says it is asking the user. */
function register (ws: WebSocket, key: string, ms: number, variant: Variant): Promise<{key: string; prompted: boolean}> {
	return new Promise((resolve, reject) => {
		let prompted = false;
		let replied = false;
		const timer = window.setTimeout(() => reject(new Error(prompted ? 'prompt shown, but nobody pressed OK in time' : 'no reply to register')), ms);
		ws.onmessage = (ev) => {
			const m = parse(ev.data);
			if (!m) return;
			replied = true;
			const p = (m.payload || {}) as Json;
			if (m.type === 'response' && p.pairingType) prompted = true;
			if (m.type === 'registered') { window.clearTimeout(timer); resolve({key: String(p['client-key'] || ''), prompted}); }
			if (m.type === 'error') { window.clearTimeout(timer); reject(new Error(String(m.error || 'TV refused the pairing'))); }
		};
		ws.onclose = (ev) => { window.clearTimeout(timer); reject(closedError(ev && ev.code, replied)); };
		ws.send(registerMessage(key, variant));
	});
}

let counter = 0;

function request (ws: WebSocket, uri: string, ms = 8000): Promise<Json> {
	const id = 'hearth_' + (++counter);
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error('no answer to ' + uri)), ms);
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

interface Saved {url: string; key: string; m?: Variant; svc?: SvcRoute}

function loadSaved (): Saved | null {
	try { const s = JSON.parse(window.localStorage.getItem(KEY_STORE) || 'null') as Saved | null; return s && s.url && s.key ? {url: s.url, key: s.key, m: variantOf(s.m), svc: s.svc && s.svc.port ? s.svc : undefined} : null; } catch { return null; }
}

/** Reconnects to the saved endpoint with the saved key and runs `fn` on it. */
function withSession<T> (fn: (ws: WebSocket) => Promise<T>): Promise<T> {
	const saved = loadSaved();
	if (!saved) return Promise.reject(new Error('no saved pairing: run test 17 first'));
	if (saved.svc) return Promise.reject(new Error('paired through the helper service (test 18): this test needs the page route; see test 19 for the list'));
	return openSocket(saved.url).then((ws) => register(ws, saved.key, 8000, variantOf(saved.m)).then((r) => {
		if (r.prompted) throw new Error('the TV asked for pairing again (the saved key was not accepted)');
		return fn(ws);
	}).then((v) => { ws.close(); return v; }, (e) => { try { ws.close(); } catch { /* ignore */ } throw e; }));
}

const titleOf = (i: Json): string => String(i.title || i.id || '');

function iconLoads (src: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const img = new Image();
		const timer = window.setTimeout(() => resolve(false), 3000);
		img.onload = () => { window.clearTimeout(timer); resolve(img.naturalWidth > 0); };
		img.onerror = () => { window.clearTimeout(timer); resolve(false); };
		img.src = src;
	});
}

function tryAll (urls: string[]): Promise<{url: string; ws?: WebSocket; err: string}[]> {
	return urls.reduce((chain, url) => chain.then((acc) => openSocket(url).then(
		(ws) => { ws.close(); return acc.concat({url, err: ''}); },
		(e) => acc.concat({url, err: msg(e)})
	)), Promise.resolve([] as {url: string; err: string}[]));
}

const short = (url: string): string => url.replace('ws://', 'ws ').replace('wss://', 'wss ').replace('127.0.0.1', 'local');

export const SSAP_TESTS: ProbeTest[] = [
	{
		id: 'ssapip', label: '14. SSAP: the TV\'s own address',
		description: 'Reads the TV\'s network address (needed to reach the remote-control service on itself).',
		run: () => findIp().then((ip) => ip ? ok('TV address is ' + ip.replace(/\.\d+$/, '.x')) : no('the TV gave no address'), (e) => no(msg(e)))
	},
	{
		id: 'ssapplain', label: '15. SSAP: plain connection (port 3000)',
		description: 'Tries to open the remote-control port without encryption, on this TV\'s own address.',
		run: () => findIp().catch(() => '').then((ip) => tryAll(endpoints(ip).filter((u) => u.startsWith('ws://')))).then((r) => ({
			ok: r.some((x) => !x.err),
			text: clip((r.some((x) => !x.err) ? 'OK: ' : 'NO: ') + r.map((x) => short(x.url) + ' ' + (x.err ? x.err : 'opens')).join('; '))
		}))
	},
	{
		id: 'ssapsecure', label: '16. SSAP: encrypted connection (port 3001)',
		description: 'Tries the encrypted port. The TV uses its own certificate, so a web page may be refused.',
		run: () => findIp().catch(() => '').then((ip) => tryAll(endpoints(ip).filter((u) => u.startsWith('wss://')))).then((r) => ({
			ok: r.some((x) => !x.err),
			text: clip((r.some((x) => !x.err) ? 'OK: ' : 'NO: ') + r.map((x) => short(x.url) + ' ' + (x.err ? x.err : 'opens')).join('; '))
		}))
	},
	{
		id: 'ssappair', manual: true, label: '17. SSAP: pair with the TV (press OK)',
		description: 'Asks to connect. If the TV shows an "allow" message, press OK on the remote within 60 seconds. Needs "LG Connect Apps" on.',
		run: () => {
			const started = Date.now();
			return findIp().catch(() => '').then((ip) => endpoints(ip).reduce((chain, url) => chain.then((found) => found ? found : openSocket(url).then(
				(ws) => ({url, ws}), () => null as null | {url: string; ws: WebSocket})), Promise.resolve(null as null | {url: string; ws: WebSocket}))).then((found) => {
				if (!found) return no('no remote-control port could be opened (see tests 15 and 16)');
				const saved = loadSaved();
				const key = saved && saved.url === found.url ? saved.key : '';
				const first: Variant = key ? variantOf(saved && saved.m) : 'new';
				const done = (ws: WebSocket, r: {key: string; prompted: boolean}, variant: Variant): ProbeResult => {
					ws.close();
					if (!r.key) return no('paired, but the TV gave no key');
					try { window.localStorage.setItem(KEY_STORE, JSON.stringify({url: found.url, key: r.key, m: variant})); } catch { /* ignore */ }
					return ok(`paired on ${short(found.url)} after ${Math.round((Date.now() - started) / 1000)} s with the ${variant} request; ${r.prompted ? 'the TV asked for permission' : 'no prompt was needed'}; key saved`);
				};
				return register(found.ws, key, 65000, first).then((r) => done(found.ws, r, first), (e) => {
					try { found.ws.close(); } catch { /* ignore */ }
					if (first === 'new' && isEarlyClose(e)) {
						const firstText = msg(e);
						return openSocket(found.url).then((ws2) => register(ws2, key, 65000, 'old').then((r) => done(ws2, r, 'old'), (e2) => { try { ws2.close(); } catch { /* ignore */ } return no(`on ${short(found.url)}: new request: ${firstText}; old request: ${msg(e2)}`); }), (e3) => no(`on ${short(found.url)}: new request: ${firstText}; old request: ${msg(e3)}`));
					}
					return no(`on ${short(found.url)}: ${msg(e)}`);
				});
			}, (e) => no(msg(e)));
		}
	},
	{
		id: 'ssapsvcpair', manual: true, label: '18. SSAP: pair through the helper service (press OK)',
		description: 'Hearth\'s helper service (in the app package) opens the remote-control port with other Origin headers. Press OK on the TV if it asks, within 60 seconds.',
		run: () => {
			const started = Date.now();
			return pairViaService(65000).then((r) => {
				if (!r.key || !r.route) return no(summaryOf(r.results) || 'the helper gave no result');
				try { window.localStorage.setItem(KEY_STORE, JSON.stringify({url: 'service', key: r.key, m: variantAt(r.route.reg), svc: {port: r.route.port, tls: r.route.tls, origin: r.route.origin}})); } catch { /* ignore */ }
				const prompted = r.results.some((a) => a.prompted);
				return ok(`paired on port ${r.route.port} with Origin ${r.route.origin || '(none)'}, ${variantAt(r.route.reg)} request, ${Math.round((Date.now() - started) / 1000)} s; ${prompted ? 'the TV asked for permission' : 'no prompt was needed'}; key saved. Failed before: ${summaryOf(r.results.filter((a) => !a.replied))}`);
			}, (e) => no('helper service: ' + msg(e)));
		}
	},
	{
		id: 'ssapsvclist', label: '19. SSAP: app list through the helper service',
		description: 'Reads the list of apps through the helper service with the key saved by test 18.',
		run: () => {
			const saved = loadSaved();
			if (!saved || !saved.svc) return Promise.resolve(no('no pairing through the helper service: run test 18 first'));
			return askViaService(saved.svc, saved.key, variantOf(saved.m), 'ssap://com.webos.applicationManager/listLaunchPoints').then((r) => {
				if (!r) return no('the TV asked to pair again (the saved key was not accepted)');
				const pts = r.launchPoints;
				if (!Array.isArray(pts)) return no('the TV answered but gave no list: ' + JSON.stringify(r).slice(0, 120));
				const first = (pts[0] || {}) as Json;
				return ok(`${pts.length} apps, e.g. ${pts.slice(0, 5).map((p) => titleOf((p || {}) as Json)).join(', ')}. Icon address looks like ${hide(String(first.largeIcon || first.icon || 'none'))}`);
			}, (e) => no('helper service: ' + msg(e)));
		}
	},
	{
		id: 'ssapagain', label: '20. SSAP: reconnect without a prompt',
		description: 'Connects again with the saved key. It must not ask again.',
		run: () => { const t = Date.now(); return withSession(() => Promise.resolve(Date.now() - t)).then((ms) => ok(`reconnected in ${ms} ms, no prompt`), (e) => no(msg(e))); }
	},
	{
		id: 'ssaplist', label: '21. SSAP: list of all apps',
		description: 'Asks the TV for every app on its home screen (listLaunchPoints) through the remote-control service.',
		run: () => withSession((ws) => request(ws, 'ssap://com.webos.applicationManager/listLaunchPoints')).then((r) => {
			const pts = r.launchPoints;
			if (!Array.isArray(pts)) return no('the TV answered but gave no list: ' + JSON.stringify(r).slice(0, 120));
			const first = (pts[0] || {}) as Json;
			const names = pts.slice(0, 5).map((p) => titleOf((p || {}) as Json)).join(', ');
			return ok(`${pts.length} apps, e.g. ${names}. Icon address looks like ${hide(String(first.largeIcon || first.icon || 'none'))}`);
		}, (e) => no(msg(e)))
	},
	{
		id: 'ssapicons', label: '22. SSAP: showing the app icons',
		description: 'Can the page show the icon pictures the list points to (first 4 apps)?',
		run: () => withSession((ws) => request(ws, 'ssap://com.webos.applicationManager/listLaunchPoints')).then((r) => {
			const pts = (Array.isArray(r.launchPoints) ? r.launchPoints : []).slice(0, 4) as Json[];
			if (!pts.length) return no('no apps to test');
			return Promise.all(pts.map((p) => {
				const src = String(p.largeIcon || p.icon || '');
				return src ? iconLoads(src) : Promise.resolve(false);
			})).then((res) => {
				const n = res.filter(Boolean).length;
				return {ok: n > 0, text: clip(`${n > 0 ? 'OK' : 'NO'}: ${n} of ${pts.length} icons shown (${pts.map((p, i) => titleOf(p) + (res[i] ? ' yes' : ' no')).join(', ')})`)};
			});
		}, (e) => no(msg(e)))
	},
	{
		id: 'ssapinputs', label: '23. SSAP: TV inputs',
		description: 'Reads the TV\'s input list through the remote-control service (extra, not required).',
		run: () => withSession((ws) => request(ws, 'ssap://tv/getExternalInputList')).then((r) => {
			const d = r.devices;
			return Array.isArray(d) ? ok(`${d.length} inputs, e.g. ${d.slice(0, 4).map((x) => String(((x || {}) as Json).label || ((x || {}) as Json).id || '')).join(', ')}`) : no('the TV gave no list');
		}, (e) => no(msg(e)))
	}
];
