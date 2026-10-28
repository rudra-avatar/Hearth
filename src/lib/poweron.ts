// "When the TV turns on, open…": the app the TV opens when it is switched on. See poweroncmd.ts for how it works, and
// src/poweron/README.md for the limits and how to undo it over SSH. Needs a rooted TV: the files belong to root, so
// everything goes through the Homebrew Channel's root shell.

import guardSh from '../poweron/guard.sh?raw';
import {exec} from './apps';
import {log} from './log';
import {isWebOS} from './luna';
import type {InstallStep} from './homehookcmd';
import {
	ABANDON_COMMAND, READ_NEW_COMMAND, READ_STOCK_COMMAND, REMOVE_COMMAND, RESTART_COMMAND, STATUS_COMMAND, buildOverride,
	finishCommand, parseStatus, powerOnMessage, writeSteps, type PowerOnResult, type PowerOnStatus
} from './poweroncmd';

export type {PowerOnResult, PowerOnStatus};
export {powerOnMessage};

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');     // plain line ends even from a Windows checkout
const why = (error: unknown): string => (error && (error as Error).message ? (error as Error).message : 'no answer');

/** What is on the TV, or null when it could not be read. */
export function readPowerOn (): Promise<PowerOnStatus | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(STATUS_COMMAND, 6000).then(parseStatus).catch(() => null);
}

function run (steps: InstallStep[]): Promise<void> {
	const next = (i: number): Promise<void> => (i >= steps.length ? Promise.resolve()
		: exec(steps[i].command, 6000).then(() => next(i + 1), (error: Error) => { throw new Error(`${steps[i].name}: ${why(error)}`); }));
	return next(0);
}

export interface PowerOnOutcome {
	result: PowerOnResult;
	detail: string;
	/** what is on the TV afterwards (read again after a failure too), or null when it could not be read */
	status?: PowerOnStatus | null;
}

/** Sends the power button to `appId` (from the next start), and network wake-ups too when `network`. The copy is written aside and read back before it is
 *  moved into place in one step. A failure takes back only what this attempt wrote, so an earlier choice stays; the
 *  outcome then carries what the TV has now. */
export function setPowerOnApp (appId: string, network = false): Promise<PowerOnOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: 'not running on a TV'});
	return readPowerOn().then((status): PowerOnOutcome | Promise<PowerOnOutcome> => {
		if (!status) return {result: 'failed', detail: 'the TV did not answer', status};
		if (!status.supported) return {result: 'unsupported', detail: '', status};
		if (status.foreign) return {result: 'foreign', detail: '', status};
		return exec(READ_STOCK_COMMAND, 6000).then((stock) => {
			let override: string;
			try { override = buildOverride(stock, appId, network); }
			catch { throw new Error("the TV's start-up file is not the kind Hearth knows"); }
			return run(writeSteps(lf(guardSh), override, appId))
				.then(() => exec(READ_NEW_COMMAND, 6000))
				.then((written) => {
					if (written.trim() !== override.trim()) throw new Error('the file did not read back the same');
					return exec(finishCommand(appId, network), 10000);
				})
				.then((out) => {
					if (!/finished/.test(out)) throw new Error('the last step did not finish');
					return readPowerOn();
				})
				.then((now): PowerOnOutcome => {
					if (!now || now.chosen !== appId || now.network !== network) return {result: 'failed', detail: 'the TV did not keep it', status: now};
					log(`Power-on app: ${appId}${network ? ' (network wake-ups too)' : ''} (from the next start)`);
					return {result: 'applied', detail: '', status: now};
				});
		}).catch((error: Error): Promise<PowerOnOutcome> => {
			log(`Power-on app: not set: ${why(error)}`);
			return exec(ABANDON_COMMAND, 6000).catch(() => '')
				.then(() => readPowerOn())
				// a slow last step can time out here and still finish on the TV: what the TV has now decides
				.then((now): PowerOnOutcome => (now && now.chosen === appId && now.network === network
					? {result: 'applied', detail: '', status: now}
					: {result: 'failed', detail: why(error), status: now}));
		});
	});
}

/** Back to the TV's own behaviour (from the next start). */
export function clearPowerOnApp (): Promise<PowerOnOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: 'not running on a TV'});
	return exec(REMOVE_COMMAND, 6000).then(
		(out) => ({result: (/removed/.test(out) ? 'removed' : 'foreign') as PowerOnResult, detail: ''}),
		(error: Error) => ({result: 'failed' as PowerOnResult, detail: why(error)})
	).then((outcome) => readPowerOn().then((status): PowerOnOutcome => {
		if (outcome.result === 'removed') log('Power-on app: back to the TV\'s own behaviour (from the next start)');
		return {...outcome, status};
	}));
}

/** Restarts the TV, so the setting starts working. Resolves false when the TV refused at once; a restart that is
 *  under way usually never answers, which counts as started. */
export function restartTv (): Promise<boolean> {
	log('Power-on app: restarting the TV');
	const began = Date.now();
	return exec(RESTART_COMMAND, 5000).then(() => true, () => Date.now() - began >= 4500);
}
