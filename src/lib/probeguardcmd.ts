// Probe tests 45-48 (Tests tab only, 2.0.3 L2 probe): facts for a boot guard on webOS 3.4 TVs, where starting on the
// Hearth input can hang the TV at the logo. The guard idea: at start-up, retry Hearth; if it fails, delete the Hearth
// input, show an OK pop-up, and ideally switch to another input. Open questions these tests answer on a real TV:
// 45 which input/power methods answer; 46 does a system pop-up show; 47 can another input be started; 48 does
// deleting the Hearth input (while on it) change the TV's last input. (Start-up scripts and their uptime: tests 39-41.)

import {APP_ID} from '../config/constants';

const SEND = "SEND=luna-send-pub; command -v luna-send-pub >/dev/null 2>&1 || SEND=luna-send";
const CUT = "tr -d '\\n' | cut -c1-150";

/** Every candidate method is called with {} and its answer is cut to 150 characters (read only). */
export const READ_METHODS = [
	'luna://com.webos.service.eim/getAllInputStatus',
	'luna://com.webos.service.eim/getLastInput',
	'luna://com.webos.service.eim/getCurrentInput',
	'luna://com.webos.service.tvpower/power/getPowerState'
];

export const FACTS_COMMAND = [
	SEND,
	'echo "up=$(cut -d\' \' -f1 /proc/uptime)"',
	'echo "starfish=$(head -n 1 /etc/starfish-release 2>/dev/null)"',
	'echo "hearth input listed: $($SEND -n 1 luna://com.webos.service.eim/getAllInputStatus \'{}\' 2>&1 | grep -c \'' + APP_ID + '\')"',
	...READ_METHODS.map((m) => `echo "${m.replace('luna://com.webos.service.', '')}: $($SEND -n 1 '${m}' '{}' 2>&1 | ${CUT})"`)
].join('; ');

const ALERT = JSON.stringify({sourceId: APP_ID, message: 'Hearth test pop-up. Press OK.', buttons: [{label: 'OK'}], isSysReq: true});
const TOAST = JSON.stringify({sourceId: APP_ID, message: 'Hearth test toast'});

/** Tries the alert; if refused, a plain toast; prints both answers. */
export const ALERT_COMMAND = [
	SEND,
	`echo "alert: $($SEND -n 1 luna://com.webos.notification/createAlert '${ALERT}' 2>&1 | ${CUT})"`,
	`echo "toast: $($SEND -n 1 luna://com.webos.notification/createToast '${TOAST}' 2>&1 | ${CUT})"`
].join('; ');

export const LAUNCH_IDS = ['com.webos.app.hdmi1', 'com.webos.app.livetv'];

/** Starts another input's app, waits 3 s, prints the app in front. The user returns with the Home button. */
export const launchCommand = (id: string): string => [
	SEND,
	`echo "launch ${id}: $($SEND -n 1 luna://com.webos.applicationManager/launch '{"id":"${id}"}' 2>&1 | ${CUT})"`,
	'sleep 3',
	`echo "in front: $($SEND -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>&1 | ${CUT})"`
].join('; ');

/** Last-input facts before and after deleting the Hearth input (the delete call is the app's own, tvinput.ts). */
export function deleteCommand (removeInputCommand: string): string {
	const read = (w: string): string => `echo "${w} last: $($SEND -n 1 luna://com.webos.service.eim/getLastInput '{}' 2>&1 | ${CUT}) | current: $($SEND -n 1 luna://com.webos.service.eim/getCurrentInput '{}' 2>&1 | ${CUT}) | listed: $($SEND -n 1 luna://com.webos.service.eim/getAllInputStatus '{}' 2>&1 | grep -c '${APP_ID}')"`;
	return [SEND, read('before'), `echo "delete: $(${removeInputCommand} | ${CUT})"`, 'sleep 2', read('after')].join('; ');
}

/** Output lines, trimmed, empty ones dropped. */
export const outLines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter(Boolean);

/** "true" / "false (reason)" / "no answer" for a luna reply line. */
export function replyKind (line: string): string {
	if (/"returnValue"\s*:\s*true/.test(line)) return 'true';
	const m = /"errorText"\s*:\s*"([^"]*)"/.exec(line);
	if (/"returnValue"\s*:\s*false/.test(line)) return 'false' + (m ? ' (' + m[1] + ')' : '');
	return line ? 'other: ' + line.slice(0, 60) : 'no answer';
}

/** Short verdict for test 46: which of alert and toast were accepted. */
export function alertVerdict (out: string): {ok: boolean; text: string} {
	const l = outLines(out);
	const a = replyKind((l.find((x) => x.indexOf('alert:') === 0) || '').slice(6).trim());
	const t = replyKind((l.find((x) => x.indexOf('toast:') === 0) || '').slice(6).trim());
	return {ok: a === 'true' || t === 'true', text: `alert ${a}; toast ${t}. Tell me what you saw on the screen (pop-up with OK, toast, nothing).`};
}
