// The PlxNative shelves: fetching (plex.tv and the Plex server, straight from the web view). The pure part is plex.ts.
// Hearth runs from file://, so every request is cross-origin: plex.tv and Plex Media Server answer with CORS headers
// (the Plex web app depends on that). Probe tests 60-62 check it on a real TV.

import {
	accountUrl, continueUrl, identityUrl, isContainer, onDeckUrl, parseAccountName, parseIdentity, parseItems, parsePin, parsePinToken,
	parseServers, pinCheckUrl, pinRequestUrl, plexHeaders, recentUrl, resourcesUrl,
	type PlexItem, type PlexPin, type PlexServer
} from './plex';
import type {PlexChosenServer} from './plexstore';
import type {ShelfSet} from './shelves';

export class PlexError extends Error {
	/** 0: no answer (network down, server off, or the request was blocked); 401: the sign-in is no longer valid */
	status: number;
	constructor (message: string, status: number) { super(message); this.status = status; }
}

/** One request. Resolves with the body on 2xx, rejects with a PlexError otherwise. */
export function plexRequest (method: 'GET' | 'POST', url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open(method, url, true);
		request.timeout = timeoutMs;
		Object.keys(headers).forEach((k) => request.setRequestHeader(k, headers[k]));
		request.onload = () => (request.status >= 200 && request.status < 300 ? resolve(request.responseText) : reject(new PlexError('HTTP ' + request.status, request.status)));
		request.onerror = () => reject(new PlexError('no answer (network, or blocked by the web view)', 0));
		request.ontimeout = () => reject(new PlexError('timed out', 0));
		request.send();
	});
}

export function requestPin (clientId: string): Promise<PlexPin> {
	return plexRequest('POST', pinRequestUrl(), plexHeaders(clientId)).then((text) => {
		const pin = parsePin(text);
		if (!pin) throw new PlexError('unreadable reply from plex.tv', 200);
		return pin;
	});
}

/** The account token once the code was entered at plex.tv/link, null while it was not. */
export function checkPin (clientId: string, id: number): Promise<string | null> {
	return plexRequest('GET', pinCheckUrl(id), plexHeaders(clientId)).then(parsePinToken);
}

export function fetchAccountName (clientId: string, token: string): Promise<string> {
	return plexRequest('GET', accountUrl(), plexHeaders(clientId, token)).then(parseAccountName);
}

export function fetchServers (clientId: string, token: string): Promise<PlexServer[]> {
	return plexRequest('GET', resourcesUrl(), plexHeaders(clientId, token), 15000).then(parseServers);
}

/** The first connection (in plex.ts's order) that answers as this server. Local ones get a short wait, the others longer. */
export function findConnection (server: PlexServer, clientId: string): Promise<string> {
	const conns = server.connections;
	const attempt = (i: number, last: Error | null): Promise<string> => {
		if (i >= conns.length) return Promise.reject(last || new PlexError('no connection to ' + server.name + ' answered', 0));
		const c = conns[i];
		return plexRequest('GET', identityUrl(c.uri), plexHeaders(clientId), c.local ? 3000 : 8000).then((text) => {
			const id = parseIdentity(text);
			if (id && id !== server.id) throw new PlexError('a different server answered', 200);
			return c.uri;
		}).catch((e: Error) => attempt(i + 1, e));
	};
	return attempt(0, null);
}

function continueItems (server: PlexChosenServer, headers: Record<string, string>): Promise<PlexItem[]> {
	// the hub first (what the Plex apps show); a server too old for it answers 404 or an empty page: On Deck instead
	return plexRequest('GET', continueUrl(server.uri), headers)
		.then((text) => { if (!isContainer(text)) throw new PlexError('no hub', 404); return parseItems(text); })
		.catch((e: PlexError) => (e.status === 404 || e.status === 400 ? plexRequest('GET', onDeckUrl(server.uri), headers).then((t) => parseItems(t)) : Promise.reject(e)));
}

/** The lists that are on, as a ShelfSet for the shared shelves (a list that is off is not asked for and not in `lists`). */
export function fetchShelves (server: PlexChosenServer, clientId: string, want: {continue: boolean; recent: boolean}, now: () => number = Date.now): Promise<ShelfSet> {
	const headers = plexHeaders(clientId, server.token);
	return Promise.all([
		want.continue ? continueItems(server, headers) : Promise.resolve(null),
		want.recent ? plexRequest('GET', recentUrl(server.uri), headers).then((t) => parseItems(t)) : Promise.resolve(null)
	]).then(([cont, recent]) => {
		const lists: Record<string, PlexItem[]> = {};
		if (cont) lists.continue = cont;
		if (recent) lists.recent = recent;
		return {origin: server.id, at: now(), lists};
	});
}
