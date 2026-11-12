// The "Tests" tab (probe builds only): finds out what this TV allows a web app to do, and writes each answer in plain
// words so a photo of the screen is enough. Every test only READS something (nothing is changed), runs only when
// started, and never at start-up.

import {APP_CATALOG} from '../config/catalog';
import {APP_ID, LUNA} from '../config/constants';
import {NOROOT_MOCK} from '../config/features';
import type {OptionItem} from '../components/OptionList';
import {classifyFailure} from './failure';
import {lunaCall} from './luna';
import {fetchText} from './weathernet';
import {forecastUrl} from './weather';
import {SSAP_TESTS} from './probessap';
import {KEY_TESTS} from './probekeys';
import {PERF_TESTS} from './probeperf';
import {MORE_TESTS} from './probemore';
import {STORAGE_TESTS} from './probestorage';
import {INSTALL_TESTS} from './probeinstall';
import {MAPPER_TESTS} from './probemapper';
import {SAVER_PROBE_TESTS} from './probesaver';
import {PLEX_TESTS} from './probeplex';

export interface ProbeResult {
	ok: boolean;
	text: string;
}

export interface ProbeTest {
	id: string;
	label: string;
	description: string;
	run: () => Promise<ProbeResult>;
	/** needs the user to act or runs for a long time: skipped by "Run all tests", started only on its own */
	manual?: boolean;
}

const T = 5000;
const clip = (text: string, n = 110): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const good = (text: string): ProbeResult => ({ok: true, text: clip('OK: ' + text, 230)});

export function bad (error: unknown): ProbeResult {
	const kind = classifyFailure(error);
	const message = String(error && (error as Error).message ? (error as Error).message : error || '');
	const name = kind === 'no-service' ? 'no such service' : kind === 'denied' ? 'denied' : kind === 'timeout' ? 'no answer' : kind === 'not-webos' ? 'not a TV' : 'error';
	return {ok: false, text: clip(`FAILED (${name}): ${message}`, 230)};
}

type Json = Record<string, unknown>;

/** "OK: 12 items, e.g. A, B, C" for a call that answers with a list. */
export function listText (items: unknown, titleOf: (item: Json) => string, what = 'items'): string {
	if (!Array.isArray(items)) return 'the TV answered, but gave no list';
	const names = items.slice(0, 4).map((i) => titleOf((i || {}) as Json)).filter(Boolean).join(', ');
	return `${items.length} ${what}${names ? ', e.g. ' + names : ''}`;
}

function call (uri: string, params: object = {}): Promise<Json> {
	return lunaCall<Json>(uri, params, T);
}

function listTest (id: string, label: string, description: string, uri: string, key: string, titleOf: (i: Json) => string, what: string): ProbeTest {
	return {
		id, label, description,
		run: () => call(uri, {}).then((r) => Array.isArray(r[key]) ? good(listText(r[key], titleOf, what)) : {ok: false, text: 'NO LIST: ' + listText(r[key], titleOf, what)}, bad)
	};
}

/** Is a picture at this address shown? ("blocked or missing" when not) */
function imageLoads (src: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const img = new Image();
		const timer = window.setTimeout(() => resolve(false), 3000);
		img.onload = () => { window.clearTimeout(timer); resolve(img.naturalWidth > 0); };
		img.onerror = () => { window.clearTimeout(timer); resolve(false); };
		img.src = src;
	});
}

const ICON_PATHS = [
	['browser', '/usr/palm/applications/com.webos.app.browser/icon.png'],
	['settings', '/usr/palm/applications/com.palm.app.settings/icon.png'],
	['home', '/usr/palm/applications/com.webos.app.home/icon.png']
];

const BASE_TESTS: ProbeTest[] = [
	{
		id: 'device', label: '1. This TV and its web view',
		description: 'Model, webOS version and web view (read from the TV\'s own information).',
		run: () => {
			const info: Json = (() => { try { const p = (window as unknown as {PalmSystem?: {deviceInfo?: string}}).PalmSystem; return p && p.deviceInfo ? JSON.parse(p.deviceInfo) as Json : {}; } catch { return {}; } })();
			const chrome = /Chrome\/([0-9.]+)/.exec(navigator.userAgent);
			const webos = /(?:Web0S|webOS)[^;)]*/i.exec(navigator.userAgent);
			const parts = [
				info.modelName ? String(info.modelName) : '',
				info.platformVersion ? 'webOS ' + info.platformVersion : (info.version ? 'ver ' + info.version : ''),
				info.sdkVersion ? 'sdk ' + info.sdkVersion : '',
				chrome ? 'Chrome ' + chrome[1] : '',
				window.innerWidth + 'x' + window.innerHeight,
				webos ? webos[0].trim() : ''
			].filter(Boolean);
			return Promise.resolve(good(parts.join(' · ') || 'no information available'));
		}
	},
	listTest('launchpoints', '2. List apps: listLaunchPoints', 'Asks the TV for every app on its home screen (what a rooted Hearth uses).',
		'luna://com.webos.applicationManager/listLaunchPoints', 'launchPoints', (i) => String(i.title || i.id || ''), 'apps'),
	listTest('listapps', '3. List apps: listApps', 'The older call for the list of installed apps.',
		'luna://com.webos.applicationManager/listApps', 'apps', (i) => String(i.title || i.id || ''), 'apps'),
	listTest('devlist', '4. List apps: dev/listApps', 'Only the apps installed through Developer Mode.',
		'luna://com.webos.applicationManager/dev/listApps', 'apps', (i) => String(i.title || i.id || ''), 'apps'),
	{
		id: 'appinfo', label: '2. Details of one app: getAppInfo',
		description: 'Asks for the title and icon file of LG Home and of Hearth itself.',
		run: () => Promise.all(['com.webos.app.home', APP_ID].map((id) => call('luna://com.webos.applicationManager/getAppInfo', {id}).then(
			(r) => { const a = (r.appInfo || {}) as Json; return `${id.split('.').pop()}: ${a.title || '?'} / icon ${a.icon ? 'given' : 'none'}`; },
			(e) => `${id.split('.').pop()}: ${bad(e).text.replace('FAILED ', '')}`
		))).then((lines) => ({ok: lines.every((l) => !/\(denied|\(no such|\(error|\(no answer|: \?/.test(l)), text: clip(lines.join(' | '), 230)}))
	},
	{
		id: 'loadstatus', label: '3. Is an app installed: getAppLoadStatus',
		description: 'Checks every app in Hearth\'s built-in list, plus one made-up ID that must NOT be found (to prove the answers are real).',
		run: () => {
			const ids = APP_CATALOG.map((a) => a.id);
			const check = (id: string) => call(LUNA.appLoadStatus, {appId: id}).then((r) => r.exist === true, () => null);
			const found: string[] = [];
			let errors = 0;
			const chunks: string[][] = [];
			for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8));
			return chunks.reduce((chain, chunk) => chain.then(() => Promise.all(chunk.map(check)).then((res) => res.forEach((r, i) => { if (r === true) found.push(chunk[i]); else if (r === null) errors++; }))), Promise.resolve())
				.then(() => check('zz.not.an.app.id')).then((fake) => {
					const names = found.slice(0, 6).map((id) => (APP_CATALOG.find((a) => a.id === id) || {title: id}).title).join(', ');
					const okay = errors < ids.length;
					return {ok: okay && fake !== true, text: clip(`${okay ? 'OK' : 'FAILED'}: ${found.length} of ${ids.length} known apps found${errors ? `, ${errors} checks failed` : ''}; made-up ID ${fake === false ? 'correctly not found' : fake === true ? 'WRONGLY found' : 'check failed'}. ${names}`, 230)};
				});
		}
	},
	{
		id: 'foreground', label: '4. Which app is in front: getForegroundAppInfo',
		description: 'Asks which app is on screen right now (it should say Hearth).',
		run: () => call('luna://com.webos.applicationManager/getForegroundAppInfo', {}).then((r) => good(`${r.appId || 'unknown'}`), bad)
	},
	{
		id: 'inputs', label: '5. TV inputs: getAllInputStatus',
		description: 'Reads the TV\'s input list (HDMI 1, 2 ...).',
		run: () => call(LUNA.inputStatus, {}).then((r) => good(listText(r.devices, (i) => String(i.label || i.appId || ''), 'inputs')), bad)
	},
	{
		id: 'sysinfo', label: '6. Firmware: getSystemInfo',
		description: 'The TV\'s model and firmware, from LG\'s system-property service.',
		run: () => call('luna://com.webos.service.tv.systemproperty/getSystemInfo', {keys: ['modelName', 'firmwareVersion', 'sdkVersion']}).then((r) => good(`${r.modelName || '?'} · firmware ${r.firmwareVersion || '?'} · sdk ${r.sdkVersion || '?'}`), bad)
	},
	{
		id: 'prefs', label: '7. TV settings: getPreferences',
		description: 'Reads the time format setting (used by the clock\'s "same as the TV").',
		run: () => call(LUNA.preferences, {keys: ['timeFormat']}).then((r) => good(`timeFormat = ${JSON.stringify((r as Json).timeFormat)}`), bad)
	},
	{
		id: 'settingsservice', label: '8. System settings: getSystemSettings',
		description: 'Tries to read a system setting through the settings service (needed for things like the LG logo switch).',
		run: () => call('luna://com.webos.settingsservice/getSystemSettings', {category: 'other', keys: ['lgLogoDisplay']}).then((r) => good(JSON.stringify(r.settings || r).slice(0, 100)), bad)
	},
	listTest('recent', '12. Recent apps: listRecents', 'The list behind LG\'s "recent apps" panel.',
		'luna://com.webos.service.recent/listRecents', 'recents', (i) => String(i.title || i.appId || i.id || ''), 'recent apps'),
	{
		id: 'network', label: '9. Network: connection status',
		description: 'Whether the TV says it is online.',
		run: () => call('luna://com.webos.service.connectionmanager/getStatus', {}).then((r) => good(`internet ${(r.isInternetConnectionAvailable as boolean) === true ? 'available' : String(r.isInternetConnectionAvailable)}; wired ${(r.wired as Json || {}).state || '-'}, wifi ${(r.wifi as Json || {}).state || '-'}`), bad)
	},
	{
		id: 'weather', label: '10. Weather download',
		description: 'Downloads a tiny forecast from Open-Meteo, as the weather line does (no Homebrew service).',
		run: () => fetchText(forecastUrl(28.61, 77.21), false).then((t) => good(`${t.length} bytes received`), bad)
	},
	{
		id: 'icons', label: '11. Reading app icon files',
		description: 'Can a web app show the picture files of apps stored on the TV? (Hearth\'s own icon is the control.)',
		run: () => Promise.all([imageLoads('icon.png')].concat(ICON_PATHS.map((p) => imageLoads('file://' + p[1])))).then((res) => {
			const names = ['Hearth\'s own'].concat(ICON_PATHS.map((p) => p[0]));
			const text = names.map((n, i) => `${n} ${res[i] ? 'shows' : 'blocked'}`).join(', ');
			return {ok: res.slice(1).some(Boolean), text: clip((res.slice(1).some(Boolean) ? 'OK: ' : 'NO: ') + text, 230)};
		})
	},
	{
		id: 'homebrew', label: '12. Homebrew Channel service',
		description: 'Does the TV answer the Homebrew Channel\'s shell service (this is what "rooted" means for Hearth)?',
		run: () => call(NOROOT_MOCK ? 'luna://mock.noroot.service/none' : LUNA.homebrewExec, {command: 'id -u'}).then((r) => good(`answered; this shell runs as user ${String(r.stdoutString || '?').trim()} (0 = root)`), bad)
	},
	{
		id: 'storage', label: '13. Saving settings',
		description: 'Can Hearth save and read back its settings in the TV\'s web storage?',
		run: () => {
			try { window.localStorage.setItem('hearth-probe', 'x'); const v = window.localStorage.getItem('hearth-probe'); window.localStorage.removeItem('hearth-probe'); return Promise.resolve(v === 'x' ? good('settings can be saved') : {ok: false, text: 'FAILED: wrote but could not read back'}); } catch (e) { return Promise.resolve(bad(e)); }
		}
	}
];

/** The number in a test's label ("21b. ..." -> 21, suffix "b"): the Tests tab lists tests in this order. */
function testOrder (t: ProbeTest): [number, string] {
	const m = /^(\d+)([a-z]?)\./.exec(t.label);
	return m ? [parseInt(m[1], 10), m[2]] : [9999, ''];
}

export const PROBE_TESTS: ProbeTest[] = BASE_TESTS.concat(SSAP_TESTS, KEY_TESTS, PERF_TESTS, MORE_TESTS, STORAGE_TESTS, INSTALL_TESTS, MAPPER_TESTS, SAVER_PROBE_TESTS, PLEX_TESTS)
	.map((t, i) => ({t, i, k: testOrder(t)}))
	.sort((a, b) => a.k[0] - b.k[0] || (a.k[1] < b.k[1] ? -1 : a.k[1] > b.k[1] ? 1 : 0) || a.i - b.i)
	.map((x) => x.t);

export type ProbeState = Record<string, {state: 'running' | 'done'; result?: ProbeResult}>;

export const RUN_ALL_ID = 'probe:all';

/** A test that never answers is given up after two minutes, so one stuck test can never hold the others. */
export function withLimit (t: ProbeTest, ms = 120000): Promise<ProbeResult> {
	return new Promise<ProbeResult>((resolve, reject) => {
		const timer = window.setTimeout(() => resolve({ok: false, text: 'FAILED: no answer within ' + Math.round(ms / 1000) + ' s, given up'}), ms);
		t.run().then((r) => { window.clearTimeout(timer); resolve(r); }, (e) => { window.clearTimeout(timer); reject(e); });
	});
}

/** Runs the tests one after another, reporting each as it ends. */
export function runAll (tests: ProbeTest[], onStart: (id: string) => void, onDone: (id: string, r: ProbeResult) => void): Promise<void> {
	return tests.filter((t) => !t.manual).reduce((chain, t) => chain.then(() => { onStart(t.id); return withLimit(t).then((r) => onDone(t.id, r), (e) => onDone(t.id, bad(e))); }), Promise.resolve());
}

/** One line per test for the summary row: "2 ✗  3 ✗  6 ✓ ..." */
export function summaryText (state: ProbeState): string {
	return PROBE_TESTS.map((t, i) => {
		const s = state[t.id];
		return `${i + 1}${!s ? '·' : s.state === 'running' ? '…' : s.result && s.result.ok ? '✓' : '✗'}`;
	}).join('  ');
}

/** The Tests tab's rows. A finished test writes its answer into its own description. */
export function probeOptions (state: ProbeState): OptionItem[] {
	const done = PROBE_TESTS.filter((t) => state[t.id] && state[t.id].state === 'done').length;
	const running = PROBE_TESTS.some((t) => state[t.id] && state[t.id].state === 'running');
	const rows: OptionItem[] = [{
		id: RUN_ALL_ID,
		label: 'Run all tests',
		description: `${running ? 'Running… ' : ''}${done ? `Done ${done} of ${PROBE_TESTS.length}. ` : 'Runs the tests that need no action (17, 18, 24, 27-29, 31, 33, 35, 36, 40, 42, 45, 46, 48, 49-52 and 60-63 are started one by one). Nothing is changed on the TV. '}✓ worked, ✗ did not: ${summaryText(state)}`,
		valueText: running ? 'Running' : done ? 'Run again' : 'Run'
	}];
	PROBE_TESTS.forEach((t) => {
		const s = state[t.id];
		rows.push({
			id: 'probe:' + t.id,
			label: t.label,
			description: s && s.state === 'done' && s.result ? s.result.text : s && s.state === 'running' ? 'Running…' : t.description,
			valueText: s && s.state === 'running' ? 'Running' : s && s.result ? (s.result.ok ? '✓' : '✗') : 'Run'
		});
	});
	return rows;
}
