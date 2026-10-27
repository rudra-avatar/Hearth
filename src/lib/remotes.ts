// "Reassign remote buttons", the picture view: simple line drawings of LG's remotes, made for Hearth (not traced from
// LG's artwork), as data. Each button has a place, a shape and, when it can be given a new job, the TV's key name.
// Also: moving between buttons with the arrows, placing the labels beside the drawing, and guessing the remote.
// Pure (no imports from the app), so it can be tested on its own.

export type RemoteModel = 'magic-2019' | 'magic-2021' | 'magic-2025';

export type ButtonShape = 'circle' | 'pill' | 'rocker' | 'ring' | 'key';

export interface RemoteButton {
	id: string;
	/** written on the drawing (short) */
	text: string;
	/** said in the side panel */
	label: string;
	shape: ButtonShape;
	/** centre, in the drawing's units */
	x: number;
	y: number;
	w: number;
	h: number;
	/** the TV's key name: this button can be given a new job */
	key?: string;
	/** a colour key's colour */
	color?: string;
	/** the Linux key code the remote sends (how LG Input Hook names buttons) */
	linux?: number;
}

export interface RemoteLayout {
	model: RemoteModel;
	name: string;
	/** the outline of the remote */
	body: {x: number; y: number; w: number; h: number; r: number};
	/** the drawing's size (the labels go to the right of the body) */
	width: number;
	height: number;
	buttons: RemoteButton[];
}

// Buttons without a key are drawn dimmed: never reassigned (power, numbers, volume, channels, mute, the wheel, Home,
// Back, Play and Pause, which apps use for playback), or not known by name to the TV's firmware (Alexa, the 2025
// remote's AI, Home Hub and Quick Help keys: "Press a button" in the list still works for them).
const c = (id: string, text: string, label: string, x: number, y: number, r: number, key?: string): RemoteButton =>
	({id, text, label, shape: 'circle', x, y, w: r * 2, h: r * 2, key});
const pill = (id: string, text: string, label: string, x: number, y: number, w: number, h: number, key?: string): RemoteButton =>
	({id, text, label, shape: 'pill', x, y, w, h, key});
const k = (id: string, text: string, label: string, x: number, y: number, w: number, h: number, key?: string): RemoteButton =>
	({id, text, label, shape: 'key', x, y, w, h, key});
const colourKeys = (y: number, xs: number[], w: number, h: number): RemoteButton[] => [
	{...k('red', '', 'Red', xs[0], y, w, h, 'Key_webOS_Red'), color: '#e5484d'},
	{...k('green', '', 'Green', xs[1], y, w, h, 'Key_webOS_Green'), color: '#30a46c'},
	{...k('yellow', '', 'Yellow', xs[2], y, w, h, 'Key_webOS_Yellow'), color: '#f5d90a'},
	{...k('blue', '', 'Blue', xs[3], y, w, h, 'Key_webOS_Blue'), color: '#3e63dd'}
];
const ring = (x: number, y: number, d: number): RemoteButton => ({id: 'ok', text: 'OK', label: 'The wheel: OK and the arrows', shape: 'ring', x, y, w: d, h: d});

/** 1-9 (circles, or wide keys), then the bottom row of the pad. Never reassigned (holding a number is Quick Access). */
function numberPad (xs: number[], ys: number[], make: (id: string, text: string, x: number, y: number) => RemoteButton): RemoteButton[] {
	const out: RemoteButton[] = [];
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			const n = String(row * 3 + col + 1);
			out.push(make('n' + n, n, xs[col], ys[row]));
		}
	}
	const list = make('list', 'LIST', xs[0], ys[3]);
	const more = make('more', '•••', xs[2], ys[3]);
	return out.concat([{...list, label: 'List'}, make('n0', '0', xs[1], ys[3]), {...more, label: '••• (more actions, AD/SAP)', key: 'Key_webOS_ScreenRemote'}]);
}

export const REMOTES: RemoteLayout[] = [
	{
		// the 2019-2020 Magic Remote (MR19/MR20): wide number keys, separate + and - keys, Movies, Play and Pause
		model: 'magic-2019', name: 'Magic Remote (2019–2020, with Movies)', body: {x: 60, y: 20, w: 200, h: 880, r: 95}, width: 560, height: 920,
		buttons: [
			c('power', 'POWER', 'Power', 112, 78, 16),
			c('stbpower', 'STB', 'Set-top box power', 208, 78, 16),
			...numberPad([105, 160, 215], [135, 178, 221, 264], (id, text, x, y) => pill(id, text, text, x, y, 50, 30)),
			k('volup', '+', 'Volume up', 102, 325, 42, 32),
			k('voldown', '−', 'Volume down', 102, 402, 42, 24),
			k('chup', 'CH+', 'Channel up', 218, 325, 42, 32),
			k('chdown', 'CH−', 'Channel down', 218, 402, 42, 24),
			c('mute', 'MUTE', 'Mute', 160, 322, 17),
			pill('mic', 'MIC', 'Microphone', 160, 392, 36, 46, 'Key_webOS_Voice'),
			c('home', 'HOME', 'Home', 105, 455, 16),
			c('settings', 'SET', 'Settings', 215, 455, 16, 'Key_webOS_Settings'),
			ring(160, 560, 140),
			pill('back', 'BACK', 'Back', 105, 668, 50, 28),
			pill('guide', 'GUIDE', 'Guide', 215, 668, 50, 28, 'Key_webOS_TVGuide'),
			pill('netflix', 'NETFLIX', 'Netflix', 102, 716, 58, 26, 'Key_webOS_Netflix'),
			c('input', 'INPUT', 'Input', 160, 716, 16, 'Key_webOS_InputSource'),
			pill('prime', 'prime', 'Prime Video', 218, 716, 58, 26, 'Key_webOS_Amazon'),
			...colourKeys(760, [100, 140, 180, 220], 32, 20),
			pill('movies', 'MOVIES', 'Movies (Rakuten TV)', 102, 804, 58, 26, 'Key_webOS_RakutenTV'),
			pill('play', '▶', 'Play', 160, 804, 42, 26),
			pill('pause', 'II', 'Pause', 218, 804, 42, 26)
		]
	},
	{
		// the 2021-2024 Magic Remote (MR21-MR24): round number keys, rockers, colour keys, two columns of app keys
		model: 'magic-2021', name: 'Magic Remote (2021–2024)', body: {x: 65, y: 20, w: 190, h: 880, r: 80}, width: 560, height: 920,
		buttons: [
			c('power', 'POWER', 'Power', 112, 70, 16),
			...numberPad([115, 160, 205], [120, 160, 200, 240], (id, text, x, y) => c(id, text, text, x, y, 16)),
			{id: 'vol', text: 'VOL', label: 'Volume', shape: 'rocker', x: 108, y: 320, w: 38, h: 90},
			{id: 'ch', text: 'CH', label: 'Channels', shape: 'rocker', x: 212, y: 320, w: 38, h: 90},
			c('mute', 'MUTE', 'Mute', 160, 295, 16),
			c('mic', 'MIC', 'Microphone', 160, 345, 16, 'Key_webOS_Voice'),
			c('home', 'HOME', 'Home', 110, 410, 16),
			c('input', 'INPUT', 'Input', 210, 410, 16, 'Key_webOS_InputSource'),
			ring(160, 500, 130),
			c('back', 'BACK', 'Back', 110, 595, 16),
			c('settings', 'SET', 'Settings', 210, 595, 16, 'Key_webOS_Settings'),
			...colourKeys(640, [103, 141, 179, 217], 30, 16),
			pill('netflix', 'NETFLIX', 'Netflix', 120, 690, 76, 28, 'Key_webOS_Netflix'),
			pill('prime', 'prime video', 'Prime Video', 200, 690, 76, 28, 'Key_webOS_Amazon'),
			pill('disney', 'Disney+', 'Disney+', 120, 734, 76, 28, 'Key_webOS_Disneyplus'),
			pill('rakuten', 'Rakuten TV', 'Rakuten TV', 200, 734, 76, 28, 'Key_webOS_RakutenTV'),
			pill('channels', 'LG Channels', 'LG Channels', 120, 778, 76, 28, 'Key_webOS_LGChannels'),
			pill('alexa', 'alexa', 'Alexa', 200, 778, 76, 28)
		]
	},
	{
		// the 2025 AI Magic Remote: no number keys; one wide volume / channel bar below the wheel
		model: 'magic-2025', name: 'AI Magic Remote (2025)', body: {x: 65, y: 20, w: 190, h: 880, r: 40}, width: 560, height: 920,
		buttons: [
			c('power', 'POWER', 'Power', 110, 75, 17),
			c('help', '?', 'Quick Help', 210, 75, 16),
			c('homehub', 'HUB', 'Home Hub', 110, 140, 17),
			c('guide', 'GUIDE', 'Guide (List)', 210, 140, 16, 'Key_webOS_TVGuide'),
			c('ai', 'AI', 'AI', 160, 186, 18),
			c('home', 'HOME', 'Home', 110, 232, 17),
			c('more', '123', '123 (more actions, AD/SAP)', 210, 232, 16, 'Key_webOS_ScreenRemote'),
			ring(160, 340, 140),
			c('back', 'BACK', 'Back', 110, 455, 17),
			c('settings', 'SET', 'Settings', 210, 455, 17, 'Key_webOS_Settings'),
			pill('volch', 'VOL  ·  CH', 'Volume and channels (and mute)', 160, 508, 160, 34),
			pill('netflix', 'NETFLIX', 'Netflix', 120, 565, 76, 28, 'Key_webOS_Netflix'),
			pill('prime', 'prime video', 'Prime Video', 200, 565, 76, 28, 'Key_webOS_Amazon'),
			pill('disney', 'Disney+', 'Disney+', 120, 609, 76, 28, 'Key_webOS_Disneyplus'),
			pill('movies', 'MOVIES', 'Movies', 200, 609, 76, 28, 'Key_webOS_RakutenTV'),
			pill('channels', 'LG Channels', 'LG Channels', 120, 653, 76, 28, 'Key_webOS_LGChannels'),
			pill('alexa', 'alexa', 'Alexa', 200, 653, 76, 28)
		]
	}
];

/** Linux key codes of the drawn buttons (the TV's own key table; the same numbers LG Input Hook shows). */
export const LINUX_CODES: Record<string, number> = {
	home: 773, back: 412, mute: 113, input: 241, settings: 139, mic: 428, list: 787, more: 994, guide: 362,
	netflix: 1037, prime: 1038, disney: 1042, rakuten: 1044, movies: 1083, red: 398, green: 399, yellow: 400, blue: 401
};
REMOTES.forEach((r) => r.buttons.forEach((b) => { if (LINUX_CODES[b.id] !== undefined) b.linux = LINUX_CODES[b.id]; }));

/** Where LG Input Hook (a separate Homebrew app) keeps its own button bindings. Hearth only reads it. */
export const INPUT_HOOK_FILE = '/home/root/.config/lginputhook/keybinds.json';
export const INPUT_HOOK_COMMAND = `cat '${INPUT_HOOK_FILE}' 2>/dev/null; true`;

/** The Linux key codes Input Hook has a binding for, from its keybinds.json ({"<code>": {"action": …}}). Anything
 *  unreadable counts as no bindings. */
export function inputHookCodes (text: string): number[] {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
		return Object.keys(parsed as object).filter((k) => /^[0-9]{1,5}$/.test(k) && (parsed as Record<string, unknown>)[k] !== null)
			.map(Number).sort((a, b) => a - b);
	} catch {
		return [];
	}
}

/** The drawn buttons Input Hook also acts on. */
export function boundByInputHook (layout: RemoteLayout, codes: number[]): string[] {
	return layout.buttons.filter((b) => b.linux !== undefined && codes.indexOf(b.linux) !== -1).map((b) => b.id);
}

export function remoteLayout (model: RemoteModel): RemoteLayout {
	return REMOTES.filter((r) => r.model === model)[0] || REMOTES[0];
}

/** The buttons that can be given a new job, top to bottom, left to right. */
export function reassignable (layout: RemoteLayout): RemoteButton[] {
	return layout.buttons.filter((b) => !!b.key).sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

/** The button on this drawing for a key name (null: it is not drawn, e.g. a button this remote doesn't have). */
export function buttonForKey (layout: RemoteLayout, key: string): RemoteButton | null {
	return layout.buttons.filter((b) => b.key === key)[0] || null;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** The nearest reassignable button in a direction from `from` (null: none that way). Only buttons within a wide cone
 *  that way count (no more than twice as far across as along), and distance across counts double, so ↓ prefers the
 *  button below over one far to the side, and → at the edge finds nothing (the screen then moves to the side panel). */
export function nextButton (layout: RemoteLayout, from: RemoteButton, dir: Direction): RemoteButton | null {
	let best: RemoteButton | null = null;
	let bestScore = Infinity;
	reassignable(layout).forEach((b) => {
		if (b.id === from.id) return;
		const dx = b.x - from.x;
		const dy = b.y - from.y;
		const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
		const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
		if (along <= 4 || across > along * 2) return;
		const score = along + across * 2;
		if (score < bestScore) { bestScore = score; best = b; }
	});
	return best;
}

/** Where the labels beside the drawing go: as close to their button's height as possible, in the same order, never
 *  closer than `gap` to each other, and within [top, bottom] (pushed up from the bottom if needed). */
export function placeLabels (ys: number[], gap: number, top: number, bottom: number): number[] {
	const order = ys.map((y, i) => ({y, i})).sort((a, b) => a.y - b.y || a.i - b.i);
	const placed: number[] = [];
	order.forEach((o, n) => { placed[n] = Math.max(o.y, top, n > 0 ? placed[n - 1] + gap : top); });
	for (let n = placed.length - 1; n >= 0; n--) {
		const limit = n === placed.length - 1 ? bottom : placed[n + 1] - gap;
		if (placed[n] > limit) placed[n] = limit;
	}
	const out: number[] = [];
	order.forEach((o, n) => { out[o.i] = placed[n]; });
	return out;
}

/** Which remote the TV's log says was used last ("remote_type":"LGE MR19"), or null when it can't tell. Only the
 *  Magic Remotes say which model they are: MR19/MR20 are the 2019-2020 remote, MR21-MR24 the 2021-2024 one, MR25 and
 *  later the 2025 one; older Magic Remotes (MR14-MR18) had no partner buttons. */
export function remoteFromLog (log: string): RemoteModel | null {
	const all = log.match(/"remote_type"\s*:\s*"[^"]*"/g);
	if (!all || !all.length) return null;
	const last = /MR(\d\d)/.exec(all[all.length - 1]);
	if (!last) return null;
	const year = Number(last[1]);
	if (year === 19 || year === 20) return 'magic-2019';
	if (year >= 21 && year <= 24) return 'magic-2021';
	if (year >= 25) return 'magic-2025';
	return null;
}

/** The TV command that reads the last remote the TV's own log names (one line, or nothing). */
export const REMOTE_LOG_COMMAND = `grep -o '"remote_type":"[^"]*"' /var/log/messages 2>/dev/null | tail -1; true`;
