// Shell commands for "Custom Screen Saver" (experimental, rooted TVs). Pure string-building, so it can be
// tested on its own. See screensaver.ts for the part that runs them and src/screensaver for the script and the QML.
//
// How it works: a QML file of ours (a slideshow of the wallpaper photos) is bind-mounted over the QML file of the TV's own
// screen saver app. The TV starts its screen saver on its idle timer as usual and plays ours. Nothing is restarted.

import {lastLine, parseExit, withStatus, writeFileCommands, type InstallStep} from './homehookcmd';
import {t as tt} from '../i18n';

export {lastLine, parseExit, withStatus};

/** Bump when the script or the QML change: the launcher then rewrites the installed copy. */
export const SAVER_VERSION = '27';
export const SAVER_DIR = '/media/developer/launcher-screensaver';
export const SAVER_LINK = '/var/lib/webosbrew/init.d/49-launcher-screensaver';

export type SaverResult = 'applied' | 'launcher-missing' | 'files-missing' | 'unsupported' | 'no-target' | 'no-photos' | 'no-video' | 'not-taken' | 'off' | 'failed';
const RESULTS: SaverResult[] = ['applied', 'launcher-missing', 'files-missing', 'unsupported', 'no-target', 'no-photos', 'no-video', 'not-taken', 'off'];

export function parseSaverResult (output: string): SaverResult {
	const lines = output.split('\n').map((l) => l.trim()).filter((l) => (RESULTS as string[]).indexOf(l) !== -1);
	return lines.length ? (lines[lines.length - 1] as SaverResult) : 'failed';
}

/** What the script is told (written to its `settings` file). `source` is a folder or one picture; '' = the bundled photos. */
export interface SaverSettings {
	source: string;
	interval: number;
	shuffle: boolean;
	/** Dim: a black layer at 40% opacity over the picture (about 60% brightness) */
	dim: boolean;
	/** OLED care for a single item (picture, GIF or video): 1 on (a thin frame and a slow drift), 0 off */
	care: number;
	/** picture size: 1 fill the screen (cropped), 0 fit (whole picture) */
	fill: number;
	/** seconds of screen saver before the TV is switched off; 0 = never */
	powerOff: number;
	/** the folder's sub-folders are used too (all levels, no limit) */
	recursive: boolean;
	/** how dark Dim is, % (10-80) */
	dimLevel: number;
	/** Tests tab only (Q5): the care drift step in ms; left out of the file when not set */
	driftMs?: number;
	/** Tests tab only (Q6): draw the probe overlay; left out of the file when not set */
	overlay?: boolean;
}

const SAFE_PATH = /^[\x20-\x7e]+$/;

/** The settings file text. A path with anything but plain ASCII is left out (the script then uses the bundled photos). */
export function settingsText (s: SaverSettings): string {
	const source = s.source && SAFE_PATH.test(s.source) && s.source.indexOf("'") === -1 ? s.source : '';
	const interval = Math.max(5, Math.min(3600, Math.round(s.interval) || 60));
	return `source=${source}\ninterval=${interval}\nshuffle=${s.shuffle ? 1 : 0}\ndim=${s.dim ? 1 : 0}\ncare=${s.care === 0 ? 0 : 1}\nfill=${s.fill === 1 ? 1 : 0}\npoweroff=${Math.max(0, Math.min(86400, Math.round(s.powerOff) || 0))}\nrecursive=${s.recursive ? 1 : 0}\ndimlevel=${Math.max(10, Math.min(80, Math.round(s.dimLevel) || 40))}\n${s.driftMs ? `driftms=${Math.max(4000, Math.min(60000, Math.round(s.driftMs)))}\n` : ''}${s.overlay ? 'overlay=1\n' : ''}`;
}

export interface SaverFiles {
	screensaverSh: string;
	qml: string;
}

const SCRIPT = `${SAVER_DIR}/screensaver.sh`;

/** Writing the settings file: one command. */
export function settingsCommand (s: SaverSettings): string {
	return writeFileCommands(`${SAVER_DIR}/settings`, settingsText(s)).join('; ');
}

/** The install, in small steps; the last one mounts the QML. */
export function installSteps (files: SaverFiles, settings: SaverSettings): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'create the folder', command: `mkdir -p '${SAVER_DIR}'`},
		{name: 'clear out older files', command: `rm -f '${SAVER_DIR}'/*.new; true`},
		...write('screensaver.sh', `${SAVER_DIR}/screensaver.sh.new`, files.screensaverSh),
		...write('main.qml.template', `${SAVER_DIR}/main.qml.template.new`, files.qml),
		{name: 'put the files in place', command: `mv -f '${SAVER_DIR}/screensaver.sh.new' '${SCRIPT}' && mv -f '${SAVER_DIR}/main.qml.template.new' '${SAVER_DIR}/main.qml.template'`},
		{name: 'write the settings', command: settingsCommand(settings)},
		{name: 'write the version', command: `echo '${SAVER_VERSION}' > '${SAVER_DIR}/version'`},
		{name: 'make the script runnable', command: `chmod +x '${SCRIPT}'`},
		{name: 'put the screen saver in place', command: `sh '${SCRIPT}' on`}
	];
}

export const VERSION_COMMAND = `cat '${SAVER_DIR}/version' 2>/dev/null; true`;
/** New settings written and the QML rebuilt and mounted again, in one call. */
export function applyCommand (settings: SaverSettings): string {
	return withStatus(`if [ -f '${SCRIPT}' ]; then ${settingsCommand(settings)}; sh '${SCRIPT}' apply; else echo files-missing; fi`);
}
export const SHOW_COMMAND = withStatus(`if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' show; else echo files-missing; fi`);
export const STATUS_COMMAND = `if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' status; fi; true`;
/** Switches it off (LG's own screen saver is back) and deletes everything it added. */
export const REMOVE_COMMAND = `if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' off; else rm -f '${SAVER_LINK}'; fi; rm -rf '${SAVER_DIR}'; echo removed`;

export function parseShown (output: string): boolean {
	return /^shown$/m.test(output);
}

export function saverMessage (result: SaverResult, detail = ''): string {
	switch (result) {
		case 'applied': return tt('screensavercmd.onTheTvS');
		case 'launcher-missing': return tt('screensavercmd.hearthMustBeInstalled');
		case 'files-missing': return tt('screensavercmd.theFilesAreMissing');
		case 'unsupported': return tt('screensavercmd.thisTvHasNo');
		case 'no-video': return tt('screensavercmd.theBuiltInVideo');
		case 'not-taken': return tt('screensavercmd.theTvDidNot');
		case 'no-target': return tt('screensavercmd.couldNotFindThe');
		case 'no-photos': return tt('screensavercmd.noPhotosWereFound');
		case 'off': return tt('screensavercmd.itWasSwitchedOff');
		default: return tt('screensavercmd.couldnTSetThat', {detail: detail ? ': ' + detail : ''});
	}
}
