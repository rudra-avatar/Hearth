// The last list of recent apps, kept in localStorage, so the Recent apps panel is drawn the moment it opens: reading the
// TV's list is a shell command through the Homebrew Channel, which can take a second or more. The panel then reads the
// list again in the background and updates itself only if it changed.

export interface RecentApp {
	id: string;
	title: string;
}

export const RECENTS_CACHE_KEY = 'customlauncher-recents-v1';

/** An app id as the TV's list gives it (and as it may go into a shell command, quoted). */
export const ID_RE = /^[A-Za-z0-9._-]+$/;

export function serializeRecents (list: RecentApp[]): string {
	return JSON.stringify(list.map((a) => ({id: a.id, title: a.title})));
}

/** The saved list; null when there is none (or it cannot be read), so the panel waits for the TV instead. */
export function deserializeRecents (json: string | null): RecentApp[] | null {
	if (!json) return null;
	try {
		const list = JSON.parse(json) as Partial<RecentApp>[];
		if (!Array.isArray(list)) return null;
		return list
			.filter((a) => a && typeof a.id === 'string' && ID_RE.test(a.id) && typeof a.title === 'string')
			.map((a) => ({id: a.id as string, title: a.title as string}));
	} catch {
		return null;
	}
}

export function sameRecents (a: RecentApp[], b: RecentApp[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id || a[i].title !== b[i].title) return false;
	return true;
}

/** The list with the app `id` first, as the TV has it once the app is opened: moved there, or added with `title` when it
 *  is not in the list; the same list when it is already first. */
export function moveToFront (list: RecentApp[], id: string, title: string): RecentApp[] {
	let at = -1;
	for (let i = 0; i < list.length; i++) if (list[i].id === id) { at = i; break; }
	if (at === 0) return list;
	if (at === -1) return [{id, title}].concat(list);
	return [list[at]].concat(list.slice(0, at), list.slice(at + 1));
}

/** The list without the given apps (just closed); the same list when none of them is in it. */
export function withoutApps (list: RecentApp[], ids: string[]): RecentApp[] {
	const rest = list.filter((a) => ids.indexOf(a.id) === -1);
	return rest.length === list.length ? list : rest;
}

/** Where the highlight goes when the list shown is replaced by a newer one. Once the user has moved, it stays on the
 *  same app wherever that app now is; before that (and when the app is gone) it keeps its place. */
export function followFocus (before: RecentApp[], after: RecentApp[], index: number, moved: boolean): number {
	if (!after.length) return 0;
	const was = before[index];
	if (moved && was) {
		for (let i = 0; i < after.length; i++) if (after[i].id === was.id) return i;
	}
	return Math.max(0, Math.min(after.length - 1, index));
}
