// P91 (no root): the TV's own icons, kept as small pictures in localStorage once the page has loaded them, so the saved app
// list shows them at once after a restart (P85 only remembers which addresses load). Costs nothing at start: one read of
// one key; new pictures are made one at a time in the background a few seconds after a list load. A picture that cannot
// be read (the page may not be allowed to copy file:// pictures) is skipped and the address is used as before.

import {log} from './log';

const KEY = 'hearth-ssap-icondata-v1';
const SIDE = 128;
const MAX_CHARS = 60000;
const DELAY_MS = 6000;
let busy = false;

export function readIconData (): Record<string, string> {
	try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>; } catch { return {}; }
}

function toData (src: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			try {
				const side = Math.min(img.naturalWidth, img.naturalHeight);
				if (!side) throw new Error('empty');
				const canvas = document.createElement('canvas');
				const out = Math.min(SIDE, side);
				canvas.width = canvas.height = out;
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('no canvas');
				ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
				const data = canvas.toDataURL('image/png');
				if (data.length > MAX_CHARS) throw new Error('too large');
				resolve(data);
			} catch (e) { reject(e); }
		};
		img.onerror = () => reject(new Error('not loadable'));
		img.src = src;
	});
}

/** Entries whose TV address has a kept picture get it instead (instant); others keep the address. */
export function withKeptIcons<T extends {iconUrl?: string; tvIcon?: string}> (apps: T[]): T[] {
	const kept = readIconData();
	// P94b: the saved list drops data: pictures, so the TV address is remembered in `tvIcon` and looked up here
	return apps.map((a) => { const key = a.tvIcon || a.iconUrl; return key && kept[key] ? {...a, iconUrl: kept[key]} : a; });
}

/** Later, one by one: keeps pictures for addresses not yet kept; drops those of apps no longer on the TV. */
export function keepIcons (addresses: string[]): void {
	if (busy) return;
	const kept = readIconData();
	const wanted = addresses.filter((u) => u.indexOf('data:') !== 0);
	const missing = wanted.filter((u) => !kept[u]);
	const stale = Object.keys(kept).filter((u) => wanted.indexOf(u) === -1);
	if (!missing.length && !stale.length) return;
	busy = true;
	const next: Record<string, string> = {};
	wanted.forEach((u) => { if (kept[u]) next[u] = kept[u]; });
	let failed = 0;
	const save = () => {
		busy = false;
		try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { log('ssap icons: could not save (storage full)'); return; }
		log(`ssap icons: kept ${Object.keys(next).length} of ${wanted.length}${failed ? `, ${failed} could not be copied` : ''}`);
	};
	const step = (i: number) => {
		if (i >= missing.length) { save(); return; }
		toData(missing[i]).then((d) => { next[missing[i]] = d; }, () => { failed++; }).then(() => window.setTimeout(() => step(i + 1), 50));
	};
	window.setTimeout(() => step(0), DELAY_MS);
}
