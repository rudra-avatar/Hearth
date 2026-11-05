// Test 44 (J): how full the browser store is and how much room is left. Pure: the store is a parameter (a fake one in tests/test-probestorage.mjs).
// The headroom is measured by writing one temporary key in steps until the store refuses, then bisecting; the key is always removed again.
import {storeReport, type Store} from './storeguard';

export const FILL_KEY = 'hearth-probe-fill';

export interface Headroom { added: number; hitLimit: boolean }

/** Synchronous (no other write of this page can run in between). Cap in characters; precision about 10k. */
export function measureHeadroom (store: Store, step = 250000, cap = 12000000, key: string = FILL_KEY): Headroom {
	let lo = 0;
	let hi = -1;
	try {
		store.removeItem(key);
		while (lo + step <= cap) {
			try { store.setItem(key, 'x'.repeat(lo + step)); lo += step; } catch { hi = lo + step; break; }
		}
		while (hi !== -1 && hi - lo > 10000) {
			const mid = Math.floor((lo + hi) / 2);
			try { store.setItem(key, 'x'.repeat(mid)); lo = mid; } catch { hi = mid; }
		}
	} finally {
		try { store.removeItem(key); } catch { /* nothing to remove */ }
	}
	return {added: lo, hitLimit: hi !== -1};
}

const k = (n: number): string => `${Math.round(n / 1000)}k`;

/** One answer: totals, room left, largest keys, the two wallpaper copies. */
export function storageText (store: Store, room: Headroom): string {
	const rep = storeReport(store);          // [total line, top line]
	const len = (key: string): number => { try { const v = store.getItem(key); return v === null ? 0 : v.length; } catch { return 0; } };
	const own = len('customlauncher-wallpaper-data-v1');
	const bundled = len('hearth-bundled-data-v1');
	const total = parseInt((/, (\d+)k chars/.exec(rep[0]) || [])[1] || '0', 10) * 1000;
	const limit = room.hitLimit ? `store limit about ${k(total + room.added)}` : `no limit found up to ${k(room.added)}`;
	return `${rep[0]}; room left ${k(room.added)} (${limit}); ${rep[1]}; wallpaper copies: own ${k(own)}, bundled ${k(bundled)}${own && bundled ? ' (BOTH present)' : ''}`;
}
