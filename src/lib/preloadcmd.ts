// "LG preloaded apps" (rooted TVs): pure helpers, so they can be tested on their own. See preload.ts for the part that runs
// them and src/preload/preload.sh for the script on the TV.
//
// LG's preload manager keeps some apps loaded in the background. Its list is the configd value PRELOAD_KEY: one entry per
// app (id, isEnabled, requiredMemory, ...). Switching an app off writes the whole list back with that app's isEnabled false
// and tells the manager at once; the list as LG had it is kept so an app can go back to LG's own setting. The idea and the
// method are Glasshouse's (Rory Gallagher, MIT, server/lib/preload.js); the code is our own.

import {lastLine, withStatus, writeFileCommands} from './homehookcmd';
import {t as tt} from '../i18n';

export {lastLine, withStatus};

export const PRELOAD_VERSION = '3';
export const PRELOAD_KEY = 'com.webos.service.preloadmanager.supportAppList';
export const PRELOAD_DIR = '/media/developer/launcher-preload';
export const PRELOAD_SCRIPT = `${PRELOAD_DIR}/preload.sh`;
export const PRELOAD_LINK = '/var/lib/webosbrew/init.d/50-launcher-preload';

/** Entries the TV relies on, never offered: Home, the inputs and their guide, screen sharing, voice search, the web app container. */
export const ESSENTIAL = /^(com\.webos\.app\.(home|livetv|livemenu|hdmi\d*|miracast(-overlay)?|voice|container|inputcommon)|airplay)$/;

/** One entry of LG's list; only these fields are read, the rest is passed through unchanged. */
export interface LgEntry {
	id: string;
	isEnabled?: boolean;
	requiredMemory?: number;
	[field: string]: unknown;
}

/** What Hearth keeps on the TV: the ids switched off, and LG's list as it was before the first change (null: none yet). */
export interface PreloadState {
	off: string[];
	lg: LgEntry[] | null;
}

export interface PreloadApp {
	id: string;
	title: string;
	/** LG's requiredMemory: what the app takes once loaded (null: unknown) */
	memoryMb: number | null;
	off: boolean;
	loaded: boolean;
}

export interface PreloadRead {
	state: PreloadState;
	/** the list as the TV has it now (null: this TV has none) */
	list: LgEntry[] | null;
	/** ids of the apps loaded now */
	running: string[];
}

const MARK_LG = '@@lg';
const MARK_LIST = '@@list';
const MARK_RUNNING = '@@running';

/** One command that prints Hearth's files, LG's list now and the running apps, each after a marker line. */
export const READ_COMMAND = withStatus([
	`cat '${PRELOAD_DIR}/off.txt' 2>/dev/null`,
	`echo '${MARK_LG}'`,
	`cat '${PRELOAD_DIR}/lg.json' 2>/dev/null`,
	`echo`,
	`echo '${MARK_LIST}'`,
	`luna-send -n 1 luna://com.webos.service.config/getConfigs '{"configNames":["${PRELOAD_KEY}"]}' 2>/dev/null`,
	`echo`,
	`echo '${MARK_RUNNING}'`,
	`luna-send -n 1 luna://com.webos.applicationManager/running '{}' 2>/dev/null`
].join('; '));

/** The text between two markers (or to the end). */
function section (output: string, from: string, to: string | null): string {
	const start = output.indexOf(`\n${from}\n`);
	if (start === -1) return '';
	const body = output.slice(start + from.length + 2);
	const end = to ? body.indexOf(`\n${to}\n`) : -1;
	return end === -1 ? body : body.slice(0, end);
}

function parseJson (text: string): any {
	const at = text.indexOf('{');
	if (at === -1) return null;
	try { return JSON.parse(text.slice(at).replace(/\[exit \d+\]\s*$/, '')); } catch (e) { return null; }
}

function entriesOf (json: any): LgEntry[] | null {
	const list = json && json.configs ? json.configs[PRELOAD_KEY] : null;
	if (!Array.isArray(list)) return null;
	return list.filter((e: any) => e && typeof e === 'object' && typeof e.id === 'string');
}

export function validId (id: string): boolean {
	return /^[A-Za-z0-9._-]+$/.test(id);
}

/** Reads the output of READ_COMMAND. Never throws; a part that cannot be read is empty or null. */
export function parseRead (output: string): PreloadRead {
	const text = `\n${output.replace(/\r\n?/g, '\n')}`;
	const lgAt = text.indexOf(`\n${MARK_LG}\n`);
	const offText = lgAt === -1 ? '' : text.slice(0, lgAt);
	const off = offText.split('\n').map((l) => l.trim()).filter((l) => validId(l));
	const lg = entriesOf(parseJson(section(text, MARK_LG, MARK_LIST)));
	const list = entriesOf(parseJson(section(text, MARK_LIST, MARK_RUNNING)));
	const runJson = parseJson(section(text, MARK_RUNNING, null));
	const running: string[] = runJson && Array.isArray(runJson.running)
		? runJson.running.filter((a: any) => a && typeof a.id === 'string').map((a: any) => a.id as string)
		: [];
	return {state: {off, lg}, list, running};
}

/** The apps offered: in LG's list, installed (a title is known), not essential, and preloaded by LG (or switched off by us). */
export function offeredApps (read: PreloadRead, titles: Record<string, string>): PreloadApp[] {
	if (!read.list) return [];
	const lgById: Record<string, LgEntry> = {};
	(read.state.lg || read.list).forEach((e) => { lgById[e.id] = e; });
	const loaded: Record<string, boolean> = {};
	read.running.forEach((id) => { loaded[id] = true; });
	const apps: PreloadApp[] = [];
	read.list.forEach((e) => {
		if (ESSENTIAL.test(e.id) || !titles[e.id] || !validId(e.id)) return;
		const lg = lgById[e.id] || e;
		const off = read.state.off.indexOf(e.id) !== -1;
		if (lg.isEnabled === false && !off) return;       // LG itself does not preload it: nothing to switch off
		apps.push({id: e.id, title: titles[e.id], memoryMb: typeof e.requiredMemory === 'number' ? e.requiredMemory : null, off, loaded: !!loaded[e.id]});
	});
	apps.sort((a, b) => (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0));
	return apps;
}

/** What to write for one change; null when the app is not in the TV's list. */
export interface PreloadPlan {
	state: PreloadState;
	/** the setConfigs call for the new list (JSON text, ASCII) */
	want: string;
	/** the setConfigs call for LG's list, only on the first change */
	lg: string | null;
	/** the ids to tell the manager about, and how: enabled = back to LG's setting */
	ids: string[];
	enabled: boolean;
}

const ascii = (text: string): string => text.replace(/[\u0080-\uffff]/g, (c) => `\\u${`0000${c.charCodeAt(0).toString(16)}`.slice(-4)}`);
const call = (list: LgEntry[]): string => ascii(JSON.stringify({configs: {[PRELOAD_KEY]: list}}));
const copy = (e: LgEntry): LgEntry => ({...e});

/** Switch one app off (`off` true) or back to LG's own setting. The list written is the TV's current one, so apps a firmware update added stay. */
export function planChange (read: PreloadRead, id: string, off: boolean): PreloadPlan | null {
	if (!read.list || !validId(id) || ESSENTIAL.test(id) || !read.list.some((e) => e.id === id)) return null;
	const firstChange = !read.state.lg;
	const lgList = read.state.lg || read.list.map(copy);
	const names = read.state.off.filter((x) => x !== id);
	if (off) names.push(id);
	const lgEntry = lgList.filter((e) => e.id === id)[0];
	const enabled = off ? false : !(lgEntry && lgEntry.isEnabled === false);
	const want = read.list.map((e) => {
		const o = copy(e);
		if (names.indexOf(e.id) !== -1) o.isEnabled = false;
		else if (e.id === id) o.isEnabled = enabled;
		return o;
	});
	return {state: {off: names, lg: lgList}, want: call(want), lg: firstChange ? call(lgList) : null, ids: [id], enabled};
}

/** Every app back to LG's own setting (the files are kept until the script is told to restore). */
export function planReset (read: PreloadRead): PreloadPlan | null {
	if (!read.list || !read.state.off.length) return null;
	const lgList = read.state.lg || read.list;
	const want = read.list.map((e) => {
		const o = copy(e);
		if (read.state.off.indexOf(e.id) !== -1) {
			const lgEntry = lgList.filter((x) => x.id === e.id)[0];
			o.isEnabled = !(lgEntry && lgEntry.isEnabled === false);
		}
		return o;
	});
	return {state: {off: [], lg: lgList}, want: call(want), lg: null, ids: read.state.off.slice(), enabled: true};
}

export interface PreloadStep {
	name: string;
	command: string;
}

/** The script is written (and replaced) when the version on the TV is not ours. */
export function installSteps (scriptText: string): PreloadStep[] {
	const pieces = writeFileCommands(`${PRELOAD_SCRIPT}.new`, scriptText);
	return [
		{name: 'create the folder', command: `mkdir -p '${PRELOAD_DIR}'`},
		...pieces.map((command, i) => ({name: pieces.length > 1 ? `write the script (${i + 1}/${pieces.length})` : 'write the script', command})),
		{name: 'put the script in place', command: `mv -f '${PRELOAD_SCRIPT}.new' '${PRELOAD_SCRIPT}' && chmod +x '${PRELOAD_SCRIPT}' && echo '${PRELOAD_VERSION}' > '${PRELOAD_DIR}/version'`}
	];
}

export const VERSION_COMMAND = `cat '${PRELOAD_DIR}/version' 2>/dev/null; true`;

/** The steps for one plan: the new files, then the script's `set` (the last step, whose output holds the result). */
export function changeSteps (plan: PreloadPlan): PreloadStep[] {
	const file = (name: string, path: string, text: string): PreloadStep[] => {
		const pieces = writeFileCommands(path, text);
		return pieces.map((command, i) => ({name: pieces.length > 1 ? `write ${name} (${i + 1}/${pieces.length})` : `write ${name}`, command}));
	};
	return [
		{name: 'clear out older files', command: `rm -f '${PRELOAD_DIR}'/*.new; true`},
		...file('the list', `${PRELOAD_DIR}/want.json.new`, plan.want),
		...file('the switched-off apps', `${PRELOAD_DIR}/off.txt.new`, plan.state.off.length ? `${plan.state.off.join('\n')}\n` : ''),
		...(plan.lg ? file("LG's list", `${PRELOAD_DIR}/lg.json.new`, plan.lg) : []),
		{name: 'send the change', command: `sh '${PRELOAD_SCRIPT}' set ${plan.enabled ? 1 : 0} ${plan.ids.join(' ')}`}
	];
}

export type SetResult = 'ok' | 'failed' | 'badid' | 'nofiles';

export function parseSetResult (output: string): SetResult {
	const m = /result=(ok|failed|badid|nofiles)/.exec(output);
	return m ? (m[1] as SetResult) : 'failed';
}

/** At every start of Hearth while something is switched off: tell the manager again. A no-op when the script is not there. */
export const APPLY_COMMAND = `[ -f '${PRELOAD_SCRIPT}' ] && { sh '${PRELOAD_SCRIPT}' once || sh '${PRELOAD_SCRIPT}' apply; }; true`;   // once per TV start (P52); an older script on the TV has no `once` and just applies
/** LG's list back and everything of ours deleted. */
export const RESTORE_COMMAND = `[ -f '${PRELOAD_SCRIPT}' ] && sh '${PRELOAD_SCRIPT}' restore; true`;

export function preloadMessage (result: SetResult | 'unsupported' | 'unreachable', detail = ''): string {
	switch (result) {
		case 'ok': return tt('preloadcmd.done');
		case 'unsupported': return tt('preloadcmd.thisTvHasNo');
		case 'badid': return tt('preloadcmd.thatAppCannotBe');
		case 'nofiles': return tt('preloadcmd.theFilesCouldNot', {detail: detail ? ': ' + detail : ''});
		case 'unreachable': return tt('preloadcmd.couldNotReachThe', {detail: detail ? ': ' + detail : ''});
		default: return tt('preloadcmd.theTvDidNot');
	}
}
