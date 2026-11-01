// H3a: after a TV boot the highlight starts on the first app, not on the app opened last (Settings -> Look -> When Home is pressed).
// The page cannot tell a TV boot from a later reload by itself. Hearth writes the marker file /tmp/hearth-opened (the TV clears /tmp
// at every boot) the first time it opens an app; a page start that finds no marker means "no app opened since the TV started", so the
// first app is the highlight until one is opened. One tiny read per page start (retried while the Homebrew service is not up yet,
// only with *last app opened* set), one tiny write per page start that opens an app. Never throws.

import {exec} from './apps';
import {isWebOS} from './luna';

export const COLD_DELAYS = [0, 5000, 15000, 30000, 60000];   // the Homebrew exec answers only from about up=45 s
export const MARKER_FILE = '/tmp/hearth-opened';
export const READ_COMMAND = `test -e ${MARKER_FILE} && echo 1 || echo 0`;
export const WRITE_COMMAND = `touch ${MARKER_FILE}`;

/** True ("1") when the marker exists, false ("0") when not, null for any other output. */
export function parseMarker (out: string): boolean | null {
	const m = /^\s*([01])\s*$/.exec(out || '');
	return m ? m[1] === '1' : null;
}

/** Reads the marker (tries again on failure); calls `done(opened)` once: `opened` true = an app was opened since the TV started. `stopped()` cancels. */
export function checkColdBoot (done: (opened: boolean) => void, stopped: () => boolean): void {
	if (!isWebOS()) return;
	const attempt = (n: number): void => {
		if (stopped()) return;
		exec(READ_COMMAND, 4000).then((out) => {
			const opened = parseMarker(out);
			if (opened === null) throw new Error('no marker answer');
			if (!stopped()) done(opened);
		}).catch(() => {
			if (n + 1 < COLD_DELAYS.length) window.setTimeout(() => attempt(n + 1), COLD_DELAYS[n + 1]);
		});
	};
	attempt(0);
}

let marked = false;
let touched = false;

/** True once this page has opened an app (the marker answer may arrive after that). */
export function openedThisPage (): boolean { return touched; }

/** Writes the marker once per page start (a failed write is tried again at the next opened app). Never throws. */
export function markOpened (): void {
	touched = true;
	if (marked || !isWebOS()) return;
	exec(WRITE_COMMAND, 4000).then(() => { marked = true; }, () => undefined);
}
