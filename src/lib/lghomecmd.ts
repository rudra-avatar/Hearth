// Opening LG's own Home screen from Hearth (tile and button job), the part that needs no TV: the small script and its names.
// Pure strings (no imports), so a shell test can run the script on a fake TV. See lghome.ts for the part that runs it.
//
// webOS 4 and later: LG Home is an app (com.webos.app.home); the script launches it.
// webOS 3: there is no such app, Home is an overlay of the window manager. The script then sends the Home key (773) to the key
// device the TV itself reads, the way a real Home press arrives; the key hook sits before that point, so a Home button mapped
// to Hearth does not catch it (reported on a 3.4.3 TV by James18232, issue #36; not yet tested by us).

export const LGHOME_ID = 'com.webos.app.home';
export const LGHOME_DIR = '/media/developer/launcher-homekey';
export const LGHOME_SCRIPT = `${LGHOME_DIR}/lghome.sh`;
/** a hand-written device name (one line, e.g. event3) overrides the automatic choice */
export const LGHOME_DEVICE_FILE = `${LGHOME_DIR}/lghome.dev`;
export const LGHOME_MARK = 'lghome-v1';
export const LGHOME_LOG = '/tmp/hearth-lghome.log';
/** The command a remote button runs (key hook `exec` entry). */
export const LGHOME_COMMAND = `sh ${LGHOME_SCRIPT}`;
export const HOME_KEY = 773;

/** The script. Without an argument: launch LG Home, and when the TV refuses (no such app) send the Home key. With `inject`: only the key.
 *  Prints one line `lghome=ok launch|key <device>` or `lghome=fail <reason>` and logs it. HEARTH_PROC / HEARTH_DEVDIR / HEARTH_LOG
 *  point it at a fake TV in tests. The key goes to the first device that can send 773 (devices named like a remote come last). */
export const LGHOME_SCRIPT_TEXT = [
	'#!/bin/sh',
	`# ${LGHOME_MARK}: open LG Home (launch; on webOS 3 send the Home key). Written by Hearth.`,
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	`LOG=\${HEARTH_LOG:-${LGHOME_LOG}}`,
	'PROC=${HEARTH_PROC:-/proc/bus/input/devices}',
	'DEVDIR=${HEARTH_DEVDIR:-/dev/input}',
	'say() { echo "$1"; echo "$(date \'+%H:%M:%S\') up=$(cut -d. -f1 /proc/uptime 2>/dev/null)s $1" >> "$LOG" 2>/dev/null; }',
	'if [ "$1" != inject ]; then',
	'\tU=luna://com.webos.applicationManager',
	`\tr=$(luna-send -n 1 -w 5000 $U/launch '{"id":"${LGHOME_ID}"}' 2>&1 </dev/null | tr -d '\\n')`,
	'\tcase "$r" in',
	'\t\t*\'"returnValue": true\'*|*\'"returnValue":true\'*) say "lghome=ok launch"; exit 0 ;;',
	'\tesac',
	'fi',
	`dev=$(cat '${LGHOME_DEVICE_FILE}' 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9')`,
	'bits=${HEARTH_BITS:-$(getconf LONG_BIT 2>/dev/null)}; [ "$bits" = 64 ] || bits=32',
	'if [ -z "$dev" ]; then',
	`\tdev=$(awk -v W=$bits -v B=${HOME_KEY} '`,
	'\t\tfunction emit(  n, i, w, p, d, v) {',
	'\t\t\tif (h != "" && k != "") {',
	'\t\t\t\tn = split(k, a, " "); i = n - int(B / W)',
	'\t\t\t\tif (i >= 1) {',
	'\t\t\t\t\tw = a[i]; p = length(w) - int((B % W) / 4)',
	'\t\t\t\t\tif (p >= 1) { d = tolower(substr(w, p, 1)); v = index("0123456789abcdef", d) - 1; if (v >= 0 && int(v / (2 ^ (B % 4))) % 2 == 1) print ((name ~ /RCU|[Rr]emote|[Mm]agic/) ? 1 : 0), h }',
	'\t\t\t\t}',
	'\t\t\t}',
	'\t\t\th = ""; k = ""; name = ""',
	'\t\t}',
	'\t\t/^N: Name=/ { name = $0 }',
	'\t\t/^H: Handlers=/ { if (match($0, /event[0-9]+/)) h = substr($0, RSTART, RLENGTH) }',
	'\t\t/^B: KEY=/ { k = substr($0, 8) }',
	'\t\t/^$/ { emit() }',
	'\t\tEND { emit() }',
	'\t\' "$PROC" 2>/dev/null | sort | head -n 1 | cut -d" " -f2)',
	'fi',
	'if [ -z "$dev" ] || [ ! -e "$DEVDIR/$dev" ]; then say "lghome=fail no key device for ' + HOME_KEY + ' (bits=$bits dev=${dev:-none})"; exit 1; fi',
	'if [ "$bits" = 64 ]; then T=\'\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\\000\'; else T=\'\\000\\000\\000\\000\\000\\000\\000\\000\'; fi',
	'S=\'\\000\\000\\000\\000\\000\\000\\000\\000\'',
	// press, sync, release, sync (type 1 / code 773 = 0x0305 / value 1 then 0; type 0 = sync)
	'printf "${T}\\001\\000\\005\\003\\001\\000\\000\\000${T}${S}${T}\\001\\000\\005\\003\\000\\000\\000\\000${T}${S}" > "$DEVDIR/$dev" 2>/dev/null',
	'rc=$?',
	'if [ "$rc" = 0 ]; then say "lghome=ok key $dev"; exit 0; fi',
	'say "lghome=fail could not write to $dev (exit $rc)"; exit 1',
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
