// "Block LG update pop-up" (2.1.5): one On/Off switch (System > TV start). Pure (no bundled-file imports), so it can be
// tested on its own; the part that runs it is noupdate.ts. On a restart a start-up script puts an empty file over LG's
// updater (/usr/sbin/update), so it cannot run and cannot ask for an update. The script runs about 40 s after the
// start, so the pop-up may still show briefly before it is hidden.

import {writeFileCommands, type InstallStep} from './homehookcmd';

export const NOUPDATE_DIR = '/media/developer/launcher-noupdate';
export const NOUPDATE_LINK = '/var/lib/webosbrew/init.d/52-launcher-noupdate';
export const NOUPDATE_TARGET = '/usr/sbin/update';

/** The start-up script (no dot in its name; the link lives in the Homebrew Channel's init.d folder). Safe to run again. */
export const NOUPDATE_SCRIPT = `#!/bin/sh
# Hearth: Block LG update pop-up. Puts an empty file over LG's updater so it cannot run. The mount is gone after a
# restart, so this script (linked in /var/lib/webosbrew/init.d) puts it back at every start.
[ -e ${NOUPDATE_TARGET} ] || exit 0
grep -q " ${NOUPDATE_TARGET} " /proc/mounts || mount --bind /dev/null ${NOUPDATE_TARGET}
pkill -x update 2>/dev/null
exit 0
`;

/** Writes the script, links it for every start and runs it once now. The last step prints result=ok when the updater is covered. */
export function installSteps (script: string = NOUPDATE_SCRIPT): InstallStep[] {
	const file = `${NOUPDATE_DIR}/noupdate.sh`;
	const write = writeFileCommands(file, script);
	return [
		{name: 'create the folder', command: `mkdir -p '${NOUPDATE_DIR}'`},
		...write.map((command, i) => ({name: write.length > 1 ? `write noupdate.sh (${i + 1}/${write.length})` : 'write noupdate.sh', command})),
		{name: 'make the script runnable', command: `chmod +x '${file}'`},
		{name: 'link it for every start', command: `ln -sf '${file}' '${NOUPDATE_LINK}'`},
		{name: 'turn it on', command: `sh '${file}'; if grep -q " ${NOUPDATE_TARGET} " /proc/mounts; then echo result=ok; else echo result=failed; fi`}
	];
}

/** Off: takes the empty file away (so Software update works again at once), then the link and the folder. */
export const REMOVE_COMMAND = `grep -q " ${NOUPDATE_TARGET} " /proc/mounts && umount '${NOUPDATE_TARGET}' 2>/dev/null; rm -f '${NOUPDATE_LINK}'; rm -rf '${NOUPDATE_DIR}'; if grep -q " ${NOUPDATE_TARGET} " /proc/mounts; then echo result=failed; else echo result=off; fi`;

/** Read-only: is it linked, is the updater covered now, does this TV have the updater file at all. */
export const STATUS_COMMAND = `if [ -L '${NOUPDATE_LINK}' ]; then echo -n 'linked=yes '; else echo -n 'linked=no '; fi; if grep -q " ${NOUPDATE_TARGET} " /proc/mounts; then echo -n 'covered=yes '; else echo -n 'covered=no '; fi; if [ -e '${NOUPDATE_TARGET}' ]; then echo present=yes; else echo present=no; fi`;

export interface NoUpdateStatus {linked: boolean; covered: boolean; present: boolean}

/** The status line as flags; null when the text is not an answer (nothing is greyed on a guess). */
export function parseStatus (text: unknown): NoUpdateStatus | null {
	const s = typeof text === 'string' ? text : (text && typeof (text as {stdout?: unknown}).stdout === 'string' ? (text as {stdout: string}).stdout : '');
	const linked = /linked=(yes|no)/.exec(s);
	const covered = /covered=(yes|no)/.exec(s);
	const present = /present=(yes|no)/.exec(s);
	if (!linked || !covered || !present) return null;
	return {linked: linked[1] === 'yes', covered: covered[1] === 'yes', present: present[1] === 'yes'};
}

/** The row's switch: on while it is linked for the next start (the pop-up stays hidden after restarts). */
export function noUpdateIsOn (status: NoUpdateStatus | null | undefined): boolean {
	return !!status && status.linked;
}
