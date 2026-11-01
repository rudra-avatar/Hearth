// W2d: a saved copy of the bundled wallpaper photo, kept the way a custom wallpaper is: a data address that is complete at
// the first frame (main.tsx puts it into `--wallpaper-image`), so the TV decodes it in one go and the photo does not wipe in
// from the top. The copy is the photo's original file bytes (no re-encoding), read once through XHR a while after start-up
// and kept in localStorage for one photo only; another photo, a gradient or an own picture replaces or drops it.
// If the copy cannot be read or saved (XHR refused, storage full) nothing changes: the photo is then read whole first
// (backgrounds.ts `photoReady`).

import {log} from './log';
import {startDelay, TIER2_MS} from './startup';

const ID_KEY = 'hearth-bundled-id-v1';
const DATA_KEY = 'hearth-bundled-data-v1';
const MAX_CHARS = 1600000;       // about 1.2 MB of picture; the largest bundled photo is 0.85 MB

let memo: {id: string; data: string | null} | null = null;
let saving = '';

/** The saved copy of this photo (a data address), or null. */
export function readBundledCopy (id: string): string | null {
	if (memo && memo.id === id) return memo.data;
	let data: string | null = null;
	try {
		if (localStorage.getItem(ID_KEY) === id) {
			const d = localStorage.getItem(DATA_KEY);
			data = d && d.indexOf('data:image/jpeg;base64,/9j/') === 0 ? d : null;
		}
	} catch { data = null; }
	memo = {id, data};
	return data;
}

/** Frees the storage when the built-in photo is no longer the wallpaper. */
export function dropBundledCopy (): void {
	memo = null;
	try { localStorage.removeItem(ID_KEY); localStorage.removeItem(DATA_KEY); } catch { /* nothing to drop */ }
}

/** Reads the photo's file bytes and saves them as the copy for `id`, once per page and photo, well after start-up. */
export function saveBundledCopy (id: string, url: string): void {
	if (readBundledCopy(id) || saving === id || typeof XMLHttpRequest === 'undefined' || typeof FileReader === 'undefined') return;
	saving = id;
	window.setTimeout(() => {
		const fail = (why: string) => { log(`wallpaper: saved copy of ${id} not made (${why})`); };
		try {
			const request = new XMLHttpRequest();
			request.open('GET', url);
			request.responseType = 'blob';
			request.onerror = () => fail('file read refused');
			request.onload = () => {
				const blob = request.response as Blob | null;
				if (!blob || !blob.size) { fail('empty'); return; }
				const reader = new FileReader();
				reader.onerror = () => fail('encode failed');
				reader.onload = () => {
					const text = String(reader.result || '');
					const comma = text.indexOf(',');
					const data = comma < 0 ? '' : 'data:image/jpeg;base64,' + text.slice(comma + 1);
					if (data.indexOf('data:image/jpeg;base64,/9j/') !== 0) { fail('not a jpeg'); return; }
					if (data.length > MAX_CHARS) { fail('too large'); return; }
					try {
						localStorage.setItem(DATA_KEY, data);
						localStorage.setItem(ID_KEY, id);
						memo = {id, data};
						log(`wallpaper: saved copy of ${id} made (${Math.round(data.length / 1024)} KB, page +${Math.round(performance.now())} ms)`);
					} catch { dropBundledCopy(); fail('storage full'); }
				};
				reader.readAsDataURL(blob);
			};
			request.send();
		} catch (e) { fail(String(e)); }
	}, startDelay(TIER2_MS, 2000));
}
