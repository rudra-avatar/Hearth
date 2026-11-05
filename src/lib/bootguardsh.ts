// Boot guard, part S3b (2.0.3): the shell side. Commands that put the start-up script and the marker on the TV, take
// them off again, read the marker, and tell the script that Hearth reached its screen. Legacy bundle (webOS 3) only;
// nothing here runs until S3c wires the rows. The script itself: src/bootguard/guard.sh (tests: scripts/test-bootguard.sh).

import {APP_ID} from '../config/constants';
import {t as tt} from '../i18n';
import {writeFileCommands, type InstallStep} from './homehookcmd';
import {GUARD_DIR, GUARD_FILE, parseGuard, serializeGuard, type GuardState} from './bootguardcmd';

export const GUARD_LINK = '/var/lib/webosbrew/init.d/44-launcher-bootguard';
export const GUARD_SCRIPT = GUARD_DIR + '/guard.sh';
/** The parameters the TV's input manager needs to delete the Hearth input: the same text the add call sends (tvinput.ts). */
export const INPUT_PARAMS_FILE = GUARD_DIR + '/input.json';
export const GUARD_LOG = '/tmp/launcher-bootguard.log';
/** The boot trace (S3d), on storage that survives a hang; two files of at most 60 KB. Kept when the rows go off. */
export const BOOT_TRACE = GUARD_DIR + '/boot-trace.log';

const NEW = '.hearth-new';

/** Writes the script, the input parameters and the marker under temporary names, then moves them into place and adds
 *  the start-up link LAST (a half-written script never runs). Prints "finished". */
export function installSteps (guardSh: string, state: GuardState): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	const params = tt('tvinput.appidAppIdPigimageMvpdicon', {APP_ID});
	return [
		{name: 'create the folder', command: `mkdir -p '${GUARD_DIR}'`},
		...write('guard.sh', GUARD_SCRIPT + NEW, guardSh),
		{name: 'make the script runnable', command: `chmod +x '${GUARD_SCRIPT}${NEW}'`},
		...write('input.json', INPUT_PARAMS_FILE, params),
		...write('the marker', GUARD_FILE + NEW, serializeGuard(state)),
		{name: 'move into place', command: [
			`mv -f '${GUARD_SCRIPT}${NEW}' '${GUARD_SCRIPT}'`,
			`mv -f '${GUARD_FILE}${NEW}' '${GUARD_FILE}'`,
			'sync',
			`ln -sf '${GUARD_SCRIPT}' '${GUARD_LINK}'`,
			'echo finished'
		].join(' && ')}
	];
}

/** Both rows are off: the link, the script and the marker go; the boot trace stays (so the cause of a hang can still be read). */
export const REMOVE_GUARD_COMMAND = `rm -f '${GUARD_LINK}' '${GUARD_SCRIPT}' '${GUARD_SCRIPT}${NEW}' '${INPUT_PARAMS_FILE}' '${GUARD_FILE}' '${GUARD_FILE}${NEW}' '${GUARD_FILE}.tmp'; sync; if [ -e '${GUARD_SCRIPT}' ] || [ -e '${GUARD_FILE}' ]; then echo kept; else echo removed; fi`;

/** The trace, newest boot last, for the Debug report and for sending to the developer. */
export const READ_TRACE_COMMAND = `cat '${BOOT_TRACE}.old' '${BOOT_TRACE}' 2>/dev/null; true`;

/** Writes a new marker (a row changed something on the TV). Written aside and moved, then flushed. */
export function writeMarkerCommands (state: GuardState): string[] {
	return [...writeFileCommands(GUARD_FILE + NEW, serializeGuard(state)), `mv -f '${GUARD_FILE}${NEW}' '${GUARD_FILE}'`, 'sync'];
}

/** Hearth reached its screen: the script sets the count back to 0 (it writes only when the count was not 0). */
export const REACHED_COMMAND = `[ -f '${GUARD_SCRIPT}' ] && sh '${GUARD_SCRIPT}' reached; true`;

export const READ_MARKER_COMMAND = `cat '${GUARD_FILE}' 2>/dev/null; true`;
export const readMarker = (output: string): GuardState => parseGuard(output);
