// The PlxNative shelves (Continue watching, Recently added): the Plex part, pure. Reading plex.tv and Plex Media Server
// replies into ShelfItems (lib/shelves.ts), building addresses, choosing a server connection, and PlxNative's launch
// parameters. plexnet.ts does the fetching, plexstore.ts keeps the sign-in apart from the settings, plexsource.ts plugs
// it all into the shared shelves.
//
// PlxNative's launch contract (plx-native docs/launch-links.md):
//   launch {"id":"com.beb.plxnative","params":{"plex":{"server":"<machineIdentifier>","ratingKey":"123","action":"play"|"open"}}}

import {SHELF_MAX, type ShelfAction, type ShelfItem} from './shelves';

export const PLX_APP_ID = 'com.beb.plxnative';
export const PLX_APP_NAME = 'PlxNative';
export const PLEX_PRODUCT = 'Hearth';
export const PLEX_TV = 'https://plex.tv';
/** Where the person types the four-character code (phone or computer). */
export const PLEX_LINK_PAGE = 'plex.tv/link';

export type PlexAction = ShelfAction;
/** The lists PlxNative fills, in the order they show. */
export const PLEX_LISTS = ['continue', 'recent'] as const;
export type PlexListId = typeof PLEX_LISTS[number];

export interface PlexPin {
	id: number;
	code: string;
}

export interface PlexConnection {
	uri: string;
	local: boolean;
	relay: boolean;
}

export interface PlexServer {
	name: string;
	/** machineIdentifier: PlxNative's `server` key */
	id: string;
	/** the token for this server (a shared server has its own) */
	token: string;
	owned: boolean;
	connections: PlexConnection[];
}

/** Shelf items as Plex gives them: `key` is the ratingKey (digits only, checked); for an episode `title` is the show, `subtitle`
 *  "S2 · E5" and `thumb` the show's poster; for a film `subtitle` is the year. */
export type PlexItem = ShelfItem;
const SHELF_SIZE = SHELF_MAX;

type Json = Record<string, unknown>;

const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' && isFinite(x) ? String(x) : '');
const num = (x: unknown): number => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' && /^\d+$/.test(x) ? parseInt(x, 10) : 0);
const obj = (x: unknown): Json => (x && typeof x === 'object' ? x as Json : {});
const list = (x: unknown): Json[] => (Array.isArray(x) ? x.map(obj) : []);

function parse (json: string): Json | null {
	try { const v = JSON.parse(json); return v && typeof v === 'object' ? v as Json : null; } catch { return null; }
}

/** A random id for this install, kept for good (plex.tv lists it under the account's devices). */
export function newClientId (random: () => number = Math.random): string {
	let s = 'hearth-';
	for (let i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(random() * 16));
	return s;
}

/** The headers plex.tv and a server want. The token is only sent as a header, never in an address (except image addresses, see `imageUrl`). */
export function plexHeaders (clientId: string, token?: string): Record<string, string> {
	const h: Record<string, string> = {
		'Accept': 'application/json',
		'X-Plex-Product': PLEX_PRODUCT,
		'X-Plex-Client-Identifier': clientId,
		'X-Plex-Platform': 'webOS',
		'X-Plex-Device': 'LG TV',
		'X-Plex-Device-Name': 'Hearth'
	};
	if (token) h['X-Plex-Token'] = token;
	return h;
}

// ---- sign-in (plex.tv link code) ----

/** POST: asks for a four-character code (strong=false: typed by hand at plex.tv/link). */
export function pinRequestUrl (): string {
	return PLEX_TV + '/api/v2/pins?strong=false';
}

/** GET: asks whether the code was entered yet. */
export function pinCheckUrl (id: number): string {
	return PLEX_TV + '/api/v2/pins/' + Math.floor(id);
}

export function parsePin (json: string): PlexPin | null {
	const d = parse(json);
	if (!d) return null;
	const id = num(d.id);
	const code = str(d.code);
	return id > 0 && /^[A-Za-z0-9]{4,12}$/.test(code) ? {id, code: code.toUpperCase()} : null;
}

/** The account token once the code was entered, else null. */
export function parsePinToken (json: string): string | null {
	const d = parse(json);
	const token = d ? str(d.authToken) : '';
	return validToken(token) ? token : null;
}

export function validToken (token: string): boolean {
	return /^[A-Za-z0-9_-]{8,128}$/.test(token);
}

export function accountUrl (): string {
	return PLEX_TV + '/api/v2/user';
}

/** The account's name for the Settings row ("Signed in as ..."). */
export function parseAccountName (json: string): string {
	const d = parse(json);
	return d ? str(d.friendlyName) || str(d.username) || str(d.title) : '';
}

// ---- servers ----

export function resourcesUrl (): string {
	return PLEX_TV + '/api/v2/resources?includeHttps=1&includeRelay=1';
}

/** The order connections are tried in: on the home network first (plain http to its address before the
 *  plex.direct https name: older TVs cannot always check modern certificates), then over the internet, the relay last. */
export function orderConnections (connections: PlexConnection[]): PlexConnection[] {
	const rank = (c: PlexConnection): number => (c.relay ? 3 : c.local ? (c.uri.indexOf('http://') === 0 ? 0 : 1) : 2);
	return connections.map((c, i) => ({c, i})).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

const SAFE_URI = /^https?:\/\/[A-Za-z0-9.:\[\]-]+$/;

/** The servers on the account (its own and the ones shared with it), each with its connections in the order to try. */
export function parseServers (json: string): PlexServer[] {
	const d = parse(json);         // plex.tv answers with a JSON array (an object to `parse`)
	const out: PlexServer[] = [];
	list(d).forEach((r) => {
		if (str(r.provides).split(',').indexOf('server') === -1) return;
		const id = str(r.clientIdentifier);
		const token = str(r.accessToken);
		if (!/^[A-Za-z0-9-]{8,80}$/.test(id) || !validToken(token)) return;
		const conns: PlexConnection[] = [];
		list(r.connections).forEach((c) => {
			const local = c.local === true;
			const relay = c.relay === true;
			const uri = str(c.uri).replace(/\/+$/, '');
			if (SAFE_URI.test(uri)) conns.push({uri, local, relay});
			// a local connection also answers on plain http at its address (no certificate to check)
			const address = str(c.address);
			const port = num(c.port);
			if (local && !relay && /^[0-9.]+$/.test(address) && port > 0 && port < 65536) {
				const plain = 'http://' + address + ':' + port;
				if (!conns.some((x) => x.uri === plain)) conns.push({uri: plain, local: true, relay: false});
			}
		});
		if (!conns.length) return;
		out.push({name: str(r.name) || id, id, token, owned: r.owned === true, connections: orderConnections(conns)});
	});
	return out.sort((a, b) => (a.owned === b.owned ? 0 : a.owned ? -1 : 1));
}

/** GET on a connection: answers without sign-in; used to find a connection that works, and to check it is the right server. */
export function identityUrl (base: string): string {
	return base + '/identity';
}

export function parseIdentity (json: string): string {
	const d = parse(json);
	const mc = d ? obj(d.MediaContainer) : {};
	return str(mc.machineIdentifier);
}

// ---- shelves ----

/** Continue watching as the Plex apps show it (newer servers). */
export function continueUrl (base: string, size = SHELF_SIZE): string {
	return base + '/hubs/continueWatching?count=' + size + '&X-Plex-Container-Start=0&X-Plex-Container-Size=' + size;
}

/** Older servers without that hub: On Deck. */
export function onDeckUrl (base: string, size = SHELF_SIZE): string {
	return base + '/library/onDeck?X-Plex-Container-Start=0&X-Plex-Container-Size=' + size;
}

export function recentUrl (base: string, size = SHELF_SIZE): string {
	return base + '/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=' + size;
}

/** Kinds of items the shelves show: films and TV (music, photos and clips are left out). */
const SHOWN_TYPES = ['movie', 'episode', 'season', 'show'];

function pad (n: number): string { return n > 0 ? String(n) : '?'; }

function itemOf (m: Json): PlexItem | null {
	const type = str(m.type);
	const ratingKey = str(m.ratingKey);
	if (SHOWN_TYPES.indexOf(type) === -1 || !/^\d{1,12}$/.test(ratingKey)) return null;
	const duration = num(m.duration);
	const offset = num(m.viewOffset);
	const progress = duration > 0 && offset > 0 ? Math.min(1, offset / duration) : 0;
	if (type === 'episode') {
		return {
			key: ratingKey, type,
			title: str(m.grandparentTitle) || str(m.title),
			subtitle: 'S' + pad(num(m.parentIndex)) + ' · E' + pad(num(m.index)),
			thumb: str(m.grandparentThumb) || str(m.parentThumb) || str(m.thumb),
			progress
		};
	}
	if (type === 'season') {
		return {key: ratingKey, type, title: str(m.parentTitle) || str(m.title), subtitle: str(m.title), thumb: str(m.thumb) || str(m.parentThumb), progress: 0};
	}
	const year = num(m.year);
	return {key: ratingKey, type, title: str(m.title), subtitle: year ? String(year) : '', thumb: str(m.thumb), progress};
}

/** The items of a hub or library reply (either shape: `Metadata` directly, or the first hub's `Metadata`). */
export function parseItems (json: string, max = SHELF_SIZE): PlexItem[] {
	const d = parse(json);
	if (!d) return [];
	const mc = obj(d.MediaContainer);
	let meta = list(mc.Metadata);
	if (!meta.length) {
		const hubs = list(mc.Hub);
		if (hubs.length) meta = list(hubs[0].Metadata);
	}
	const out: PlexItem[] = [];
	const seen: Record<string, boolean> = {};
	meta.forEach((m) => {
		const it = itemOf(m);
		if (!it || seen[it.key] || out.length >= max) return;
		seen[it.key] = true;
		out.push(it);
	});
	return out;
}

/** Was the reply a server answer at all (a 404 page or an empty body is not)? Used to fall back from the hub to On Deck. */
export function isContainer (json: string): boolean {
	const d = parse(json);
	return !!d && !!d.MediaContainer && typeof d.MediaContainer === 'object';
}

/** A poster scaled by the server to the size it is drawn at, so the TV never decodes a full-size picture.
 *  The token has to be in the address here (an <img> cannot send headers). */
export function imageUrl (base: string, thumb: string, token: string, width: number, height: number): string {
	if (!thumb || thumb.charAt(0) !== '/') return '';
	return base + '/photo/:/transcode?width=' + Math.round(width) + '&height=' + Math.round(height) + '&minSize=1&upscale=1&url='
		+ encodeURIComponent(thumb) + '&X-Plex-Token=' + encodeURIComponent(token);
}

// ---- opening an item in PlxNative ----

/** What to do with an item: a season or a show has nothing to resume, so it always opens its page. */
export function actionFor (item: PlexItem, wanted: PlexAction): PlexAction {
	return item.type === 'season' || item.type === 'show' ? 'open' : wanted;
}

/** The launch parameters for PlxNative (`launchApp(PLX_APP_ID, ...)`). */
export function launchParams (item: PlexItem, server: string, wanted: PlexAction): {plex: {server: string; ratingKey: string; action: PlexAction}} {
	return {plex: {server, ratingKey: item.key, action: actionFor(item, wanted)}};
}
