// "LG preloaded apps" (rooted TVs): reads LG's list of preloaded apps, switches one off or back, and tells the TV's preload
// manager again at each start of Hearth. See preloadcmd.ts for the pure parts and src/preload/preload.sh for the script.

import preloadSh from '../preload/preload.sh?raw';
import {exec} from './apps';
import {classifyFailure, failureReason} from './failure';
import {isWebOS} from './luna';
import {
	APPLY_COMMAND, changeSteps, installSteps, offeredApps, parseRead, parseSetResult, planChange, planReset, PRELOAD_VERSION, READ_COMMAND, VERSION_COMMAND,
	type PreloadApp, type PreloadPlan, type PreloadRead, type PreloadStep, type SetResult
} from './preloadcmd';

export {preloadMessage} from './preloadcmd';
export type {PreloadApp, SetResult};

const SCRIPT = preloadSh.replace(/\r\n?/g, '\n');

export interface PreloadView {
	/** this TV has a list of preloaded apps */
	supported: boolean;
	apps: PreloadApp[];
	read: PreloadRead;
}

function why (error: Error): string {
	return failureReason(classifyFailure(error), error && error.message ? error.message : '');
}

/** Runs the steps one after the other; resolves with the output of the last one, rejects with the name of the step that failed. */
function runSteps (steps: PreloadStep[]): Promise<string> {
	const run = (i: number): Promise<string> => exec(steps[i].command, 15000).then(
		(output) => (i === steps.length - 1 ? output : run(i + 1)),
		(error: Error) => { throw new Error(`${steps[i].name}: ${why(error)}`); }
	);
	return run(0);
}

/** Writes the script when the copy on the TV is older or missing. */
function ensureScript (): Promise<void> {
	return exec(VERSION_COMMAND, 6000).then((out) => (out.trim() === PRELOAD_VERSION ? undefined : runSteps(installSteps(SCRIPT)).then(() => undefined)));
}

/** LG's list as it is now, with what Hearth switched off. `titles` maps an app id to its name (an app with no name is not installed). */
export function readPreload (titles: Record<string, string>): Promise<PreloadView> {
	if (!isWebOS()) return Promise.reject(new Error('This only works on a TV.'));
	return exec(READ_COMMAND, 12000).then((output) => {
		const read = parseRead(output);
		return {supported: !!read.list, apps: offeredApps(read, titles), read};
	});
}

function send (plan: PreloadPlan | null): Promise<SetResult | 'unsupported'> {
	if (!plan) return Promise.resolve('unsupported');
	return ensureScript().then(() => runSteps(changeSteps(plan))).then(parseSetResult);
}

/** Switches one app's preloading off, or back to LG's setting. Rejects with a readable message when a step failed. */
export function setPreloadOff (view: PreloadView, id: string, off: boolean): Promise<SetResult | 'unsupported'> {
	return send(planChange(view.read, id, off));
}

/** Every app back to LG's setting. */
export function resetPreload (view: PreloadView): Promise<SetResult | 'unsupported'> {
	return send(planReset(view.read));
}

/** At each start of Hearth while apps are switched off: tells the preload manager again. Never throws. */
export function applyPreload (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	return exec(APPLY_COMMAND, 10000).then(() => undefined, () => undefined);
}
