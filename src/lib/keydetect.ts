// P61f: finding out which button number a remote button sends. Two sources are read together, nothing else needed:
// the TV's raw key devices (rawkeyscmd.ts) and Input Hook's logs (homekey.ts, for Magic Remotes that show up there).
// Listening is a short fixed window that starts only when a detect screen asks; nothing runs at start-up or while idle.

import {exec} from './apps';
import {startDetecting, newLinesCommand, startHomeGuard, stopHomeGuard} from './homekey';
import {log} from './log';
import {DETECT_KEEP_MS, detectKeys, readBaseline, writeBaseline, type DetectedKey} from './homekeycore';
import {isWebOS} from './luna';
import {RAW_CLEAN_COMMAND, RAW_START_COMMAND, RAW_WINDOW_S, parseGuardHits, parseRawKeys, pollCommand, splitPoll} from './rawkeyscmd';

const AT_KEY = 'customlauncher-rawkeys-at-v1';

export const LISTEN_WINDOW_MS = RAW_WINDOW_S * 1000;

function readAt (now: number = Date.now()): number {
	try {
		const v = Number(typeof localStorage === 'undefined' ? 0 : localStorage.getItem(AT_KEY));
		return v && now - v <= DETECT_KEEP_MS && now >= v - 60000 ? v : 0;
	} catch (e) {
		return 0;
	}
}

function writeAt (at: number): void {
	try {
		if (typeof localStorage === 'undefined') return;
		if (at) localStorage.setItem(AT_KEY, String(at)); else localStorage.removeItem(AT_KEY);
	} catch (e) {
		// refused: detecting still works for this visit
	}
}

/** Starts listening and returns the start time. A start that is still fresh (the user pressed a button that took them out of Hearth
 *  and came back) is kept unless `forget`. */
export function beginListening (forget: boolean): Promise<number> {
	if (!isWebOS()) return Promise.resolve(0);
	failLogged = false;
	const saved = forget ? 0 : readAt();
	if (saved) return Promise.resolve(saved);
	const at = Date.now();
	writeAt(at);
	return Promise.all([exec(RAW_START_COMMAND, 8000).then((out) => { log(`keys: ${String(out).replace(/\s+/g, ' ').trim().slice(0, 100)}`); }, () => ''), startDetecting().catch(() => null), startHomeGuard()]).then(() => at);
}

/** The start time of a listening that is still fresh (the user pressed a button that took them out of Hearth and came back), else 0. Starts nothing. */
export function resumeListening (): number {
	return isWebOS() ? readAt() : 0;
}

/** Stops showing what was detected (the readers end by themselves). */
export function endListening (): void {
	failLogged = false;
	writeAt(0);
	writeBaseline(null);
	if (isWebOS()) { exec(RAW_CLEAN_COMMAND, 5000).catch(() => ''); stopHomeGuard(); }       // W1: the key files are not needed any more
}

/** True while the reader window of a start at `at` is still open. */
export function listening (at: number, now: number = Date.now()): boolean {
	return !!at && now - at < LISTEN_WINDOW_MS;
}

/** Z (idea 6): the first failed poll of a listening is written to the debug log once (a silent failure looked like "nothing pressed"). */
let failLogged = false;
const failedPoll = (why: string): DetectedKey[] => {
	if (!failLogged) { failLogged = true; log(`keys: poll failed: ${why}`); }
	return [];
};

/** Every button pressed since listening began (raw devices first, then Input Hook's log), each once, the newest at the end.
 *  Z (idea 1): ONE shell call reads both. */
export function pressedKeys (): Promise<DetectedKey[]> {
	if (!isWebOS() || !readAt()) return Promise.resolve([]);
	const baseline = readBaseline();
	return exec(pollCommand(baseline ? newLinesCommand(baseline) : ''), 8000).then((out) => {
		const parts = splitPoll(out);
		if (!parts.complete) return failedPoll(`unexpected output (${out.length} characters, no end marker)`);
		const raw = parseRawKeys(parts.raw);
		const logged = baseline ? detectKeys(parts.hook) : [];
		const merged: DetectedKey[] = [];
		raw.concat(logged, parseGuardHits(parts.hits)).forEach((k) => {
			const same = merged.filter((m) => m.code === k.code)[0];
			if (same) same.count += k.count; else merged.push({code: k.code, count: k.count});
		});
		return merged;
	}, (e) => failedPoll(e && e.message ? String(e.message).slice(0, 120) : 'no answer'));
}
