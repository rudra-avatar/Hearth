// Remote buttons through LG Input Hook (a separate Homebrew Channel app that remaps remote buttons).
// Hearth reads and writes Input Hook's own settings file, so that file is the one source of truth: what
// Settings shows is what the TV really does, also for a binding made by hand or in Input Hook's own app.
//
// Hearth manages only a few button codes: Home, and the four colour buttons. For those it adds or removes
// "launch" bindings; any other binding (other buttons, or a Replace / Execute / Disable on these) is kept.

import {exec} from './apps';
import {writeFileCommands} from './homehookcmd';
import {isWebOS} from './luna';

export type ColorKey = 'red' | 'green' | 'yellow' | 'blue';
export const COLOR_KEYS: readonly ColorKey[] = ['red', 'green', 'yellow', 'blue'];

export const KEYBINDS_PATH = '/home/root/.config/lginputhook/keybinds.json';
export const INPUT_HOOK_DIR = '/media/developer/apps/usr/palm/applications/org.webosbrew.inputhook';

/** Button codes as Input Hook sees them (Linux input codes). Home is LG's own code, seen on a webOS 6.5 Magic Remote;
 *  the colour buttons are the standard KEY_RED / KEY_GREEN / KEY_YELLOW / KEY_BLUE. */
export const HOME_CODE = '773';
export const COLOR_CODES: Record<ColorKey, string> = {red: '398', green: '399', yellow: '400', blue: '401'};

/** What the managed buttons do now. */
export interface RemoteState {
	/** Input Hook is installed */
	installed: boolean;
	/** Home opens Hearth */
	home: boolean;
	/** the app each colour button opens, or null */
	keys: Record<ColorKey, string | null>;
}

type Keybinds = Record<string, unknown>;

const APP_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function launchTarget (binding: unknown): string | null {
	const b = binding as {action?: unknown; id?: unknown} | null;
	return b && b.action === 'launch' && typeof b.id === 'string' && APP_ID_PATTERN.test(b.id) ? b.id : null;
}

/** Reads Input Hook's file (as text) into what the managed buttons do. */
export function readState (text: string, hearthId: string, installed = true): RemoteState {
	const binds = parseKeybinds(text);
	const keys = {} as Record<ColorKey, string | null>;
	for (const k of COLOR_KEYS) keys[k] = launchTarget(binds[COLOR_CODES[k]]);
	return {installed, home: launchTarget(binds[HOME_CODE]) === hearthId, keys};
}

export function parseKeybinds (text: string): Keybinds {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch { return {}; }
}

/** The file with the managed buttons set as `want`. Other bindings stay as they are; on a managed button,
 *  only a "launch" binding (the kind Hearth makes) is replaced or removed. */
export function mergeKeybinds (existing: Keybinds, want: {home: boolean; keys: Record<ColorKey, string | null>}, hearthId: string): Keybinds {
	const out: Keybinds = {...existing};
	const set = (code: string, appId: string | null) => {
		const current = out[code] as {action?: unknown} | undefined;
		const ours = !current || current.action === 'launch';
		if (!ours) return;                                         // the user's own Replace / Execute / Disable: leave it
		if (appId && APP_ID_PATTERN.test(appId)) out[code] = {action: 'launch', id: appId};
		else delete out[code];
	};
	set(HOME_CODE, want.home ? hearthId : null);
	for (const k of COLOR_KEYS) set(COLOR_CODES[k], want.keys[k]);
	return out;
}

const READ_COMMAND = `[ -d '${INPUT_HOOK_DIR}' ] || { echo HEARTH_NO_INPUTHOOK; exit 0; }; cat '${KEYBINDS_PATH}' 2>/dev/null || echo '{}'`;

/** What the managed buttons do now, or null when the TV can't be asked. */
export function getRemoteState (hearthId: string): Promise<RemoteState | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(READ_COMMAND, 6000).then((out) => (out.indexOf('HEARTH_NO_INPUTHOOK') !== -1
		? {installed: false, home: false, keys: {red: null, green: null, yellow: null, blue: null}}
		: readState(out, hearthId))).catch(() => null);
}

/** Sets the managed buttons. Re-reads the file first, so changes made elsewhere since are kept.
 *  Input Hook notices the file changed and uses it at once. */
export function setRemote (want: {home: boolean; keys: Record<ColorKey, string | null>}, hearthId: string): Promise<'ok' | 'missing' | 'failed'> {
	if (!isWebOS()) return Promise.resolve('failed');
	return exec(READ_COMMAND, 6000).then((out) => {
		if (out.indexOf('HEARTH_NO_INPUTHOOK') !== -1) return 'missing' as const;
		const text = JSON.stringify(mergeKeybinds(parseKeybinds(out), want, hearthId));
		const write = [`mkdir -p '${KEYBINDS_PATH.replace(/\/[^/]+$/, '')}'`].concat(writeFileCommands(KEYBINDS_PATH, text)).join(' && ');
		return exec(`${write} && echo HEARTH_WRITTEN`, 8000).then((res) => (res.indexOf('HEARTH_WRITTEN') !== -1 ? 'ok' as const : 'failed' as const));
	}).catch(() => 'failed' as const);
}
