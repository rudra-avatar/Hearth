// Probe tests 40-48 (Tests tab only, 2.1.6 Q4): can the bundled key hook (Input Hook) do what the second method
// ("Reassign remote buttons", the key filter in surface-manager) does, and how many of Magic Mapper's actions can it
// replicate? Pure string building and parsing (no TV access), so scripts/test-probemapper.mjs can run it on a fake TV.
// See probemapper.ts for the part that runs it.
//
// How the hook test works: Hearth asks the user to press buttons (test 40 lists the buttons the kernel saw, test 41 reads
// them), then binds a small recorder script to each of them in the hook's keybinds file (test 42, the file is backed up
// first and put back by test 44 or by itself after MP_AUTO_S seconds). A recorder notes that the hook ran it and, 3 s
// later, which app is in front: so the user's presses show (a) whether the hook saw the button, (b) whether LG's own
// action (Netflix opening, ...) still happened after the hook took it.

import {detached} from './fdclean';

export const MP_HITS = '/tmp/hearth-mapprobe.hits';
export const MP_ORIG = '/tmp/hearth-mapprobe.orig';
export const MP_NONE = '/tmp/hearth-mapprobe.none';
export const MP_REC = '/tmp/hearth-mapprobe-rec.sh';
/** The keybinds file is put back by itself this long after test 42 or 45 (seconds). */
export const MP_AUTO_S = 170;
/** At most this many buttons are bound in one test. */
export const MP_MAX = 24;
/** Test 45: the first button acts as this one (Linux key code 115 = volume up). */
export const MP_REPLACE_CODE = 115;

export const recScriptPath = (code: number): string => `/tmp/hearth-mapprobe-${code}.sh`;

/** The recorder (ASCII only). The button's code is in its own file name (hearth-mapprobe-<code>.sh). */
export const REC_TEXT = [
	'#!/bin/sh',
	'# Hearth test 42: the key hook ran this script for one button (its code is in this file name). Written by Hearth.',
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	'c=${0##*hearth-mapprobe-}; c=${c%.sh}',
	`echo "$(date +%H:%M:%S) $c hit" >> ${MP_HITS}`,
	`( sleep 3; a=$(luna-send -n 1 -w 3000 luna://com.webos.service.applicationmanager/getForegroundAppInfo '{}' 2>/dev/null </dev/null | tr -d '\\n' | grep -o '"appId":"[^"]*"' | head -n 1 | cut -d'"' -f4); echo "$(date +%H:%M:%S) $c front \${a:-unknown}" >> ${MP_HITS} ) >/dev/null 2>&1 </dev/null &`,
	''
].join('\n');

/** Copies the recorder once per button and empties the hits file. */
export function copyRecorders (codes: number[]): string {
	return `: > ${MP_HITS}; for c in ${codes.join(' ')}; do cp -f ${MP_REC} /tmp/hearth-mapprobe-$c.sh; done; echo copied`;
}

/** Keeps the keybinds file as it was (only the first time: a second arm never overwrites the backup). */
export function backupCommand (config: string): string {
	return `C='${config}'; if [ ! -f ${MP_ORIG} ] && [ ! -f ${MP_NONE} ]; then if [ -s "$C" ]; then cat "$C" > ${MP_ORIG}; else : > ${MP_NONE}; fi; fi; echo backed-up`;
}

/** Puts the keybinds file back (in place, the hook watches it) and deletes the test files; prints restored=file|empty|nothing. */
export function restoreCommand (config: string): string {
	return `C='${config}'; if [ -f ${MP_ORIG} ]; then cat ${MP_ORIG} > "$C"; echo restored=file; rm -f ${MP_ORIG}; elif [ -f ${MP_NONE} ]; then echo '{}' > "$C"; echo restored=empty; else echo restored=nothing; fi; rm -f ${MP_NONE} /tmp/hearth-mapprobe-*.sh`;
}

/** A detached job that puts everything back after MP_AUTO_S seconds, whatever the page does. */
export function autoRestoreCommand (config: string, seconds: number = MP_AUTO_S): string {
	return detached(`sh -c "sleep ${seconds}; ${restoreCommand(config).replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`);
}

export function parseRestored (out: string): 'file' | 'empty' | 'nothing' | 'unknown' {
	const m = /restored=(file|empty|nothing)/.exec(out);
	return m ? m[1] as 'file' | 'empty' | 'nothing' : 'unknown';
}

export interface HitRow {
	code: number;
	hits: number;
	/** the app in front 3 s after each press ('unknown' when it could not be read), in order */
	front: string[];
}

/** The recorder's lines as one row per button, in the order the buttons were first pressed. */
export function parseHits (text: string): HitRow[] {
	const rows: HitRow[] = [];
	const row = (code: number): HitRow => {
		for (let i = 0; i < rows.length; i++) if (rows[i].code === code) return rows[i];
		const made = {code, hits: 0, front: [] as string[]};
		rows.push(made);
		return made;
	};
	text.split('\n').forEach((line) => {
		const m = /^\S+\s+(\d{1,5})\s+(hit|front\s+(\S+))\s*$/.exec(line.trim());
		if (!m) return;
		const r = row(parseInt(m[1], 10));
		if (m[2] === 'hit') r.hits++; else r.front.push(m[3]);
	});
	return rows;
}

/** One short phrase per button: "1037 (NETFLIX): caught 2x, in front after: netflix". */
export function hitsText (rows: HitRow[], label: (code: number) => string): string {
	return rows.map((r) => `${label(r.code)}: caught ${r.hits}x${r.front.length ? ', in front after: ' + r.front.filter((f, i) => r.front.indexOf(f) === i).join('/') : ''}`).join('; ');
}

/** The buttons of test 40 as codes, from what the kernel saw (the protected, Home and unusable ones are left out by the caller). */
export function uniqueCodes (codes: number[], max: number = MP_MAX): number[] {
	const out: number[] = [];
	codes.forEach((c) => { if (out.indexOf(c) === -1 && out.length < max) out.push(c); });
	return out;
}

/** Test 46: the setting keys read and written back with the same value (names are GUESSES from Magic Mapper's action names). */
export const SETTING_KEYS = ['energySaving', 'backlight', 'dynamicToneMapping', 'eyeComfortMode'];

/** Reads each key from the TV's settings service and writes the same value back; one line per key. Changes nothing. */
export function settingsCheckScript (keys: string[] = SETTING_KEYS): string {
	return [
		'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
		'U=luna://com.webos.settingsservice',
		`for k in ${keys.join(' ')}; do`,
		'  r=$(luna-send -n 1 -w 5000 $U/getSystemSettings "{\\"category\\":\\"picture\\",\\"keys\\":[\\"$k\\"]}" 2>&1 </dev/null | tr -d "\\n")',
		'  v=$(printf "%s" "$r" | grep -o "\\"$k\\":[^,}]*" | head -n 1 | cut -d: -f2-)',
		'  if [ -z "$v" ]; then echo "$k: read failed: $(printf "%s" "$r" | cut -c1-60)"; continue; fi',
		'  w=$(luna-send -n 1 -w 5000 $U/setSystemSettings "{\\"category\\":\\"picture\\",\\"settings\\":{\\"$k\\":$v}}" 2>&1 </dev/null | tr -d "\\n" | grep -o "\\"returnValue\\":[a-z]*\\|\\"errorText\\":\\"[^\\"]*\\"" | head -n 2 | tr "\\n" " ")',
		'  echo "$k: read $v, same value written -> ${w:-no answer}"',
		'done'
	].join('\n');
}

/** Test 47: which tools a webhook / TCP action could use, and whether the TV has CEC or IR devices (read only). */
export const TOOLS_COMMAND = 'for c in curl wget nc ncat telnet; do p=$(command -v $c 2>/dev/null); echo "$c=${p:-no}"; done; ls /dev/cec* /dev/lirc* 2>/dev/null | head -n 4 | while read d; do echo "dev=$d"; done; true';

export function parseTools (out: string): {have: string[]; missing: string[]; devices: string[]} {
	const have: string[] = [];
	const missing: string[] = [];
	const devices: string[] = [];
	out.split('\n').forEach((line) => {
		const m = /^([a-z]+)=(\S+)$/.exec(line.trim());
		if (!m) return;
		if (m[1] === 'dev') devices.push(m[2]); else if (m[2] === 'no') missing.push(m[1]); else have.push(m[1]);
	});
	return {have, missing, devices};
}

/** Test 48: screen off for 6 s, then on again (the method names are GUESSES; the answers are shown). */
export const SCREEN_COMMAND = [
	'U=luna://com.webos.service.tvpower/power',
	'a=$(luna-send -n 1 -w 5000 $U/turnOffScreen \'{}\' 2>&1 </dev/null | tr -d "\\n" | cut -c1-80)',
	'sleep 6',
	'b=$(luna-send -n 1 -w 5000 $U/turnOnScreen \'{}\' 2>&1 </dev/null | tr -d "\\n" | cut -c1-80)',
	'echo "off: ${a:-no answer} | on: ${b:-no answer}"'
].join('; ');
