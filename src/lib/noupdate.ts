// "Block LG update pop-up" (2.1.5), the part that runs on the TV through the Homebrew Channel's root shell.
// Commands and parsing: noupdatecmd.ts.

import {exec} from './apps';
import {log} from './log';
import {isWebOS} from './luna';
import {failureText} from './failure';
import {t as tt} from '../i18n';
import {REMOVE_COMMAND, STATUS_COMMAND, installSteps, parseStatus, type NoUpdateStatus} from './noupdatecmd';

/** What the TV has (null when it could not be read). Read when Settings opens. */
export function readNoUpdate (): Promise<NoUpdateStatus | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(STATUS_COMMAND, 6000).then(parseStatus).catch(() => null);
}

/** Turns it on or off. Resolves '' on success, else the reason in plain words. */
export function applyNoUpdate (on: boolean): Promise<string> {
	if (!isWebOS()) return Promise.resolve(tt('app.noUpdateNotTv'));
	if (!on) {
		return exec(REMOVE_COMMAND, 12000).then((out) => { log('Block LG update pop-up: off'); return /result=off/.test(out) ? '' : tt('app.noUpdateNoConfirm'); }, (e: Error) => failureText(e, tt('app.noUpdateChanging')));
	}
	const steps = installSteps();
	const run = (i: number): Promise<string> => {
		if (i >= steps.length) return Promise.resolve('');
		return exec(steps[i].command, 15000).then((out) => {
			if (i === steps.length - 1 && !/result=ok/.test(out)) return tt('app.noUpdateNoConfirm');
			return run(i + 1);
		}, (e: Error) => failureText(e, tt('app.noUpdateStep', {name: steps[i].name})));
	};
	return run(0).then((why) => { log(`Block LG update pop-up: on ${why ? 'failed: ' + why : 'set'}`); return why; });
}
