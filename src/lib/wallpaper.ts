// Finding and loading wallpaper pictures: USB drives, folder listings and image loading.
//
// A sideloaded web app on webOS cannot list directories, and its web view cannot load
// pictures from file:// paths. So both go through the Homebrew Channel's root shell, with
// fixed commands only (every path is checked and shell-quoted first):
//   - folders are listed with `ls -1p`;
//   - a picture is read in chunks with `dd | base64` (the same proven route the app list
//     uses for icons), put back together in memory as a Blob, and shown from a blob: URL.
//     Chunks are small because the shell service caps how much one call may print.

import {WALLPAPER} from '../config/constants';
import {exec, shellQuote} from './apps';
import {isWebOS} from './luna';
import {ensureNetFolder} from './netfolder';
import {inNetFolder} from './netfoldercmd';
import {setRootVars} from './cssvars';
import {t as tt} from '../i18n';

export interface DirEntry {
	name: string;
	isDir: boolean;
}

export interface StorageRoot {
	label: string;
	path: string;
}

const IMAGE_NAME = /\.(jpe?g|png|webp|bmp)$/i;
/** Control characters (including newline) can never be part of a path we pass to a shell. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const INTERNAL_ROOT: StorageRoot = {get label () { return tt('wallpaper.internalStorage'); }, path: '/media/developer'};
/** The folders Hearth advises for your own pictures (wallpaper) and pictures or videos (screen saver); made once on a rooted TV. */
export const WALLPAPER_FOLDER: StorageRoot = {get label () { return tt('wallpaper.wallpapersFolder'); }, path: '/media/developer/wallpapers'};
export const SAVER_FOLDER: StorageRoot = {get label () { return tt('wallpaper.screenSaversFolder'); }, path: '/media/developer/screensavers'};
const FOLDERS_KEY = 'hearth-folders-made';

/** Makes the two folders once (`mkdir -p`, never again once it worked, so a folder you delete stays deleted). A TV that cannot run
 *  commands is tried again at the next start. Never throws. */
export function ensureUserFolders (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	try { if (localStorage.getItem(FOLDERS_KEY)) return Promise.resolve(); } catch (e) { return Promise.resolve(); }
	return exec(`mkdir -p ${shellQuote(WALLPAPER_FOLDER.path)} ${shellQuote(SAVER_FOLDER.path)}; [ -d ${shellQuote(WALLPAPER_FOLDER.path)} ] && [ -d ${shellQuote(SAVER_FOLDER.path)} ] && echo made`, 6000).then((out) => {
		if (/^made$/m.test(out)) { try { localStorage.setItem(FOLDERS_KEY, '1'); } catch (e) { /* not saved: tried again next start */ } }
	}, () => undefined);
}

// ---------- path helpers ----------

export function isSafePath (path: string): boolean {
	return path.charAt(0) === '/' && !CONTROL_CHARS.test(path);
}

/** A path inside the network folder: connect it first (the TV drops the mount at every restart). Other paths: nothing. */
function netReady (path: string): Promise<void> {
	return inNetFolder(path) ? ensureNetFolder() : Promise.resolve();
}

export function isPicture (name: string): boolean {
	return name.charAt(0) !== '.' && IMAGE_NAME.test(name);
}

export function joinPath (base: string, name: string): string {
	return `${base.replace(/\/+$/, '')}/${name}`;
}

export function parentPath (path: string): string {
	const trimmed = path.replace(/\/+$/, '');
	const i = trimmed.lastIndexOf('/');
	return i <= 0 ? '/' : trimmed.slice(0, i);
}

export function baseName (path: string): string {
	const trimmed = path.replace(/\/+$/, '');
	return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
}

export function fileUrl (path: string): string {
	return 'file://' + path.split('/').map(encodeURIComponent).join('/');
}

export function shuffled<T> (list: T[]): T[] {
	const out = list.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
	}
	return out;
}

// One persisted deck per selected folder, consumed only as photos are loaded.
const SHUFFLE_KEY = 'customlauncher-wallpaper-deck-v1';

/** A short fingerprint of a list of paths (a big folder tree would otherwise fill the storage with its own list). */
function listHash (files: string[]): string {
	let h = 5381;
	for (const f of files) for (let i = 0; i < f.length; i++) h = ((h * 33) ^ f.charCodeAt(i)) >>> 0;
	return h.toString(36);
}

export function createShuffleOrder (files: string[], folderId: string) {
	const id = `${folderId}#${files.length}#${listHash(files)}`;
	let remaining: string[] = [];
	let last = '';
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(SHUFFLE_KEY) || 'null');
		if (saved && typeof saved === 'object' && 'id' in saved && saved.id === id &&
			'remaining' in saved && Array.isArray(saved.remaining) &&
			'last' in saved && typeof saved.last === 'string' && files.indexOf(saved.last) >= 0) {
			const valid = saved.remaining.filter((path): path is string => typeof path === 'string' && files.indexOf(path) >= 0);
			if (valid.length === saved.remaining.length && new Set(valid).size === valid.length && valid.indexOf(saved.last) < 0) {
				remaining = valid;
				last = saved.last;
			}
		}
	} catch { /* unavailable or corrupt storage: start a fresh deck */ }
	return {
		take (): string | undefined {
			if (!remaining.length) {
				remaining = shuffled(files);
				if (remaining.length > 1 && remaining[0] === last) {
					const swap = 1 + Math.floor(Math.random() * (remaining.length - 1));
					const first = remaining[0];
					remaining[0] = remaining[swap];
					remaining[swap] = first;
				}
			}
			return remaining.shift();
		},
		shown (path: string) {
			last = path;
			try { localStorage.setItem(SHUFFLE_KEY, JSON.stringify({id, remaining, last})); }
			catch { /* keep the in-memory deck if storage is full */ }
		}
	};
}

// ---------- listing ----------

/** Turns the output of `ls -1p` into entries: folders first, then pictures, each A–Z.
 *  Hidden files (including the "._" files macOS leaves on USB drives) and other file
 *  types are dropped. */
export function parseListing (output: string, gifs = false, zips = false, ext?: RegExp): DirEntry[] {
	const dirs: DirEntry[] = [];
	const pictures: DirEntry[] = [];
	for (const line of output.split('\n')) {
		const name = line.replace(/\r$/, '');
		if (!name || name.charAt(0) === '.') continue;
		if (name.charAt(name.length - 1) === '/') dirs.push({name: name.slice(0, -1), isDir: true});
		else if (ext ? ext.test(name) : zips ? /\.zip$/i.test(name) : isPicture(name) || (gifs && name.charAt(0) !== '.' && /\.(gif|mp4|m4v|mov|mkv|webm)$/i.test(name))) pictures.push({name, isDir: false});
	}
	const byName = (a: DirEntry, b: DirEntry) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
	return dirs.sort(byName).concat(pictures.sort(byName));
}

/** `gifs`: animated GIFs and videos are listed too (the screen saver plays them; wallpapers do not). */
export function listDir (path: string, gifs = false, zips = false, ext?: RegExp): Promise<DirEntry[]> {
	if (!isWebOS()) return Promise.resolve(mockListing(path));
	if (!isSafePath(path)) return Promise.reject(new Error('Unsafe path'));
	return netReady(path).then(() => exec(`ls -1p -- ${shellQuote(path)} 2>/dev/null`)).then((out) => parseListing(out, gifs, zips, ext));
}

/** Full paths of every picture in `path` and in all folders inside it (no limit). The list is made in a temporary file on the TV
 *  and read back in pages, so a very large tree never hits the shell service's output limit. Hidden files and folders are skipped. */
const DEEP_FILE = '/tmp/hearth-wallpaper-list';
const DEEP_PAGE = 250;
const DEEP_NAMES = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].map((x) => `-iname '*.${x}'`).join(' -o ');
export function listImagesDeep (path: string): Promise<string[]> {
	if (!isWebOS()) return Promise.resolve(listImages(path));
	if (!isSafePath(path)) return Promise.reject(new Error('Unsafe path'));
	const out: string[] = [];
	const page = (from: number, total: number): Promise<string[]> => {
		if (from > total) return Promise.resolve(out);
		return exec(`sed -n '${from},${from + DEEP_PAGE - 1}p' ${DEEP_FILE}`).then((text) => {
			for (const line of text.split('\n')) {
				const f = line.replace(/\r$/, '');
				if (f && isPicture(baseName(f)) && f.slice(path.length).indexOf('/.') < 0) out.push(f);
			}
			return page(from + DEEP_PAGE, total);
		});
	};
	return netReady(path).then(() => exec(`find -L ${shellQuote(path)} -type f \\( ${DEEP_NAMES} \\) 2>/dev/null | sort > ${DEEP_FILE}; wc -l < ${DEEP_FILE}`)).then((n) => {
		const total = parseInt(n.trim(), 10) || 0;
		return page(1, total);
	}).then((list) => exec(`rm -f ${DEEP_FILE}; true`).then(() => list, () => list));
}

/** Full paths of the pictures directly inside `path`; with `recursive`, also those in the folders inside it. No limit on the count. */
export function listImages (path: string, recursive = false): Promise<string[]> {
	if (recursive) return listImagesDeep(path);
	return listDir(path).then((entries) =>
		entries.filter((e) => !e.isDir).map((e) => joinPath(path, e.name))
	);
}

/** Reads /proc/mounts and returns the mounted USB drives, plus the TV's own developer
 *  storage (where pictures can also be put with scp). */
export function parseMounts (output: string): StorageRoot[] {
	const roots: StorageRoot[] = [];
	for (const line of output.split('\n')) {
		const parts = line.split(' ');
		if (parts.length < 3) continue;
		const mount = parts[1].replace(/\\040/g, ' ');
		const isUsb = /^\/dev\/sd[a-z]/.test(parts[0]) || /\/usb\//i.test(mount);
		if (!isUsb || !isSafePath(mount) || roots.some((r) => r.path === mount)) continue;
		roots.push({label: 'USB drive', path: mount});
	}
	if (roots.length > 1) roots.forEach((r, i) => { r.label = tt('wallpaper.usbDriveV1', {v1: i + 1}); });
	return roots;
}

export function listRoots (): Promise<StorageRoot[]> {
	if (!isWebOS()) return Promise.resolve([{label: tt('wallpaper.usbDrive'), path: '/tmp/usb/sda/sda1'}, INTERNAL_ROOT]);
	// Rejects when the shell service isn't reachable, so the picker can say why it is empty.
	return exec('cat /proc/mounts').then((out) => parseMounts(out).concat(INTERNAL_ROOT));
}

// ---------- loading a picture ----------

export type PictureProblem = 'bad-path' | 'unreadable' | 'too-large' | 'too-many-pixels' | 'not-a-picture';

export interface PictureError extends Error {
	problem: PictureProblem;
}

function pictureError (problem: PictureProblem, message: string): PictureError {
	const error = new Error(message) as PictureError;
	error.problem = problem;
	return error;
}

const MIME_TYPES: Record<string, string> = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp'};

export function mimeType (path: string): string {
	const extension = (/\.([A-Za-z0-9]+)$/.exec(path) || [])[1];
	return (extension && MIME_TYPES[extension.toLowerCase()]) || 'image/jpeg';
}

type Run = (command: string, timeoutMs?: number) => Promise<string>;

function decodeBase64 (text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Reads a file through the shell, `chunkBytes` per call, a few calls at a time.
 *  Resolves with the pieces in order. `run` is the shell (injectable for tests). */
export function readFileChunks (path: string, run: Run = exec): Promise<Uint8Array[]> {
	if (!isSafePath(path)) return Promise.reject(pictureError('bad-path', tt('wallpaper.thatFileNameCanT')));
	const quoted = shellQuote(path);
	const chunk = WALLPAPER.chunkBytes;

	return (run === exec ? netReady(path) : Promise.resolve()).then(() => run(`wc -c < ${quoted}`)).then((out) => {
		const size = parseInt(out.trim(), 10);
		if (!(size > 0)) throw pictureError('unreadable', "Can't read that picture");
		if (size > WALLPAPER.maxBytes) {
			throw pictureError('too-large', `That picture is ${(size / 1048576).toFixed(1)} MB; the limit is ${Math.round(WALLPAPER.maxBytes / 1048576)} MB`);
		}
		const count = Math.ceil(size / chunk);
		const parts: Uint8Array[] = new Array(count);

		const readBatch = (first: number): Promise<Uint8Array[]> => {
			if (first >= count) return Promise.resolve(parts);
			const indexes: number[] = [];
			for (let i = first; i < Math.min(count, first + WALLPAPER.parallelChunks); i++) indexes.push(i);
			return Promise.all(indexes.map((i) =>
				run(`dd if=${quoted} bs=${chunk} skip=${i} count=1 2>/dev/null | base64 | tr -d '\\n'`).then((text) => {
					const b64 = text.trim();
					if (!b64 || !/^[A-Za-z0-9+\/=]+$/.test(b64)) throw pictureError('unreadable', "Can't read that picture");
					return decodeBase64(b64);
				})
			)).then((got) => {
				got.forEach((bytes, k) => { parts[indexes[k]] = bytes; });
				return readBatch(first + WALLPAPER.parallelChunks);
			});
		};
		return readBatch(0);
	});
}

export interface LoadedPicture {
	/** what to show: a blob: URL (give it back with releasePicture) */
	url: string;
	/** a screen-sized JPEG (data URL) for the startup cache; null when it couldn't be made */
	snapshot: string | null;
}

const SCREEN = {width: 1920, height: 1080};

/** The size to draw a picture at so it just covers the screen (never enlarged). */
export function coverSize (width: number, height: number): {width: number; height: number} {
	const scale = Math.min(1, Math.max(SCREEN.width / width, SCREEN.height / height));
	return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

/** Pictures much bigger than the screen are shrunk before showing: the TV would otherwise hold
 *  the whole full-size bitmap in memory for a 1080p screen. */
export function isOversized (width: number, height: number): boolean {
	return width > SCREEN.width * 1.5 || height > SCREEN.height * 1.5;
}

/** Resolves with the picture to show, or rejects with a PictureError whose message says what
 *  went wrong. */
export function loadPicture (path: string): Promise<LoadedPicture> {
	if (!isSafePath(path)) return Promise.reject(pictureError('bad-path', tt('wallpaper.thatFileNameCanT')));
	const source: Promise<string> = isWebOS()
		? readFileChunks(path).then((parts) => URL.createObjectURL(new Blob(parts as unknown as BlobPart[], {type: mimeType(path)})))
		: Promise.resolve(fileUrl(path));        // desktop preview: file:// works there
	return source.then((url) => decode(url).then(
		(img) => prepare(url, img),
		(error: Error) => { releasePicture(url); throw error; }
	));
}

export function releasePicture (url: string): void {
	if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
}

/** Draws the picture at screen size for the startup cache, and, when it is huge, shows that
 *  smaller copy instead of the original. */
function prepare (url: string, img: HTMLImageElement): Promise<LoadedPicture> {
	const size = coverSize(img.naturalWidth, img.naturalHeight);
	let canvas: HTMLCanvasElement | null = null;
	let snapshot: string | null = null;
	try {
		canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('no canvas');
		context.drawImage(img, 0, 0, size.width, size.height);
		snapshot = canvas.toDataURL('image/jpeg', 0.82);
	} catch {
		canvas = null;
		snapshot = null;
	}
	if (!canvas || !isOversized(img.naturalWidth, img.naturalHeight)) return Promise.resolve({url, snapshot});
	const shrunk = canvas;
	return new Promise<LoadedPicture>((resolve) => {
		shrunk.toBlob((blob) => {
			if (!blob) { resolve({url, snapshot}); return; }
			releasePicture(url);
			resolve({url: URL.createObjectURL(blob), snapshot});
		}, 'image/jpeg', 0.9);
	});
}

function decode (url: string): Promise<HTMLImageElement> {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		const timer = window.setTimeout(() => done(() => reject(pictureError('not-a-picture', tt('wallpaper.thePictureTookTooLong')))), WALLPAPER.probeTimeoutMs);
		const done = (fn: () => void) => {
			window.clearTimeout(timer);
			img.onload = null;
			img.onerror = null;
			fn();
		};
		img.onload = () => done(() => {
			const megapixels = Math.round(img.naturalWidth * img.naturalHeight / 1000000);
			if (img.naturalWidth * img.naturalHeight > WALLPAPER.maxPixels) {
				reject(pictureError('too-many-pixels', tt('wallpaper.thatPictureIsMegapixelsMegapixels', {megapixels, v2: WALLPAPER.maxPixels / 1000000})));
			} else resolve(img);
		});
		img.onerror = () => done(() => reject(pictureError('not-a-picture', tt('wallpaper.theTvCouldnTOpen'))));
		img.src = url;
	});
}

// ---------- the startup cache: the picture last on screen, at screen size ----------

const CACHE_ID_KEY = 'customlauncher-wallpaper-id-v1';
const CACHE_DATA_KEY = 'customlauncher-wallpaper-data-v1';

export function wallpaperCacheId (mode: string, path: string): string {
	return `${mode}|${path}`;
}

/** The cached picture for this wallpaper choice (a data URL), or null. */
export function readWallpaperCache (id: string): string | null {
	try {
		if (localStorage.getItem(CACHE_ID_KEY) !== id) return null;
		const data = localStorage.getItem(CACHE_DATA_KEY);
		return data && data.indexOf('data:image/') === 0 ? data : null;
	} catch { return null; }
}

// P56: a single saved picture (or a folder's saved picture) is painted by CSS before the first render, the way the bundled
// photos are: main.tsx calls `startEarlyStatic`, which reads the saved copy once and puts it into `--wallpaper-image`.
// `Wallpaper` takes the same copy (no second read) and, once its own layer is drawn, calls `endEarlyStatic`. At a lower opacity a black veil is added (P67). Nothing else changes.
let earlyStatic: {id: string; data: string} | null = null;
let earlyTimer = 0;

export function startEarlyStatic (mode: string, path: string, recursive: boolean, opacity: number): void {
	if (mode === 'gradient' || !path || opacity <= 0) return;
	const id = wallpaperCacheId(mode, path + (recursive ? '|sub' : ''));
	const data = readWallpaperCache(id);
	if (!data) return;
	earlyStatic = {id, data};
	// P67: below full strength a black veil of the missing share stands in for the lower opacity (exact on black themes)
	const share = ((100 - opacity) / 100).toFixed(2);
	setRootVars({'--wallpaper-image': `url(\"${data}\")`, '--wallpaper-veil': opacity < 100 ? `linear-gradient(rgba(0,0,0,${share}),rgba(0,0,0,${share}))` : 'none'});
	earlyTimer = window.setTimeout(endEarlyStatic, 5000);       // never stays if the component does not take over
}

/** The saved copy read in main.tsx for this choice, once (null when none). */
export function takeEarlyStatic (id: string): string | null {
	const e = earlyStatic;
	return e && e.id === id ? e.data : null;
}

/** The component's own layer is drawn: the early picture goes (the same picture is underneath). */
export function endEarlyStatic (): void {
	if (!earlyStatic) return;
	window.clearTimeout(earlyTimer);
	earlyStatic = null;
	setRootVars({'--wallpaper-image': 'none', '--wallpaper-veil': 'none'});
}

// p31b: the picture last shown by a folder slideshow without shuffle (shuffle keeps its own deck), so a restart carries on after it instead of at the first file
const LAST_KEY = 'hearth-wallpaper-last-v1';
export function readLastShown (id: string): string | null {
	try {
		const v: unknown = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
		return v && typeof v === 'object' && 'id' in v && 'path' in v && (v as {id: unknown}).id === id && typeof (v as {path: unknown}).path === 'string' ? (v as {path: string}).path : null;
	} catch { return null; }
}
export function writeLastShown (id: string, path: string): void {
	try { localStorage.setItem(LAST_KEY, JSON.stringify({id, path})); } catch { /* storage full: the slideshow starts at the first file next time */ }
}

export function writeWallpaperCache (id: string, data: string): boolean {
	try {
		localStorage.setItem(CACHE_DATA_KEY, data);
		localStorage.setItem(CACHE_ID_KEY, id);
		return true;
	} catch { return false; }      // quota exceeded: the next start just loads the picture normally
}

export function clearWallpaperCache (): void {
	try { localStorage.removeItem(CACHE_ID_KEY); localStorage.removeItem(CACHE_DATA_KEY); } catch { /* ignore */ }
}

// ---------- sample data, so the layout can be developed in a desktop browser ----------

function mockListing (path: string): DirEntry[] {
	if (path === '/tmp/usb/sda/sda1') return [
		{name: tt('wallpaper.wallpapers'), isDir: true}, {name: tt('wallpaper.holiday2025'), isDir: true}, {name: 'cover.jpg', isDir: false}
	];
	return [
		{name: 'mountains.jpg', isDir: false}, {name: 'night-sky.png', isDir: false}, {name: 'sea.jpg', isDir: false}
	];
}
