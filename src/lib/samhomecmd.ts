// Shell commands for "Replace LG Home with SAM" (2.0.3 R3; experimental). Pure string-building (no imports of the
// bundled files), so it can be tested on its own. See samhome.ts for the part that runs them and src/takeover for the
// scripts. The method: a small black stand-in app is mounted over LG Home's own folder and the TV's app manager (SAM)
// reads it, so the TV opens Hearth through LG Home's own place. Old name inside the files: "takeover".

import {lastLine, parseExit, withStatus, writeFileCommands, type InstallStep} from './homehookcmd';

export {lastLine, parseExit, withStatus};

/** Bump when takeover.sh or shim.html change: the launcher then rewrites the installed copies. */
export const SAM_VERSION = '10';
export const SAM_DIR = '/media/developer/launcher-takeover';
export const SAM_LINK = '/var/lib/webosbrew/init.d/47-launcher-takeover';
export const SAM_SCRIPT = `${SAM_DIR}/takeover.sh`;
export const SAM_ALLOW = `${SAM_DIR}/allow-restart`;

export type SamResult = 'applied' | 'launcher-missing' | 'files-missing' | 'needs-restart' | 'sam-refused' | 'busy' | 'failed';
const RESULTS: SamResult[] = ['applied', 'launcher-missing', 'files-missing', 'needs-restart', 'sam-refused', 'busy'];

/** What is in place on the TV right now (the words `takeover.sh status` prints). */
export interface SamStatus {
	enabled: boolean;
	mounted: boolean;
	/** SAM reports the stand-in as LG Home */
	web: boolean;
	linked: boolean;
	watching: boolean;
	/** taking the place needed a restart of SAM, so putting LG Home back needs one too */
	restartUsed: boolean;
}

/** The last result word in the script's output; anything else is a failure. */
export function parseSamResult (output: string): SamResult {
	const found = output.split('\n').map((l) => l.trim()).filter((l) => (RESULTS as string[]).indexOf(l) !== -1);
	return found.length ? (found[found.length - 1] as SamResult) : 'failed';
}

export function parseSamStatus (output: string): SamStatus {
	const has = (word: string): boolean => new RegExp('^' + word + '$', 'm').test(output);
	return {enabled: has('enabled'), mounted: has('mounted'), web: has('web'), linked: has('linked'), watching: has('watching'), restartUsed: has('restart-used')};
}

/** True when the method is switched on (flag file) or its start-at-boot link is there: the helper must stay off then. */
export function samIsOn (status: SamStatus | null | undefined): boolean {
	return !!status && (status.enabled || status.linked);
}

export interface SamFiles {
	takeoverSh: string;
	shimHtml: string;
}

/** The install, one small step at a time (one piece of a file per call), so a failure says which step it was.
 *  Nothing is switched on here; `ON_COMMAND` does that. The restart permission file is written only here, by a
 *  deliberate choice in the pop-up (it is what lets the script restart SAM where nothing gentler exists). */
export function samInstallSteps (files: SamFiles): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'create the folder', command: `mkdir -p '${SAM_DIR}'`},
		{name: 'clear out older files', command: `rm -f '${SAM_DIR}'/*.new; true`},
		...write('takeover.sh', `${SAM_DIR}/takeover.sh.new`, files.takeoverSh),
		...write('shim.html', `${SAM_DIR}/shim.html.new`, files.shimHtml),
		{name: 'put the files in place', command: `mv -f '${SAM_DIR}/takeover.sh.new' '${SAM_SCRIPT}' && mv -f '${SAM_DIR}/shim.html.new' '${SAM_DIR}/shim.html'`},
		{name: 'write the version', command: `echo '${SAM_VERSION}' > '${SAM_DIR}/version'`},
		{name: 'make the script runnable', command: `chmod +x '${SAM_SCRIPT}'`},
		{name: 'allow restarting SAM', command: `: > '${SAM_ALLOW}'`}
	];
}

/** Rewrites only the two files (an update of Hearth): nothing is switched on or off, SAM is not touched. */
export function samRewriteSteps (files: SamFiles): InstallStep[] {
	return samInstallSteps(files).filter((s) => s.name !== 'allow restarting SAM');
}

/** Switches it on: mounts the stand-in, makes SAM read it (can take 15-40 s, restarts SAM where nothing gentler exists). */
export const SAM_ON_COMMAND = withStatus(`if [ -f '${SAM_SCRIPT}' ]; then sh '${SAM_SCRIPT}' on; else echo files-missing; fi`);
/** If it is switched on, makes sure it is in place (cheap when it is). Prints a result word, or `off`. */
export const SAM_APPLY_COMMAND = withStatus(`if [ -f '${SAM_SCRIPT}' ]; then sh '${SAM_SCRIPT}' apply; else echo files-missing; fi`);
/** LG's own Home is wanted now (the LG Home tile): put it back, and take the place again once it is left. */
export const SAM_STOCK_COMMAND = `[ -f '${SAM_SCRIPT}' ] && sh '${SAM_SCRIPT}' stock; true`;
export const SAM_STATUS_COMMAND = `[ -f '${SAM_SCRIPT}' ] && sh '${SAM_SCRIPT}' status; true`;
export const SAM_VERSION_COMMAND = `cat '${SAM_DIR}/version' 2>/dev/null; true`;
