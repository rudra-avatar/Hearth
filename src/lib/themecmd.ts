// P79: loading a user theme (a zip in /media/developer/themes) on a rooted TV. Pure parts only: the shell commands run by
// lib/theme.ts and the parsers of their output. Nothing runs at start-up. The extractor is found at run time
// (`unzip`, else `busybox unzip`); which one this TV has is logged on the first load.

import type {ThemeData} from './themefile';

export const THEME_FOLDER = '/media/developer/themes';
export const THEME_WORK = '/tmp/hearth-theme';
export const THEME_STORE = '/media/developer/launcher-theme';
/** the manifest is read through exec in one piece: at most this many bytes (+1 to notice a bigger one) */
export const MANIFEST_READ = 3 * 1024 * 1024;

const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Makes the themes folder (once, when the picker opens) and lists it. */
export const LIST_COMMAND = `mkdir -p ${THEME_FOLDER} 2>/dev/null; ls -1 ${THEME_FOLDER} 2>/dev/null`;

export function parseZipNames (out: string): string[] {
	return out.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => /\.zip$/i.test(l) && l.indexOf('/') === -1).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
}

export const zipPath = (name: string): string => `${THEME_FOLDER}/${name}`;

const FIND_TOOL = 'T=none; if command -v unzip >/dev/null 2>&1; then T=unzip; elif command -v busybox >/dev/null 2>&1 && busybox --list 2>/dev/null | grep -qx unzip; then T=busybox; fi; echo "@@TOOL $T"';
const UNZIP = (args: string): string => `if [ "$T" = unzip ]; then unzip ${args}; else busybox unzip ${args}; fi`;

/** Step 1: which extractor there is, and the zip's entries (names and sizes), before anything is extracted. */
export function inspectCommand (zip: string): string {
	return `Z=${q(zip)}; ${FIND_TOOL}; [ "$T" = none ] && exit 0; [ -f "$Z" ] || { echo "@@NOFILE"; exit 0; }; ${UNZIP('-l "$Z" 2>&1')}; echo "@@END"`;
}

export interface Inspection {
	tool: 'unzip' | 'busybox' | 'none';
	noFile: boolean;
	/** path -> size, folders left out */
	entries: Record<string, number>;
}

export function parseInspect (out: string): Inspection {
	const tool = /@@TOOL (\w+)/.exec(out);
	const kind = tool && (tool[1] === 'unzip' || tool[1] === 'busybox') ? tool[1] : 'none';
	const entries: Record<string, number> = {};
	for (const raw of out.split('\n')) {
		const m = /^\s*(\d+)\s+\d{2,4}[-/]\d{2}[-/]\d{2,4}\s+\d{1,2}:\d{2}\s+(.+?)\s*$/.exec(raw.replace(/\r$/, ''));
		if (m && m[2].charAt(m[2].length - 1) !== '/') entries[m[2]] = parseInt(m[1], 10);
	}
	return {tool: kind, noFile: out.indexOf('@@NOFILE') !== -1, entries};
}

/** Step 2: extract into a fresh temporary folder, then list what is there (size and path) and print manifest.json. */
export function extractCommand (zip: string, tool: 'unzip' | 'busybox'): string {
	const W = THEME_WORK;
	return `Z=${q(zip)}; T=${tool}; rm -rf ${W}; mkdir -p ${W} || exit 0; ${UNZIP(`-o -q "$Z" -d ${W} >/dev/null 2>&1`)}; echo "@@RC $?"; cd ${W} || exit 0; `
		+ `find . -type f | while IFS= read -r f; do echo "@@F $(wc -c < "$f") $f"; done; echo "@@MANIFEST"; head -c ${MANIFEST_READ + 1} manifest.json 2>/dev/null; echo; echo "@@END"`;
}

export interface Extracted {
	ok: boolean;
	files: Record<string, number>;
	manifest: string;
}

export function parseExtract (out: string): Extracted {
	const rc = /@@RC (\d+)/.exec(out);
	const files: Record<string, number> = {};
	const head = out.slice(0, Math.max(0, out.indexOf('@@MANIFEST')) || out.length);
	for (const l of head.split('\n')) {
		const m = /^@@F (\d+) \.\/(.+?)\s*$/.exec(l.replace(/\r$/, ''));
		if (m) files[m[2]] = parseInt(m[1], 10);
	}
	const a = out.indexOf('@@MANIFEST\n');
	const b = out.lastIndexOf('\n@@END');
	const manifest = a === -1 ? '' : out.slice(a + '@@MANIFEST\n'.length, b === -1 || b < a ? out.length : b);
	return {ok: !!rc && rc[1] === '0' && out.indexOf('@@END') !== -1, files, manifest};
}

/** Step 3 (the theme is valid): keep the extracted files where they survive a restart, replacing the earlier theme. */
export const STORE_COMMAND = `mkdir -p ${THEME_STORE} && rm -rf ${THEME_STORE}/current && mv ${THEME_WORK} ${THEME_STORE}/current && test -f ${THEME_STORE}/current/manifest.json && echo stored`;
export const slugOk = (s: string): boolean => /^[a-z0-9-]{1,40}$/.test(s);
/** P81: keep the loaded theme's files as a saved theme / bring a saved theme back as the loaded one / drop the loaded one. */
export const saveCommand = (slug: string): string => !slugOk(slug) ? 'exit 1'
	: `S=${THEME_STORE}; mkdir -p $S/saved && rm -rf $S/saved/${slug} && cp -r $S/current $S/saved/${slug} && test -f $S/saved/${slug}/manifest.json && echo saved`;
export const activateCommand = (slug: string): string => !slugOk(slug) ? 'exit 1'
	: `S=${THEME_STORE}; test -f $S/saved/${slug}/manifest.json && rm -rf $S/current && cp -r $S/saved/${slug} $S/current && test -f $S/current/manifest.json && echo stored`;
export const deleteSavedCommand = (slug: string): string => !slugOk(slug) ? 'exit 1' : `rm -rf ${THEME_STORE}/saved/${slug}; echo deleted`;
export const MAKE_FOLDER_COMMAND = `mkdir -p ${THEME_FOLDER} 2>/dev/null; echo made`;
export const REMOVE_COMMAND = `rm -rf ${THEME_STORE}/current; echo removed`;
export const CLEAN_COMMAND = `rm -rf ${THEME_WORK}`;

/** What a theme holds, in words (for the pop-up after loading). */
export function themeSummary (t: ThemeData): string {
	const parts: string[] = [];
	if (t.colors && Object.keys(t.colors).length) parts.push('colours');
	if (t.fonts && ((t.fonts.files && t.fonts.files.length) || t.fonts.widget || t.fonts.names)) parts.push(t.fonts.files && t.fonts.files.length ? `${t.fonts.files.length} fonts` : 'fonts');
	if (t.iconStyle && Object.keys(t.iconStyle).length) parts.push('icon style');
	if (t.wallpaper && (t.wallpaper.file || t.wallpaper.folder)) parts.push(t.wallpaper.folder ? 'wallpaper slideshow' : 'wallpaper');
	if (t.icons && t.icons.length) parts.push(`${t.icons.length} icons`);
	if (t.apps && t.apps.length) parts.push(`${t.apps.length} apps`);
	if (t.cities && t.cities.length) parts.push(`${t.cities.length} cities`);
	return parts.length ? parts.join(', ') : 'no parts (the theme changes nothing)';
}
