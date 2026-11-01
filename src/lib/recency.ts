// Settings -> Apps / Sources -> "Order by last opened": the home row shows the apps opened most recently first.
// The list of opened tile keys (newest first) has its own small localStorage entry; the saved manual order is never
// touched, so switching the option off brings it back. Read when a launch is noted or the row is built: no timers, no TV calls.

export const RECENT_ORDER_KEY = 'customlauncher-recent-order';
export const RECENT_MAX = 80;

export function readRecent (): string[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(RECENT_ORDER_KEY) || '[]');
		return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string' && k.length <= 200).slice(0, RECENT_MAX) : [];
	} catch { return []; }
}

export function writeRecent (list: string[]): void {
	try { localStorage.setItem(RECENT_ORDER_KEY, JSON.stringify(list)); }
	catch { /* no storage: the row then keeps the manual order */ }
}

/** `key` goes to the front of the list (once), the list stays at most RECENT_MAX long. */
export function noteRecent (list: string[], key: string): string[] {
	return [key].concat(list.filter((k) => k !== key)).slice(0, RECENT_MAX);
}

/** The tiles opened lately first (newest first), then the tiles never opened, in their manual order.
 *  Keys in `fixed` (the favourites) keep the places they hold: only the other places are filled in the new order. */
export function orderByRecent<T> (items: T[], keyOf: (item: T) => string, recent: string[], fixed: string[]): T[] {
	const isFixed: Record<string, boolean> = {};
	fixed.forEach((k) => { isFixed[k] = true; });
	const rank: Record<string, number> = {};
	recent.forEach((k, i) => { if (rank[k] === undefined) rank[k] = i; });
	const movable = items.filter((item) => !isFixed[keyOf(item)]);
	const opened = movable.filter((item) => rank[keyOf(item)] !== undefined).sort((a, b) => rank[keyOf(a)] - rank[keyOf(b)]);
	const never = movable.filter((item) => rank[keyOf(item)] === undefined);
	const queue = opened.concat(never);
	let at = 0;
	return items.map((item) => (isFixed[keyOf(item)] ? item : queue[at++]));
}
