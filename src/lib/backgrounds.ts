// Built-in backgrounds (Settings → Wallpaper → Built-in background): plain colours and gradients drawn by CSS, so
// they cost no memory and no start-up time, and a few bundled pictures (public/wallpapers, 1920 px wide, painted by CSS
// behind everything, so they need no root). 'theme' is the current theme's own background.

import {setRootVars} from './cssvars';
import {td} from '../i18n';
import {readBundledCopy, saveBundledCopy, dropBundledCopy} from './bundledcopy';

export interface Background {
	id: string;
	/** read from the string table: `bg.<id>`, or `bg.photo` with the number for bundled photos (T1c) */
	label: string;
	/** the number shown for a bundled photo */
	num?: number;
	/** gradient start, middle, end (the same colour three times for a plain one) */
	colors: [string, string, string];
	/** a bundled picture (path inside the app); the colours are what shows until it has loaded */
	image?: string;
}

const plain = (c: string): [string, string, string] => [c, c, c];

const RAW_BACKGROUNDS: readonly Omit<Background, 'label'>[] = [
	{id: 'theme', colors: ['', '', '']},
	{id: 'photo-show', colors: ['#10161a', '#10161a', '#080b0d']},
	{id: 'photo-17', num: 1, colors: ['#1a251a', '#141e13', '#09130c'], image: 'wallpapers/photo-17.jpg'},
	{id: 'photo-02', num: 2, colors: ['#06102e', '#0a1c47', '#192855'], image: 'wallpapers/photo-02.jpg'},
	{id: 'photo-03', num: 3, colors: ['#455463', '#acaeb1', '#999792'], image: 'wallpapers/photo-03.jpg'},
	{id: 'photo-04', num: 4, colors: ['#54548b', '#402b50', '#4b3f6d'], image: 'wallpapers/photo-04.jpg'},
	{id: 'photo-05', num: 5, colors: ['#94b6cb', '#869192', '#3f3c2f'], image: 'wallpapers/photo-05.jpg'},
	{id: 'photo-06', num: 6, colors: ['#d4d7d5', '#b0b2af', '#1e2023'], image: 'wallpapers/photo-06.jpg'},
	{id: 'photo-07', num: 7, colors: ['#10232e', '#17232f', '#1f2b39'], image: 'wallpapers/photo-07.jpg'},
	{id: 'photo-08', num: 8, colors: ['#005a62', '#066e60', '#021d1e'], image: 'wallpapers/photo-08.jpg'},
	{id: 'photo-09', num: 9, colors: ['#5b6fc7', '#3349b0', '#405dd8'], image: 'wallpapers/photo-09.jpg'},
	{id: 'photo-10', num: 10, colors: ['#787b89', '#2c485c', '#192d3a'], image: 'wallpapers/photo-10.jpg'},
	{id: 'photo-11', num: 11, colors: ['#535e69', '#606363', '#343b41'], image: 'wallpapers/photo-11.jpg'},
	{id: 'photo-12', num: 12, colors: ['#95aeae', '#106e75', '#457351'], image: 'wallpapers/photo-12.jpg'},
	{id: 'photo-13', num: 13, colors: ['#7da5c5', '#5b7993', '#28455c'], image: 'wallpapers/photo-13.jpg'},
	{id: 'photo-14', num: 14, colors: ['#0e4673', '#255784', '#323130'], image: 'wallpapers/photo-14.jpg'},
	{id: 'photo-15', num: 15, colors: ['#17211f', '#1d3125', '#192823'], image: 'wallpapers/photo-15.jpg'},
	{id: 'photo-16', num: 16, colors: ['#6b9098', '#b8c2b0', '#7c6559'], image: 'wallpapers/photo-16.jpg'},
	{id: 'photo-20', num: 17, colors: ['#929bb0', '#6895a7', '#243235'], image: 'wallpapers/photo-20.jpg'},
	{id: 'photo-18', num: 18, colors: ['#b7a390', '#735e50', '#392e2b'], image: 'wallpapers/photo-18.jpg'},
	{id: 'photo-19', num: 19, colors: ['#6e685e', '#454942', '#273935'], image: 'wallpapers/photo-19.jpg'},
	{id: 'photo-01', num: 20, colors: ['#e2a0ae', '#956da0', '#69619f'], image: 'wallpapers/photo-01.jpg'},
	{id: 'photo-21', num: 21, colors: ['#0288b1', '#0482a6', '#0183a7'], image: 'wallpapers/photo-21.jpg'},
	{id: 'photo-22', num: 22, colors: ['#101957', '#274d8e', '#3c4c6e'], image: 'wallpapers/photo-22.jpg'},
	{id: 'photo-23', num: 23, colors: ['#132929', '#78533b', '#323934'], image: 'wallpapers/photo-23.jpg'},
	{id: 'photo-24', num: 24, colors: ['#889894', '#869787', '#375149'], image: 'wallpapers/photo-24.jpg'},
	{id: 'photo-25', num: 25, colors: ['#0a283c', '#235e72', '#214553'], image: 'wallpapers/photo-25.jpg'},
	{id: 'charcoal', colors: plain('#1a1a1a')},
	{id: 'navy', colors: plain('#0d1b2a')},
	{id: 'dusk', colors: ['#2b1055', '#5b2a86', '#1a0b2e']},
	{id: 'ocean', colors: ['#06202e', '#0b4a63', '#04141c']},
	{id: 'forest', colors: ['#0b2415', '#1c4a2c', '#07140c']},
	{id: 'ember', colors: ['#2a0a0a', '#6b1d14', '#14070a']},
	{id: 'aurora', colors: ['#06181f', '#0f4c4a', '#1b2a5e']},
	{id: 'cloud', colors: ['#c6d0dc', '#aebbca', '#93a5b8']},
	{id: 'peach', colors: ['#f2d8c6', '#e6bfa6', '#d4a088']},
	{id: 'mint', colors: ['#cfe3d6', '#b2d3bf', '#8fbba3']},
	{id: 'sky', colors: ['#c9dcee', '#aac7e2', '#86acd0']},
	{id: 'lavender', colors: ['#ddd5ee', '#c6b9e0', '#a99bcc']}
];

export const BACKGROUNDS: readonly Background[] = RAW_BACKGROUNDS.map((b) => {
	const row = {...b} as Background;
	Object.defineProperty(row, 'label', {get: () => (b.num ? td('bg.photo', {n: b.num}) : td('bg.' + b.id)), enumerable: true});
	return row;
});

/** The bundled photos, and the id of the slideshow that plays them one after another (see app.tsx). */
export const PHOTO_SHOW = 'photo-show';
export const PHOTO_IDS: string[] = BACKGROUNDS.filter((b) => !!b.image).map((b) => b.id);

/** The next photo of the slideshow: a random other one when shuffled, else the following one. */
export function nextPhoto (index: number, shuffle: boolean): number {
	const n = PHOTO_IDS.length;
	if (n < 2) return 0;
	if (!shuffle) return (index + 1) % n;
	const r = Math.floor(Math.random() * (n - 1));
	return r >= index ? r + 1 : r;
}

/** Address of the bundled photo with this index (absolute: see `imageUrl`). */
export function photoUrl (index: number): string {
	const b = BACKGROUNDS.filter((x) => x.id === PHOTO_IDS[index])[0];
	return b && b.image ? imageUrl(b.image) : '';
}

let early = -1;
let earlyImage: HTMLImageElement | null = null;

/** P54: with the photo slideshow on, picks its first photo and starts loading it before the first draw (main.tsx), so it is
 *  already on its way when `PhotoShow` asks for it (same address, so the browser reuses the request). */
export function startEarlyPhoto (background: string, wallpaperMode: string): void {
	if (background !== PHOTO_SHOW || wallpaperMode !== 'gradient' || typeof Image === 'undefined') return;
	early = Math.floor(Math.random() * PHOTO_IDS.length);
	earlyImage = new Image();
	earlyImage.src = photoUrl(early);
}

/** The index chosen by `startEarlyPhoto`, once (-1 when none). */
export function takeEarlyPhoto (): number {
	const i = early;
	early = -1;
	return i;
}

export const BACKGROUND_IDS: string[] = BACKGROUNDS.map((b) => b.id);

export function backgroundLabel (id: string): string {
	const b = BACKGROUNDS.filter((x) => x.id === id)[0];
	return b ? b.label : BACKGROUNDS[0].label;
}

/** A custom property's url() is resolved against the stylesheet (assets/), not the page, so the page's address is used. */
function imageUrl (path: string): string {
	return typeof document !== 'undefined' && document.baseURI ? new URL(path, document.baseURI).href : path;
}

// W2c: a bundled photo used to be the CSS background by its file address, so the TV painted it while the file was still
// arriving and decoding (the wipe from top to bottom). A saved own picture is a data address, complete from the first frame,
// and never wipes. Now the photo is read whole first (this Image is kept so the file stays in memory) and set as the
// background only when it is complete; until then the theme gradient shows. `builtIn` is false while an own picture is used.
let photoHold: HTMLImageElement | null = null;
let heldUrl = '';
let photoSeq = 0;

/** True when the photo is complete and can be painted now; else starts reading it and sets it as background when done. */
function photoReady (url: string, id: string): boolean {
	if (photoHold && heldUrl === url && photoHold.complete && photoHold.naturalWidth > 0) { saveBundledCopy(id, url); return true; }
	const seq = ++photoSeq;
	const img = new Image();
	img.onload = () => {
		if (seq !== photoSeq) return;
		photoHold = img;
		heldUrl = url;
		setRootVars({'--wallpaper-image': `url("${url}")`});
		saveBundledCopy(id, url);
	};
	img.src = url;
	if (img.complete && img.naturalWidth > 0) { photoHold = img; heldUrl = url; saveBundledCopy(id, url); return true; }
	return false;
}

/** Puts the chosen background on screen; 'theme' puts the theme's own colours back. */
/** With no picture on screen the scrim shades only the plain background, so it is left out when that is pure black
 *  (it would change nothing) or when the theme has no scrim. */
export function applyBackground (id: string, themeColors: {wallpaperStart: string; wallpaperMid: string; wallpaperEnd: string; scrimTop?: string; scrimMid?: string; scrimBottom?: string}, builtIn = true): void {
	const b = BACKGROUNDS.filter((x) => x.id === id)[0];
	const c: [string, string, string] = b && b.id !== 'theme' ? b.colors : [themeColors.wallpaperStart, themeColors.wallpaperMid, themeColors.wallpaperEnd];
	const black = c.every((x) => /^#0{3}(0{3})?$/.test(x));
	const noScrim = themeColors.scrimTop !== undefined && Number(themeColors.scrimTop) === 0 && Number(themeColors.scrimMid) === 0 && Number(themeColors.scrimBottom) === 0;
	const url = builtIn && b && b.image ? imageUrl(b.image) : '';
	if (!url) { photoSeq++; dropBundledCopy(); }       // a photo still being read must not be set after another choice; the saved copy goes
	const copy = url && b ? readBundledCopy(b.id) : null;
	if (copy) photoSeq++;       // W2d: the saved copy is complete at the first frame (no wipe)
	setRootVars({
		'--color-wallpaper-start': c[0], '--color-wallpaper-mid': c[1], '--color-wallpaper-end': c[2],
		'--wallpaper-image': copy ? `url("${copy}")` : url && b && photoReady(url, b.id) ? `url("${url}")` : 'none',
		'--scrim-bare-display': (black && !(b && b.image)) || noScrim ? 'none' : 'block'
	});
}
