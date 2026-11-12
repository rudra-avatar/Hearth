// Probe tests 60-63 (Tests tab): can this TV's web view reach plex.tv and a Plex server (cross-origin requests from
// file://), show the server's posters, and hand an item to PlxNative? All four are started one by one (manual):
// 60 asks plex.tv for a link code, the person enters it at plex.tv/link, 61 picks up the sign-in and lists the servers,
// 62 reads both shelves from the first server and loads one poster, 63 opens the first item's page in PlxNative.
// The sign-in they make is the same one the Plex shelves use (plexstore.ts). The token is never written into a result.
// Nothing is written to the Plex account: 63 uses action "open" (the detail page), never "play".

import type {ProbeResult, ProbeTest} from './probe';
import {appExists, launchApp} from './launch';
import {PLEX_LINK_PAGE, PLX_APP_ID, imageUrl, launchParams, type PlexServer} from './plex';
import {checkPin, fetchAccountName, fetchServers, fetchShelves, findConnection, requestPin} from './plexnet';
import {clearPendingPin, keepClientId, readAuth, readPendingPin, savePendingPin, writeAuth} from './plexstore';

const clip = (text: string, n = 230): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const ok = (text: string): ProbeResult => ({ok: true, text: clip('OK: ' + text)});
const fail = (text: string): ProbeResult => ({ok: false, text: clip('FAILED: ' + text)});

let servers: PlexServer[] = [];

function imageLoads (src: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const img = new Image();
		const timer = window.setTimeout(() => resolve(false), 8000);
		img.onload = () => { window.clearTimeout(timer); resolve(img.naturalWidth > 0); };
		img.onerror = () => { window.clearTimeout(timer); resolve(false); };
		img.src = src;
	});
}

function linkCode (): Promise<ProbeResult> {
	const auth = readAuth();
	keepClientId(auth);
	return requestPin(auth.clientId).then(
		(pin) => { savePendingPin(pin, Date.now()); return ok(`plex.tv answered. On a phone or computer open ${PLEX_LINK_PAGE}, enter ${pin.code}, then run test 61.`); },
		(e) => fail(`plex.tv could not be asked for a code: ${msg(e)}. "no answer" here usually means the web view blocked the cross-origin request.`)
	);
}

function signIn (): Promise<ProbeResult> {
	const auth = readAuth();
	const pin = readPendingPin(Date.now());
	const start: Promise<string | null> = auth.token ? Promise.resolve(auth.token) : pin ? checkPin(auth.clientId, pin.id) : Promise.resolve(null);
	return start.then((token) => {
		if (!token) return pin ? fail(`the code ${pin.code} was not entered yet at ${PLEX_LINK_PAGE}. Enter it, then run 61 again.`) : fail('no code: run test 60 first.');
		clearPendingPin();
		return fetchAccountName(auth.clientId, token).catch(() => '').then((account) => {
			writeAuth({...auth, token, account});
			return fetchServers(auth.clientId, token).then((list) => {
				servers = list;
				if (!list.length) return fail(`signed in${account ? ' as ' + account : ''}, but the account has no server.`);
				const names = list.slice(0, 4).map((s) => `${s.name}${s.owned ? '' : ' (shared)'} [${s.connections.length} ways]`).join(', ');
				return ok(`signed in${account ? ' as ' + account : ''}. ${list.length} server(s): ${names}. Run test 62.`);
			}, (e) => fail(`signed in, but the server list could not be read: ${msg(e)}`));
		});
	}, (e) => fail(`plex.tv did not answer: ${msg(e)}`));
}

function shelves (): Promise<ProbeResult> {
	const auth = readAuth();
	if (!auth.token) return Promise.resolve(fail('not signed in: run 60 and 61 first.'));
	const pick = (): Promise<PlexServer[]> => (servers.length ? Promise.resolve(servers) : fetchServers(auth.clientId, auth.token));
	return pick().then((list) => {
		servers = list;
		const server = list[0];
		if (!server) return fail('the account has no server.');
		const t0 = Date.now();
		return findConnection(server, auth.clientId).then((uri) => {
			const ms = Date.now() - t0;
			const chosen = {id: server.id, name: server.name, uri, token: server.token};
			writeAuth({...auth, server: chosen});
			const way = uri.indexOf('http://') === 0 ? 'http' : uri.indexOf('.plex.direct') !== -1 ? 'https plex.direct' : 'https';
			return fetchShelves(chosen, auth.clientId, {continue: true, recent: true}).then((s) => {
				const cont = s.lists.continue || [];
				const recent = s.lists.recent || [];
				const first = cont[0] || recent[0];
				const counts = `continue ${cont.length}, recent ${recent.length}`;
				if (!first) return ok(`${server.name} answered over ${way} in ${ms} ms; both shelves are empty (${counts}).`);
				return imageLoads(imageUrl(uri, first.thumb, server.token, 200, 300)).then((img) => (img
					? ok(`${server.name} over ${way} (${ms} ms): ${counts}, e.g. "${first.title}". The poster loaded. Run 63.`)
					: fail(`${server.name} over ${way}: ${counts}, but the poster did not load.`)));
			}, (e) => fail(`${server.name} answered over ${way}, but the shelves could not be read: ${msg(e)}`));
		}, (e) => fail(`no connection to ${server.name} answered (${server.connections.length} tried): ${msg(e)}`));
	}, (e) => fail(`the server list could not be read: ${msg(e)}`));
}

function openInPlx (): Promise<ProbeResult> {
	const auth = readAuth();
	if (!auth.token || !auth.server) return Promise.resolve(fail('no server chosen: run 60-62 first.'));
	const server = auth.server;
	return appExists(PLX_APP_ID).then((there) => {
		if (!there) return fail(`PlxNative (${PLX_APP_ID}) is not installed on this TV.`);
		return fetchShelves(server, auth.clientId, {continue: true, recent: true}).then((s) => {
			const item = (s.lists.continue || [])[0] || (s.lists.recent || [])[0];
			if (!item) return fail('nothing on either shelf to open.');
			return launchApp(PLX_APP_ID, launchParams(item, server.id, 'open')).then(
				() => ok(`asked PlxNative to open "${item.title}" (ratingKey ${item.key}). Its detail page should show now.`),
				(e) => fail(`the launch was refused: ${msg(e)}`)
			);
		});
	}, (e) => fail(msg(e)));
}

export const PLEX_TESTS: ProbeTest[] = [
	{id: 'plexPin', label: '60. PlxNative rows: reach plex.tv', manual: true, run: linkCode,
		description: 'Asks plex.tv for a sign-in code (a cross-origin request from the web view). Shows the code to enter at plex.tv/link.'},
	{id: 'plexSignIn', label: '61. PlxNative rows: sign in and list servers', manual: true, run: signIn,
		description: 'After the code from 60 was entered: picks up the sign-in (saved for the Plex shelves) and lists the servers on the account.'},
	{id: 'plexShelves', label: '62. PlxNative rows: read the shelves', manual: true, run: shelves,
		description: 'Finds a connection to the first server that answers, reads Continue watching and Recently added, and loads one poster.'},
	{id: 'plexLaunch', label: '63. PlxNative rows: open in PlxNative', manual: true, run: openInPlx,
		description: 'Opens the first item\'s page in PlxNative (never plays, nothing is written to the Plex account).'}
];
