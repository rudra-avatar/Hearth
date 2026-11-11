// 2.1.6 (p1): one-time clean-up of the removed "Block LG update pop-up" row and the pop-up probe scripts, through the
// Homebrew Channel's root shell. Commands and parsing: noupdatecmd.ts. Runs from app.tsx a while after the start.

import {exec} from './apps';
import {log} from './log';
import {isWebOS} from './luna';
import {CLEANUP_COMMAND, cleanupFinished} from './noupdatecmd';

const DONE_KEY = 'hearth-noupdate-cleaned';   // its own key, not a saved setting; written only after the TV's answer proved the clean-up

/** Already finished on this TV: the start-up timer is not even armed. */
export function cleanupDone (): boolean {
	try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

/** Runs once per TV (until it finishes); a TV without root answers nothing, and it is tried again at the next start. */
export function cleanupOldBlock (): Promise<void> {
	if (!isWebOS() || cleanupDone()) return Promise.resolve();
	return exec(CLEANUP_COMMAND, 12000).then((out) => {
		if (!cleanupFinished(out)) { log('update-block clean-up: not finished'); return; }
		log(`update-block clean-up: ${/cleanup=done/.test(out) ? 'removed' : 'nothing there'}`);
		try { localStorage.setItem(DONE_KEY, '1'); } catch { /* tried again at the next start */ }
	}, () => { /* no root yet: tried again at the next start */ });
}
