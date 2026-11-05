// Hearth's own short event log, kept in memory and shown in Settings → Debug. On a rooted TV `logfile.ts` also
// appends it to the one report file, so it survives a restart. It holds the last few dozen events: what was asked of the TV and what the TV answered.

const MAX_LINES = 40;
const MAX_CHARS = 110;       // on screen (Debug page)
const ALL_LINES = 400;       // J: the report file gets the whole session, each event up to ALL_CHARS (a test answer was cut at 110 and the file lost all but the last 40 events)
const ALL_CHARS = 1000;
const lines: string[] = [];
const all: string[] = [];
const listeners: Array<(line: string) => void> = [];

/** Called with every new line (used to copy the log to the report file). */
export function onLog (fn: (line: string) => void): void { listeners.push(fn); }

function pad (n: number): string { return n < 10 ? '0' + n : String(n); }

export function log (text: string, now: Date = new Date()): void {
	const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
	const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
	const whole = `${stamp} ${clean}`.slice(0, ALL_CHARS);
	all.push(whole);
	if (all.length > ALL_LINES) all.shift();
	lines.push(whole.slice(0, MAX_CHARS));
	listeners.forEach((fn) => fn(whole));
	if (lines.length > MAX_LINES) lines.shift();
}

/** The whole session (oldest first, full text per event): for the report file. */
export function allLogLines (): string[] { return all.slice(); }

/** Newest last. */
export function logLines (): string[] { return lines.slice(); }

export function clearLog (): void { lines.length = 0; all.length = 0; }
