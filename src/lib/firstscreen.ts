// P94: without the helper (non-root starts) nothing writes the "first screen" line, and the TV closes Hearth in the background, so the
// line of an earlier start is gone when the Debug tab is opened. One short line per start is kept here (last 4, one localStorage key,
// written once after the first frame) and the earlier ones are shown in the Debug tab as `previous start:` lines.

import {log} from './log';

const KEY = 'hearth-firstscreen-v1';
const KEEP = 4;

/** Logs this start's line and the kept lines of earlier starts, then keeps this one. Never throws. */
export function noteFirstScreen (line: string): void {
	let old: string[] = [];
	try { const raw = localStorage.getItem(KEY); old = raw ? JSON.parse(raw) : []; if (!Array.isArray(old)) old = []; } catch (e) { old = []; }
	log(`first screen ${line}`);
	old.forEach((l, i) => log(`previous start ${i + 1}: ${l}`));
	try { localStorage.setItem(KEY, JSON.stringify([line].concat(old).slice(0, KEEP))); } catch (e) { /* storage full: nothing is kept */ }
}
