// The small line at the bottom right of Settings: versions and root state, to read off a photo of the screen.
// Read when Settings opens (never at start-up). Everything that can't be read is simply left out.

import {HEARTH_VERSION} from '../config/version';
import {exec} from './apps';
import {type Failure, type RootState} from './failure';
import {lunaCall} from './luna';
import {t as tt} from '../i18n';

export interface Versions {
	/** the webOS release, e.g. 11.2.0 */
	webos?: string;
	firmware?: string;
	/** the Homebrew Channel app's version (needs root) */
	homebrew?: string;
	/** the TV's own address on the network (wired first, else Wi-Fi) */
	ip?: string;
}

/** webOS and firmware versions through LG's system-property service (a public call). */
export function readVersions (): Promise<Versions> {
	return lunaCall<{firmwareVersion?: string; sdkVersion?: string}>('luna://com.webos.service.tv.systemproperty/getSystemInfo', {keys: ['firmwareVersion', 'sdkVersion']}, 4000).then(
		(r): Versions => ({webos: clean(r.sdkVersion), firmware: clean(r.firmwareVersion)}),
		(): Versions => ({})
	);
}

/** The TV's network address through the connection manager (a public call, no root). Left out when not connected. */
export function readIp (): Promise<string | undefined> {
	return lunaCall<{wired?: {state?: string; ipAddress?: string}; wifi?: {state?: string; ipAddress?: string}}>('luna://com.webos.service.connectionmanager/getStatus', {}, 4000).then(
		(r) => {
			const wired = r.wired || {};
			const wifi = r.wifi || {};
			const pick = wired.state === 'connected' && wired.ipAddress ? wired.ipAddress : wifi.state === 'connected' && wifi.ipAddress ? wifi.ipAddress : wired.ipAddress || wifi.ipAddress;
			return typeof pick === 'string' && /^[0-9.]{7,15}$/.test(pick) && pick !== '0.0.0.0' ? pick : undefined;
		},
		() => undefined
	);
}

/** The Homebrew Channel's version, asked through the same shell the app list uses (only called once root works). */
export function readHomebrewVersion (): Promise<string | undefined> {
	return exec("luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{\"id\":\"org.webosbrew.hbchannel\"}'", 5000).then(
		(out) => { try { return clean(((JSON.parse(out) as {appInfo?: {version?: string}}).appInfo || {}).version); } catch { return undefined; } },
		() => undefined
	);
}

function clean (value: unknown): string | undefined {
	return typeof value === 'string' && /^[A-Za-z0-9._ -]{1,40}$/.test(value.trim()) ? value.trim() : undefined;
}

/** Why root is not available, in a few words. */
export function rootNote (kind: Failure | null): string {
	switch (kind) {
		case 'denied': return tt('about.theTvRefusedTheCommand');
		case 'no-service': return tt('about.homebrewChannelServiceNotFound');
		case 'timeout': return tt('about.theHomebrewChannelDidNot');
		case 'not-webos': return tt('about.notRunningOnATv');
		default: return tt('about.theCommandFailed');
	}
}

export function aboutText (v: Versions, root: RootState, kind: Failure | null, hearth: string = HEARTH_VERSION): string {
	const parts = [`Hearth ${hearth}`];
	if (v.webos) parts.push(`webOS ${v.webos}`);
	if (v.firmware) parts.push(`firmware ${v.firmware}`);
	if (v.homebrew) parts.push(`Homebrew ${v.homebrew}`);
	if (v.ip) parts.push(`IP: ${v.ip}`);
	parts.push(root === 'yes' ? 'Root: yes' : root === 'no' ? `Root: not available (${rootNote(kind)})` : 'Root: checking…');
	return parts.join('  ·  ');
}

