// P97: writes the theme base zip (Settings -> Look -> Theme -> Export theme base). Rooted TVs only; run by hand, never at start-up.

import guide from '../../docs/theme/theme-guide.md?raw';
import {exec} from './apps';
import {log} from './log';
import {BASE_PATH, SMALL_PIECE_CHARS, buildThemeBase, parseWritten, writeCommands, type BaseApp} from './themebase';
import {dataUriBytes} from './zipwrite';
import {t as tt} from '../i18n';

const SIDE = 160;

export interface ExportItem {
	id: string;
	name: string;
	/** the picture shown now: a data: address or an asset path; undefined = none */
	image?: string;
}

export interface ExportResult {
	ok: boolean;
	reason?: string;
	apps: number;
	icons: number;
	skipped: number;
	size: number;
}

/** The picture as a PNG at most SIDE pixels wide or high (aspect kept); null when it cannot be drawn. */
function shrink (src: string): Promise<Uint8Array | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			try {
				const w = img.naturalWidth, h = img.naturalHeight;
				if (!w || !h) { resolve(null); return; }
				const k = Math.min(1, SIDE / Math.max(w, h));
				const canvas = document.createElement('canvas');
				canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
				const ctx = canvas.getContext('2d');
				if (!ctx) { resolve(null); return; }
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(dataUriBytes(canvas.toDataURL('image/png')));
			} catch (e) { resolve(null); }
		};
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

function pictureOf (item: ExportItem): Promise<BaseApp> {
	const base: BaseApp = {id: item.id, name: item.name, icon: null};
	if (!item.image) return Promise.resolve(base);
	return shrink(item.image).then((png) => {
		if (png) return {...base, icon: png, type: 'png' as const};
		// the picture could not be redrawn: a data: picture is kept as it is, an asset path is skipped
		const raw = dataUriBytes(item.image!);
		return raw ? {...base, icon: raw, type: /^data:image\/jpe?g/.test(item.image!) ? 'jpg' as const : 'png' as const} : base;
	});
}

function pictures (items: ExportItem[]): Promise<BaseApp[]> {
	const out: BaseApp[] = [];
	const step = (from: number): Promise<BaseApp[]> => from >= items.length ? Promise.resolve(out)
		: Promise.all(items.slice(from, from + 6).map(pictureOf)).then((got) => { out.push(...got); return step(from + 6); });
	return step(0);
}

const runAll = (cmds: string[], at = 0): Promise<string> => at >= cmds.length ? Promise.resolve('')
	: exec(cmds[at], 20000).then((out) => at === cmds.length - 1 ? out : runAll(cmds, at + 1));

export function exportThemeBase (items: ExportItem[]): Promise<ExportResult> {
	return pictures(items).then((apps) => {
		const built = buildThemeBase(apps, guide);
		const skipped = apps.filter((a) => !a.icon).length;
		const result = (r: Partial<ExportResult>): ExportResult => ({ok: false, apps: built.apps, icons: built.icons, skipped, size: built.bytes.length, ...r});
		log(`theme base: ${built.apps} apps, ${built.icons} icons (${skipped} without), ${built.bytes.length} bytes`);
		const check = (out: string): ExportResult => parseWritten(out) === built.bytes.length ? result({ok: true}) : result({reason: tt('themeexport.theFileWasNotWritten')});
		return runAll(writeCommands(built.bytes)).then(check).catch((e: Error) => {
			// a long command may be refused: write again in small pieces
			log(`theme base: first write failed (${e && e.message ? e.message : 'failed'}), trying small pieces`);
			return runAll(writeCommands(built.bytes, SMALL_PIECE_CHARS)).then(check).catch((e2: Error) => result({reason: tt('themeexport.couldNotWriteBasePath', {BASE_PATH, v2: e2 && e2.message ? e2.message : 'failed'})}));
		});
	});
}
