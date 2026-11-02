// Add the launcher to the TV's inputs (like HDMI 1) or take it out again, through the TV's External Input Manager.
// 2.0.2 (D1, user): the add call is back as one toggle row; it only runs when the user presses it. Starting the TV on
// Hearth by another way is the power-on app (poweron.ts). The command runs in the Homebrew Channel's root shell.
// The removing call (deleteDevice) is not documented anywhere.

import {APP_ID} from '../config/constants';
import {exec} from './apps';
import {t as tt} from '../i18n';

export const TV_INPUT_LOG = '/tmp/launcher-input.log';
const EIM = 'luna://com.webos.service.eim';

function eimCommand (method: 'addDevice' | 'deleteDevice'): string {
	// pigImage must be present (the TV's input manager crashes without it) and mvpdIcon is needed on older webOS;
	// label and description are what the TV shows for the input. The app's appinfo.json must have "supportGIP": true.
	const params = tt('tvinput.appidAppIdPigimageMvpdicon', {APP_ID});
	return [
		'SEND=luna-send-pub',
		'command -v luna-send-pub >/dev/null 2>&1 || SEND=luna-send',          // the public bus tool, or the usual one
		`R=$($SEND -n 1 '${EIM}/${method}' '${params}' 2>&1)`,
		`echo "$(date +%H:%M:%S) ${method} $R" >> ${TV_INPUT_LOG}`,
		// for the log: does the TV's own input list now name the launcher? (0 = no)
		`echo "$(date +%H:%M:%S) listed in getAllInputStatus: $($SEND -n 1 '${EIM}/getAllInputStatus' '{}' 2>&1 | grep -c '${APP_ID}')" >> ${TV_INPUT_LOG}`,
		'echo "$R"'
	].join('; ');
}

export const addInputCommand = (): string => eimCommand('addDevice');
export const removeInputCommand = (): string => eimCommand('deleteDevice');

/** Did the TV's answer say it worked? (The real proof is the input showing up in the TV's input list.) */
export function replyOk (output: string): boolean {
	return /"returnValue"\s*:\s*true/.test(output);
}

export function addTvInput (): Promise<boolean> {
	return exec(addInputCommand(), 15000).then(replyOk);
}

export function removeTvInput (): Promise<boolean> {
	return exec(removeInputCommand(), 15000).then(replyOk);
}
