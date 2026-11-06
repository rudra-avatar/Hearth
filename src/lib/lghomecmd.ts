// Opening LG's own Home screen from Hearth (tile and button job), the part that needs no TV: the small script and its names.
// Pure strings (no imports), so a shell test can run the script on a fake TV. See lghome.ts for the part that runs it.
//
// webOS 4 and later: LG Home is an app (com.webos.app.home); the script launches it.
// webOS 3: there is no such app, Home is an overlay of the window manager. The script then sends the Home key (773) to the key
// device the TV itself reads, the way a real Home press arrives; the key hook sits before that point, so a Home button mapped
// to Hearth does not catch it (reported on a 3.4.3 TV by James18232, issue #36; 2.1.3: the remote-named device comes first).

export const LGHOME_ID = 'com.webos.app.home';
export const LGHOME_DIR = '/media/developer/launcher-homekey';
export const LGHOME_SCRIPT = `${LGHOME_DIR}/lghome.sh`;
/** a hand-written device name (one line, e.g. event3) overrides the automatic choice */
export const LGHOME_DEVICE_FILE = `${LGHOME_DIR}/lghome.dev`;
export const LGHOME_MARK = 'lghome-v4';
/** Hearth's own app id and the launch parameter that asks it to learn the Home key (phase 3a: the button job has no screen of its own). */
export const LGHOME_HEARTH_ID = 'tld.my.customlauncher';
export const LGHOME_LEARN_PARAM = 'hearthLgHomeLearn';
export const LGHOME_LOG = '/tmp/hearth-lghome.log';
/** The command a remote button runs (key hook `exec` entry). */
export const LGHOME_COMMAND = `sh ${LGHOME_SCRIPT}`;
export const HOME_KEY = 773;

/** The script. Without an argument: launch LG Home, and when the TV refuses (no such app) send the Home key. With `inject`: only the key.
 *  Phase 3a: when the launch is refused and no `lghome.dev` exists, the script opens Hearth with the parameter `hearthLgHomeLearn` instead of
 *  guessing (`lghome=ok learn-prompt`); Hearth then asks for one real Home press and learns the device (the button job has no screen of its own).
 *  With `learn [seconds]`: listen for a real Home press (773) on the devices that can send it and store the device that heard it in
 *  `lghome.dev` (2.1.4, issue #36); prints `lghome=learned <device>` or `lghome=fail nothing heard`.
 *  Prints one line `lghome=ok launch|key <device>` or `lghome=fail <reason>` and logs it. HEARTH_PROC / HEARTH_DEVDIR / HEARTH_LOG /
 *  HEARTH_DEVFILE / HEARTH_SLEEP / HEARTH_TMP point it at a fake TV in tests.
 *  Key device: `lghome.dev` when it exists; otherwise the first device that can send 773, devices named like a remote FIRST (a 3.4.3 TV
 *  reads its remote from `LGE M-RCU - Builtin [0]`; another device listed before it took the key and did nothing). ONE key to ONE device
 *  per press (2.1.4: the 2.1.3 retry on the next device sent a second Home key, which closed LG Home again: `tried event1 event3`). */
export const LGHOME_SCRIPT_TEXT = [
	'#!/bin/sh',
	`# ${LGHOME_MARK}: open LG Home (launch; on webOS 3 send the Home key). Written by Hearth.`,
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	`LOG=\${HEARTH_LOG:-${LGHOME_LOG}}`,
	'PROC=${HEARTH_PROC:-/proc/bus/input/devices}',
	'DEVDIR=${HEARTH_DEVDIR:-/dev/input}',
	`DEVFILE=\${HEARTH_DEVFILE:-${LGHOME_DEVICE_FILE}}`,
	'SLP=${HEARTH_SLEEP:-sleep}',
	'TMP=${HEARTH_TMP:-/tmp/hearth-lghome-learn}',
	'say() { echo "$1"; echo "$(date \'+%H:%M:%S\') up=$(cut -d. -f1 /proc/uptime 2>/dev/null)s $1" >> "$LOG" 2>/dev/null; }',
	'if [ "$1" != inject ] && [ "$1" != learn ]; then',
	'\tU=luna://com.webos.applicationManager',
	`\tr=$(luna-send -n 1 -w 5000 $U/launch '{"id":"${LGHOME_ID}"}' 2>&1 </dev/null | tr -d '\\n')`,
	'\tcase "$r" in',
	'\t\t*\'"returnValue": true\'*|*\'"returnValue":true\'*) say "lghome=ok launch"; exit 0 ;;',
	'\tesac',
	// phase 3a: the TV refused LG Home (webOS 3) and no key device is known yet: open Hearth, which asks for one real Home press and learns it
	'\tif [ ! -s "$DEVFILE" ]; then',
	`\t\tr=$(luna-send -n 1 -w 5000 $U/launch '{"id":"${LGHOME_HEARTH_ID}","params":{"${LGHOME_LEARN_PARAM}":true}}' 2>&1 </dev/null | tr -d '\\n')`,
	'\t\tcase "$r" in',
	'\t\t\t*\'"returnValue": true\'*|*\'"returnValue":true\'*) say "lghome=ok learn-prompt"; exit 0 ;;',
	'\t\tesac',
	'\tfi',
	'fi',
	`dev=$(cat "$DEVFILE" 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9')`,
	'[ "$1" = learn ] && dev=',
	'bits=${HEARTH_BITS:-$(getconf LONG_BIT 2>/dev/null)}; [ "$bits" = 64 ] || bits=32',
	'list=$dev',
	'if [ -z "$dev" ]; then',
	`\tlist=$(awk -v W=$bits -v B=${HOME_KEY} '`,
	'\t\tfunction emit(  n, i, w, p, d, v) {',
	'\t\t\tif (h != "" && k != "") {',
	'\t\t\t\tn = split(k, a, " "); i = n - int(B / W)',
	'\t\t\t\tif (i >= 1) {',
	'\t\t\t\t\tw = a[i]; p = length(w) - int((B % W) / 4)',
	'\t\t\t\t\tif (p >= 1) { d = tolower(substr(w, p, 1)); v = index("0123456789abcdef", d) - 1; if (v >= 0 && int(v / (2 ^ (B % 4))) % 2 == 1) print ((name ~ /RCU|[Rr]emote|[Mm]agic/) ? 0 : 1), h }',
	'\t\t\t\t}',
	'\t\t\t}',
	'\t\t\th = ""; k = ""; name = ""',
	'\t\t}',
	'\t\t/^N: Name=/ { name = $0 }',
	'\t\t/^H: Handlers=/ { if (match($0, /event[0-9]+/)) h = substr($0, RSTART, RLENGTH) }',
	'\t\t/^B: KEY=/ { k = substr($0, 8) }',
	'\t\t/^$/ { emit() }',
	'\t\tEND { emit() }',
	'\t\' "$PROC" 2>/dev/null | sort | cut -d" " -f2)',
	'fi',
	'list=$(echo $list)',
	'if [ -z "$list" ]; then say "lghome=fail no key device for ' + HOME_KEY + ' (bits=$bits)"; exit 1; fi',
	// learn: one reader per candidate (at most six), polled once a second; the first device (list order) that shows a press of 773 is stored
	'if [ "$1" = learn ]; then',
	'\tsecs=${2:-15}; case "$secs" in *[!0-9]*|"") secs=15 ;; esac',
	'\tw=16; o=9; [ "$bits" = 64 ] && { w=24; o=17; }',
	'\trm -rf "$TMP"; mkdir -p "$TMP" || { say "lghome=fail could not listen"; exit 1; }',
	'\tn=0; for d in $list; do n=$((n+1)); [ $n -le 6 ] || break; [ -e "$DEVDIR/$d" ] && (timeout $secs cat "$DEVDIR/$d" > "$TMP/$d" 2>/dev/null < /dev/null &); done',
	'\theard=""; i=0',
	'\twhile [ -z "$heard" ] && [ $i -lt $secs ]; do',
	'\t\t$SLP 1; i=$((i+1))',
	'\t\tfor d in $list; do',
	`\t\t\t[ -s "$TMP/$d" ] && tail -c 4096 "$TMP/$d" 2>/dev/null | od -An -tx1 -w$w -v | awk -v o=$o '$o=="01" && $(o+1)=="00" && $(o+2)=="05" && $(o+3)=="03" && $(o+4)=="01" {f=1} END {exit !f}' && { heard=$d; break; }`,
	'\t\tdone',
	'\tdone',
	'\trm -rf "$TMP"',
	'\tif [ -z "$heard" ]; then say "lghome=fail nothing heard"; exit 1; fi',
	'\techo "$heard" > "$DEVFILE" 2>/dev/null || { say "lghome=fail could not store $heard"; exit 1; }',
	'\tsay "lghome=learned $heard"; exit 0',
	'fi',
	// press: one key to one device (the one in lghome.dev, else the first candidate)
	'set -- $list; d=$1',
	'[ -e "$DEVDIR/$d" ] || { say "lghome=fail $d is not in /dev/input"; exit 1; }',
	'if [ "$bits" = 64 ]; then T=\'\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\'; else T=\'\\000\\000\\000\\000\\000\\000\\000\\000\'; fi',
	'S=\'\\000\\000\\000\\000\\000\\000\\000\\000\'',
	// press, sync, release, sync (type 1 / code 773 = 0x0305 / value 1 then 0; type 0 = sync)
	'printf "${T}\\001\\000\\005\\003\\001\\000\\000\\000${T}${S}${T}\\001\\000\\005\\003\\000\\000\\000\\000${T}${S}" > "$DEVDIR/$d" 2>/dev/null || { say "lghome=fail could not write the key to $d"; exit 1; }',
	'say "lghome=ok key $d"; exit 0',
	''
].join('\n');

/** The shell command that makes sure the script is on the TV (written only when the version mark is missing). `write` = the commands that write it. */
export function ensureScriptCommand (write: string[]): string {
	return `mkdir -p '${LGHOME_DIR}' && if grep -q '${LGHOME_MARK}' '${LGHOME_SCRIPT}' 2>/dev/null; then true; else ${write.join(' && ')} && chmod +x '${LGHOME_SCRIPT}'; fi`;
}

/** Is this key-hook entry the LG Home job? */
export function isLgHomeCommand (command: string): boolean {
	return command === LGHOME_COMMAND;
}

/** Is this launch parameter object (or JSON string) the request to learn the Home key? */
export function isLgHomeLearnRequest (raw: unknown): boolean {
	try {
		let v: unknown = raw;
		if (typeof v === 'string') v = JSON.parse(v);
		return !!v && typeof v === 'object' && (v as Record<string, unknown>)[LGHOME_LEARN_PARAM] === true;
	} catch {
		return false;
	}
}

/** How long `learn` listens (seconds). */
export const LGHOME_LEARN_S = 15;
export const LGHOME_LEARN_COMMAND = `sh ${LGHOME_SCRIPT} learn ${LGHOME_LEARN_S}`;

/** The device from a `lghome=learned <device>` line, or ''. */
export function lgHomeLearned (output: string): string {
	const m = /lghome=learned (event[0-9]+)/.exec(output);
	return m ? m[1] : '';
}

/** Does the device file exist on the TV? Prints `dev=yes` when so. */
export const LGHOME_HAS_DEVICE_COMMAND = `[ -s '${LGHOME_DEVICE_FILE}' ] && echo dev=yes; true`;

/** Parses the script's output line: true when it says ok. */
export function lgHomeOk (output: string): boolean {
	return /lghome=ok\b/.test(output);
}

/** The reason from a `lghome=fail` line, or ''. */
export function lgHomeWhy (output: string): string {
	const m = /lghome=fail ([^\n]*)/.exec(output);
	return m ? m[1].trim().slice(0, 120) : '';
}
