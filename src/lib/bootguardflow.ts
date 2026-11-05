// Boot guard, part S3c (2.0.3): what the page does with the marker text it reads. Pure (no TV effect, only imports the
// state module), so a node test can load it. The page side that runs the commands: bootguard.ts.

import {applyChange, guardActive, parseGuard, type GuardChange, type GuardState} from './bootguardcmd';

export interface ChangePlan {
	/** the state the marker should hold after the row changed something on the TV */
	state: GuardState;
	/** install: script, parameters and marker, link last (guard was off). marker: only the marker (guard already on).
	 *  remove: both rows are off, take the guard away (idempotent; the boot trace stays). */
	action: 'install' | 'marker' | 'remove';
}

/** A row (TV input, power-on app) changed something on the TV: what to do with the guard. */
export function planChange (markerText: string, change: GuardChange): ChangePlan {
	const before = parseGuard(markerText);
	const state = applyChange(before, change);
	if (!guardActive(state)) return {state, action: 'remove'};
	return {state, action: guardActive(before) ? 'marker' : 'install'};
}

export interface StartPlan {
	/** none: nothing to do. reached: Hearth showed after a boot the guard counted (tries back to 0). reverted: the guard
	 *  switched the rows off by itself; tell the user once. */
	action: 'none' | 'reached' | 'reverted';
	/** after `reverted`: write the marker again without the note (`marker`) or, with nothing left to guard, remove it (`remove`) */
	clear?: 'marker' | 'remove';
	state: GuardState;
}

/** Hearth shows (webOS 3 only): what the marker on the TV says to do. */
export function planStart (markerText: string): StartPlan {
	const s = parseGuard(markerText);
	if (s.reverted) return {action: 'reverted', clear: guardActive(s) ? 'marker' : 'remove', state: {...s, reverted: false}};
	if (guardActive(s) && s.tries > 0) return {action: 'reached', state: s};
	return {action: 'none', state: s};
}

/** The last lines of the boot trace for the Debug report: newest last, each cut to 200 characters. */
export function traceLines (output: string, max = 200): string[] {
	const lines = (output || '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '').map((l) => (l.length > 200 ? l.slice(0, 199) + '…' : l));
	return lines.length > max ? lines.slice(lines.length - max) : lines;
}
