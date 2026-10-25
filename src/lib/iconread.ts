// Reading app icons through the Homebrew Channel's shell, in small groups.
//
// The service caps how much a command may print (Node's exec maxBuffer: 200 KB on the Node 8 of webOS 6).
// A command that prints more fails as a whole ("stdout maxBuffer exceeded"), so reading every icon in one
// command lost ALL icons on TVs with many apps. Reading a few per command keeps each answer small, and if
// one group still fails, its icons are tried one at a time, so a single oversized icon only costs itself.

export interface IconWanted { id: string; path: string; }

/** Quote a value for a POSIX shell. Defence in depth: paths are also validated by the caller. */
export function shellQuote (value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Splits `items` into groups of at most `size` (at least 1). */
export function groups<T> (items: T[], size: number): T[][] {
	const step = Math.max(1, Math.floor(size));
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
	return out;
}

/** One line per icon: "<index> <base64>". busybox base64 has no -w, so newlines are stripped.
 *  Icons are named by index, so app IDs never reach the shell. */
export function iconScript (paths: string[]): string {
	return paths
		.map((path, i) => `printf '%d ' ${i}; base64 ${shellQuote(path)} 2>/dev/null | tr -d '\\n'; echo`)
		.join('; ');
}

/** Parses iconScript's output: index → base64. Lines that are empty (unreadable file) or malformed are skipped. */
export function parseIconOutput (out: string, count: number): Record<number, string> {
	const result: Record<number, string> = {};
	for (const line of out.split('\n')) {
		const match = /^(\d+) ([A-Za-z0-9+\/=]+)$/.exec(line);
		if (!match) continue;
		const index = Number(match[1]);
		if (index < count) result[index] = match[2];
	}
	return result;
}

/** Runs `tasks` with at most `limit` at once; resolves when all have settled. */
export function runLimited (tasks: (() => Promise<void>)[], limit: number): Promise<void> {
	let next = 0;
	const worker = (): Promise<void> => {
		if (next >= tasks.length) return Promise.resolve();
		const task = tasks[next++];
		return task().catch(() => undefined).then(worker);
	};
	const workers: Promise<void>[] = [];
	for (let i = 0; i < Math.max(1, Math.min(limit, tasks.length)); i++) workers.push(worker());
	return Promise.all(workers).then(() => undefined);
}

/** Reads `wanted` icons with `run` (a shell runner that resolves with stdout), `perCall` per command and
 *  `parallel` commands at once. Resolves with path → base64 for every icon that could be read; never rejects. */
export function readIcons (
	wanted: IconWanted[],
	run: (command: string) => Promise<string>,
	perCall: number,
	parallel: number
): Promise<Record<string, string>> {
	const found: Record<string, string> = {};
	const readGroup = (group: IconWanted[]): Promise<void> =>
		run(iconScript(group.map((w) => w.path))).then((out) => {
			const data = parseIconOutput(out, group.length);
			group.forEach((w, i) => { if (data[i]) found[w.path] = data[i]; });
		});
	const tasks = groups(wanted, perCall).map((group) => () =>
		readGroup(group).catch(() => {
			// the whole group failed (most likely too much output): try its icons one at a time
			if (group.length < 2) return;
			return runLimited(group.map((w) => () => readGroup([w])), 1);
		})
	);
	return runLimited(tasks, parallel).then(() => found);
}
