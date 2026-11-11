// Probe tests 40-48 (Tests tab only, 2.1.6 Q4): can the bundled key hook (Input Hook) replace the second mapping method
// (the key filter of "Reassign remote buttons"), and which of Magic Mapper's actions can it do? The command text lives
// in probemappercmd.ts (tested on a fake TV). Tests 42 and 45 change the hook's keybinds file for a few minutes: the file
// is backed up first and put back by test 44 or, whatever the page does, by a detached job after MP_AUTO_S seconds.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {HOOK_CONFIG, readBinds, readStatus, writeBinds} from './homekey';
import {startEngine} from './homeengine';
import {isHomeCode, isProtected, keyLabel, validCode, type Keybinds} from './homekeycore';
import {RAW_READ_COMMAND, RAW_START_COMMAND, RAW_WINDOW_S, RAW_KEEP_S, parseRawKeys} from './rawkeyscmd';
import {
	MP_AUTO_S, MP_HITS, MP_MAX, MP_REC, MP_REPLACE_CODE, REC_TEXT, SCREEN_COMMAND, TOOLS_COMMAND,
	autoRestoreCommand, backupCommand, copyRecorders, hitsText, parseHits, parseRestored, parseTools, recScriptPath, restoreCommand,
	settingsCheckScript, uniqueCodes
} from './probemappercmd';
import {writeFileCommands} from './homehookcmd';
import type {ProbeResult, ProbeTest} from './probe';

const STORE = 'hearth-mapprobe-codes';
const clip = (text: string, n = 900): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});

function readCodes (): number[] {
	try {
		const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORE);
		const v = raw ? JSON.parse(raw) : null;
		return Array.isArray(v) ? v.filter(validCode) : [];
	} catch (e) {
		return [];
	}
}

function writeCodes (codes: number[]): void {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORE, JSON.stringify(codes));
	} catch (e) {
		// refused: test 42 then asks for tests 40 and 41 again
	}
}

/** Volume down/up, mute, channel up/down: they stay as they are so the TV stays usable while a test runs. */
const SOUND_CHANNEL = [113, 114, 115, 402, 403];

/** Why a button may not be bound in these tests, or ''. The arrows, OK, Back and power stay as they are; Home is the Home button's. */
function skipReason (code: number): string {
	if (isProtected(code)) return 'protected';
	if (isHomeCode(code)) return 'Home';
	if (SOUND_CHANNEL.indexOf(code) !== -1) return 'volume or channel';
	return '';
}

/** Backs the keybinds file up, starts the key engine when needed, writes `next`, checks it, and plans the automatic put-back. */
function armBinds (next: (binds: Keybinds) => {binds: Keybinds; codes: number[]}, afterWrite: (codes: number[]) => string): Promise<ProbeResult> {
	return readBinds().then((read): Promise<ProbeResult> => {
		if (!read.ok) return Promise.resolve({ok: false, text: 'FAILED: ' + read.why});
		const plan = next(read.binds);
		if (!plan.codes.length) return Promise.resolve({ok: false, text: 'NOTHING TO BIND: every button seen is protected, the Home button or already mapped (see test 41)'});
		return readStatus().then((s) => (s.injected && s.ready ? null : startEngine()))
			.then(() => exec(backupCommand(HOOK_CONFIG), 8000))
			.then(() => exec(autoRestoreCommand(HOOK_CONFIG), 8000))
			.then(() => writeBinds(plan.binds))
			.then((written): Promise<ProbeResult> => {
				if (!written.ok) return Promise.resolve({ok: false, text: 'FAILED: ' + written.text + ' Run test 44 to be sure the file is as before.'});
				return readBinds().then((again): ProbeResult => {
					const same = again.ok && plan.codes.every((c) => !!again.binds[String(c)]);
					return same ? {ok: true, text: clip(afterWrite(plan.codes))} : {ok: false, text: 'FAILED: the keybinds file did not read back as written. Run test 44 to put it back.'};
				});
			});
	}).catch(fail);
}

export const MAPPER_TESTS: ProbeTest[] = [
	{
		id: 'mapperlisten', manual: true, label: '40. Buttons: listen (45 s)',
		description: `Starts a ${RAW_WINDOW_S} s listening window. Press the buttons you want to test, each once (Netflix, Prime Video, Disney+, Rakuten, LG Channels, Guide, the colours, Settings, Input, microphone...). LG apps may open: come back to Hearth within ${RAW_WINDOW_S + RAW_KEEP_S} s and run test 41. Reads only. Needs a rooted TV.`,
		run: () => exec(RAW_START_COMMAND, 10000).then((out) => /readers:\s*\S/.test(out) ? {ok: true, text: `Listening for ${RAW_WINDOW_S} s on: ${clip(out.replace(/readers:/, '').trim(), 80)}. Press the buttons now, then run test 41 within ${RAW_WINDOW_S + RAW_KEEP_S} s.`} : {ok: false, text: 'FAILED: no key device could be read: ' + clip(out.trim(), 120)}, fail)
	},
	{
		id: 'mapperread', label: '41. Buttons: show what was pressed',
		description: 'Lists the buttons test 40 saw (key code and name) and keeps the usable ones for tests 42 and 45. Reads only. Needs a rooted TV.',
		run: () => exec(RAW_READ_COMMAND, 10000).then((out): ProbeResult => {
			const seen = parseRawKeys(out);
			if (!seen.length) return {ok: false, text: 'NO PRESSES FOUND: run test 40 again and press the buttons while it listens (the files are kept only 100 s)'};
			const usable = uniqueCodes(seen.map((k) => k.code).filter((c) => !skipReason(c)));
			writeCodes(usable);
			const skipped = seen.map((k) => k.code).filter((c) => skipReason(c));
			return {ok: usable.length > 0, text: clip(`Seen: ${seen.map((k) => keyLabel(k.code)).join(', ')}. Kept ${usable.length} for the tests${usable.length > MP_MAX ? ' (first ' + MP_MAX + ')' : ''}${skipped.length ? '; left out (protected or Home): ' + skipped.map(keyLabel).join(', ') : ''}.`)};
		}, fail)
	},
	{
		id: 'mapperarm', manual: true, label: `42. Hook: catch those buttons (${Math.round(MP_AUTO_S / 60)} min)`,
		description: `Gives each button from test 41 to the key hook (it only writes a note: button, time, app in front 3 s later). Press the same buttons now. After about ${Math.round(MP_AUTO_S / 60)} min, or at test 44, the buttons are given back. Then run test 43. Needs a rooted TV.`,
		run: () => {
			const codes = readCodes();
			if (!codes.length) return Promise.resolve({ok: false, text: 'NO BUTTONS: run tests 40 and 41 first'});
			const pieces = writeFileCommands(MP_REC, REC_TEXT);
			if (pieces.length !== 1) return Promise.resolve({ok: false, text: 'FAILED: the recorder script is too long'});
			return exec(pieces[0], 8000).then(() => exec(copyRecorders(codes), 8000)).then(() => armBinds((binds) => {
				const next: Keybinds = {};
				Object.keys(binds).forEach((k) => { next[k] = binds[k]; });
				const used: number[] = [];
				codes.forEach((c) => { if (!binds[String(c)]) { next[String(c)] = {action: 'exec', command: `sh ${recScriptPath(c)}`}; used.push(c); } });
				return {binds: next, codes: used};
			}, (used) => `Armed ${used.length} buttons: ${used.map(keyLabel).join(', ')}. Press them now, one at a time, 5 s apart. Buttons that already had a mapping were left alone. Given back by itself in about ${Math.round(MP_AUTO_S / 60)} min, or run test 44. Then run test 43.`));
		}
	},
	{
		id: 'mapperhits', label: '43. Hook: what it caught',
		description: 'Shows, for each button of test 42, how often the hook caught it and which app was in front 3 s after each press (a LG app there means the TV still did its own action). Reads only. Needs a rooted TV.',
		run: () => exec(`cat ${MP_HITS} 2>/dev/null`, 8000).then((out): ProbeResult => {
			const rows = parseHits(out);
			if (!rows.length) return {ok: false, text: 'NOTHING CAUGHT: no press was recorded. Either test 42 was not run, the buttons were not pressed, or the hook did not see them'};
			const armed = readCodes().filter((c) => !rows.some((r) => r.code === c));
			return {ok: true, text: clip(`${hitsText(rows, keyLabel)}.${armed.length ? ' Not caught: ' + armed.map(keyLabel).join(', ') + '.' : ''}`)};
		}, fail)
	},
	{
		id: 'mapperrestore', label: '44. Hook: give the buttons back now',
		description: 'Puts the key hook\'s button file back as it was before test 42 or 45 and deletes their notes. Safe to run at any time. Needs a rooted TV.',
		run: () => exec(restoreCommand(HOOK_CONFIG), 8000).then((out): ProbeResult => {
			const how = parseRestored(out);
			return how === 'file' ? {ok: true, text: 'Given back: the button file is as it was before the tests.'}
				: how === 'empty' ? {ok: true, text: 'Given back: there was no button file before, it is empty again.'}
				: how === 'nothing' ? {ok: true, text: 'Nothing to give back (no test had changed the file, or it was already given back).'}
				: {ok: false, text: 'FAILED: ' + clip(out.trim(), 160)};
		}, fail)
	},
	{
		id: 'mapperreplace', manual: true, label: '45. Hook: one button acts as another (2 min)',
		description: `The first button of test 41 acts as Volume up (code ${MP_REPLACE_CODE}). Press it: the volume should go up. Given back in about ${Math.round(MP_AUTO_S / 60)} min or at test 44. Press Volume down afterwards to undo. Needs a rooted TV.`,
		run: () => {
			const codes = readCodes();
			if (!codes.length) return Promise.resolve({ok: false, text: 'NO BUTTONS: run tests 40 and 41 first'});
			return armBinds((binds) => {
				const pick = codes.filter((c) => !binds[String(c)] && c !== MP_REPLACE_CODE)[0];
				if (pick === undefined) return {binds, codes: []};
				const next: Keybinds = {};
				Object.keys(binds).forEach((k) => { next[k] = binds[k]; });
				next[String(pick)] = {action: 'replace', keycode: MP_REPLACE_CODE};
				return {binds: next, codes: [pick]};
			}, (used) => `${keyLabel(used[0])} now sends ${keyLabel(MP_REPLACE_CODE)}. Press it: does the volume go up (one step per press)? Press Volume down to undo. Given back in about ${Math.round(MP_AUTO_S / 60)} min, or run test 44.`);
		}
	},
	{
		id: 'mappersettings', manual: true, label: '46. Magic Mapper actions: picture settings (writes the same value)',
		description: 'For energy saving, OLED light, tone mapping and eye comfort: reads the value from the TV and writes the same value back (nothing changes). Shows whether the TV allows both. The setting names are guesses. Needs a rooted TV.',
		run: () => exec(settingsCheckScript(), 40000).then((out): ProbeResult => {
			const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
			const ok = lines.some((l) => /returnValue":true/.test(l));
			return {ok, text: lines.length ? clip(lines.join('  |  ')) : 'NO ANSWER from the settings service'};
		}, fail)
	},
	{
		id: 'mappertools', label: '47. Magic Mapper actions: web hook, TCP, CEC, IR tools',
		description: 'Lists which tools a web hook or TCP action could use (curl, wget, nc) and whether the TV shows CEC or IR devices. Reads only. Needs a rooted TV.',
		run: () => exec(TOOLS_COMMAND, 8000).then((out): ProbeResult => {
			const t = parseTools(out);
			return {ok: t.have.length > 0, text: clip(`Found: ${t.have.join(', ') || 'none'}. Missing: ${t.missing.join(', ') || 'none'}. Devices: ${t.devices.join(', ') || 'none'}.`)};
		}, fail)
	},
	{
		id: 'mapperscreen', manual: true, label: '48. Magic Mapper actions: screen off for 6 s',
		description: 'Turns the screen off for 6 s, then on again (the method names are guesses). If it stays dark press any button. Shows what the TV answered. Needs a rooted TV.',
		run: () => exec(SCREEN_COMMAND, 20000).then((out): ProbeResult => ({ok: /off:[^|]*returnValue":true/.test(out), text: clip(out.trim() || 'NO ANSWER')}), fail)
	}
];
