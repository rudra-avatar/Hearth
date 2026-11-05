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
export const LGHOME_MARK = 'lghome-v2';
export const LGHOME_LOG = '/tmp/hearth-lghome.log';
/** The command a remote button runs (key hook `exec` entry). */
export const LGHOME_COMMAND = `sh ${LGHOME_SCRIPT}`;
export const HOME_KEY = 773;

/** The script. Without an argument: launch LG Home, and when the TV refuses (no such app) send the Home key. With `inject`: only the key.
 *  Prints one line `lghome=ok launch|key <device>` or `lghome=fail <reason>` and logs it. HEARTH_PROC / HEARTH_DEVDIR / HEARTH_LOG /
 *  HEARTH_DEVFILE / HEARTH_MSG / HEARTH_SLEEP point it at a fake TV in tests.
 *  Key device (2.1.3, issue #36): the candidates are the devices that can send 773, devices named like a remote FIRST (a 3.4.3 TV
 *  reads its remote from `LGE M-RCU - Builtin [0]`; another device listed before it took the key and did nothing), at most three.
 *  A hand-written `lghome.dev` replaces the list. Fallback: when the TV has logged `NL_HOME_SHOWN` before, the script waits a second
 *  after each key and tries the next candidate when that line did not appear; a TV that never logged it gets one key to the first
 *  candidate. When no candidate showed a response the line says `(unconfirmed, tried ...)`. */
export const LGHOME_SCRIPT_TEXT = [
	'#!/bin/sh',
	`# ${LGHOME_MARK}: open LG Home (launch; on webOS 3 send the Home key). Written by Hearth.`,
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	`LOG=\${HEARTH_LOG:-${LGHOME_LOG}}`,
	'PROC=${HEARTH_PROC:-/proc/bus/input/devices}',
	'DEVDIR=${HEARTH_DEVDIR:-/dev/input}',
	`DEVFILE=\${HEARTH_DEVFILE:-${LGHOME_DEVICE_FILE}}`,
	'MSG=${HEARTH_MSG:-/var/log/messages}',
	'SLP=${HEARTH_SLEEP:-sleep}',
	'say() { echo "$1"; echo "$(date \'+%H:%M:%S\') up=$(cut -d. -f1 /proc/uptime 2>/dev/null)s $1" >> "$LOG" 2>/dev/null; }',
	'if [ "$1" != inject ]; then',
	'\tU=luna://com.webos.applicationManager',
	`\tr=$(luna-send -n 1 -w 5000 $U/launch '{"id":"${LGHOME_ID}"}' 2>&1 </dev/null | tr -d '\\n')`,
	'\tcase "$r" in',
	'\t\t*\'"returnValue": true\'*|*\'"returnValue":true\'*) say "lghome=ok launch"; exit 0 ;;',
	'\tesac',
	'fi',
	`dev=$(cat "$DEVFILE" 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9')`,
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
	'\t\' "$PROC" 2>/dev/null | sort | cut -d" " -f2 | head -n 3)',
	'fi',
	'list=$(echo $list)',
	'if [ -z "$list" ]; then say "lghome=fail no key device for ' + HOME_KEY + ' (bits=$bits)"; exit 1; fi',
	'if [ "$bits" = 64 ]; then T=\'\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\'; else T=\'\\000\\000\\000\\000\\000\\000\\000\\000\'; fi',
	'S=\'\\000\\000\\000\\000\\000\\000\\000\\000\'',
	'count() { n=$(grep -c NL_HOME_SHOWN "$MSG" 2>/dev/null); echo "${n:-0}"; }',
	'before=$(count); [ -z "$dev" ] || before=0',
	'tried=""; first=""; ok=""',
	'for d in $list; do',
	'\t[ -e "$DEVDIR/$d" ] || continue',
	// press, sync, release, sync (type 1 / code 773 = 0x0305 / value 1 then 0; type 0 = sync)
	'\tprintf "${T}\\001\\000\\005\\003\\001\\000\\000\\000${T}${S}${T}\\001\\000\\005\\003\\000\\000\\000\\000${T}${S}" > "$DEVDIR/$d" 2>/dev/null || continue',
	'\ttried="$tried $d"; [ -n "$first" ] || first=$d',
	'\tif [ "$before" -gt 0 ]; then',
	'\t\t$SLP 1; a=$(count)',
	'\t\tif [ "$a" -gt "$before" ]; then ok=$d; break; fi',
	'\t\tbefore=$a',
	'\telse ok=$d; break; fi',
	'done',
	'if [ -n "$ok" ]; then say "lghome=ok key $ok (tried$tried)"; exit 0; fi',
	'if [ -n "$first" ]; then say "lghome=ok key $first (unconfirmed, tried$tried)"; exit 0; fi',
	'say "lghome=fail could not write the key to any of: $list"; exit 1',
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

/** Parses the script's output line: true when it says ok. */
export function lgHomeOk (output: string): boolean {
	return /lghome=ok\b/.test(output);
}

/** The reason from a `lghome=fail` line, or ''. */
export function lgHomeWhy (output: string): string {
	const m = /lghome=fail ([^\n]*)/.exec(output);
	return m ? m[1].trim().slice(0, 120) : '';
}
