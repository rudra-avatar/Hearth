// Boot guard, part S3c (2.0.3): the page side. webOS 3 only (legacy bundle), rooted TVs only. Puts the guard on the TV
// when "Add Hearth as a TV input" or "When the TV turns on, open..." is switched on, takes it away when both are off,
// tells the guard that Hearth reached its screen, and reads the boot trace for the Debug report. The decisions are in
// bootguardflow.ts, the commands in bootguardsh.ts, the start-up script in src/bootguard/guard.sh.

import guardSh from '../bootguard/guard.sh?raw';
import {LEGACY} from '../config/features';
import {exec} from './apps';
import {guardAllowed, type GuardChange} from './bootguardcmd';
import {planChange, planStart, traceLines} from './bootguardflow';
import {installSteps, READ_MARKER_COMMAND, READ_TRACE_COMMAND, REACHED_COMMAND, REMOVE_GUARD_COMMAND, writeMarkerCommands} from './bootguardsh';
import {parseExit, withStatus} from './homehookcmd';
import {isWebOS} from './luna';

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');      // the TV's shell reads a carriage return as part of the word
const here = (): boolean => guardAllowed(LEGACY) && isWebOS();

/** Runs the commands one after the other; false at the first one that does not end with exit code 0. */
function run (commands: string[]): Promise<boolean> {
	const next = (i: number): Promise<boolean> => (i >= commands.length ? Promise.resolve(true)
		: exec(withStatus(commands[i]), 15000).then((out) => (parseExit(out) === 0 ? next(i + 1) : false), () => false));
	return next(0);
}

/** A row changed something on the TV (call it only after the TV proved the change). Resolves true when the guard now
 *  matches the rows. A half-finished install is taken away again. */
export function noteGuardChange (change: GuardChange): Promise<boolean> {
	if (!here()) return Promise.resolve(false);
	return exec(READ_MARKER_COMMAND, 6000).then((text) => {
		const plan = planChange(text, change);
		if (plan.action === 'remove') return run([REMOVE_GUARD_COMMAND]);
		if (plan.action === 'marker') return run(writeMarkerCommands(plan.state));
		return run(installSteps(lf(guardSh), plan.state).map((step) => step.command)).then((ok) => (ok ? true : run([REMOVE_GUARD_COMMAND]).then(() => false)));
	}).catch(() => false);
}

/** ok: nothing more to do (or nothing to do here). reverted: the guard switched the rows off after boots that never
 *  reached Hearth (tell the user). unreachable: the Homebrew service did not answer (often not up yet): try later. */
export type GuardStart = 'ok' | 'reverted' | 'unreachable';

/** Hearth shows: sets the guard's count back to 0 (only when the guard is on and counted a boot), and reports a revert once. */
export function guardAtStart (): Promise<GuardStart> {
	if (!here()) return Promise.resolve('ok');
	return exec(READ_MARKER_COMMAND, 6000).then((text): Promise<GuardStart> => {
		const plan = planStart(text);
		if (plan.action === 'reached') return run([REACHED_COMMAND]).then((): GuardStart => 'ok');
		if (plan.action === 'reverted') return run(plan.clear === 'remove' ? [REMOVE_GUARD_COMMAND] : writeMarkerCommands(plan.state)).then((): GuardStart => 'reverted');
		return Promise.resolve('ok');
	}, (): GuardStart => 'unreachable');
}

/** The boot trace (oldest first, the last 200 lines) for the Debug report; empty when there is none. */
export function readBootTrace (): Promise<string[]> {
	if (!here()) return Promise.resolve([]);
	return exec(READ_TRACE_COMMAND, 6000).then((out) => traceLines(out), () => []);
}
