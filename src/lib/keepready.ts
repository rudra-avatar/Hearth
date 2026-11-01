// "Keep Hearth ready" (experimental), the part that runs on the TV through the Homebrew Channel's root shell. See
// keepreadycmd.ts (commands) and src/keepready/keepready.sh (what it does).

import keepSh from '../keepready/keepready.sh?raw';
import {exec} from './apps';
import {log} from './log';
import {isWebOS} from './luna';
import {LIST_COMMAND, REMOVE_COMMAND, STATUS_COMMAND, installSteps, keepProblemText, parseListAnswer, parseStatus, type KeepStatus} from './keepreadycmd';
import {failureText} from './failure';
import {t as tt} from '../i18n';

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');     // plain line ends even from a Windows checkout

/** What the TV has (null when it could not be read). */
export function readKeepStatus (): Promise<KeepStatus | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(STATUS_COMMAND, 6000).then(parseStatus).catch(() => null);
}

let listKnown: boolean | null = null;      // K2: asked once per page start (the answer cannot change by itself)

/** K2: has this TV a memory list Keep can change? Only read when Settings opens; null while unknown or unreadable. */
export function readKeepList (): Promise<boolean | null> {
	if (!isWebOS()) return Promise.resolve(null);
	if (listKnown !== null) return Promise.resolve(listKnown);
	return exec(LIST_COMMAND, 20000).then((out) => {
		const found = parseListAnswer(out);
		if (found !== null) { listKnown = found; log(`keep: memory list ${found ? 'found' : 'not found'} on this TV`); }
		return found;
	}).catch(() => null);
}

/** P74: after `apply on` the script works in the background (memory list, restart of the memory manager, about 15 s on the TV).
 *  Reads its state every 3 s, at most 45 s; resolves '' when it is ok, else the plain reason. */
function waitForOutcome (): Promise<string> {
	const began = Date.now();
	const poll = (): Promise<string> => new Promise<void>((resolve) => { window.setTimeout(resolve, 3000); }).then(() => readKeepStatus()).then((status) => {
		const bad = status ? keepProblemText(status.state) : null;
		if (bad) return bad;
		if (status && status.state === 'ok') return '';
		return Date.now() - began > 45000 ? (keepProblemText('timeout') as string) : poll();
	});
	return poll();
}

/** Turns it on or off on the TV (off removes everything). Resolves '' on success, else the reason in plain words. */
export function applyKeepReady (on: boolean, relaunch = false): Promise<string> {
	if (!isWebOS()) return Promise.resolve(tt('keepready.notRunningOnATv'));
	if (!on) {
		return exec(REMOVE_COMMAND, 12000).then((out) => { log('Keep ready: off'); return /result=off/.test(out) ? '' : tt('keepready.theTvDidNotConfirm'); }, (e: Error) => (e && e.message) || tt('keepready.noAnswer'));
	}
	const steps = installSteps(lf(keepSh), relaunch);
	const run = (i: number): Promise<string> => {
		if (i >= steps.length) return Promise.resolve('');
		return exec(steps[i].command, 15000).then((out) => {
			if (i === steps.length - 1 && !/result=ok/.test(out)) return tt('keepready.theTvDidNotConfirm');
			return run(i + 1);
		}, (e: Error) => failureText(e, tt('keepready.turnOnKeepHearthReady', {name: steps[i].name})));
	};
	return run(0).then((why) => (why ? why : waitForOutcome())).then((why) => { log(`Keep ready: on ${why ? 'failed: ' + why : 'set'}`); return why; });
}
