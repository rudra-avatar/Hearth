// Network folder (SMB) for the file pickers: runs the script on the TV (public/netfolder/netfolder.sh). The pure parts are
// in netfoldercmd.ts. Nothing here runs at start-up: the folder is connected when a picker asks for it.

import {exec} from './apps';
import {isWebOS} from './luna';
import {t as tt} from '../i18n';
import {
	cleanHost, cleanShare, netForgetCommand, netMountCommand, netSetCommand, netStatusCommand, parseNetResult, parseNetStatus,
	type NetFolder, type NetResult
} from './netfoldercmd';

export {cleanHost, cleanShare};
export type {NetFolder, NetResult};

/** The saved network folder, or null (also off the TV). */
export function readNetFolder (): Promise<NetFolder | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(netStatusCommand(), 10000).then(parseNetStatus);
}

/** Saves and connects. Throws only when the text has characters that cannot be used or the TV did not answer. */
export function saveNetFolder (host: string, share: string, user: string, pass: string): Promise<NetResult> {
	let command: string;
	try { command = netSetCommand(cleanHost(host), cleanShare(share), user.trim(), pass); } catch (e) { return Promise.reject(e); }
	netFolderChanged();
	return exec(command, 90000).then(parseNetResult);
}

/** Connects from the saved settings (on demand: when the picker opens the network row). */
export function mountNetFolder (): Promise<NetResult> {
	return exec(netMountCommand(), 90000).then(parseNetResult);
}

/** Disconnects and forgets the saved settings; what is on the NAS stays. */
export function forgetNetFolder (): Promise<void> {
	netFolderChanged();
	return exec(netForgetCommand(), 30000).then(() => undefined);
}

/** A failed connect in words (the user's language). */
export function netReasonText (r: NetResult): string {
	switch (r.reason) {
		case 'login': return tt('netfolder.whyLogin');
		case 'guest': return tt('netfolder.whyGuest');
		case 'share': return tt('netfolder.whyShare');
		case 'down': return tt('netfolder.whyDown');
		case 'host': return tt('netfolder.whyHost');
		case 'none': return tt('netfolder.whyNone');
		case 'refused': return tt('netfolder.whyRefused');
		default: return r.detail ? `${tt('netfolder.whyOther')} (${r.detail})` : tt('netfolder.whyOther');
	}
}

// A path inside the share (a wallpaper folder or picture) needs the share connected, and the TV drops the mount at every
// restart: so reading such a path connects first. One connect at a time; a good answer counts for a minute (the script
// itself checks that an old mount still answers). Paths elsewhere never come here, so nothing else pays for this.
const KEEP_MS = 60000;
let pending: Promise<void> | null = null;
let okAt = 0;
export function ensureNetFolder (): Promise<void> {
	if (!isWebOS() || Date.now() - okAt < KEEP_MS) return Promise.resolve();
	if (!pending) {
		pending = mountNetFolder().then((r) => {
			pending = null;
			if (!r.ok) throw new Error(netReasonText(r));
			okAt = Date.now();
		}, (e) => { pending = null; throw e; });
	}
	return pending;
}
/** After the saved settings change or are forgotten: connect again at the next use. */
export function netFolderChanged (): void { okAt = 0; }
