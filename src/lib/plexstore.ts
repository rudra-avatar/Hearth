// The Plex sign-in, kept apart from the settings (UserConfig): the token opens the whole Plex account, so it must never
// reach a theme export, the settings backup, the debug log or a report file. Only the switches and the action live in
// UserConfig. localStorage is private to this app on the TV.

import {newClientId, validToken} from './plex';

const AUTH_KEY = 'customlauncher-plex-auth-v1';
const PIN_KEY = 'customlauncher-plex-pin-v1';
/** A link code is good for about 15 minutes at plex.tv; an older one is not checked again. */
export const PIN_LIFE_MS = 14 * 60 * 1000;

export interface PlexChosenServer {
	/** machineIdentifier */
	id: string;
	name: string;
	/** the connection that answered last (tried first next time) */
	uri: string;
	/** the server's own token (a shared server has its own) */
	token: string;
}

export interface PlexAuth {
	clientId: string;
	/** the account token; '' when signed out */
	token: string;
	/** the account's name for the Settings row */
	account: string;
	server: PlexChosenServer | null;
}

const SAFE_URI = /^https?:\/\/[A-Za-z0-9.:\[\]-]+$/;

function cleanServer (x: unknown): PlexChosenServer | null {
	const s = x && typeof x === 'object' ? x as Record<string, unknown> : null;
	if (!s || typeof s.id !== 'string' || typeof s.uri !== 'string' || typeof s.token !== 'string') return null;
	if (!/^[A-Za-z0-9-]{8,80}$/.test(s.id) || !SAFE_URI.test(s.uri) || !validToken(s.token)) return null;
	return {id: s.id, name: typeof s.name === 'string' ? s.name.slice(0, 80) : s.id, uri: s.uri, token: s.token};
}

/** What was saved, read and checked; a fresh client id is made (and saved) the first time. */
export function readAuth (): PlexAuth {
	let saved: Record<string, unknown> = {};
	try { saved = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}') || {}; } catch { saved = {}; }
	const clientId = typeof saved.clientId === 'string' && /^hearth-[0-9a-f]{24}$/.test(saved.clientId) ? saved.clientId : '';
	const token = typeof saved.token === 'string' && validToken(saved.token) ? saved.token : '';
	return {
		clientId: clientId || newClientId(),       // not saved here: nothing is written for people who never sign in (see `keepClientId`)
		token,
		account: token && typeof saved.account === 'string' ? saved.account.slice(0, 80) : '',
		server: token ? cleanServer(saved.server) : null
	};
}

/** Saves the client id before a sign-in starts: a link code belongs to the client id that asked for it. */
export function keepClientId (auth: PlexAuth): void {
	let saved: Record<string, unknown> | null = null;
	try { saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { saved = null; }
	if (!saved || saved.clientId !== auth.clientId) writeAuth(auth);
}

export function writeAuth (auth: PlexAuth): void {
	try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch { /* no room: the sign-in lasts until Hearth restarts */ }
}

/** Sign out: the token and the server are forgotten, the client id stays (plex.tv keeps listing one device, not a new one each time). */
export function signOut (): PlexAuth {
	const a = readAuth();
	const out: PlexAuth = {clientId: a.clientId, token: '', account: '', server: null};
	writeAuth(out);
	try { localStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
	return out;
}

export function isSignedIn (auth: PlexAuth): boolean {
	return !!auth.token;
}

/** A link code that was shown and not entered yet (the sign-in screen can be left and opened again). */
export function readPendingPin (now: number): {id: number; code: string} | null {
	try {
		const p = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
		if (p && typeof p.id === 'number' && typeof p.code === 'string' && typeof p.at === 'number' && now - p.at < PIN_LIFE_MS && now >= p.at) return {id: p.id, code: p.code};
	} catch { /* ignore */ }
	return null;
}

export function savePendingPin (pin: {id: number; code: string}, now: number): void {
	try { localStorage.setItem(PIN_KEY, JSON.stringify({id: pin.id, code: pin.code, at: now})); } catch { /* ignore */ }
}

export function clearPendingPin (): void {
	try { localStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
}
