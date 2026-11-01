// "Keep Hearth ready" (experimental): one On/Off switch, its texts and the shell commands that install and read it. Pure (no
// imports of bundled files), so it can be tested on its own. The part that runs them is keepready.ts, the TV script is
// src/keepready/keepready.sh (see its header for what it does), the page side is keepalive.ts.

import {writeFileCommands, type InstallStep} from './homehookcmd';
import {t as tt} from '../i18n';

export const KEEP_DIR = '/media/developer/launcher-keepready';
export const KEEP_LINK = '/var/lib/webosbrew/init.d/51-launcher-keepready';
export const KEEP_LOG = '/tmp/hearth-keep.log';

/** Shown before the switch is turned on (P73). */
export const KEEP_WARNING = 'Hearth then stays in the TV\'s memory all the time, about 30-55 MB of the TV\'s RAM, so the TV may close other apps sooner or reload them more often. It also changes the TV\'s memory-manager list and restarts that service once at start-up (not permanent: Off or a restart of the TV undoes it). Experimental: turn it Off if the TV acts oddly.';

/** Writes the script and turns the switch on (the script's own `apply on` adds the start-up link and starts the watcher). */
export function installSteps (scriptSh: string, relaunch = false): InstallStep[] {
	const write = writeFileCommands(`${KEEP_DIR}/keepready.sh`, scriptSh);
	return [
		{name: 'create the folder', command: `mkdir -p '${KEEP_DIR}'`},
		...write.map((command, i) => ({name: write.length > 1 ? `write keepready.sh (${i + 1}/${write.length})` : 'write keepready.sh', command})),
		{name: 'make the script runnable', command: `chmod +x '${KEEP_DIR}/keepready.sh'`},
		{name: 'turn it on', command: `sh '${KEEP_DIR}/keepready.sh' apply on${relaunch ? ' relaunch' : ''}`}
	];
}

/** Off: the script removes the watcher, the memory-list change, the link and its folder. When the script is not on the TV, the files are removed directly. */
export const REMOVE_COMMAND = `if [ -f '${KEEP_DIR}/keepready.sh' ]; then sh '${KEEP_DIR}/keepready.sh' apply off; else rm -f '${KEEP_LINK}'; rm -rf '${KEEP_DIR}'; echo result=off; fi`;

export const STATUS_COMMAND = `if [ -f '${KEEP_DIR}/keepready.sh' ]; then sh '${KEEP_DIR}/keepready.sh' status; else echo 'on=no watcher=stopped linked=no memlist=no relaunch=no state=ok'; fi`;

/** K2: does this TV have a memory list that can be changed at all? Read-only; the same search as the script's `find_memfiles` (/etc/palm). */
export const LIST_COMMAND = `if [ -n "$(grep -rIil -e KeepOnLaunchEx /etc/palm 2>/dev/null | head -n 1)" ]; then echo keep-list=yes; else echo keep-list=no; fi`;

/** true: list found; false: no list on this TV; null: not an answer (nothing is greyed on a guess). */
export function parseListAnswer (text: unknown): boolean | null {
	if (typeof text !== 'string') return null;
	const m = /keep-list=(yes|no)/.exec(text);
	return m ? m[1] === 'yes' : null;
}

export interface KeepStatus {
	on: boolean;
	watcher: boolean;
	linked: boolean;
	memlist: boolean;
	relaunch: boolean;
	/** `working`, `ok` or a failure code of the script (see KEEP_PROBLEMS) */
	state: string;
}

/** P74: what the script's failure codes mean, in plain words (each follows "Keep Hearth ready is off again: "). */
const KEEP_PROBLEMS: {[code: string]: string} = {
	'no-list': "this TV's memory list was not found",
	'no-home-entry': "the TV's memory list has a layout Hearth does not know, nothing was changed",
	'bad-copy': "the changed memory list failed Hearth's own check, nothing was changed",
	'bad-json': "the changed memory list was not valid, nothing was changed",
	'mount-failed': 'the TV refused the changed memory list',
	'not-applied': 'the TV did not take the changed memory list, it was undone',
	'no-service': "the TV's memory manager service was not found, so the change would not be read",
	'restart-failed': 'the memory manager did not start again after the restart; if the TV acts oddly, restart the TV',
	'lost': 'the memory manager lost the change after restarting',
	'timeout': `the TV did not finish in time (see ${KEEP_LOG})`
};

/** Plain text for a script state; null for `ok` and `working`. An unknown code still reads as a problem. */
export function keepProblemText (state: string): string | null {
	if (state === 'ok' || state === 'working' || !state) return null;
	return KEEP_PROBLEMS[state] || tt('keepreadycmd.theTvReportedSee', {state, KEEP_LOG});
}

/** The script's `status` line; null when it is not one (an older script prints `level=`, so it reads as null and is replaced). */
export function parseStatus (text: unknown): KeepStatus | null {
	if (typeof text !== 'string') return null;
	const m = /on=(\w+)\s+watcher=(\w+)\s+linked=(\w+)\s+memlist=(\w+)\s+relaunch=(\w+)\s+state=([\w-]+)/.exec(text);
	if (!m) return null;
	return {on: m[1] === 'yes', watcher: m[2] === 'running', linked: m[3] === 'yes', memlist: m[4] === 'changed', relaunch: m[5] === 'yes', state: m[6]};
}

/** Does the TV's status match the saved switch? (When not, the start-up check applies it again.) */
export function statusMatches (status: KeepStatus | null, on: boolean, relaunch = false): boolean {
	if (!status) return false;
	if (!on) return !status.on && !status.linked;
	return status.on && status.linked && status.watcher && status.memlist && status.relaunch === relaunch;
}

export function keepMessage (on: boolean, ok: boolean, detail = ''): string {
	if (!ok) return tt('keepreadycmd.couldnTChangeThis', {detail: detail ? ': ' + detail : ''});
	return on ? tt('keepreadycmd.keepHearthReadyOn', {KEEP_LOG}) : tt('keepreadycmd.keepHearthReadyOff');
}
