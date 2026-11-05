// 2.0.3 I2: a settings save that fails because the browser store is full frees rebuildable caches, one group at a time, and retries.
// Pure (the store is a parameter). Never touches settings, backups, themes or language packs. Order: cheapest to rebuild first.
// The wallpaper copies come last (user 2026-11-04: dismissed "never freed"); one freed copy is made again once, after the next start.

export interface Store { getItem (k: string): string | null; setItem (k: string, v: string): void; removeItem (k: string): void; key (i: number): string | null; readonly length: number }

export const FREE_ORDER: ReadonlyArray<readonly string[]> = [
	['hearth-probe-fill'],          // J: a leftover of test 44 (only if the page was killed during it)
	['hearth-mono-v3'],
	['hearth-ssap-icondata-v1'],
	['customlauncher-weather-v1'],
	['launcher-icon-cache-v1', 'launcher-icon-stamps-v1'],
	['customlauncher-apps-v1'],
	['customlauncher-wallpaper-id-v1', 'customlauncher-wallpaper-data-v1'],
	['hearth-bundled-id-v1', 'hearth-bundled-data-v1']
];

export interface WriteResult { ok: boolean; freed: string[] }

/** Writes `key`; when the store refuses, frees the next group that exists and retries, stopping at the first write that fits. */
export function writeWithRoom (store: Store, key: string, value: string, order: ReadonlyArray<readonly string[]> = FREE_ORDER): WriteResult {
	const freed: string[] = [];
	try { store.setItem(key, value); return {ok: true, freed}; } catch { /* full: free something */ }
	for (let i = 0; i < order.length; i++) {
		let any = false;
		for (let j = 0; j < order[i].length; j++) {
			try {
				if (store.getItem(order[i][j]) !== null) { store.removeItem(order[i][j]); any = true; }
			} catch { /* unreadable key: skip */ }
		}
		if (!any) continue;
		freed.push(order[i][order[i].length - 1]);
		try { store.setItem(key, value); return {ok: true, freed}; } catch { /* still full: next group */ }
	}
	return {ok: false, freed};
}

/** Two short log lines: total characters and key count, then the five largest keys (name:thousand chars). Reads every value once: only call while the Debug tab is on. */
export function storeReport (store: Store): string[] {
	const sizes: Array<[string, number]> = [];
	let total = 0;
	try {
		for (let i = 0; i < store.length; i++) {
			const k = store.key(i);
			if (k === null) continue;
			const v = store.getItem(k);
			const n = k.length + (v === null ? 0 : v.length);
			total += n;
			sizes.push([k, n]);
		}
	} catch { /* partial figures are still useful */ }
	sizes.sort((a, b) => b[1] - a[1]);
	const top = sizes.slice(0, 5).map((z) => `${z[0].replace(/^(customlauncher|hearth|launcher)-/, '').replace(/-v\d$/, '')}:${Math.round(z[1] / 1000)}k`).join(' ');
	return [`store: ${sizes.length} keys, ${Math.round(total / 1000)}k chars`, `store top: ${top}`];
}
