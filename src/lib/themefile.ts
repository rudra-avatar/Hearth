// P78: the format of a user theme (a zip file, format 1) and its pure validator. No file or TV access here: the loader
// (P79) lists the zip's files with their sizes and reads manifest.json, this checks them and returns a clean theme or the
// reasons it was refused. Nothing in a theme can run: only data files are allowed. There is NO limit on counts (apps,
// icons, fonts, cities); only a very high size guard per file against broken or absurd files.

import {THEME_IDS, ICON_STYLE_IDS} from './storage';
import {BUILTIN_FONT_IDS} from './clockfont';
import {PLAIN_COLOR_IDS, validInk} from './clockcolor';
import {t as tt} from '../i18n';

export const THEME_FORMAT = 1;
/** a file bigger than this is refused (broken or absurd file); counts are never limited */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 3 * 1024 * 1024;   // read in one piece by the loader (about 25 000 apps)
export const MANIFEST_FILE = 'manifest.json';
/** the errors listed in a pop-up (the rest are counted) */
export const MAX_ERRORS_SHOWN = 6;

export const THEME_ICON_EXT = ['png', 'jpg', 'jpeg'];
export const THEME_FONT_EXT = ['woff2', 'woff', 'ttf', 'otf'];
/** every file of the zip must be one of these (no scripts, pages or programs); .md and .txt are notes for people */
export const THEME_FILE_EXT = THEME_ICON_EXT.concat(THEME_FONT_EXT, ['json', 'md', 'txt']);

export interface ThemeCity {name: string; lat: number; lon: number; detail?: string}
export interface ThemeFont {id: string; label: string; file: string}
export interface ThemeApp {id: string; name?: string}
export interface ThemeIcon {app: string; file: string}
/** P96: the wallpaper of a theme: one picture (`file`) or the pictures of a folder inside the zip (`folder`, a slideshow); own files only */
export interface ThemeWallpaper {file?: string; folder?: string; intervalSec?: number; shuffle?: boolean}
export const THEME_WALLPAPER_MIN_SEC = 5;
export const THEME_WALLPAPER_MAX_SEC = 3600;

/** A checked theme: every part is optional (a missing part changes nothing). */
export interface ThemeData {
	name: string;
	author?: string;
	colors?: {theme?: string; widget?: string; widgetInk?: string; icon?: string};
	fonts?: {files?: ThemeFont[]; widget?: string; names?: string};
	iconStyle?: {style?: string; tile?: 'dark' | 'light'};
	wallpaper?: ThemeWallpaper;
	icons?: ThemeIcon[];
	apps?: ThemeApp[];
	cities?: ThemeCity[];
}

export type ThemeResult = {ok: true; theme: ThemeData; files: string[]} | {ok: false; errors: string[]};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const extOf = (path: string): string => { const i = path.lastIndexOf('.'); return i === -1 ? '' : path.slice(i + 1).toLowerCase(); };

/** Is this a safe path inside the zip (relative, no .., no backslash, plain characters)? */
export function safePath (path: string): boolean {
	if (!path || path.length > 200 || path.charAt(0) === '/' || path.indexOf('\\') !== -1 || path.indexOf('\0') !== -1 || path.indexOf(':') !== -1) return false;
	const parts = path.split('/');
	for (const p of parts) if (p === '' || p === '.' || p === '..') return false;
	return true;
}

/** The text of manifest.json as an object, or the reason it cannot be read. */
export function parseManifest (text: string): {ok: true; value: unknown} | {ok: false; error: string} {
	if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
	try { return {ok: true, value: JSON.parse(text)}; } catch (e) { return {ok: false, error: tt('themefile.manifestJsonIsNotValid')}; }
}

/** The zip's files (path -> size): safe names, data types only, not absurdly big. Used before anything is extracted and again by `validateTheme`. */
export function checkFiles (files: Record<string, number>): string[] {
	const errors: string[] = [];
	for (const f of Object.keys(files)) {
		if (!safePath(f)) { errors.push(`The file name "${f}" is not allowed`); continue; }
		const e = extOf(f);
		if (THEME_FILE_EXT.indexOf(e) === -1) errors.push(`The file "${f}" is not allowed (a theme holds only ${THEME_FILE_EXT.join(', ')} files)`);
		else if (!(files[f] >= 0) || files[f] > MAX_FILE_BYTES) errors.push(`The file "${f}" is too big`);
	}
	return errors;
}

function text (v: unknown, max: number): string | null {
	return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null;
}

/** `files` = every file of the zip (folders left out) with its size in bytes. */
export function validateTheme (manifest: unknown, files: Record<string, number>): ThemeResult {
	const errors: string[] = [];
	const err = (m: string) => { errors.push(m); };

	errors.push(...checkFiles(files));
	if (files[MANIFEST_FILE] === undefined) err(tt('themefile.manifestJsonIsMissing'));
	else if (files[MANIFEST_FILE] > MAX_MANIFEST_BYTES) err(tt('themefile.manifestJsonIsTooBig'));
	if (!isObj(manifest)) { if (files[MANIFEST_FILE] !== undefined) err(tt('themefile.manifestJsonMustHoldOne')); return {ok: false, errors}; }

	const m = manifest;
	const known = ['format', 'name', 'author', 'note', 'colors', 'fonts', 'iconStyle', 'wallpaper', 'icons', 'apps', 'cities'];
	for (const k in m) if (known.indexOf(k) === -1) err(tt('themefile.unknownPartKInManifest', {k}));
	if (m.format !== THEME_FORMAT) err(typeof m.format === 'number' ? tt('themefile.themeFormatFormatIsNot', {format: m.format, THEME_FORMAT}) : tt('themefile.manifestJsonHasNoFormat'));
	const name = text(m.name, 40);
	if (!name) err(tt('themefile.theThemeNeedsAName'));

	const used: string[] = [MANIFEST_FILE];
	const fileOk = (file: unknown, exts: string[], what: string): string | null => {
		if (typeof file !== 'string' || !safePath(file)) { err(tt('themefile.whatTheFileNameIs', {what})); return null; }
		if (files[file] === undefined) { err(tt('themefile.whatTheFileFileIs', {what, file})); return null; }
		if (exts.indexOf(extOf(file)) === -1) { err(tt('themefile.whatFileMustBeV3', {what, file, v3: exts.join(', ')})); return null; }
		used.push(file);
		return file;
	};
	const part = (key: string): Record<string, unknown> | null => {
		if (m[key] === undefined) return null;
		if (!isObj(m[key])) { err(tt('themefile.keyMustBeAnObject', {key})); return null; }
		return m[key] as Record<string, unknown>;
	};
	const list = (key: string): unknown[] | null => {
		if (m[key] === undefined) return null;
		if (!Array.isArray(m[key])) { err(tt('themefile.keyMustBeAList', {key})); return null; }
		return m[key] as unknown[];
	};
	const only = (o: Record<string, unknown>, key: string, allowed: string[]) => { for (const k in o) if (allowed.indexOf(k) === -1) err(tt('themefile.unknownEntryKInKey', {k, key})); };

	const theme: ThemeData = {name: name || ''};
	const author = m.author === undefined ? null : text(m.author, 60);
	if (author) theme.author = author;

	// colours: the theme, the widget colour and the icon colour are three independent choices
	const colors = part('colors');
	if (colors) {
		only(colors, 'colors', ['theme', 'widget', 'widgetInk', 'icon']);
		const out: NonNullable<ThemeData['colors']> = {};
		if (colors.theme !== undefined) { if (typeof colors.theme === 'string' && (THEME_IDS as string[]).indexOf(colors.theme) !== -1) out.theme = colors.theme; else err(tt('themefile.colorsThemeMustBeOne', {v1: THEME_IDS.join(', ')})); }
		for (const k of ['widget', 'icon'] as const) {
			const v = colors[k];
			if (v === undefined) continue;
			if (typeof v === 'string' && (v === 'theme' || PLAIN_COLOR_IDS.indexOf(v) !== -1)) out[k] = v; else err(tt('themefile.colorsKMustBeTheme', {k, v2: PLAIN_COLOR_IDS.join(', ')}));
		}
		// P100: the theme's own widget ink, any colour as #RRGGBB; not together with a "widget" choice (which one would win is unclear)
		if (colors.widgetInk !== undefined) {
			const ink = validInk(colors.widgetInk);
			if (!ink) err(tt('themefile.colorsWidgetinkMustBeA'));
			else if (colors.widget !== undefined) err(tt('themefile.colorsGiveEitherWidgetOr'));
			else out.widgetInk = ink;
		}
		theme.colors = out;
	}

	// fonts: font files of the theme (any number) and which font the widget and the names use (the theme's or a built-in one)
	const fonts = part('fonts');
	if (fonts) {
		only(fonts, 'fonts', ['files', 'widget', 'names']);
		const out: NonNullable<ThemeData['fonts']> = {};
		const ownIds: string[] = [];
		if (fonts.files !== undefined) {
			if (!Array.isArray(fonts.files)) err(tt('themefile.fontsFilesMustBeA'));
			else {
				out.files = [];
				fonts.files.forEach((f, i) => {
					const w = `fonts.files[${i}]`;
					if (!isObj(f)) { err(tt('themefile.wMustBeAnObject', {w})); return; }
					only(f, w, ['id', 'label', 'file']);
					const id = typeof f.id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(f.id) ? f.id : null;
					if (!id) { err(tt('themefile.wIdMustBe1', {w})); return; }
					if ((BUILTIN_FONT_IDS as string[]).indexOf(id) !== -1 || id === 'default') { err(tt('themefile.wTheIdIdIs', {w, id})); return; }
					if (ownIds.indexOf(id) !== -1) { err(tt('themefile.wTheIdIdIs2', {w, id})); return; }
					const file = fileOk(f.file, THEME_FONT_EXT, w);
					if (!file) return;
					ownIds.push(id);
					out.files!.push({id, label: text(f.label, 40) || id, file});
				});
			}
		}
		const fontId = (v: unknown, key: string, allowDefault: boolean): string | undefined => {
			if (v === undefined) return undefined;
			if (typeof v === 'string' && (ownIds.indexOf(v) !== -1 || (BUILTIN_FONT_IDS as string[]).indexOf(v) !== -1 || (allowDefault && v === 'default'))) return v;
			err(tt('themefile.fontsKeyMustBeA', {key}));
			return undefined;
		};
		const w = fontId(fonts.widget, 'widget', false); if (w) out.widget = w;
		const n = fontId(fonts.names, 'names', true); if (n) out.names = n;
		theme.fonts = out;
	}

	// icon style: one of the existing styles and the tile
	const style = part('iconStyle');
	if (style) {
		only(style, 'iconStyle', ['style', 'tile']);
		const out: NonNullable<ThemeData['iconStyle']> = {};
		if (style.style !== undefined) { if (typeof style.style === 'string' && ICON_STYLE_IDS.indexOf(style.style) !== -1) out.style = style.style; else err(tt('themefile.iconstyleStyleMustBeOne', {v1: ICON_STYLE_IDS.join(', ')})); }
		if (style.tile !== undefined) { if (style.tile === 'dark' || style.tile === 'light') out.tile = style.tile; else err(tt('themefile.iconstyleTileMustBeDark')); }
		theme.iconStyle = out;
	}

	// wallpaper (P96): one picture, or a folder of pictures (slideshow); the pictures are the theme's own files
	const wall = part('wallpaper');
	if (wall) {
		only(wall, 'wallpaper', ['file', 'folder', 'intervalSec', 'shuffle']);
		const out: ThemeWallpaper = {};
		if ((wall.file === undefined) === (wall.folder === undefined)) err(tt('themefile.wallpaperNeedsExactlyOneOf'));
		else if (wall.file !== undefined) {
			const file = fileOk(wall.file, THEME_ICON_EXT, 'wallpaper');
			if (file) out.file = file;
			if (wall.intervalSec !== undefined || wall.shuffle !== undefined) err(tt('themefile.wallpaperIntervalsecAndShuffleBelong'));
		} else {
			const dir = typeof wall.folder === 'string' ? wall.folder.replace(/\/+$/, '') : '';
			if (!dir || !safePath(dir)) err(tt('themefile.wallpaperFolderTheFolderName'));
			else {
				const pics = Object.keys(files).filter((f) => f.indexOf(dir + '/') === 0 && f.indexOf('/', dir.length + 1) === -1 && THEME_ICON_EXT.indexOf(extOf(f)) !== -1);
				if (!pics.length) err(tt('themefile.wallpaperFolderDirHoldsNo', {dir}));
				else { out.folder = dir; used.push(...pics); }
			}
			if (wall.intervalSec !== undefined) {
				const v = wall.intervalSec;
				if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= THEME_WALLPAPER_MIN_SEC && v <= THEME_WALLPAPER_MAX_SEC) out.intervalSec = v;
				else err(tt('themefile.wallpaperIntervalsecMustBeA', {THEME_WALLPAPER_MIN_SEC, THEME_WALLPAPER_MAX_SEC}));
			}
			if (wall.shuffle !== undefined) { if (typeof wall.shuffle === 'boolean') out.shuffle = wall.shuffle; else err(tt('themefile.wallpaperShuffleMustBeTrue')); }
		}
		theme.wallpaper = out;
	}

	// icons: a picture for an app, by its id (any number)
	const icons = list('icons');
	if (icons) {
		const seen: string[] = [];
		theme.icons = [];
		icons.forEach((it, i) => {
			const w = `icons[${i}]`;
			if (!isObj(it)) { err(tt('themefile.wMustBeAnObject', {w})); return; }
			only(it, w, ['app', 'file']);
			const app = text(it.app, 80);
			if (!app) { err(tt('themefile.wAppTheAppId', {w})); return; }
			if (seen.indexOf(app) !== -1) { err(tt('themefile.wTheAppAppHas', {w, app})); return; }
			const file = fileOk(it.file, THEME_ICON_EXT, w);
			if (!file) return;
			seen.push(app);
			theme.icons!.push({app, file});
		});
	}

	// apps: the order of the apps (the list order) and edited names (any number)
	const apps = list('apps');
	if (apps) {
		const seen: string[] = [];
		theme.apps = [];
		apps.forEach((it, i) => {
			const w = `apps[${i}]`;
			if (!isObj(it)) { err(tt('themefile.wMustBeAnObject', {w})); return; }
			only(it, w, ['id', 'name']);
			const id = text(it.id, 80);
			if (!id) { err(tt('themefile.wIdTheAppId', {w})); return; }
			if (seen.indexOf(id) !== -1) { err(tt('themefile.wTheAppIdIs', {w, id})); return; }
			seen.push(id);
			const label = it.name === undefined ? null : text(it.name, 24);
			if (it.name !== undefined && !label) { err(tt('themefile.wNameMustBeText', {w})); return; }
			theme.apps!.push(label ? {id, name: label} : {id});
		});
	}

	// cities (any number); how they are used is decided in P81
	const cities = list('cities');
	if (cities) {
		theme.cities = [];
		cities.forEach((it, i) => {
			const w = `cities[${i}]`;
			if (!isObj(it)) { err(tt('themefile.wMustBeAnObject', {w})); return; }
			only(it, w, ['name', 'lat', 'lon', 'detail']);
			const cityName = text(it.name, 80);
			const lat = it.lat, lon = it.lon;
			if (!cityName) { err(tt('themefile.wNameIsMissing', {w})); return; }
			if (typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90 || typeof lon !== 'number' || !isFinite(lon) || lon < -180 || lon > 180) { err(tt('themefile.wLat9090And', {w})); return; }
			const detail = it.detail === undefined ? null : text(it.detail, 80);
			theme.cities!.push(detail ? {name: cityName, lat, lon, detail} : {name: cityName, lat, lon});
		});
	}

	return errors.length ? {ok: false, errors} : {ok: true, theme, files: used};
}

/** The reason shown in the pop-up for a refused theme: the first errors, the rest counted. Nothing was changed. */
export function themeErrorText (errors: string[]): string {
	const shown = errors.slice(0, MAX_ERRORS_SHOWN).join('. ');
	return errors.length > MAX_ERRORS_SHOWN ? tt('themefile.andMore', {shown, v: errors.length - MAX_ERRORS_SHOWN}) : shown;
}
