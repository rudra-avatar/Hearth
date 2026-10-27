// "Set Hearth as the TV's Home app": Hearth's id goes into the TV's own Home app setting, so the Home button opens it
// directly. See homeappcmd.ts for how it works, and src/homeapp/README.md for the limits and how to undo it over SSH.
//
// The setting is read and changed through the Homebrew Channel's root shell: settingsservice answers an app's own Luna
// call for it with "Access denied" (webOS 4.5), so this needs a rooted TV.

import guardSh from '../homeapp/guard.sh?raw';
import {exec} from './apps';
import {APP_ID} from '../config/constants';
import {appExists} from './launch';
import {log} from './log';
import {isWebOS} from './luna';
import {LG_HOME_ID, homeSettingCommand} from './system';
import {
	FULL_HOME_ID, READ_PARAMS, REMOVE_GUARD_COMMAND, SAVED_COMMAND, SETTINGS_SERVICE, guardSteps, homeAppMessage, isAppId,
	parseHomeSetting, parseSaved, type HomeAppResult
} from './homeappcmd';

export type {HomeAppResult};
export {homeAppMessage};

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');     // plain line ends even from a Windows checkout
const READ_COMMAND = `luna-send -n 1 -f ${SETTINGS_SERVICE}/getSystemSettings '${JSON.stringify(READ_PARAMS)}'`;

/** The app the Home button opens: its id, '' when this TV has no such setting, null when it could not be read. */
export function readHomeApp (): Promise<string | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(READ_COMMAND, 6000).then(parseHomeSetting).catch(() => null);
}

/** Sets the Home app, and reads it back. Resolves true once the TV names it. */
function writeHomeApp (appId: string): Promise<boolean> {
	return exec(homeSettingCommand(appId), 6000)
		.then(() => readHomeApp())
		.then((now) => now === appId, () => false);
}

/** LG's own Home on this TV, for when the value from before is not known: the full-screen overlay on webOS 4.x, else LG Home. */
function stockHome (): Promise<string> {
	return appExists(FULL_HOME_ID).then((full) => (full ? FULL_HOME_ID : LG_HOME_ID));
}

/** The value a start-up check on the TV has kept, or ''. */
function savedOnTv (): Promise<string> {
	return exec(SAVED_COMMAND, 5000).then(parseSaved).catch(() => '');
}

/** The start-up check that puts `previous` back if Hearth is uninstalled (a failure is only logged: the method itself works). */
function installGuard (previous: string): Promise<void> {
	const steps = guardSteps(lf(guardSh), previous);
	const run = (i: number): Promise<void> => (i >= steps.length ? Promise.resolve()
		: exec(steps[i].command, 6000).then(() => run(i + 1)));
	return run(0).catch((error: Error) => {
		log(`Home app: the start-up check could not be written: ${error && error.message ? error.message : 'no answer'}`);
		exec(REMOVE_GUARD_COMMAND, 5000).catch(() => undefined);
	});
}

export interface HomeAppOutcome {
	result: HomeAppResult;
	/** applied: the app that was the Home app before; otherwise what went wrong */
	detail: string;
}

/** Makes Hearth the Home app. The app that was there before is the outcome's detail, to be kept for switching it off. */
export function setHearthAsHome (): Promise<HomeAppOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: 'not running on a TV'});
	return readHomeApp().then((current): HomeAppOutcome | Promise<HomeAppOutcome> => {
		if (current === '') return {result: 'unsupported', detail: ''};
		if (current === null) return {result: 'failed', detail: 'the TV did not answer'};
		// already Hearth (set by hand, or Hearth's settings were cleared): what was there before is not known here
		const before = current !== APP_ID ? Promise.resolve(current) : savedOnTv().then((saved) => saved || stockHome());
		return before.then((previous) => writeHomeApp(APP_ID).then((ok) => {
			if (!ok) return {result: 'refused', detail: ''} as HomeAppOutcome;
			log(`Home app: set to ${APP_ID} (was ${previous})`);
			return installGuard(previous).then((): HomeAppOutcome => ({result: 'applied', detail: previous}));
		}));
	});
}

/** Switches it off: the Home button gets `previous` back (or, when that is not known, LG's own Home). If the setting no
 *  longer names Hearth, it is left as it is. Either way the start-up check is removed. */
export function restoreHomeApp (previous: string): Promise<HomeAppOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: 'not running on a TV'});
	return readHomeApp().then((current): HomeAppOutcome | Promise<HomeAppOutcome> => {
		if (current === null) return {result: 'failed', detail: 'the TV did not answer'};
		const removeGuard = () => exec(REMOVE_GUARD_COMMAND, 5000).catch(() => '');
		if (current !== APP_ID) return removeGuard().then((): HomeAppOutcome => ({result: 'restored', detail: current}));
		const target = isAppId(previous) && previous !== APP_ID ? Promise.resolve(previous) : savedOnTv().then((saved) => saved || stockHome());
		return target.then((app) => writeHomeApp(app).then((ok): HomeAppOutcome | Promise<HomeAppOutcome> => {
			if (!ok) return {result: 'refused', detail: ''};
			log(`Home app: set back to ${app}`);
			return removeGuard().then((): HomeAppOutcome => ({result: 'restored', detail: app}));
		}));
	});
}
