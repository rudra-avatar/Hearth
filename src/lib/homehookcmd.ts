// Shell commands for "Open this launcher instead of LG Home". Pure string-building (no imports of
// the bundled files), so it can be tested on its own. See homehook.ts for the part that runs them.
//
// How it works: a small watcher script (src/homehook/watch.sh) runs in the background and, whenever
// the TV brings LG Home to the front (Home button, leaving an app with Back), opens the launcher.
// Nothing of LG Home is replaced or mounted. A link in the startup folder starts the watcher at boot
// (always added; the watcher is also started whenever the launcher opens).

/** Bump when the scripts change: the launcher then rewrites the installed copy and restarts the watcher. */
export const HOOK_VERSION = '10';
export const HOOK_DIR = '/media/developer/launcher-homehook';
export const HOOK_LINK = '/var/lib/webosbrew/init.d/48-launcher-homehook';
export const APP_QML = '/usr/palm/applications/com.webos.app.home/qml';
export const PID_FILE = '/tmp/launcher-homehook-watch.pid';
export const ALLOW_FILE = '/tmp/launcher-allow-stock-home';
export const ALIVE_FILE = '/tmp/launcher-alive';

export type HookResult = 'applied' | 'launcher-missing' | 'files-missing' | 'failed';

/** What is in place on the TV right now. */
export interface HookStatus {
	/** the watcher is running */
	running: boolean;
	/** the start-at-boot link exists */
	linked: boolean;
}

const RESULTS: HookResult[] = ['applied', 'launcher-missing', 'files-missing'];

/** Looks for the apply script's result word in its output (the last one wins); anything else is a failure. */
export function parseHookResult (output: string): HookResult {
	const lines = output.split('\n').map((l) => l.trim()).filter((l) => (RESULTS as string[]).indexOf(l) !== -1);
	return lines.length ? (lines[lines.length - 1] as HookResult) : 'failed';
}

/** Runs `command` so that its output (errors included) always comes back, with the exit code on the last line. */
export function withStatus (command: string): string {
	return `{ ${command}; } 2>&1; echo "[exit $?]"`;
}

/** The exit code from the last line of withStatus output, or null. */
export function parseExit (output: string): number | null {
	const match = /\[exit (\d+)\]\s*$/.exec(output);
	return match ? Number(match[1]) : null;
}

/** The last meaningful line of some output, for telling the user what went wrong. */
export function lastLine (output: string): string {
	const lines = output.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !/^\[exit \d+\]$/.test(l));
	return lines.length ? lines[lines.length - 1].slice(0, 140) : '';
}

/** Commands that write `text` (ASCII only) to `path`, carried as base64 so nothing needs quoting, in
 *  pieces of at most ~4000 characters (the first piece creates the file, the rest append). Each piece
 *  is a multiple of 4 base64 characters, so each decodes on its own. */
export function writeFileCommands (path: string, text: string): string[] {
	const encoded = btoa(text);
	const pieces: string[] = [];
	for (let i = 0; i < encoded.length; i += 4000) pieces.push(encoded.slice(i, i + 4000));
	if (!pieces.length) pieces.push('');
	return pieces.map((piece, n) => `echo '${piece}' | base64 -d ${n === 0 ? '>' : '>>'} '${path}'`);
}

export interface HookFiles {
	watchSh: string;
	applySh: string;
	stockSh: string;
	diagnoseSh: string;
}

export interface InstallStep {
	name: string;
	command: string;
}

// kill -9, not a polite stop: the watcher is busy listening and would only notice a polite stop much later.
// The pattern also catches a watcher whose pid file is lost; its leading [l] stops it matching this command itself.
const STOP_WATCHER = `pid="$(cat '${PID_FILE}' 2>/dev/null)"; if [ -n "$pid" ]; then pkill -P "$pid" 2>/dev/null; kill -9 "$pid" 2>/dev/null; fi; pkill -9 -f '[l]auncher-homehook/watch.sh' 2>/dev/null; rm -f '${PID_FILE}'; true`;

/** The install, in small steps (one piece of a file per call), so a failure says which step it was.
 *  The start-at-boot link is always added. The last step starts the watcher. */
export function installSteps (files: HookFiles): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'create the folder', command: `mkdir -p '${HOOK_DIR}'`},
		{name: 'clear out older files', command: `rm -rf '${HOOK_DIR}/overlay'; rm -f '${HOOK_DIR}'/*.new; true`},
		...write('watch.sh', `${HOOK_DIR}/watch.sh.new`, files.watchSh),
		...write('apply.sh', `${HOOK_DIR}/apply.sh.new`, files.applySh),
		...write('stock.sh', `${HOOK_DIR}/stock.sh.new`, files.stockSh),
		...write('diagnose.sh', `${HOOK_DIR}/diagnose.sh.new`, files.diagnoseSh),
		// written under a temporary name and moved into place, so a running script is never overwritten half-way
		{name: 'put the files in place', command: ['watch.sh', 'apply.sh', 'stock.sh', 'diagnose.sh'].map((f) => `mv -f '${HOOK_DIR}/${f}.new' '${HOOK_DIR}/${f}'`).join(' && ')},
		{name: 'write the version', command: `echo '${HOOK_VERSION}' > '${HOOK_DIR}/version'`},
		{name: 'make the scripts runnable', command: `chmod +x '${HOOK_DIR}/watch.sh' '${HOOK_DIR}/apply.sh' '${HOOK_DIR}/stock.sh' '${HOOK_DIR}/diagnose.sh'`},
		{name: 'add the start-at-boot link', command: `ln -sf '${HOOK_DIR}/apply.sh' '${HOOK_LINK}'`},
		{name: 'stop an older watcher', command: STOP_WATCHER},
		{name: 'start the watcher', command: `sh '${HOOK_DIR}/apply.sh'`}
	];
}

// if/else, not `a && b || c`: the apply script exits non-zero when it refuses, and that must not also print the fallback
export const APPLY_COMMAND = withStatus(`if [ -f '${HOOK_DIR}/apply.sh' ]; then sh '${HOOK_DIR}/apply.sh'; else echo files-missing; fi`);
/** LG's own Home is wanted: the watcher stands down until it is left again. */
export const STOCK_COMMAND = `[ -f '${HOOK_DIR}/stock.sh' ] && sh '${HOOK_DIR}/stock.sh'; echo stock`;
/** Stops the watcher and deletes everything the setting added (and any stand-in an earlier version mounted). */
export const REMOVE_COMMAND = `${STOP_WATCHER}; rm -f '${ALLOW_FILE}' '${ALIVE_FILE}' '${HOOK_LINK}'; while grep -q ' ${APP_QML} ' /proc/mounts; do umount '${APP_QML}' || break; done; rm -rf '${HOOK_DIR}'; echo removed`;
export const VERSION_COMMAND = `cat '${HOOK_DIR}/version' 2>/dev/null; true`;
export const STATUS_COMMAND = `if [ -f '${PID_FILE}' ] && kill -0 "$(cat '${PID_FILE}')" 2>/dev/null; then echo running; fi; if [ -L '${HOOK_LINK}' ]; then echo linked; fi; true`;

export function parseHookStatus (output: string): HookStatus {
	return {running: /^running$/m.test(output), linked: /^linked$/m.test(output)};
}
