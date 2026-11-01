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

/** Starts one short-lived reader per key device, each writing to its own file; returns at once. */
export const RAW_START_COMMAND =
	`rm -f ${RAW_PREFIX}*; for d in /dev/input/event*; do [ -e "$d" ] && (timeout ${RAW_WINDOW_S} cat "$d" > "${RAW_PREFIX}\${d##*/}" 2>/dev/null < /dev/null &); done; true`;

/** Prints "#<file>" and then "<hex code> " for each key press seen (value 1), oldest first. */
export const RAW_READ_COMMAND =
	'w=16; o=9; [ "$(getconf LONG_BIT 2>/dev/null)" = 64 ] && { w=24; o=17; }; ' +
	`for f in ${RAW_PREFIX}event*; do [ -s "$f" ] || continue; echo "#$f"; ` +
	'od -An -tx1 -w$w -v "$f" | awk -v o=$o \'$o=="01" && $(o+1)=="00" && $(o+4)=="01" {print $(o+3) $(o+2)}\'; done; true';

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
