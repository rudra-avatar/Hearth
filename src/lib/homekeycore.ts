// "Home button opens Hearth" (test build), the part that needs no TV: LG's Home button codes, the Input Hook keybinds
// file (what is in it, how to add and remove Hearth's entry without touching anyone else's), reading button codes out of
// Input Hook's log, and the two small things Hearth remembers (what it set, and where detecting started).
//
// Input Hook (org.webosbrew.inputhook) keeps its buttons in /home/root/.config/lginputhook/keybinds.json: an object keyed by
// the button's number, for example {"773": {"action": "launch", "id": "tld.my.customlauncher"}}. It watches the file, so a
// change applies at once. See homekey.ts for reading and writing it on the TV.

import {APP_ID} from '../config/constants';
import {isLgHomeCommand} from './lghomecmd';
import {t as tt} from '../i18n';

// ----- LG's Home button codes -----

export interface HomeCode {
	code: number;
	/** LG's own name for it (from the key table of the TV's network-input-service) */
	name: string;
}

/** The three Home codes in LG's key table, in the order they are offered: 773 first, because it is the code on the
 *  developer's TV. 774 (HOME_US) and 125 (HOME) are the other two. */
export const HOME_CODES: readonly HomeCode[] = [
	{code: 773, name: 'RF_HOME'},
	{code: 774, name: 'HOME_US'},
	{code: 125, name: 'HOME'}
];

/** Names of the buttons that are most likely to show up, so a detected number reads as a word. */
const KEY_NAMES: Record<number, string> = {
	2: 'NUM_1', 3: 'NUM_2', 4: 'NUM_3', 5: 'NUM_4', 6: 'NUM_5', 7: 'NUM_6', 8: 'NUM_7', 9: 'NUM_8', 10: 'NUM_9', 11: 'NUM_0',
	28: 'ENTER', 103: 'UP', 105: 'LEFT', 106: 'RIGHT', 108: 'DOWN',
	113: 'MUTE', 114: 'VOLUMEDOWN', 115: 'VOLUMEUP', 116: 'POWER', 119: 'PAUSE', 125: 'HOME', 128: 'STOP',
	139: 'MENU', 167: 'RECORD', 168: 'REWIND', 174: 'EXIT', 207: 'PLAY', 208: 'FASTFORWARD', 217: 'SEARCH', 241: 'TV_VIDEO (Input)',
	272: 'WHEEL_CLICK', 358: 'INFO', 362: 'GUIDE', 364: 'FAVORITES', 377: 'TV',
	398: 'RED', 399: 'GREEN', 400: 'YELLOW', 401: 'BLUE', 402: 'CHANNELUP', 403: 'CHANNELDOWN', 412: 'BACK', 428: 'RF_VOICE',
	773: 'RF_HOME', 774: 'HOME_US', 779: 'TELETEXT', 780: 'TEXTOPTION', 787: 'LIST', 793: 'QMENU', 821: '3D_MODE', 987: 'MYAPPS', 994: 'SCREEN_REMOTE', 1008: 'RECENT', 1020: 'E_GALLERY', 1026: 'MAGNIFIER_ZOOM',
	1037: 'NETFLIX', 1038: 'AMAZON', 1042: 'DISNEY+', 1086: 'ALEXA', 1117: 'GOOGLE_ASSISTANT'
};

/** LG's name for a button number, or '' when it is not one of the common ones. */
export function keyName (code: number): string {
	return KEY_NAMES[code] || '';
}

/** "773 (RF_HOME)" or just "1234". */
export function keyLabel (code: number): string {
	const name = keyName(code);
	return name ? `${code} (${name})` : String(code);
}

export function isHomeCode (code: number): boolean {
	return HOME_CODES.some((h) => h.code === code);
}

/** Buttons that must never be given to Hearth: the arrows, OK, Back and the wheel click move around Hearth itself, and
 *  Power is not something a Home button should be. Mapping one would make the remote hard to use. */
const PROTECTED_CODES = [103, 105, 106, 108, 28, 412, 272, 116];

export function isProtected (code: number): boolean {
	return PROTECTED_CODES.indexOf(code) !== -1;
}

export function validCode (code: unknown): code is number {
	return typeof code === 'number' && isFinite(code) && Math.floor(code) === code && code >= 0 && code <= 65535;
}

// ----- the keybinds file -----

export type Keybind =
	| {action: 'launch'; id: string}
	| {action: 'replace'; keycode: number}
	| {action: 'ignore'}
	| {action: 'exec'; command: string};

export type Keybinds = Record<string, Keybind>;

const APP_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isKeybind (value: unknown): value is Keybind {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.action === 'launch') return typeof v.id === 'string';
	if (v.action === 'replace') return validCode(v.keycode);
	if (v.action === 'ignore') return true;
	if (v.action === 'exec') return typeof v.command === 'string';
	return false;
}

/** The file's text as keybinds. null = it cannot be read: the caller must NOT write then (that would wipe the other
 *  buttons the user set up). An empty file is "no buttons". */
export function parseKeybinds (text: string): Keybinds | null {
	if (!text.replace(/\s+/g, '')) return {};
	try {
		const data = JSON.parse(text);
		return data && typeof data === 'object' && !Array.isArray(data) ? data as Keybinds : null;
	} catch (e) {
		return null;
	}
}

/** P71 (experimental): with "Keep Hearth ready" on, the button runs this small script (it launches Hearth WITH keepAlive,
 *  which the hook's own `launch` action cannot do). The script lives in the key engine's folder. */
export const OPEN_SCRIPT = '/media/developer/launcher-homekey/open.sh';
export const OPEN_COMMAND = `sh ${OPEN_SCRIPT}`;
export const OPEN_MARK = 'open-v2';
/** P70c: keepAlive is sent only when Hearth is not running. A relaunch of a kept page that carries launch parameters
 *  (keepAlive) made the TV load the page again on every Home press (P70b TV log); a plain launch of a kept page did not. */
export const OPEN_SCRIPT_TEXT = [
	'#!/bin/sh',
	`# ${OPEN_MARK}: Home button: open Hearth. keepAlive only when Hearth is not in memory (Hearth P70c, experimental). Written by Hearth.`,
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	'U=luna://com.webos.applicationManager',
	'R=$(luna-send -n 1 $U/running \'{}\' 2>/dev/null | tr -d \'\\n\')',
	`case "$R" in`,
	`\t*'"id":"${APP_ID}"'*)`,
	`\t\tluna-send -n 1 $U/launch '{"id":"${APP_ID}"}' >/dev/null 2>&1; form=plain ;;`,
	'\t*)',
	`\t\tluna-send -n 1 $U/launch '{"id":"${APP_ID}","keepAlive":true}' >/dev/null 2>&1 || luna-send -n 1 $U/launch '{"id":"${APP_ID}"}' >/dev/null 2>&1; form=keepAlive ;;`,
	'esac',
	`e=$(printf '%s' "$R" | grep -o '{[^{}]*"id":"${APP_ID}"[^{}]*}' | head -n 1 | grep -o '"processid":"[0-9]*"')`,
	'echo "$(date \'+%H:%M:%S\') up=$(cut -d. -f1 /proc/uptime)s keep: home key: asked for Hearth, $form launch (before: ${e:-not running})" >> /tmp/hearth-keep.log',
	''
].join('\n');

/** True for the entry Hearth writes: this button launches Hearth (plain launch, or the keepAlive script). */
export function isHearthBind (bind: Keybind | undefined | null): boolean {
	if (!bind) return false;
	if (bind.action === 'launch') return bind.id === APP_ID;
	return bind.action === 'exec' && bind.command === OPEN_COMMAND;
}

/** Z5: while a key mapper listens, the Home codes that nobody uses are bound to a tiny recorder (the way the removed Home-button probe did it): the press is
 *  taken by the key engine, so LG Home does not open and Hearth stays; the code is read back from a hits file. */
export const GUARD_MARK = 'hearth-hkguard';
/** 2.1.6 p20: app buttons (Netflix, Amazon, Disney+, Alexa, Assistant: 1037, 1038, 1042, 1086, 1117) are NOT bound to the recorder any more (p16 did; on the tester's TV the app still opened, so the press was not swallowed). *Add a button* reads the raw key devices and tells the user to come back to Hearth. The list stays for the user-facing check. */
export const APP_BUTTON_CODES = [1037, 1038, 1042, 1086, 1117];
export const GUARD_CODES = [773, 774, 125];
export const GUARD_HITS = '/tmp/hearth-hkguard.hits';
export const guardScriptPath = (code: number): string => `/tmp/${GUARD_MARK}-${code}.sh`;
export const guardScriptText = (code: number): string => `#!/bin/sh\necho ${code} >> ${GUARD_HITS}\n`;

export function isGuardBind (bind: Keybind | undefined | null): boolean {
	return !!bind && bind.action === 'exec' && bind.command.indexOf(GUARD_MARK) !== -1;
}

/** `binds` without the recorder entries (what the screens and the mapping code see). */
export function stripGuard (binds: Keybinds): Keybinds {
	const out: Keybinds = {};
	Object.keys(binds).forEach((k) => { if (!isGuardBind(binds[k])) out[k] = binds[k]; });
	return out;
}

/** The same buttons plus a recorder on every Home code that has no entry yet; `codes` says which were added. The input is not changed. */
export function addGuard (binds: Keybinds): {binds: Keybinds; codes: number[]} {
	const next: Keybinds = {};
	Object.keys(binds).forEach((k) => { next[k] = binds[k]; });
	const codes = GUARD_CODES.filter((c) => !next[String(c)]);
	codes.forEach((c) => { next[String(c)] = {action: 'exec', command: `sh ${guardScriptPath(c)}`}; });
	return {binds: next, codes};
}

/** The same buttons with `code` set to open `appId`. The input is not changed. */
export function bindLaunch (binds: Keybinds, code: number, appId: string = APP_ID, keep = false): Keybinds {
	if (!validCode(code)) throw new Error('bad button number');
	if (!APP_ID_PATTERN.test(appId)) throw new Error('bad app id');
	const next: Keybinds = {};
	Object.keys(binds).forEach((k) => { next[k] = binds[k]; });
	next[String(code)] = keep && appId === APP_ID ? {action: 'exec', command: OPEN_COMMAND} : {action: 'launch', id: appId};
	return next;
}

/** The same buttons without `code`; when `restore` is given, that goes back in its place. */
export function unbind (binds: Keybinds, code: number, restore?: Keybind | null): Keybinds {
	const next: Keybinds = {};
	Object.keys(binds).forEach((k) => { if (k !== String(code)) next[k] = binds[k]; });
	if (restore) next[String(code)] = restore;
	return next;
}

/** The buttons (numbers) that currently open Hearth. */
export function hearthCodes (binds: Keybinds): number[] {
	return Object.keys(binds).filter((k) => isHearthBind(binds[k])).map(Number).filter(validCode);
}

/** The file's text. ASCII only (the shell write goes through base64 of a plain string). */
export function serialize (binds: Keybinds): string {
	return JSON.stringify(binds).replace(/[\u0080-\uffff]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}

/** Two entries that do the same thing. */
export function sameBind (a: Keybind | undefined, b: Keybind | undefined): boolean {
	return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/** What a button does, in a few words. */
export function describeBind (bind: Keybind | undefined | null): string {
	if (!bind) return 'nothing';
	if (isHearthBind(bind)) return tt('homekeycore.opensHearth');
	if (bind.action === 'launch') return tt('homekeycore.opensId', {id: bind.id});
	if (bind.action === 'replace') return tt('homekeycore.actsAsButtonKeycode', {keycode: bind.keycode});
	if (bind.action === 'ignore') return tt('homekeycore.isSwitchedOff');
	if (isLgHomeCommand(bind.command)) return tt('homekeycore.opensLgHome');
	return tt('homekeycore.runsACommand');
}

// ----- reading button numbers from Input Hook's log -----

export interface DetectedKey {
	code: number;
	/** log lines that named it (a press usually writes more than one) */
	count: number;
}

/** The button numbers named in Input Hook's log text, each with how often, the one seen last at the end. The log writes
 *  "id => 773" for some remotes and "keyid=773, state=1 ..." for others. The lginput hook (webOS 3) writes
 *  "keyid=3, state=1 uinput_code=773": there keyid is only the slot in LG's key table, and the hook matches the keybinds
 *  file on uinput_code, so a line that has uinput_code is read by that alone. */
export function detectKeys (text: string): DetectedKey[] {
	const order: number[] = [];
	const counts: Record<number, number> = {};
	const pattern = /uinput_code=(\d+)|\bid\s*=>\s*(\d+)|keyid=(\d+)(?![^\n]*uinput_code=)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const code = Number(match[1] || match[2] || match[3]);
		if (!validCode(code)) continue;
		counts[code] = (counts[code] || 0) + 1;
		const at = order.indexOf(code);
		if (at !== -1) order.splice(at, 1);
		order.push(code);
	}
	return order.map((code) => ({code, count: counts[code]}));
}

/** What to offer from what was detected: LG's Home codes first (they are the likely ones), then the rest, newest
 *  first. Protected buttons are kept in the list (marked) so the user sees why they cannot be chosen. */
export function rankDetected (found: DetectedKey[]): DetectedKey[] {
	const homes: DetectedKey[] = [];
	HOME_CODES.forEach((h) => { found.forEach((f) => { if (f.code === h.code) homes.push(f); }); });
	const others = found.filter((f) => !isHomeCode(f.code) && !isProtected(f.code)).reverse();
	return homes.concat(others);
}

// ----- what Hearth remembers (localStorage) -----

const RECORD_KEY = 'customlauncher-homekey-v1';
const DETECT_KEY = 'customlauncher-homekey-detect-v1';

/** How long a start of detecting stays valid: a Home press can take the user out of Hearth, and what they pressed must
 *  still be there when they come back. */
export const DETECT_KEEP_MS = 30 * 60 * 1000;

/** What Hearth set: the button, and what that button did before (given back when the mapping is removed). */
export interface HomeKeyRecord {
	code: number;
	previous: Keybind | null;
}

function load (key: string): unknown {
	try {
		const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function save (key: string, value: unknown): void {
	try {
		if (typeof localStorage === 'undefined') return;
		if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
	} catch (e) {
		// storage full or refused: Hearth still works, it just forgets
	}
}

export function readRecord (): HomeKeyRecord | null {
	const v = load(RECORD_KEY) as {code?: unknown; previous?: unknown} | null;
	if (!v || !validCode(v.code)) return null;
	return {code: v.code, previous: isKeybind(v.previous) ? v.previous : null};
}

export function writeRecord (record: HomeKeyRecord | null): void {
	save(RECORD_KEY, record);
}

/** The button Hearth set, or 0. */
export function recordedCode (): number {
	const r = readRecord();
	return r ? r.code : 0;
}

// ----- K1: automatic mapping -----

/** What the automatic mapping did; the app shows it in a pop-up at once. */
export interface AutoResult {
	ok: boolean;
	code: number;
	/** the reason (failure only), already in the user's language */
	why: string;
}

export type AutoPick = {code: number; blockedBy?: undefined} | {code: number; blockedBy: Keybind};

/** The Home code (773, 774 or 125, in that order of LG's table) seen in the log that automatic mapping may use, or null
 *  when none was seen, Hearth already has a button, or the file is not known. A code another app already uses is
 *  returned with `blockedBy`: it is not overwritten without the user's yes. */
export function autoPick (found: DetectedKey[], binds: Keybinds | null): AutoPick | null {
	if (!binds || hearthCodes(binds).length) return null;
	const seen = rankDetected(found).filter((d) => isHomeCode(d.code) && !isProtected(d.code));
	if (!seen.length) return null;
	const code = seen[0].code;
	const existing = binds[String(code)];
	return existing && !isHearthBind(existing) ? {code, blockedBy: existing} : {code};
}

/** Where detecting started: how many lines each Input Hook log had at that moment. */
export interface DetectBaseline {
	at: number;
	files: Record<string, number>;
}

export const LOG_FILE_PATTERN = /^\/tmp\/lginput-hook-[A-Za-z0-9_.-]+\.log$/;

export function readBaseline (now: number = Date.now()): DetectBaseline | null {
	const v = load(DETECT_KEY) as {at?: unknown; files?: unknown} | null;
	if (!v || typeof v.at !== 'number' || now - v.at > DETECT_KEEP_MS || now < v.at - 60000) return null;
	if (!v.files || typeof v.files !== 'object') return null;
	const files: Record<string, number> = {};
	Object.keys(v.files as Record<string, unknown>).forEach((name) => {
		const n = (v.files as Record<string, unknown>)[name];
		if (LOG_FILE_PATTERN.test(name) && typeof n === 'number' && n >= 0 && Math.floor(n) === n) files[name] = n;
	});
	return {at: v.at, files};
}

export function writeBaseline (baseline: DetectBaseline | null): void {
	save(DETECT_KEY, baseline);
}
