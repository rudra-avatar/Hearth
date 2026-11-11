// Settings -> Apps / Sources -> "Most used" (2.1.6 p5; replaces "Order by last opened"; the saved switch key stays `orderByRecent`):
// the home row shows the most opened apps first, ties by the one opened last. Two small localStorage entries: the opened tile keys
// (newest first, the tie-break and the old list) and the open counts. Counts not saved yet are seeded from the old list (1 each),
// so the row does not jump for users who had the old switch on. The saved manual order is never touched, so switching off brings it back.
// Read when a launch is noted or the row is built: no timers, no TV calls.

export const RECENT_ORDER_KEY = 'customlauncher-recent-order';
export const RECENT_MAX = 80;
export const USAGE_KEY = 'customlauncher-usage-counts';
export const USAGE_MAX_ENTRIES = 200;
export const USAGE_HALVE_AT = 1000;

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

/** Open counts per tile key. Nothing saved yet: 1 for each tile of the old last-opened list (no write here). */
export function readUsage (): Record<string, number> {
	try {
		const raw = localStorage.getItem(USAGE_KEY);
		if (raw === null) {
			const seeded: Record<string, number> = {};
			readRecent().forEach((k) => { seeded[k] = 1; });
			return seeded;
		}
		const parsed = JSON.parse(raw);
		const out: Record<string, number> = {};
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			Object.keys(parsed).slice(0, USAGE_MAX_ENTRIES).forEach((k) => {
				const n = parsed[k];
				if (k.length <= 200 && typeof n === 'number' && isFinite(n) && n > 0) out[k] = Math.floor(n);
			});
		}
		return out;
	} catch { return {}; }
}

export function writeUsage (counts: Record<string, number>): void {
	try { localStorage.setItem(USAGE_KEY, JSON.stringify(counts)); }
	catch { /* no storage: the row then keeps the manual order */ }
}

/** `key` is opened once more. At USAGE_HALVE_AT every count is halved (old habits fade), the table stays at most USAGE_MAX_ENTRIES long. */
export function noteUsage (counts: Record<string, number>, key: string): Record<string, number> {
	let next: Record<string, number> = {};
	Object.keys(counts).forEach((k) => { next[k] = counts[k]; });
	next[key] = (next[key] || 0) + 1;
	if (next[key] >= USAGE_HALVE_AT) {
		const halved: Record<string, number> = {};
		Object.keys(next).forEach((k) => { const n = Math.floor(next[k] / 2); if (n > 0) halved[k] = n; });
		next = halved;
	}
	const keys = Object.keys(next);
	if (keys.length > USAGE_MAX_ENTRIES) {
		const keep = keys.filter((k) => k !== key).sort((a, b) => next[b] - next[a]).slice(0, USAGE_MAX_ENTRIES - 1);
		const trimmed: Record<string, number> = {};
		keep.concat([key]).forEach((k) => { if (next[k] > 0) trimmed[k] = next[k]; });
		next = trimmed;
	}
	return next;
}

/** The most opened tiles first (ties: the one opened last first), then the tiles never opened, in their manual order.
 *  Keys in `fixed` (the favourites) keep the places they hold: only the other places are filled in the new order. */
export function orderByUsage<T> (items: T[], keyOf: (item: T) => string, counts: Record<string, number>, recent: string[], fixed: string[]): T[] {
	const isFixed: Record<string, boolean> = {};
	fixed.forEach((k) => { isFixed[k] = true; });
	const rank: Record<string, number> = {};
	recent.forEach((k, i) => { if (rank[k] === undefined) rank[k] = i; });
	const at0 = (k: string) => (rank[k] === undefined ? RECENT_MAX + 1 : rank[k]);
	const movable = items.filter((item) => !isFixed[keyOf(item)]);
	const opened = movable.filter((item) => (counts[keyOf(item)] || 0) > 0).sort((a, b) => {
		const ka = keyOf(a), kb = keyOf(b);
		if (counts[kb] !== counts[ka]) return counts[kb] - counts[ka];
		return at0(ka) - at0(kb) || movable.indexOf(a) - movable.indexOf(b);
	});
	const never = movable.filter((item) => !((counts[keyOf(item)] || 0) > 0));
	const queue = opened.concat(never);
	let at = 0;
	return items.map((item) => (isFixed[keyOf(item)] ? item : queue[at++]));
}
