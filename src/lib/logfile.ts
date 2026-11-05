// Keeps the event log in the one report file (REPORT_FILE) on a rooted TV, so it survives an app restart.
// Opening the Debug tab overwrites the file with the full report; in between, new events are appended in batches.
// Nothing runs at startup: it begins after the TV has settled, and only when root works.

import {exec, shellQuote} from './apps';
import {rootState} from './failure';
import {allLogLines, onLog} from './log';
import {REPORT_FILE} from './debuginfo';

const KEEP_LINES = 100;          // what is kept from the last run
const FLUSH_MS = 4000;

let before: string[] = [];       // the end of the file as the last run left it
let queue: string[] = [];
let timer = 0;
let live = false;

/** What the file held when this run started (newest last). */
export function previousRunLines (): string[] { return before.slice(); }

function flush (): void {
	timer = 0;
	if (!queue.length) return;
	const batch = queue;
	queue = [];
	exec(`printf '%s\\n' ${batch.map(shellQuote).join(' ')} >> ${REPORT_FILE}`, 5000).catch(() => undefined);
}

/** Overwrite the file with the full report (the Debug tab does this each time it opens). */
export function writeReport (text: string): Promise<unknown> {
	queue = [];
	return exec(`printf '%s' ${shellQuote(text)} > ${REPORT_FILE}`, 5000).catch(() => undefined);
}

function begin (): boolean {
	if (rootState() !== 'yes') return false;
	live = true;
	queue = allLogLines();
	// read the old tail and trim the file to it, so it never grows without end
	const script = `t=$(tail -n ${KEEP_LINES} ${REPORT_FILE} 2>/dev/null); printf '%s\\n' "$t" > ${REPORT_FILE}; printf '%s\\n' "$t"`;
	exec(script, 5000).then((out) => { before = out.split('\n').filter((l) => l.trim() !== ''); }, () => undefined);
	timer = window.setTimeout(flush, FLUSH_MS);
	return true;
}

/** Start after `delayMs`; tries once more later if root was not known yet. Returns a stop function. */
export function startLogFile (delayMs: number): () => void {
	let t1 = 0;
	let t2 = 0;
	onLog((line) => {
		if (!live) return;
		queue.push(line);
		if (!timer) timer = window.setTimeout(flush, FLUSH_MS);
	});
	t1 = window.setTimeout(() => { if (!begin()) t2 = window.setTimeout(begin, 25000); }, delayMs);
	return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(timer); };
}
