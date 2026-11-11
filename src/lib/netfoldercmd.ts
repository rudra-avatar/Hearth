// Network folder (SMB) as a place in the file pickers (rooted TVs): pure helpers, so they can be tested on their own.
// netfolder.ts runs them; public/netfolder/netfolder.sh is the script on the TV. Connected on demand only, no start-up link.
// The way to connect follows PR #53 by lordmax895-oss (Apple TV Aerials); the code is our own.

import {APP_ID} from '../config/constants';

export const NETFOLDER_SCRIPT = `/media/developer/apps/usr/palm/applications/${APP_ID}/netfolder/netfolder.sh`;

/** Where the share appears while it is connected (the script's default; a path in the pickers starts with it). */
export const NETFOLDER_MOUNT = '/tmp/hearth-netfolder';

/** True for the mount point and anything inside it. */
export function inNetFolder (path: string): boolean {
	return path === NETFOLDER_MOUNT || path.indexOf(NETFOLDER_MOUNT + '/') === 0;
}

/** What the script printed for `status`: null = nothing saved. `mount` is where the share appears while connected. */
export interface NetFolder {on: boolean; host: string; share: string; guest: boolean; mount: string}

/** Why a connect failed. `refused` = the text was not accepted before anything was saved. */
export type NetReason = 'login' | 'guest' | 'share' | 'down' | 'host' | 'none' | 'refused' | 'other';
export interface NetResult {ok: boolean; reason?: NetReason; detail?: string}

const SAFE_HOST = /^[A-Za-z0-9.-]{1,253}$/;
const SAFE_SHARE = /^[A-Za-z0-9._$\/ -]{1,200}$/;
const SAFE_USER = /^[A-Za-z0-9._@\\-]{0,100}$/;
const SAFE_MOUNT = /^\/[A-Za-z0-9._\/-]+$/;

const q = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** The address as typed: "smb://nas/", "\\\\nas\\video" or "nas/video" all read as "nas" (the folder is asked separately). */
export function cleanHost (text: string): string {
	return text.trim().replace(/^smb:\/\//i, '').replace(/^\\\\|^\/\//, '').replace(/[\\/].*$/, '');
}

/** The share as typed: "Video", "/Video/", "\\\\NAS\\Video" and "//nas/Video/Photos" read as "Video" or "Video/Photos". */
export function cleanShare (text: string): string {
	let t = text.trim().replace(/\\/g, '/');
	if (/^\/\//.test(t)) t = t.replace(/^\/\/[^/]*\/?/, '');       // drop the server part
	return t.replace(/^\/+|\/+$/g, '').trim();
}

/** The command to save and connect; throws when the text has characters that cannot be used (nothing runs then). */
export function netSetCommand (host: string, share: string, user: string, pass: string): string {
	if (!SAFE_HOST.test(host) || !SAFE_SHARE.test(share) || !SAFE_USER.test(user) || pass.length > 200) throw new Error('unsafe network folder');
	return `sh ${q(NETFOLDER_SCRIPT)} set ${q(host)} ${q(share)}` + (user ? ` ${q(user)} ${q(pass)}` : '');
}
export const netMountCommand = (): string => `sh ${q(NETFOLDER_SCRIPT)} mount`;
export const netForgetCommand = (): string => `sh ${q(NETFOLDER_SCRIPT)} forget`;
export const netStatusCommand = (): string => `sh ${q(NETFOLDER_SCRIPT)} status`;

/** The `net ...` line of `status`. */
export function parseNetStatus (out: string): NetFolder | null {
	for (const line of out.split('\n')) {
		const f = line.trim().split(/\s+/);
		if (f[0] === 'net' && (f[1] === 'on' || f[1] === 'off') && f[2] && f[3] && f[5] && SAFE_MOUNT.test(f[5])) {
			return {on: f[1] === 'on', host: f[2], share: f[3].replace(/\+/g, ' '), guest: f[4] !== 'user', mount: f[5]};
		}
	}
	return null;
}

/** The `result=...` line of `set` or `mount`. An answer without one counts as a failure with no detail. */
export function parseNetResult (out: string): NetResult {
	const m = /^result=(\w+)(?: (.*))?$/m.exec(out);
	if (!m) return {ok: false, reason: 'other'};
	const code = m[1];
	if (code === 'ok') return {ok: true};
	if (code === 'login' || code === 'guest' || code === 'share' || code === 'down' || code === 'host' || code === 'none') return {ok: false, reason: code};
	if (/^bad(host|share|user|pass)$/.test(code)) return {ok: false, reason: 'refused'};
	return {ok: false, reason: 'other', detail: (m[2] || '').trim()};
}
