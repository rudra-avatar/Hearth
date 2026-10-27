// "Set Hearth as the TV's Home app": the settings it reads and writes, and the shell commands for the start-up check.
// Pure (no imports of the bundled files), so it can be tested on its own. See homeapp.ts for the part that runs them,
// and src/homeapp/guard.sh for the start-up check.
//
// How it works: the Home button opens the app named in the TV's system setting general.defaultApps.home. On webOS 4.x
// that is LG's com.webos.app.fullhome, an overlay that never becomes the app in front, so neither the helper script nor
// the SAM method can see it. This method writes Hearth's id into the setting instead, and keeps the value it found so
// switching it off can put that back. Nothing runs in the background. It needs root: settingsservice refuses an app's
// own Luna call for this setting ("Access denied"). A small start-up check also puts the old value back if Hearth is
// uninstalled while the setting still names it.

import {writeFileCommands, type InstallStep} from './homehookcmd';

export const HOME_APP_DIR = '/media/developer/launcher-homeapp';
export const HOME_APP_LINK = '/var/lib/webosbrew/init.d/46-launcher-homeapp';
export const SETTINGS_SERVICE = 'luna://com.webos.settingsservice';
/** LG's Home on webOS 4.x: shown as an overlay, never the app in front. */
export const FULL_HOME_ID = 'com.webos.app.fullhome';

export const READ_PARAMS = {category: 'general', keys: ['defaultApps']};

const APP_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isAppId (value: unknown): value is string {
	return typeof value === 'string' && APP_ID_PATTERN.test(value);
}

/** The Home app out of a getSystemSettings reply: its id, '' when the TV answered but has no such setting, null when
 *  the reply is no answer at all. The reply can be luna-send's printed JSON or the parsed object. */
export function parseHomeSetting (reply: unknown): string | null {
	let data = reply;
	if (typeof data === 'string') {
		try { data = JSON.parse(data.trim()); }
		catch { return null; }
	}
	if (!data || typeof data !== 'object') return null;
	const r = data as {returnValue?: boolean; errorText?: string; settings?: {defaultApps?: {home?: unknown}}};
	const home = r.settings && r.settings.defaultApps ? r.settings.defaultApps.home : undefined;
	if (isAppId(home)) return home;
	if (r.returnValue === true) return '';
	return isMissing(r.errorText) ? '' : null;
}

/** What settingsservice says when the setting does not exist on this TV. */
export function isMissing (errorText: unknown): boolean {
	return typeof errorText === 'string' && /no matched result/i.test(errorText);
}

/** A friendly name for the app the Home button opens. */
export function homeName (appId: string): string {
	return appId === FULL_HOME_ID || appId === 'com.webos.app.home' ? 'LG Home' : appId;
}

export type HomeAppResult = 'applied' | 'restored' | 'unsupported' | 'refused' | 'failed';

export function homeAppMessage (result: HomeAppResult, detail = ''): string {
	switch (result) {
		case 'applied': return 'On: the Home button now opens Hearth';
		case 'restored': return `Turned off. The Home button opens ${detail ? homeName(detail) : 'LG Home'} again`;
		case 'unsupported': return 'This TV has no Home app setting, so this method does not work here. Use one of the other two';
		case 'refused': return `The TV did not accept the change${detail ? ': ' + detail : ''}. Nothing was changed`;
		default: return `Couldn't read the TV's Home app setting${detail ? ': ' + detail : ''}`;
	}
}

/** Writes the start-up check and the app to put back (rooted TVs). The link is added last, so a half-written check
 *  never runs. */
export function guardSteps (guardSh: string, previous: string): InstallStep[] {
	if (!isAppId(previous)) throw new Error('Invalid app id');
	const write = writeFileCommands(`${HOME_APP_DIR}/guard.sh`, guardSh);
	return [
		{name: 'create the folder', command: `mkdir -p '${HOME_APP_DIR}'`},
		...write.map((command, i) => ({name: write.length > 1 ? `write guard.sh (${i + 1}/${write.length})` : 'write guard.sh', command})),
		{name: 'save the previous Home app', command: `echo '${previous}' > '${HOME_APP_DIR}/previous'`},
		{name: 'make the check runnable', command: `chmod +x '${HOME_APP_DIR}/guard.sh'`},
		{name: 'add the start-up link', command: `ln -sf '${HOME_APP_DIR}/guard.sh' '${HOME_APP_LINK}'`}
	];
}

export const REMOVE_GUARD_COMMAND = `rm -f '${HOME_APP_LINK}'; rm -rf '${HOME_APP_DIR}'; echo removed`;
/** The app a start-up check would put back, if one is installed ('' when none). */
export const SAVED_COMMAND = `cat '${HOME_APP_DIR}/previous' 2>/dev/null; true`;

export function parseSaved (output: string): string {
	const value = output.trim().split('\n')[0] || '';
	return isAppId(value) ? value : '';
}
