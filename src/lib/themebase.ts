// P97: the "theme base" zip: the current app list (order and names), the current icons and the theme guide, in the
// theme format 1 (see themefile.ts), so a person or an AI agent can start a theme from the real apps of this TV.
// Pure: building the zip and the shell commands that write it. The runner is lib/themeexport.ts.

import {buildZip, bytesToBase64, utf8} from './zipwrite';
import {THEME_FOLDER} from './themecmd';

export const BASE_ZIP = 'theme_base.zip';
export const BASE_PATH = `${THEME_FOLDER}/${BASE_ZIP}`;
/** one shell call carries this many base64 characters (a multiple of 4); a failed call is retried in SMALL pieces */
export const PIECE_CHARS = 32000;
export const SMALL_PIECE_CHARS = 4000;

export interface BaseApp {
	id: string;
	/** the name shown now (edited or LG's) */
	name: string;
	/** a png or jpeg, or null (the app has no picture, e.g. a monogram) */
	icon: Uint8Array | null;
	/** the picture's file type */
	type?: 'png' | 'jpg';
}

/** `icons/<id>.png`: the id with every character outside a-z 0-9 . _ - replaced; two ids never share a name. */
export function iconFileName (id: string, type: 'png' | 'jpg', used: string[]): string {
	const base = id.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 100) || 'app';
	let name = `icons/${base}.${type}`;
	for (let n = 2; used.indexOf(name) !== -1; n++) name = `icons/${base}-${n}.${type}`;
	used.push(name);
	return name;
}

export interface BaseBuild {
	bytes: Uint8Array;
	manifest: string;
	apps: number;
	icons: number;
}

/** The zip: manifest.json (format 1: `apps` in the shown order with names, `icons`), the icon files and `theme-guide.md`. */
export function buildThemeBase (apps: BaseApp[], guide: string): BaseBuild {
	const used: string[] = [];
	const seen: string[] = [];
	const list: {id: string; name?: string}[] = [];
	const icons: {app: string; file: string}[] = [];
	const files: {name: string; data: Uint8Array}[] = [];
	for (const a of apps) {
		if (!a.id || a.id.length > 80 || seen.indexOf(a.id) !== -1) continue;
		seen.push(a.id);
		const name = a.name.trim().slice(0, 24);
		list.push(name ? {id: a.id, name} : {id: a.id});
		if (a.icon && a.icon.length) {
			const file = iconFileName(a.id, a.type || 'png', used);
			icons.push({app: a.id, file});
			files.push({name: file, data: a.icon});
		}
	}
	const manifest = JSON.stringify({format: 1, name: 'theme_base', apps: list, icons}, null, 1);
	const all = [{name: 'manifest.json', data: utf8(manifest)}, {name: 'theme-guide.md', data: utf8(guide)}].concat(files);
	return {bytes: buildZip(all), manifest, apps: list.length, icons: icons.length};
}

/** The shell commands that write `bytes` to BASE_PATH through a temporary file: make the folder, the pieces, then move it and print its size. */
export function writeCommands (bytes: Uint8Array, pieceChars = PIECE_CHARS): string[] {
	const tmp = `${BASE_PATH}.part`;
	const per = Math.floor(pieceChars / 4) * 3;
	const cmds = [`mkdir -p '${THEME_FOLDER}' && rm -f '${tmp}' && : > '${tmp}' && echo ready`];
	for (let i = 0; i < bytes.length; i += per) cmds.push(`echo '${bytesToBase64(bytes, i, Math.min(bytes.length, i + per))}' | base64 -d >> '${tmp}'`);
	cmds.push(`mv -f '${tmp}' '${BASE_PATH}' && wc -c < '${BASE_PATH}'`);
	return cmds;
}

/** The size printed by the last command, or -1. */
export function parseWritten (out: string): number {
	const m = /(\d+)\s*$/.exec(out.trim());
	return m ? parseInt(m[1], 10) : -1;
}
