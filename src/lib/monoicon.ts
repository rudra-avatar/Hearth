// "Dark mono" icon style (experimental): every app icon is turned into a white shape on the tile's dark background, once, and kept in memory.
// The shape is whatever differs from the icon's own background (found from its border), so a white logo on a coloured tile and a
// coloured logo on a white tile both become a white logo. Icons that cannot be read (the browser blocks it) stay as they are.

import {startDelay, TIER2_MS} from './startup';

// Converted icons are kept between starts (P52c): the result is a white shape with transparency and the theme colour is
// applied by a CSS mask, so one saved copy serves every theme. The key holds the converter version: bump it when monoPixels changes.
const STORE_KEY = 'hearth-mono-v3';      // Z3: v3 = masks made at up to 256 px and smoothed (v2 was 128 px, jagged edges without a tile)
const OLD_STORE_KEY = 'hearth-mono-v2';
const STORE_MAX_CHARS = 1200000;      // about 1.2 MB of the browser's storage at most
const STORE_MAX_ENTRIES = 150;
let stored: {[hash: string]: string} | null = null;   // '-' = this icon cannot be converted
let storedOrder: string[] = [];                       // oldest first
let saveTimer = 0;

function hashOf (url: string): string {
	let h = 5381;
	for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
	return `${url.length}-${h.toString(16)}`;
}
function loadStore (): {[hash: string]: string} {
	if (stored) return stored;
	stored = {};
	try { window.localStorage.removeItem(OLD_STORE_KEY); } catch { /* nothing to free */ }
	try {
		const raw = window.localStorage.getItem(STORE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && parsed.order && parsed.items) { stored = parsed.items; storedOrder = parsed.order; }
	} catch { stored = {}; storedOrder = []; }
	return stored as {[hash: string]: string};
}
function saveStoreSoon (): void {
	if (saveTimer) return;
	saveTimer = window.setTimeout(() => {
		saveTimer = 0;
		const items = loadStore();
		let chars = 0;
		storedOrder.forEach((h) => { chars += (items[h] || '').length; });
		while (storedOrder.length > 0 && (chars > STORE_MAX_CHARS || storedOrder.length > STORE_MAX_ENTRIES)) {
			const old = storedOrder.shift() as string;
			chars -= (items[old] || '').length;
			delete items[old];
		}
		try { window.localStorage.setItem(STORE_KEY, JSON.stringify({order: storedOrder, items})); } catch { /* full: the next start converts again */ }
	}, 3000);
}
function remember (url: string, result: string | null): void {
	const items = loadStore();
	const h = hashOf(url);
	if (items[h] === undefined) storedOrder.push(h);
	items[h] = result || '-';
	saveStoreSoon();
}

let on = false;
let version = 0;
const cache: {[url: string]: string | null} = {};
const queue: Array<() => void> = [];
const waiting: {[url: string]: Array<() => void>} = {};
let busy = false;

/** Switches the style on or off (called while rendering; does nothing when unchanged). */
export function setMonoIcons (value: boolean): void {
	if (value !== on) { on = value; version++; }
}
export function monoIconsOn (): boolean { return on; }
/** Changes whenever the style is switched, so a tile knows to draw itself again. */
export function monoVersion (): number { return version; }

const SIZE = 256;
/** brightness difference from the logo's body (0-1) where detail starts to be cut out, and where it is fully cut out (P47) */
const CUT_LOW = 0.18;
const CUT_HIGH = 0.32;
const BINS = 64;

/** Turns RGBA pixels into white shapes with soft edges, in place. Pure, so it is tested without a browser. */
export function monoPixels (px: Uint8ClampedArray, w: number, h: number): void {
	// the border ring: its opaque pixels give the background colour; mostly transparent means the icon has no background
	const r: number[] = [];
	const g: number[] = [];
	const b: number[] = [];
	let ring = 0;
	let clear = 0;
	const take = (x: number, y: number) => {
		const i = (y * w + x) * 4;
		ring++;
		if (px[i + 3] < 128) clear++;
		else { r.push(px[i]); g.push(px[i + 1]); b.push(px[i + 2]); }
	};
	for (let y = 0; y < h; y++) {
		if (y < 2 || y >= h - 2) { for (let x = 0; x < w; x++) take(x, y); }   // whole rows at the top and bottom
		else { take(0, y); take(1, y); take(w - 2, y); take(w - 1, y); }          // two columns on each side between
	}
	const median = (v: number[]) => { v.sort((p, q) => p - q); return v.length ? v[v.length >> 1] : 0; };
	const hasBg = clear / Math.max(1, ring) < 0.5 && r.length > 0;
	const br = median(r);
	const bg = median(g);
	const bb = median(b);
	const n = px.length >> 2;
	const strengths = new Float32Array(n);
	const lums = new Float32Array(n);
	const bins: number[] = [];
	for (let k = 0; k < BINS; k++) bins.push(0);
	let strong = 0;
	for (let p = 0; p < n; p++) {
		const i = p * 4;
		const a = px[i + 3] / 255;
		let strength: number;
		if (!hasBg) strength = a;                        // a transparent icon: its own shape
		else if (a < 0.5) strength = 0;                  // rounded corners of a filled icon stay empty
		else {
			const dr = px[i] - br;
			const dg = px[i + 1] - bg;
			const db = px[i + 2] - bb;
			const d = Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
			strength = d <= 0.08 ? 0 : d >= 0.4 ? 1 : (d - 0.08) / 0.32;
		}
		strengths[p] = strength;
		const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
		lums[p] = lum;
		if (strength >= 0.5) { bins[Math.min(BINS - 1, Math.floor(lum * BINS))]++; strong++; }
	}
	// Two levels (P47): the shape, and a cut-out where the tile shows through. The body brightness is the median brightness of
	// the shape; a pixel that differs from it by more than CUT_LOW (fully cut at CUT_HIGH), darker or brighter, is a hole, so
	// inner detail (a play triangle, text in a pill) reads clearly. One-colour logos have no such pixel and stay solid.
	let body = 0.5;
	if (strong > 0) {
		let seen = 0;
		for (let k = 0; k < BINS; k++) { seen += bins[k]; if (seen >= strong * 0.5) { body = (k + 0.5) / BINS; break; } }
	}
	for (let p = 0; p < n; p++) {
		let strength = strengths[p];
		if (strength >= 0.5) {
			const diff = Math.abs(lums[p] - body);
			const cut = diff <= CUT_LOW ? 0 : diff >= CUT_HIGH ? 1 : (diff - CUT_LOW) / (CUT_HIGH - CUT_LOW);
			strength *= 1 - cut;
		}
		const i = p * 4;
		px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
		px[i + 3] = Math.round(strength * 255);
	}
}

/** Z3: softens the edge of the shape (alpha only, a 1-2-1 blur in both directions), so a shape drawn with no tile behind it has no stair steps. Pure. */
export function smoothAlpha (px: Uint8ClampedArray, w: number, h: number): void {
	const a = new Float32Array(w * h);
	for (let p = 0; p < w * h; p++) a[p] = px[p * 4 + 3];
	const t = new Float32Array(w * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const l = a[y * w + (x > 0 ? x - 1 : x)];
		const r = a[y * w + (x < w - 1 ? x + 1 : x)];
		t[y * w + x] = (l + 2 * a[y * w + x] + r) / 4;
	}
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const u = t[(y > 0 ? y - 1 : y) * w + x];
		const d = t[(y < h - 1 ? y + 1 : y) * w + x];
		px[(y * w + x) * 4 + 3] = Math.round((u + 2 * t[y * w + x] + d) / 4);
	}
}

function convert (url: string, done: (result: string | null) => void): void {
	const img = new Image();
	img.onload = () => {
		try {
			const scale = Math.min(2, SIZE / Math.max(img.naturalWidth || SIZE, img.naturalHeight || SIZE));
			const w = Math.max(8, Math.round((img.naturalWidth || SIZE) * scale));
			const h = Math.max(8, Math.round((img.naturalHeight || SIZE) * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w; canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) { done(null); return; }
			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(img, 0, 0, w, h);
			const data = ctx.getImageData(0, 0, w, h);   // throws when the image is from another origin
			monoPixels(data.data, w, h);
			smoothAlpha(data.data, w, h);          // Z3
			ctx.putImageData(data, 0, 0);
			done(canvas.toDataURL('image/png'));
		} catch { done(null); }
	};
	img.onerror = () => done(null);
	img.src = url;
}

function next (): void {
	const job = queue.shift();
	if (!job) { busy = false; return; }
	busy = true;
	job();
}

/** The converted picture for an icon, or null while it is being made (then `ready` is called) or when it cannot be converted. */
export function monoFor (url: string, ready: () => void): string | null {
	const known = cache[url];
	if (known !== undefined) {
		if (known === null && waiting[url]) waiting[url].push(ready);   // still being made: tell every tile that asked
		return known;
	}
	const saved = loadStore()[hashOf(url)];                // converted in an earlier start
	if (saved !== undefined) { cache[url] = saved === '-' ? null : saved; return cache[url]; }
	cache[url] = null;                                    // asked once; the result replaces it
	waiting[url] = [ready];
	queue.push(() => convert(url, (result) => {
		cache[url] = result;
		remember(url, result);
		const list = waiting[url] || [];
		delete waiting[url];
		if (result) for (let i = 0; i < list.length; i++) list[i]();
		window.setTimeout(next, 0);                       // one icon at a time, so the row never stalls
	}));
	if (!busy) { busy = true; window.setTimeout(next, startDelay(TIER2_MS, 0)); }   // at start, new conversions wait until the Home button work is done
	return null;
}
