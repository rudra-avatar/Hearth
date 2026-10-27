// Shell commands for "Replace LG Home with a script and SAM". Pure string-building, no imports of the bundled
// files, so it can be tested on its own. See takeover.ts for the part that runs them and src/takeover for the scripts.
//
// How it works: a small black "shim" app is bind-mounted over LG Home's own folder, so the TV's app manager reads it as
// LG Home. Everything that opens LG Home (Home, Back out of the last app, waking from standby) opens the shim, which
// opens Hearth. LG Home itself never starts. The mount lives in memory only: a reboot puts LG Home back, and a link in
// the startup folder does it again about 25 s into the start.

import {lastLine, parseExit, withStatus, writeFileCommands, type InstallStep} from './homehookcmd';

export {lastLine, parseExit, withStatus};

/** Bump when the scripts change: the launcher then rewrites the installed copy. */
export const TAKEOVER_VERSION = '9';
export const TAKEOVER_DIR = '/media/developer/launcher-takeover';
export const TAKEOVER_LINK = '/var/lib/webosbrew/init.d/47-launcher-takeover';
export const LG_HOME_DIR = '/usr/palm/applications/com.webos.app.home';

export type TakeoverResult = 'applied' | 'launcher-missing' | 'files-missing' | 'sam-refused' | 'needs-restart' | 'busy' | 'off' | 'failed';

const RESULTS: TakeoverResult[] = ['applied', 'launcher-missing', 'files-missing', 'sam-refused', 'needs-restart', 'busy', 'off'];

/** What is in place on the TV right now. */
export interface TakeoverStatus {
	/** it is switched on (the TV keeps it on at boot) */
	enabled: boolean;
	/** the shim is mounted over LG Home's folder */
	mounted: boolean;
	/** the TV's app manager reports the shim as LG Home */
	web: boolean;
	/** the start-at-boot link exists */
	linked: boolean;
	/** the user's permission to restart the TV's app manager is on the TV */
	restartAllowed: boolean;
	/** the takeover needed such a restart (so putting LG Home back needs one too) */
	restartUsed: boolean;
}

/** Looks for the script's result word in its output (the last one wins); anything else is a failure. */
export function parseTakeoverResult (output: string): TakeoverResult {
	const lines = output.split('\n').map((l) => l.trim()).filter((l) => (RESULTS as string[]).indexOf(l) !== -1);
	return lines.length ? (lines[lines.length - 1] as TakeoverResult) : 'failed';
}

export function parseTakeoverStatus (output: string): TakeoverStatus {
	const has = (word: string) => new RegExp(`^${word}$`, 'm').test(output);
	return {enabled: has('enabled'), mounted: has('mounted'), web: has('web'), linked: has('linked'), restartAllowed: has('restart-allowed'), restartUsed: has('restart-used')};
}

export interface TakeoverFiles {
	takeoverSh: string;
	shimHtml: string;
}

const SCRIPT = `${TAKEOVER_DIR}/takeover.sh`;

/** The install, in small steps (one piece of a file per call), so a failure says which step it was.
 *  The last step switches it on; it is the only one that can take long. */
export function installSteps (files: TakeoverFiles): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'create the folder', command: `mkdir -p '${TAKEOVER_DIR}'`},
		{name: 'clear out older files', command: `rm -f '${TAKEOVER_DIR}'/*.new; true`},
		...write('takeover.sh', `${TAKEOVER_DIR}/takeover.sh.new`, files.takeoverSh),
		...write('shim.html', `${TAKEOVER_DIR}/shim.html.new`, files.shimHtml),
		// under a temporary name and moved into place, so a script that is running is never overwritten half-way
		{name: 'put the files in place', command: `mv -f '${TAKEOVER_DIR}/takeover.sh.new' '${SCRIPT}' && mv -f '${TAKEOVER_DIR}/shim.html.new' '${TAKEOVER_DIR}/shim.html'`},
		{name: 'write the version', command: `echo '${TAKEOVER_VERSION}' > '${TAKEOVER_DIR}/version'`},
		{name: 'make the script runnable', command: `chmod +x '${SCRIPT}'`},
		// choosing this method is the permission to restart the TV's app manager (SAM), the only way on webOS 7
		{name: 'allow restarting SAM', command: `touch '${TAKEOVER_DIR}/allow-restart'`},
		{name: 'put Hearth in LG Home\'s place', command: `sh '${SCRIPT}' on`}
	];
}

/** The step that can take long (the TV is asked to read LG Home's manifest again): it gets a longer timeout. */
export const SLOW_STEP = 'put Hearth in LG Home\'s place';

// if/else, not `a && b || c`: the script exits non-zero when it refuses, and that must not also print the fallback
// The installed version is printed first, so one call does both: whether the copy on the TV is current, and the apply itself
// (which starts the watcher at once). The apply of an older copy is just as good for that.
export const APPLY_COMMAND = withStatus(`echo "version=$(cat '${TAKEOVER_DIR}/version' 2>/dev/null)"; if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' apply; else echo files-missing; fi`);

export function parseApplyOutput (output: string): {version: string; result: TakeoverResult} {
	const match = /^version=(.*)$/m.exec(output);
	return {version: match ? match[1].trim() : '', result: parseTakeoverResult(output)};
}
/** LG's own Home is wanted: the TV is given it back now, and Hearth takes the place again once LG Home has been left. */
export const STOCK_COMMAND = withStatus(`if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' stock; else echo stock; fi`);
/** What LG Home's place being given back is answered with: `stock` (done), or `unsupported` (it would take a second restart of sam). */
export type StockResult = 'stock' | 'unsupported' | 'failed';

export function parseStock (output: string): StockResult {
	if (/^unsupported$/m.test(output)) return 'unsupported';
	return /^stock$/m.test(output) ? 'stock' : 'failed';
}

export const STATUS_COMMAND = `if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' status; fi; true`;
/** Switches it off and deletes everything it added. The folder is only deleted once LG Home's folder is free of the mount
 *  (deleting the shim's files under a mount would leave the TV with nothing to read). */
export const REMOVE_COMMAND = `if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' off; else rm -f '${TAKEOVER_LINK}'; while grep -q ' ${LG_HOME_DIR} ' /proc/mounts; do umount '${LG_HOME_DIR}' || break; done; fi; if grep -q ' ${LG_HOME_DIR} ' /proc/mounts; then echo still-mounted; else rm -rf '${TAKEOVER_DIR}'; echo removed; fi`;

export function parseRemoved (output: string): boolean {
	return /^removed$/m.test(output) && !/^still-mounted$/m.test(output);
}

export function takeoverMessage (result: TakeoverResult, detail = ''): string {
	switch (result) {
		case 'applied': return 'On: Hearth now has LG Home\'s place. LG Home will not show';
		case 'launcher-missing': return 'Hearth must be installed to do this';
		case 'files-missing': return 'The files are missing, nothing was changed';
		case 'sam-refused': return 'This TV did not accept it (it would not read the replacement). LG Home was left as it was. Details: /tmp/launcher-takeover.log on the TV';
		case 'needs-restart': return 'This TV can only do it by restarting its app manager (SAM), which was not allowed. Nothing was changed';
		case 'busy': return 'The TV is busy with it already. Try again in a moment';
		case 'off': return 'It was switched off on the TV, so it is off here too';
		default: return `Couldn't set that up${detail ? ': ' + detail : ''}. LG Home was left as it was`;
	}
}
