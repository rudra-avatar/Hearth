// "Reassign remote buttons": the button map, and the shell commands that put it on the TV. Pure
// string-building and data (no imports of the bundled files), so it can be tested on its own. See
// remap.ts for the part that runs them, and src/remap for the key filter and its apply script.
//
// How it works: the TV decides what a remote button does in a chain of small JavaScript "key filters"
// inside its window manager (surface-manager). That is where LG's Netflix and Prime Video buttons open
// their apps, for the IR remote and the Magic Remote alike. Hearth adds its own filter to the front of
// the chain, in the TV's config service and in memory only, and hands it the map. Buttons that are not
// in the map go on to the TV's own filters, so they behave exactly as before.

import {writeFileCommands, withStatus} from './homehookcmd';

/** Bump when keyfilter.js or apply.sh change: Hearth then rewrites the copy on the TV. */
export const REMAP_VERSION = '2';
export const REMAP_DIR = '/media/developer/launcher-remap';
export const REMAP_LINK = '/var/lib/webosbrew/init.d/47-launcher-remap';
export const REMAP_LOG = '/tmp/launcher-remap.log';
export const REMAP_CONFIG = 'tld.my.customlauncher.remap';

/** What a button does instead of the TV's own action. */
export type RemapAction =
	| {t: 'app'; id: string}
	| {t: 'mute'}
	| {t: 'none'};

export interface RemapConfig {
	/** the master switch: off gives every button back to the TV, but keeps the list for later */
	on: boolean;
	/** by button name (see BUTTONS; "#<code>" for a button without a name) */
	keys: Record<string, RemapAction>;
}

export const DEFAULT_REMAP: RemapConfig = {on: false, keys: {}};

export interface ButtonInfo {
	name: string;
	label: string;
	/** listed even before it has been pressed or reassigned (LG's partner buttons) */
	common?: boolean;
}

/** Buttons Hearth knows by name. The names are the TV's own (Qt key names in surface-manager). */
export const BUTTONS: ButtonInfo[] = [
	{name: 'Key_webOS_Netflix', label: 'Netflix', common: true},
	{name: 'Key_webOS_Amazon', label: 'Prime Video', common: true},
	{name: 'Key_webOS_Disneyplus', label: 'Disney+', common: true},
	{name: 'Key_webOS_RakutenTV', label: 'Rakuten TV / Movies', common: true},
	{name: 'Key_webOS_LGChannels', label: 'LG Channels', common: true},
	{name: 'Key_webOS_New', label: 'Partner button'},
	{name: 'Key_webOS_IVI', label: 'ivi'},
	{name: 'Key_webOS_Hotstar', label: 'Hotstar'},
	{name: 'Key_webOS_Globoplay', label: 'Globoplay'},
	{name: 'Key_webOS_Okko', label: 'Okko'},
	{name: 'Key_webOS_Kinopoisk', label: 'Kinopoisk'},
	{name: 'Key_webOS_Watchaplay', label: 'Watcha'},
	{name: 'Key_webOS_UNext', label: 'U-Next'},
	{name: 'Key_webOS_TVGuide', label: 'Guide'},
	{name: 'Key_webOS_InputTV', label: 'Live TV'},
	{name: 'Key_webOS_Red', label: 'Red'},
	{name: 'Key_webOS_Green', label: 'Green'},
	{name: 'Key_webOS_Yellow', label: 'Yellow'},
	{name: 'Key_webOS_Blue', label: 'Blue'},
	{name: 'Key_webOS_ScreenRemote', label: 'Screen remote (…)'},
	{name: 'Key_webOS_Voice', label: 'Microphone'},
	{name: 'Key_webOS_Settings', label: 'Settings'},
	{name: 'Key_webOS_InputSource', label: 'Input'},
	{name: 'Key_webOS_3DMode', label: '3D'},
	{name: 'Key_webOS_RecordList', label: 'Recordings'},
	{name: 'Key_webOS_LiveTVMenu', label: 'Live menu'},
	{name: 'Key_webOS_ProgramList', label: 'Channel list'},
	{name: 'Key_webOS_AspectRatio', label: 'Aspect ratio'},
	{name: 'Key_webOS_MagicLink', label: 'Magic Link'},
	{name: 'Key_webOS_LiveZoom', label: 'Live Zoom'}
];

/** One button, different key names on different remotes. The Rakuten TV / Movies button sends Key_webOS_USP on 2019
 *  remotes (the MR19 Magic Remote calls it KEY_MOVIES) and Key_webOS_RakutenTV on later ones. Hearth stores the name on
 *  the right, and the key filter treats the one on the left as the same button. */
export const ALIASES: Record<string, string> = {Key_webOS_USP: 'Key_webOS_RakutenTV'};

/** The name a button is stored under. */
export function canonicalButton (name: string): string {
	return ALIASES[name] || name;
}

const NAME_RE = /^(Key_webOS_[A-Za-z0-9]{1,30}|#[0-9]{1,10})$/;
const APP_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;

export function buttonLabel (name: string): string {
	name = canonicalButton(name);
	const known = BUTTONS.filter((b) => b.name === name)[0];
	if (known) return known.label;
	if (name.charAt(0) === '#') return `Button ${name.slice(1)}`;
	return name.replace(/^Key_webOS_/, '');
}

/** The buttons the list shows: the common partner buttons, then any other button that has a new job. */
export function listedButtons (remap: RemapConfig): string[] {
	const out = BUTTONS.filter((b) => b.common).map((b) => b.name);
	Object.keys(remap.keys).forEach((name) => { if (out.indexOf(name) === -1) out.push(name); });
	return out;
}

function cleanAction (value: unknown): RemapAction | null {
	if (!value || typeof value !== 'object') return null;
	const a = value as {t?: unknown; id?: unknown};
	if (a.t === 'app' && typeof a.id === 'string' && APP_ID_RE.test(a.id)) return {t: 'app', id: a.id};
	if (a.t === 'mute') return {t: 'mute'};
	if (a.t === 'none') return {t: 'none'};
	return null;
}

/** The saved map, with anything unknown or malformed left out. */
export function cleanRemap (value: unknown): RemapConfig {
	if (!value || typeof value !== 'object') return {on: false, keys: {}};
	const v = value as {on?: unknown; keys?: unknown};
	const keys: Record<string, RemapAction> = {};
	if (v.keys && typeof v.keys === 'object') {
		Object.keys(v.keys as object).forEach((name) => {
			const action = cleanAction((v.keys as Record<string, unknown>)[name]);
			// a button saved under another of its names is stored under the usual one (unless that one has a job already)
			if (NAME_RE.test(name) && action && !keys[canonicalButton(name)]) keys[canonicalButton(name)] = action;
		});
	}
	return {on: v.on === true, keys};
}

/** A copy of the map with `name` set to `action` (null: the TV's own action again). */
export function setButton (remap: RemapConfig, name: string, action: RemapAction | null): RemapConfig {
	name = canonicalButton(name);
	const keys: Record<string, RemapAction> = {};
	Object.keys(remap.keys).forEach((k) => { if (k !== name) keys[k] = remap.keys[k]; });
	if (action) keys[name] = action;
	return {on: remap.on, keys};
}

export function sameAction (a: RemapAction | null | undefined, b: RemapAction | null | undefined): boolean {
	if (!a || !b) return !a && !b;
	return a.t === b.t && (a.t !== 'app' || (b.t === 'app' && a.id === b.id));
}

/** What the key filter is handed (and what map.json holds). `capture`: Hearth is waiting for a button press. */
export function mapJson (remap: RemapConfig, capture = false): string {
	const clean = cleanRemap(remap);
	const out: {on: boolean; keys: Record<string, RemapAction>; capture?: number} = {on: clean.on, keys: clean.keys};
	if (capture) out.capture = 1;
	// app ids and button names are checked above, so the JSON holds no quote marks of the shell's kind;
	// this is a second guard for the single-quoted command below
	return JSON.stringify(out).replace(/'/g, '\\u0027');
}

export interface RemapFiles {
	keyfilterJs: string;
	applySh: string;
}

export interface InstallStep {
	name: string;
	command: string;
}

/** Writes the filter, the apply script and the map, adds the boot link, and puts the filter in place. */
export function remapInstallSteps (files: RemapFiles, remap: RemapConfig): InstallStep[] {
	const write = (name: string, path: string, text: string): InstallStep[] => {
		const commands = writeFileCommands(path, text);
		return commands.map((command, i) => ({name: commands.length > 1 ? `write ${name} (${i + 1}/${commands.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'create the folder', command: `mkdir -p '${REMAP_DIR}'`},
		{name: 'clear out older files', command: `rm -f '${REMAP_DIR}'/*.new; true`},
		...write('keyfilter.js', `${REMAP_DIR}/keyfilter.js.new`, files.keyfilterJs),
		...write('apply.sh', `${REMAP_DIR}/apply.sh.new`, files.applySh),
		...write('map.json', `${REMAP_DIR}/map.json.new`, mapJson(remap)),
		// written under temporary names and moved into place, so nothing is ever read half-written
		{name: 'put the files in place', command: ['keyfilter.js', 'apply.sh', 'map.json'].map((f) => `mv -f '${REMAP_DIR}/${f}.new' '${REMAP_DIR}/${f}'`).join(' && ')},
		{name: 'write the version', command: `echo '${REMAP_VERSION}' > '${REMAP_DIR}/version'`},
		{name: 'make the script runnable', command: `chmod +x '${REMAP_DIR}/apply.sh'`},
		{name: 'add the start-at-boot link', command: `ln -sf '${REMAP_DIR}/apply.sh' '${REMAP_LINK}'`},
		{name: 'reload the buttons', command: `sh '${REMAP_DIR}/apply.sh' reload`}
	];
}

/** Saves a changed map and hands it to the filter at once (the filter chain itself is not reloaded). */
export function saveMapCommand (remap: RemapConfig): string {
	return withStatus([...writeFileCommands(`${REMAP_DIR}/map.json.new`, mapJson(remap)), `mv -f '${REMAP_DIR}/map.json.new' '${REMAP_DIR}/map.json'`, `sh '${REMAP_DIR}/apply.sh' on`].join(' && '));
}

/** Tells the filter (in memory only) that Hearth is waiting for a button press, or not any more. */
export function captureCommand (capture: boolean): string {
	return withStatus(`sh '${REMAP_DIR}/apply.sh' ${capture ? 'capture' : 'nocapture'}`);
}

export const CHECK_COMMAND = withStatus(`if [ -f '${REMAP_DIR}/apply.sh' ]; then sh '${REMAP_DIR}/apply.sh' check; else echo files-missing; fi`);
export const VERSION_COMMAND = `cat '${REMAP_DIR}/version' 2>/dev/null; true`;
/** Takes the filter out, and deletes the files and the boot link. */
export const REMOVE_COMMAND = withStatus(`rm -f '${REMAP_LINK}'; if [ -f '${REMAP_DIR}/apply.sh' ]; then sh '${REMAP_DIR}/apply.sh' off; else echo removed; fi; rm -rf '${REMAP_DIR}'`);

export type RemapResult = 'applied' | 'removed' | 'launcher-missing' | 'files-missing' | 'failed';
const RESULTS: RemapResult[] = ['applied', 'removed', 'launcher-missing', 'files-missing'];

/** The apply script's result word in its output (the last one wins); anything else is a failure. */
export function parseRemapResult (output: string): RemapResult {
	const lines = output.split('\n').map((l) => l.trim()).filter((l) => (RESULTS as string[]).indexOf(l) !== -1);
	return lines.length ? (lines[lines.length - 1] as RemapResult) : 'failed';
}
