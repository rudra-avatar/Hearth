// P61f: detecting remote buttons by reading the TV's raw key devices (/dev/input/event*), read only, no hook. Pure string
// building and parsing (no imports), so it can be tested on its own. See keydetect.ts for the part that runs it.
//
// Why: Input Hook's log shows nothing for an IR remote on some TVs (reference TV, webOS 7.6: only a silent hook installs).
// The kernel's key devices always show the press: the IR remote is "LGE RCU" (event1 on the reference TV); the Magic Remote
// has its own devices. Every device is read (no model choice), for a short fixed window, and only while a detect screen is open.
// Each event is 16 bytes on a 32-bit system (sec4 usec4 type2 code2 value4), 24 on a 64-bit one (unverified on a TV).
// A key press is type 1, value 1; the code is the Linux key code (Netflix 1037, Settings 139, Volume up 115, Home 773).

export const RAW_PREFIX = '/tmp/hearth-keys.';
/** How long the readers run (seconds); they stop by themselves, nothing keeps polling. */
export const RAW_WINDOW_S = 45;
/** W1: the files are deleted by a timer this long after the readers' window (a press read late still finds them). */
export const RAW_KEEP_S = 60;
/** W1: names the newest start, so an older timer never deletes the files of a newer start. */
export const RAW_ID_FILE = '/tmp/hearth-keyid';

/* Z4: the per-file cap (a `head -c` stage in each reader) is gone: on the TV nothing was detected with it (cause unverified, buffering suspected); the readers are plain `timeout cat > file` again. */
/** Z: a poll reads only the newest bytes of each file (also a multiple of 48), so its cost stops growing during the window. */
export const RAW_READ_BYTES = 196608;

/** Z (idea 2): prints the names (event0, event1...) of the devices that can send keys (the EV_KEY bit, the 0x2 bit of the lowest hex digit of `B: EV=`
 *  in /proc/bus/input/devices); prints nothing when that file is unreadable, then every event device is read as before. */
export const RAW_KEY_DEVICES =
	`awk '/^B: EV=/{e=substr($0,7)} /^H: Handlers=/{if(match($0,/event[0-9]+/))h=substr($0,RSTART,RLENGTH)} /^$/{if(h!=""&&e~/[2367abefABEF]$/)print h;h="";e=""} END{if(h!=""&&e~/[2367abefABEF]$/)print h}' /proc/bus/input/devices 2>/dev/null`;

/** Starts one short-lived reader per key device, each writing to its own file; returns at once. */
export const RAW_START_COMMAND =
	`rm -f ${RAW_PREFIX}*; id=$$-$(date +%s); echo "$id" > ${RAW_ID_FILE}; list=$(${RAW_KEY_DEVICES}); [ -n "$list" ] || list=$(ls /dev/input 2>/dev/null | grep '^event'); ` +
	`for n in $list; do d=/dev/input/$n; [ -e "$d" ] && (timeout ${RAW_WINDOW_S} cat "$d" > "${RAW_PREFIX}$n" 2>/dev/null < /dev/null &); done; ` +
	`(sleep ${RAW_WINDOW_S + RAW_KEEP_S}; [ "$(cat ${RAW_ID_FILE} 2>/dev/null)" = "$id" ] && rm -f ${RAW_PREFIX}* ${RAW_ID_FILE}) > /dev/null 2>&1 < /dev/null & echo "readers:" $list`;

/** W1: deletes the files at once (a button was set, nothing is left to read). */
export const RAW_CLEAN_COMMAND = `rm -f ${RAW_PREFIX}* ${RAW_ID_FILE}; true`;

/** Prints "#<file>" and then "<hex code> " for each key press seen (value 1), oldest first (only the newest RAW_READ_BYTES of each file). */
export const RAW_READ_COMMAND =
	'w=16; o=9; [ "$(getconf LONG_BIT 2>/dev/null)" = 64 ] && { w=24; o=17; }; ' +
	`for f in ${RAW_PREFIX}event*; do [ -s "$f" ] || continue; echo "#$f"; ` +
	`tail -c ${RAW_READ_BYTES} "$f" 2>/dev/null | od -An -tx1 -w$w -v | awk -v o=$o '$o=="01" && $(o+1)=="00" && $(o+4)=="01" {print $(o+3) $(o+2)}'; done; true`;

/** Z (idea 1): the line between the two halves of one combined poll (the raw key files, then Input Hook's new log lines). */
export const POLL_SPLIT = '##hearth-hook-log##';

/** Z5: the line before the Home guard's hits (codes the recorder wrote, one per line). */
export const HITS_SPLIT = '##hearth-hits##';
const HITS_FILE = '/tmp/hearth-hkguard.hits';

/** Z (idea 1): one shell call for all reads; `hookCommand` is the Input Hook read (may be empty when there is no baseline). */
export const pollCommand = (hookCommand: string): string =>
	`${RAW_READ_COMMAND}; echo '${POLL_SPLIT}'; ${hookCommand || 'true'}; echo '${HITS_SPLIT}'; cat ${HITS_FILE} 2>/dev/null; true`;

/** Z: the parts of a combined poll's output; `complete` is false when a marker is missing (the shell call died half way). */
export function splitPoll (text: string): {raw: string; hook: string; hits: string; complete: boolean} {
	const at = text.indexOf(POLL_SPLIT);
	if (at === -1) return {raw: text, hook: '', hits: '', complete: false};
	const rest = text.slice(at + POLL_SPLIT.length);
	const h = rest.indexOf(HITS_SPLIT);
	if (h === -1) return {raw: text.slice(0, at), hook: rest, hits: '', complete: false};
	return {raw: text.slice(0, at), hook: rest.slice(0, h), hits: rest.slice(h + HITS_SPLIT.length), complete: true};
}

export interface RawKey {
	code: number;
	count: number;
}

/** The pressed codes in the command's output, each with how often, the one pressed last at the end. */
export function parseRawKeys (text: string): RawKey[] {
	const order: number[] = [];
	const counts: Record<number, number> = {};
	text.split('\n').forEach((line) => {
		const m = /^([0-9a-f]{4})\s*$/i.exec(line.trim());
		if (!m) return;
		const code = parseInt(m[1], 16);
		if (!code) return;
		counts[code] = (counts[code] || 0) + 1;
		const at = order.indexOf(code);
		if (at !== -1) order.splice(at, 1);
		order.push(code);
	});
	return order.map((code) => ({code, count: counts[code]}));
}

/** Z5: the codes the Home guard recorded (decimal, one per line), each with how often, the one pressed last at the end. */
export function parseGuardHits (text: string): RawKey[] {
	const order: number[] = [];
	const counts: Record<number, number> = {};
	text.split('\n').forEach((line) => {
		const m = /^(\d{1,5})$/.exec(line.trim());
		if (!m) return;
		const code = parseInt(m[1], 10);
		if (!code) return;
		counts[code] = (counts[code] || 0) + 1;
		const at = order.indexOf(code);
		if (at !== -1) order.splice(at, 1);
		order.push(code);
	});
	return order.map((code) => ({code, count: counts[code]}));
}
