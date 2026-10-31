// Which apps show on the home row. Apps are visible unless the user hides them, so an app installed
// later appears by itself (at the end of the row, or where the user's saved order puts it).
// Older settings kept a list of the apps TO SHOW instead (anything not listed stayed hidden, which is
// why new apps used to be hidden); those are converted once, see hiddenAfterUpgrade.

/** Apps that start hidden, on new and existing settings alike, until switched on in Settings → Apps. LG's app store
 *  (LG Content Store) was left out of the app list before; listing it must not add it to anybody's row. */
export const HIDDEN_BY_DEFAULT = ['com.webos.app.discovery'];

/** Put each HIDDEN_BY_DEFAULT app on the hide-list once. `done` lists the ones already put there, so an app the user
 *  switched on stays on. `hidden === null` (old settings, not converted yet) waits for the next load: the conversion,
 *  hiddenAfterUpgrade, hides these too when the live list has them, as they were never on the old list. */
export function hideByDefault (hidden: string[] | null, done: string[]): {hidden: string[] | null; done: string[]} {
	const todo = HIDDEN_BY_DEFAULT.filter((id) => done.indexOf(id) === -1);
	if (!todo.length || hidden === null) return {hidden, done};
	return {hidden: hidden.concat(todo.filter((id) => hidden.indexOf(id) === -1)), done: done.concat(todo)};
}

/** The apps to show: the user's saved order first (skipping hidden and uninstalled ones), then every other
 *  app that isn't hidden, in the TV's order. `hidden === null` means old settings that have not been
 *  converted yet: then only the apps in the saved list show, as before. */
export function visibleApps<T extends {id: string}> (apps: T[], order: string[] | null, hidden: string[] | null): T[] {
	const byId: Record<string, T> = {};
	apps.forEach((a) => { byId[a.id] = a; });
	if (hidden === null) {
		return order ? order.filter((id) => byId[id]).map((id) => byId[id]) : apps;
	}
	const isHidden: Record<string, boolean> = {};
	hidden.forEach((id) => { isHidden[id] = true; });
	const placed: Record<string, boolean> = {};
	const ordered: T[] = [];
	(order || []).forEach((id) => {
		if (byId[id] && !isHidden[id] && !placed[id]) { ordered.push(byId[id]); placed[id] = true; }
	});
	return ordered.concat(apps.filter((a) => !placed[a.id] && !isHidden[a.id]));
}

/** Old settings listed the apps to show: every app that is installed now but not in that list was hidden
 *  (by the user, or by default). This is the hide-list that keeps them hidden. */
export function hiddenAfterUpgrade<T extends {id: string}> (apps: T[], order: string[] | null): string[] {
	if (!order) return [];
	return apps.filter((a) => order.indexOf(a.id) === -1).map((a) => a.id);
}

/** The hide-list of the settings, converting old ones (`hiddenIds === null`) with hiddenAfterUpgrade. A HIDDEN_BY_DEFAULT
 *  app that the conversion hid is noted as done, so showing it afterwards sticks. */
export function hiddenOf<T extends {id: string}> (apps: T[], c: {appIds: string[] | null; hiddenIds: string[] | null; hiddenByDefault: string[]}): {hiddenIds: string[]; hiddenByDefault: string[]} {
	if (c.hiddenIds !== null) return {hiddenIds: c.hiddenIds, hiddenByDefault: c.hiddenByDefault};
	const hidden = hiddenAfterUpgrade(apps, c.appIds);
	return {hiddenIds: hidden, hiddenByDefault: c.hiddenByDefault.concat(HIDDEN_BY_DEFAULT.filter((id) => c.hiddenByDefault.indexOf(id) === -1 && hidden.indexOf(id) !== -1))};
}

/** Add an app to the hide-list, or take it off (OK in Settings → Apps, or Hide in the hold-OK menu). */
export function toggleHidden (hidden: string[], id: string): string[] {
	return hidden.indexOf(id) === -1 ? hidden.concat(id) : hidden.filter((x) => x !== id);
}

/** The saved order with every app that is not in it yet added at the end, in the list's order. This is what puts a newly
 *  installed app after the last app of the row, instead of wherever the TV happens to list it. Returns the very same array
 *  when nothing is new (so nothing needs saving). */
export function extendOrder<T extends {id: string}> (apps: T[], order: string[] | null): string[] | null {
	if (apps.length === 0) return order;
	const known: Record<string, boolean> = {};
	(order || []).forEach((id) => { known[id] = true; });
	const added = apps.filter((a) => !known[a.id]).map((a) => a.id);
	if (added.length === 0 && order !== null) return order;
	return (order || []).concat(added);
}
