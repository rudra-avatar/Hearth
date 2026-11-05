// Boot guard, part S3a (2.0.3): state and decisions only. No TV effect, no imports (so a node test can load it).
// User 2026-11-05: the guard is on whenever the TV-input row (`tvInput`) or the power-on app row is on, ONLY in the
// legacy bundle (webOS 3), and it reverts AUTOMATICALLY after a boot that never reached Hearth (a pop-up could not
// be answered during a hang). S3b writes the marker on the TV and runs the revert at start-up; S3c wires the rows.
// The marker is plain `key=value` lines so a start-up shell script can read it without a parser.

/** Folder of the marker on the TV (the link that starts the boot script is chosen in S3b). */
export const GUARD_DIR = '/media/developer/launcher-bootguard';
export const GUARD_FILE = GUARD_DIR + '/state';

/** Boots that did not reach Hearth: up to this many are retried, the next one reverts. UNMEASURED proposal (undecided). */
export const RETRY_BOOTS = 2;

export interface GuardState {
	/** the TV input was added by Hearth (`tvInput` on) */
	input: boolean;
	/** the power-on app was set by Hearth */
	powerOn: boolean;
	/** boots counted since Hearth last reached its screen */
	tries: number;
	/** the guard already reverted; kept so the next start can tell the user (S3c) */
	reverted: boolean;
}

export type GuardChange = 'inputAdded' | 'inputRemoved' | 'powerOnSet' | 'powerOnCleared';
export type GuardDecision = 'none' | 'retry' | 'revert';
export type RevertStep = 'removeInput' | 'clearPowerOn';

export const EMPTY_GUARD: GuardState = {input: false, powerOn: false, tries: 0, reverted: false};

/** The guard exists only in the bundle for webOS 3 (Chromium 38). */
export const guardAllowed = (legacy: boolean): boolean => legacy === true;

/** On while either row is on. */
export const guardActive = (s: GuardState): boolean => s.input || s.powerOn;

/** The state after a row changed something on the TV. A new change starts counting from zero and clears `reverted`. */
export function applyChange (s: GuardState, change: GuardChange): GuardState {
	const next = {...s, tries: 0, reverted: false};
	if (change === 'inputAdded') next.input = true;
	else if (change === 'inputRemoved') next.input = false;
	else if (change === 'powerOnSet') next.powerOn = true;
	else next.powerOn = false;
	return next;
}

/** A boot was seen at start-up (S3b script). */
export const bootSeen = (s: GuardState): GuardState => (guardActive(s) ? {...s, tries: s.tries + 1} : s);

/** Hearth reached its screen: the boot worked, the count restarts. */
export const hearthReached = (s: GuardState): GuardState => (s.tries === 0 ? s : {...s, tries: 0});

/** What a start-up should do with the state it finds (after bootSeen). */
export function decide (s: GuardState): GuardDecision {
	if (!guardActive(s) || s.tries <= 0) return 'none';
	return s.tries <= RETRY_BOOTS ? 'retry' : 'revert';
}

/** Steps to undo, in order: the input first (it is what starts the hang), then the power-on app. */
export function revertPlan (s: GuardState): RevertStep[] {
	const steps: RevertStep[] = [];
	if (s.input) steps.push('removeInput');
	if (s.powerOn) steps.push('clearPowerOn');
	return steps;
}

/** The state after the plan ran and the TV was read again: a step counts as done only when the read proves it
 *  (`deleteDevice` gives no answer, so the input list is the proof). `reverted` is set when nothing is left. */
export function afterRevert (s: GuardState, inputStillListed: boolean, powerOnStillSet: boolean): GuardState {
	const input = s.input && inputStillListed;
	const powerOn = s.powerOn && powerOnStillSet;
	return {input, powerOn, tries: 0, reverted: s.input !== input || s.powerOn !== powerOn ? true : s.reverted};
}

/** Marker text, one `key=value` per line. */
export function serializeGuard (s: GuardState): string {
	return `input=${s.input ? 1 : 0}\npowerOn=${s.powerOn ? 1 : 0}\ntries=${Math.max(0, Math.floor(s.tries))}\nreverted=${s.reverted ? 1 : 0}\n`;
}

/** Reads marker text; anything unreadable gives the empty state (the guard then does nothing). */
export function parseGuard (text: string): GuardState {
	const v: Record<string, string> = {};
	(text || '').split('\n').forEach((line) => {
		const m = /^\s*(input|powerOn|tries|reverted)\s*=\s*(\d{1,3})\s*$/.exec(line);
		if (m) v[m[1]] = m[2];
	});
	return {input: v.input === '1', powerOn: v.powerOn === '1', tries: v.tries ? parseInt(v.tries, 10) : 0, reverted: v.reverted === '1'};
}
