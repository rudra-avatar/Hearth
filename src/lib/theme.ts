// P79: loads a user theme (zip) on a rooted TV: look at the zip, extract it to a temporary folder, check it, keep it.
// A wrong file changes nothing. Applying the parts comes in P80/P81. Needs root (exec); nothing runs at start-up.

import {exec} from './apps';
import {THEME_FONTS_KEY, THEME_FONT_PREFIX, THEME_STORE_KEY, setThemeFonts} from './clockfont';
import {buildThemeIcons, setThemeIcons} from './themeicons';
import {ACTIVE_KEY, INDEX_KEY, activeSlug, activeTheme, savedIndex, savedKey, slugFor} from './themelist';
import {isWebOS} from './luna';
import {baseName, fileUrl, isSafePath, readFileChunks} from './wallpaper';
import {log} from './log';
import {
	CLEAN_COMMAND, MANIFEST_READ, REMOVE_COMMAND, STORE_COMMAND, THEME_STORE, activateCommand, deleteSavedCommand, saveCommand, extractCommand, inspectCommand, parseExtract, parseInspect, themeSummary, zipPath
} from './themecmd';
import {checkFiles, parseManifest, themeErrorText, validateTheme, type ThemeData} from './themefile';
import {t as tt} from '../i18n';

const KEY = THEME_STORE_KEY;

/** The theme kept by Hearth (null = none): the zip's name and the checked content. */
export interface LoadedTheme {zip: string; theme: ThemeData}

export function readLoadedTheme (): LoadedTheme | null {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
		return raw && typeof raw.zip === 'string' && raw.theme && typeof raw.theme.name === 'string' ? raw as LoadedTheme : null;
	} catch (e) { return null; }
}

/** `theme` = the checked theme; `iconsFailed` = icons that could not be read or kept (P81) */
export type LoadOutcome = {ok: true; name: string; summary: string; theme: ThemeData; iconsFailed: number} | {ok: false; reason: string};

const fail = (reason: string): LoadOutcome => ({ok: false, reason});
const clean = (): Promise<unknown> => exec(CLEAN_COMMAND, 6000).catch(() => undefined);

/** `where` = the full path of the zip (any folder or drive), or a bare name in /media/developer/themes. */
export function loadThemeZip (where: string, wanted: string[] = []): Promise<LoadOutcome> {
	const zip = where.charAt(0) === '/' ? where : zipPath(where);
	const name = baseName(zip);
	if (!isSafePath(zip)) return Promise.resolve(fail(tt('theme.theFileNameCannotBe')));
	return exec(inspectCommand(zip), 15000).then((out) => {
		const seen = parseInspect(out);
		log(`theme: extractor ${seen.tool}, ${Object.keys(seen.entries).length} entries in ${name}`);
		if (seen.tool === 'none') return fail(tt('theme.thisTvHasNoUnzip'));
		if (seen.noFile) return fail(tt('theme.theFileIsGone'));
		if (!Object.keys(seen.entries).length) return fail(tt('theme.theFileIsNotA'));
		const bad = checkFiles(seen.entries);          // nothing is extracted when a file name or type is not allowed
		if (bad.length) return fail(themeErrorText(bad));
		return exec(extractCommand(zip, seen.tool), 60000).then((done) => {
			const got = parseExtract(done);
			if (!got.ok) return clean().then(() => fail(tt('theme.theZipCouldNotBe')));
			if (got.manifest.length > MANIFEST_READ) return clean().then(() => fail(tt('theme.manifestJsonIsTooBig')));
			const parsed = parseManifest(got.manifest);
			const result = parsed.ok ? validateTheme(parsed.value, got.files) : null;
			if (!parsed.ok || !result || !result.ok) {
				const why = !parsed.ok ? [parsed.error] : result && !result.ok ? result.errors : [tt('theme.theThemeCouldNotBe')];
				return clean().then(() => fail(themeErrorText(why)));
			}
			return exec(STORE_COMMAND, 60000).then((stored) => {
				if (!/stored/.test(stored)) return clean().then(() => fail(tt('theme.theThemeCouldNotBe2')));
				return keepActive(name, result.theme, wanted).then((o) => {
					if (o.ok) log(`theme: loaded "${result.theme.name}" from ${name}: ${themeSummary(result.theme)}`);
					return o;
				});
			});
		});
	}).catch((e: Error) => clean().then(() => fail(tt('theme.theTvDidNotAnswer') + (e && e.message ? e.message : tt('theme.noAnswer')))));
}

// P80: the theme's own font files are read from the kept folder only when a setting actually uses one (nothing at start-up
// for a theme without fonts, or while a built-in font is chosen). Until the file is read, the text shows in Inter.
const fontState: Record<string, boolean> = {};
let fontStyle: HTMLStyleElement | null = null;

/** Forgets the fonts read so far (a new theme was loaded). */
export function resetThemeFonts (): void {
	for (const k of Object.keys(fontState)) delete fontState[k];
	if (fontStyle && fontStyle.parentNode) fontStyle.parentNode.removeChild(fontStyle);
	fontStyle = null;
}

/** Reads the font files of the loaded theme for these font ids (the ids that are not the theme's are ignored). */
export function ensureThemeFonts (ids: string[]): void {
	const loaded = readLoadedTheme();
	const files = loaded && loaded.theme.fonts && loaded.theme.fonts.files;
	if (!files) return;
	for (const f of files) {
		if (ids.indexOf(f.id) === -1 || fontState[f.id]) continue;
		fontState[f.id] = true;
		const path = `${THEME_STORE}/current/${f.file}`;
		if (!isSafePath(path)) { log(`theme: font ${f.id}: the file name cannot be used`); continue; }
		const url: Promise<string> = isWebOS()
			? readFileChunks(path).then((parts) => URL.createObjectURL(new Blob(parts as unknown as BlobPart[], {type: 'font/' + (f.file.split('.').pop() || 'woff2').toLowerCase()})))
			: Promise.resolve(fileUrl(path));
		url.then((u) => {
			if (!fontStyle) { fontStyle = document.createElement('style'); document.head.appendChild(fontStyle); }
			fontStyle.appendChild(document.createTextNode(`@font-face{font-family:"${THEME_FONT_PREFIX}${f.id}";src:url("${u}");}`));
			log(`theme: font ${f.id} read (${f.file})`);
		}).catch((e: Error) => { fontState[f.id] = false; log(`theme: font ${f.id} not read: ${e && e.message ? e.message : 'failed'}`); });
	}
}

/** Makes the theme in the kept folder the active one: its record, font names, fonts and icon pictures. */
function keepActive (zip: string, theme: ThemeData, wanted: string[]): Promise<LoadOutcome> {
	const slug = slugFor(theme.name);
	const fonts = theme.fonts && theme.fonts.files ? theme.fonts.files.map((f) => ({id: f.id, label: f.label})) : [];
	try {
		localStorage.setItem(KEY, JSON.stringify({zip, theme, slug}));
		localStorage.setItem(ACTIVE_KEY, JSON.stringify({slug, name: theme.name}));
		if (fonts.length) localStorage.setItem(THEME_FONTS_KEY, JSON.stringify(fonts)); else localStorage.removeItem(THEME_FONTS_KEY);
	} catch (e) { return Promise.resolve(fail(tt('theme.theThemeCouldNotBe3'))); }
	resetThemeFonts();
	setThemeFonts(fonts);
	return buildThemeIcons(theme, wanted).then((iconsFailed) => ({ok: true, name: theme.name, summary: themeSummary(theme), theme, iconsFailed} as LoadOutcome));
}

/** P81 Save theme in Hearth: keeps the loaded theme (files and checked data) so it can be picked again. */
export function saveLoadedTheme (): Promise<{ok: boolean; reason?: string}> {
	const a = activeTheme();
	const loaded = readLoadedTheme();
	if (!a || !loaded) return Promise.resolve({ok: false, reason: tt('theme.noThemeIsLoaded')});
	return exec(saveCommand(a.slug), 60000).then((out) => {
		if (!/saved/.test(out)) return {ok: false, reason: tt('theme.theThemeCouldNotBe2')};
		try {
			localStorage.setItem(savedKey(a.slug), JSON.stringify({zip: loaded.zip, theme: loaded.theme}));
			localStorage.setItem(INDEX_KEY, JSON.stringify(savedIndex().filter((t) => t.slug !== a.slug).concat([{slug: a.slug, name: a.name}])));
		} catch (e) { return {ok: false, reason: tt('theme.theThemeCouldNotBe3')}; }
		log(`theme: saved "${a.name}" as ${a.slug}`);
		return {ok: true};
	}).catch((e: Error) => ({ok: false, reason: tt('theme.theTvDidNotAnswer') + (e && e.message ? e.message : tt('theme.noAnswer'))}));
}

/** P81: a saved theme becomes the loaded one (its files are copied back; nothing is checked again). */
export function activateSavedTheme (slug: string, wanted: string[] = []): Promise<LoadOutcome> {
	let data: {zip: string; theme: ThemeData} | null = null;
	try { data = JSON.parse(localStorage.getItem(savedKey(slug)) || 'null'); } catch (e) { data = null; }
	if (!data || !data.theme) return Promise.resolve(fail(tt('theme.thatSavedThemeIsGone')));
	const kept = data;
	return exec(activateCommand(slug), 60000).then((out) => {
		if (!/stored/.test(out)) return fail(tt('theme.theSavedThemeCouldNot'));
		return keepActive(kept.zip, kept.theme, wanted).then((o) => { if (o.ok) log(`theme: switched to saved "${kept.theme.name}"`); return o; });
	}).catch((e: Error) => fail(tt('theme.theTvDidNotAnswer') + (e && e.message ? e.message : tt('theme.noAnswer'))));
}

/** P81 Remove theme: the loaded theme's files, fonts and icons go; saved themes stay. The caller puts the settings back (removeThemeParts). */
export function removeLoadedTheme (): Promise<void> {
	for (const k of [KEY, ACTIVE_KEY, THEME_FONTS_KEY]) { try { localStorage.removeItem(k); } catch (e) { /* nothing */ } }
	setThemeIcons(null);
	resetThemeFonts();
	setThemeFonts([]);
	log('theme: removed');
	return exec(REMOVE_COMMAND, 20000).then(() => undefined, () => undefined);
}

/** P81: the cities of the loaded theme (added to the city list). */
export function themeCities (): {name: string; lat: number; lon: number; detail?: string}[] {
	const t = readLoadedTheme();
	return t && t.theme.cities ? t.theme.cities : [];
}

/** P82 Delete this theme: a saved copy is dropped (list entry, record, files); if it is the loaded one it is removed too. The caller puts the settings back. */
export function deleteTheme (slug: string): Promise<void> {
	try {
		localStorage.setItem(INDEX_KEY, JSON.stringify(savedIndex().filter((t) => t.slug !== slug)));
		localStorage.removeItem(savedKey(slug));
	} catch (e) { /* the entry may stay; the files below still go */ }
	log(`theme: deleted ${slug}`);
	return exec(deleteSavedCommand(slug), 20000).then(() => undefined, () => undefined).then(() => activeSlug() === slug ? removeLoadedTheme() : undefined);
}
