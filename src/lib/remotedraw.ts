// P61c: simple vector drawings of remotes, as data (made for Hearth, not traced from LG's artwork). Used only on the two
// "Remote control" pages to show which button a code is. Pure: no imports. Linux key codes are the same numbers the key hook shows.

export type RemoteModel = 'ir' | 'magic-2016' | 'magic-2019' | 'magic-2021' | 'magic-2025';
export const REMOTE_MODELS: RemoteModel[] = ['ir', 'magic-2016', 'magic-2019', 'magic-2021', 'magic-2025'];
export const REMOTE_NAMES: Record<RemoteModel, string> = {
	'ir': 'Standard IR remote',
	'magic-2016': 'Magic Remote (2016)',
	'magic-2019': 'Magic Remote (2019-2020)',
	'magic-2021': 'Magic Remote (2021-2024)',
	'magic-2025': 'AI Magic Remote (2025)'
};

/** r = rounded key, c = round or oval, p = pill. `w` white (app keys). */
export type DrawShape = 'r' | 'c' | 'p';
export interface DrawButton { id: string; x: number; y: number; w: number; h: number; s: DrawShape; t: string; code: number; color?: string; white?: boolean }
export interface DrawLayout { model: RemoteModel; body: {x: number; y: number; w: number; h: number; r: number}; buttons: DrawButton[] }

export function nextModel (m: RemoteModel, dir: number): RemoteModel {
	const i = REMOTE_MODELS.indexOf(m);
	return REMOTE_MODELS[(i + dir + REMOTE_MODELS.length) % REMOTE_MODELS.length];
}
export function validModel (v: unknown): RemoteModel {
	return REMOTE_MODELS.indexOf(v as RemoteModel) !== -1 ? v as RemoteModel : 'ir';
}

const RED = '#e5484d', GREEN = '#30a46c', YELLOW = '#f5d90a', BLUE = '#3e63dd';
const b = (id: string, x: number, y: number, w: number, h: number, s: DrawShape, t: string, code: number, extra?: Partial<DrawButton>): DrawButton => ({id, x, y, w, h, s, t, code, ...extra});

/** Codes shared by every remote (numbers 1-9 are 2-10, 0 is 11). */
const CODES: Record<string, number> = {
	power: 116, home: 773, back: 412, mute: 113, input: 241, settings: 139, mic: 428, list: 787, guide: 362, netflix: 1037,
	prime: 1038, disney: 1042, rakuten: 1044, movies: 1083, red: 398, green: 399, yellow: 400, blue: 401, up: 103, left: 105,
	right: 106, down: 108, ok: 28, play: 207, pause: 119
};
const code = (id: string): number => {
	if (CODES[id] !== undefined) return CODES[id];
	const n = /^n([0-9])$/.exec(id);
	return n ? (n[1] === '0' ? 11 : Number(n[1]) + 1) : 0;
};
const m = (id: string, x: number, y: number, w: number, h: number, s: DrawShape, t: string, extra?: Partial<DrawButton>) => b(id, x, y, w, h, s, t, code(id), extra);
const colours = (y: number, xs: number[], w: number, h: number): DrawButton[] => [
	m('red', xs[0], y, w, h, 'r', '', {color: RED}), m('green', xs[1], y, w, h, 'r', '', {color: GREEN}),
	m('yellow', xs[2], y, w, h, 'r', '', {color: YELLOW}), m('blue', xs[3], y, w, h, 'r', '', {color: BLUE})
];
const app = (id: string, x: number, y: number, w: number, h: number, t: string) => m(id, x, y, w, h, 'r', t, {white: true});

const IR: DrawLayout = {
	// LG AKB30085202 (coordinates from a photo, origin moved by (525, 45))
	model: 'ir', body: {x: 3, y: 7, w: 372, h: 1328, r: 40},
	buttons: [
		m('power', 86, 83, 60, 60, 'c', '\u23fb', {color: RED}), b('input', 318, 92, 52, 40, 'r', '', 241),
		b('info', 83, 156, 52, 40, 'r', 'INFO', 358), b('subtitle', 159, 156, 52, 40, 'r', '\u25ad', 370),
		b('sap', 236, 156, 52, 40, 'r', 'SAP', 0), m('settings', 312, 158, 52, 40, 'r', '\u2699'),
		m('n1', 93, 226, 80, 50, 'r', '1'), m('n2', 194, 226, 80, 50, 'r', '2'), m('n3', 299, 226, 80, 50, 'r', '3'),
		m('n4', 93, 294, 80, 50, 'r', '4'), m('n5', 194, 294, 80, 50, 'r', '5'), m('n6', 299, 294, 80, 50, 'r', '6'),
		m('n7', 93, 361, 80, 50, 'r', '7'), m('n8', 194, 361, 80, 50, 'r', '8'), m('n9', 299, 361, 80, 50, 'r', '9'),
		m('guide', 93, 427, 80, 50, 'r', 'GUIDE'), m('n0', 194, 427, 80, 50, 'r', '0'), b('more', 299, 427, 80, 50, 'r', '\u00b7\u00b7\u00b7', 0),
		m('mute', 194, 495, 52, 38, 'r', 'MUTE'), m('search', 194, 554, 52, 38, 'r', 'FIND', {code: 217}),
		b('tv', 194, 612, 52, 38, 'r', 'TV', 377), b('vol', 89, 555, 88, 160, 'r', 'VOL', 115), b('ch', 299, 555, 88, 160, 'r', 'CH', 402),
		app('netflix', 88, 678, 82, 40, 'NETFLIX'), m('home', 191, 677, 52, 38, 'r', '\u2302'), app('prime', 297, 678, 82, 40, 'prime'),
		app('disney', 87, 747, 82, 40, 'Disney+'), b('lgch', 296, 748, 82, 40, 'r', 'LG Ch.', 0, {white: true}),
		m('up', 191, 757, 62, 50, 'r', '\u25b2'), m('left', 94, 832, 76, 60, 'r', '\u25c0'), m('ok', 191, 832, 62, 62, 'c', '\u25ce'),
		m('right', 287, 832, 76, 60, 'r', '\u25b6'), m('down', 191, 907, 62, 50, 'r', '\u25bc'),
		m('back', 87, 916, 82, 40, 'r', '\u21a9'), b('exit', 295, 916, 82, 40, 'r', '\u238b', 174),
		m('list', 84, 985, 82, 40, 'r', 'LIST'), b('rec', 189, 985, 82, 40, 'r', '\u25cf', 167), b('stop', 293, 985, 82, 40, 'r', '\u25a0', 128),
		b('rew', 72, 1055, 58, 42, 'r', '\u25c0\u25c0', 168), m('play', 151, 1055, 58, 42, 'r', '\u25b6'), m('pause', 228, 1055, 58, 42, 'r', '\u275a\u275a'), b('ff', 307, 1055, 58, 42, 'r', '\u25b6\u25b6', 208),
		...colours(1118, [71, 150, 228, 306], 58, 40)
	]
};

const ring = (x: number, y: number, d: number) => m('ok', x, y, d, d, 'c', 'OK');
const numbers = (xs: number[], ys: number[], mk: (id: string, t: string, x: number, y: number) => DrawButton): DrawButton[] => {
	const out: DrawButton[] = [];
	for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(mk('n' + (r * 3 + c + 1), String(r * 3 + c + 1), xs[c], ys[r]));
	return out.concat([mk('list', 'LIST', xs[0], ys[3]), mk('n0', '0', xs[1], ys[3]), mk('more', '\u2022\u2022\u2022', xs[2], ys[3])]);
};
const MORE_CODE = 994;

// 2016 Magic Remote (AN-MR650 / AN-MR650A, webOS 3.x). Positions laid out for Hearth after LG's AN-MR650 product photo; the bottom
// row is the AN-MR650A's (TEXT, T.OPT, FOCUS). Codes for 3D, TEXT, T.OPT and FOCUS are the ones an AN-MR650A sent on a 55UH652T
// (issue #36); keys whose code is not known are drawn with 0 (never highlighted): STB power, the ... key, search, STB MENU, CAPTION.
const M16: DrawLayout = {
	model: 'magic-2016', body: {x: 60, y: 20, w: 200, h: 880, r: 95},
	buttons: [
		m('power', 115, 93, 32, 32, 'c', 'PWR'), b('stb', 205, 93, 30, 30, 'c', 'STB', 0),
		...numbers([106, 160, 214], [150, 189, 229, 269], (id, t, x, y) => id === 'more' ? b(id, x, y, 48, 26, 'p', t, 0) : m(id, x, y, 48, 26, 'p', t)),
		b('volup', 100, 319, 40, 30, 'r', '+', 115), b('voldown', 100, 386, 40, 22, 'r', '\u2212', 114),
		b('chup', 220, 319, 40, 30, 'r', 'CH+', 402), b('chdown', 220, 386, 40, 22, 'r', 'CH\u2212', 403),
		m('mute', 160, 319, 32, 32, 'c', 'MUTE'), b('search', 160, 392, 34, 34, 'c', 'FIND', 0),
		m('home', 89, 428, 42, 24, 'p', 'HOME'), b('stbmenu', 231, 428, 42, 24, 'p', 'MENU', 0), ring(160, 522, 140),
		m('back', 89, 607, 42, 22, 'p', 'BACK'), b('caption', 231, 607, 50, 22, 'p', 'CAPTION', 0),
		b('3d', 93, 653, 42, 24, 'p', '3D', 821), m('input', 160, 648, 32, 32, 'c', 'INPUT'), m('settings', 227, 653, 42, 24, 'p', 'SET'),
		...colours(695, [95, 138, 182, 225], 30, 18),
		b('text', 108, 737, 46, 22, 'p', 'TEXT', 779), b('topt', 160, 737, 46, 22, 'p', 'T.OPT', 780), b('focus', 212, 737, 46, 22, 'p', 'FOCUS', 1026)
	]
};

const M19: DrawLayout = {
	model: 'magic-2019', body: {x: 60, y: 20, w: 200, h: 880, r: 95},
	buttons: [
		m('power', 112, 78, 32, 32, 'c', 'PWR'), b('stb', 208, 78, 32, 32, 'c', 'STB', 0),
		...numbers([105, 160, 215], [135, 178, 221, 264], (id, t, x, y) => id === 'more' ? b(id, x, y, 50, 30, 'p', t, MORE_CODE) : m(id, x, y, 50, 30, 'p', t)),
		b('volup', 102, 325, 42, 32, 'r', '+', 115), b('voldown', 102, 402, 42, 24, 'r', '\u2212', 114), b('chup', 218, 325, 42, 32, 'r', 'CH+', 402), b('chdown', 218, 402, 42, 24, 'r', 'CH\u2212', 403),
		m('mute', 160, 322, 34, 34, 'c', 'MUTE'), m('mic', 160, 392, 36, 46, 'p', 'MIC'),
		m('home', 105, 455, 32, 32, 'c', 'HOME'), m('settings', 215, 455, 32, 32, 'c', 'SET'), ring(160, 560, 140),
		m('back', 105, 668, 50, 28, 'p', 'BACK'), m('guide', 215, 668, 50, 28, 'p', 'GUIDE'),
		m('netflix', 102, 716, 58, 26, 'p', 'NETFLIX'), m('input', 160, 716, 32, 32, 'c', 'INPUT'), m('prime', 218, 716, 58, 26, 'p', 'prime'),
		...colours(760, [100, 140, 180, 220], 32, 20),
		m('movies', 102, 804, 58, 26, 'p', 'MOVIES'), m('play', 160, 804, 42, 26, 'p', '\u25b6'), m('pause', 218, 804, 42, 26, 'p', 'II')
	]
};

const M21: DrawLayout = {
	model: 'magic-2021', body: {x: 65, y: 20, w: 190, h: 880, r: 80},
	buttons: [
		m('power', 112, 70, 32, 32, 'c', 'PWR'),
		...numbers([115, 160, 205], [120, 160, 200, 240], (id, t, x, y) => id === 'more' ? b(id, x, y, 32, 32, 'c', t, MORE_CODE) : m(id, x, y, 32, 32, 'c', t)),
		b('vol', 108, 320, 38, 90, 'r', 'VOL', 115), b('ch', 212, 320, 38, 90, 'r', 'CH', 402),
		m('mute', 160, 295, 32, 32, 'c', 'MUTE'), m('mic', 160, 345, 32, 32, 'c', 'MIC'),
		m('home', 110, 410, 32, 32, 'c', 'HOME'), m('input', 210, 410, 32, 32, 'c', 'INPUT'), ring(160, 500, 130),
		m('back', 110, 595, 32, 32, 'c', 'BACK'), m('settings', 210, 595, 32, 32, 'c', 'SET'),
		...colours(640, [103, 141, 179, 217], 30, 16),
		m('netflix', 120, 690, 76, 28, 'p', 'NETFLIX'), m('prime', 200, 690, 76, 28, 'p', 'prime video'),
		m('disney', 120, 734, 76, 28, 'p', 'Disney+'), m('rakuten', 200, 734, 76, 28, 'p', 'Rakuten TV'),
		b('lgch', 120, 778, 76, 28, 'p', 'LG Channels', 0), b('alexa', 200, 778, 76, 28, 'p', 'alexa', 0)
	]
};

const M25: DrawLayout = {
	model: 'magic-2025', body: {x: 65, y: 20, w: 190, h: 880, r: 40},
	buttons: [
		m('power', 110, 75, 34, 34, 'c', 'PWR'), b('help', 210, 75, 32, 32, 'c', '?', 0),
		b('homehub', 110, 140, 34, 34, 'c', 'HUB', 0), m('guide', 210, 140, 32, 32, 'c', 'GUIDE'),
		b('ai', 160, 186, 36, 36, 'c', 'AI', 0),
		m('home', 110, 232, 34, 34, 'c', 'HOME'), b('more', 210, 232, 32, 32, 'c', '123', MORE_CODE), ring(160, 340, 140),
		m('back', 110, 455, 34, 34, 'c', 'BACK'), m('settings', 210, 455, 34, 34, 'c', 'SET'),
		b('volch', 160, 508, 160, 34, 'p', 'VOL  \u00b7  CH', 115),
		m('netflix', 120, 565, 76, 28, 'p', 'NETFLIX'), m('prime', 200, 565, 76, 28, 'p', 'prime video'),
		m('disney', 120, 609, 76, 28, 'p', 'Disney+'), m('movies', 200, 609, 76, 28, 'p', 'MOVIES'),
		b('lgch', 120, 653, 76, 28, 'p', 'LG Channels', 0), b('alexa', 200, 653, 76, 28, 'p', 'alexa', 0)
	]
};

export function remoteLayout (model: RemoteModel): DrawLayout {
	return model === 'magic-2016' ? M16 : model === 'magic-2019' ? M19 : model === 'magic-2021' ? M21 : model === 'magic-2025' ? M25 : IR;
}

/** The button drawn for a key code (null: this remote has no such button). */
export function buttonForCode (layout: DrawLayout, c: number): DrawButton | null {
	if (!c) return null;
	return layout.buttons.filter((x) => x.code === c)[0] || null;
}
