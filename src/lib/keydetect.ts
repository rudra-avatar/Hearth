// P61f: finding out which button number a remote button sends. Two sources are read together, nothing else needed:
// the TV's raw key devices (rawkeyscmd.ts) and Input Hook's logs (homekey.ts, for Magic Remotes that show up there).
// Listening is a short fixed window that starts only when a detect screen asks; nothing runs at start-up or while idle.

import {exec} from './apps';
import {startDetecting, readNewLines} from './homekey';
import {DETECT_KEEP_MS, detectKeys, readBaseline, writeBaseline, type DetectedKey} from './homekeycore';
import {isWebOS} from './luna';
import {RAW_READ_COMMAND, RAW_START_COMMAND, RAW_WINDOW_S, parseRawKeys} from './rawkeyscmd';

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
	const saved = forget ? 0 : readAt();
	if (saved) return Promise.resolve(saved);
	const at = Date.now();
	writeAt(at);
	return Promise.all([exec(RAW_START_COMMAND, 8000).catch(() => ''), startDetecting().catch(() => null)]).then(() => at);
}

/** Stops showing what was detected (the readers end by themselves). */
export function endListening (): void {
	writeAt(0);
	writeBaseline(null);
}

/** True while the reader window of a start at `at` is still open. */
export function listening (at: number, now: number = Date.now()): boolean {
	return !!at && now - at < LISTEN_WINDOW_MS;
}

/** Every button pressed since listening began (raw devices first, then Input Hook's log), each once, the newest at the end. */
export function pressedKeys (): Promise<DetectedKey[]> {
	if (!isWebOS() || !readAt()) return Promise.resolve([]);
	const baseline = readBaseline();
	return Promise.all([
		exec(RAW_READ_COMMAND, 8000).then((out): DetectedKey[] => parseRawKeys(out), (): DetectedKey[] => []),
		baseline ? readNewLines(baseline).then((text): DetectedKey[] => detectKeys(text), (): DetectedKey[] => []) : Promise.resolve([] as DetectedKey[])
	]).then(([raw, logged]) => {
		const merged: DetectedKey[] = [];
		raw.concat(logged).forEach((k) => {
			const same = merged.filter((m) => m.code === k.code)[0];
			if (same) same.count += k.count; else merged.push({code: k.code, count: k.count});
		});
		return merged;
	});
}
