// The icon cache is keyed by the icon file's path, and an app update often keeps the path while
// changing the picture. So next to each cached icon Hearth remembers the file's size and change
// time ("stamp"), read for every icon with one `stat` command, and an icon whose stamp changed is
// read again. Pure (no imports from the app), so it can be tested on its own.

export const ICON_STAMPS_KEY = 'launcher-icon-stamps-v1';

/** One shell command for every icon: "<size> <mtime> <path>" per line. Paths are already validated
 *  (SAFE_PATH) and quoted by the caller; a missing file is just left out. */
export function stampCommand (quotedPaths: string[]): string {
	return `stat -c '%s %Y %n' ${quotedPaths.join(' ')} 2>/dev/null; true`;
}

/** path -> "size:mtime" from stampCommand's output; lines that don't fit are ignored. */
export function parseStamps (out: string): Record<string, string> {
	const stamps: Record<string, string> = {};
	for (const line of out.split('\n')) {
		const match = /^(\d+) (\d+) (\/\S+)$/.exec(line.trim());
		if (match) stamps[match[3]] = `${match[1]}:${match[2]}`;
	}
	return stamps;
}

/** Whether a cached icon can be used as it is. With no stamp for the file now (stat failed or not
 *  run) the cache is trusted, as before; otherwise the stamp saved with the icon must match. An icon
 *  cached before stamps existed has none saved, so it is read once more. */
export function iconIsFresh (path: string, now: Record<string, string>, saved: Record<string, string>): boolean {
	const current = now[path];
	return current === undefined || saved[path] === current;
}
