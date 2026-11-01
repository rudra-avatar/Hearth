import {isAppIcon} from '../config/appicons';
import {t as tt} from '../i18n';

// Icons and names for the Sources (HDMI inputs and so on): drawn as simple line art in the theme's colours, and
// editable per source (Settings → Apps or Sources → hold OK on a tile). The TV's own name and icon are used until edited.

export interface SourceIcon {
	id: string;
	label: string;
	/** SVG path data on a 24 × 24 grid */
	path: string;
}

export const SOURCE_ICONS: readonly SourceIcon[] = [
	{id: 'hdmi', get label () { return tt('sourceicons.hdmiPort'); }, path: 'M4 7.5h16v6.2l-2.3 3.3H6.3L4 13.7zM8.5 11h7'},
	{id: 'tv', get label () { return tt('sourceicons.tv'); }, path: 'M3 5.5h18v11H3zM8.5 20h7M12 16.5V20'},
	{id: 'console', get label () { return tt('sourceicons.gameConsole'); }, path: 'M3.5 8.5h17v7.5h-17zM7 12.2h6.5M17 12.2h.01M9 19h6'},
	{id: 'controller', get label () { return tt('sourceicons.gameController'); }, path: 'M7 7.5h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.2 2L14.5 14h-5l-1.3 1A3 3 0 0 1 3 13v-1.5a4 4 0 0 1 4-4zM8 10v3M6.5 11.5h3M15.5 10.8h.01M17.5 12.6h.01'},
	{id: 'desktop', get label () { return tt('sourceicons.desktopPc'); }, path: 'M3.5 4.5h17v11h-17zM9 20h6M12 15.5V20'},
	{id: 'laptop', get label () { return tt('sourceicons.laptop'); }, path: 'M5.5 6h13v9h-13zM3 18.5h18l-1.2-3.5H4.2z'},
	{id: 'tvbox', get label () { return tt('sourceicons.tvBoxStick'); }, path: 'M4 9.5h16v6.5H4zM8 12.8h4M17 12.8h.01'},
	{id: 'settop', get label () { return tt('sourceicons.cableSatelliteBox'); }, path: 'M3.5 9h17v7h-17zM7 12.5h3M17 11.2h.01M17 13.8h.01'},
	{id: 'disc', get label () { return tt('sourceicons.discPlayer'); }, path: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 10.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z'},
	{id: 'speaker', get label () { return tt('sourceicons.soundbarSpeaker'); }, path: 'M3 9.5h18v6H3zM7 12.5h.01M17 12.5h.01M10 12.5h4'},
	{id: 'antenna', get label () { return tt('sourceicons.antenna'); }, path: 'M12 12.5v8M8 20.5h8M7.5 9a6 6 0 0 1 9 0M4.7 6.5a10 10 0 0 1 14.6 0M12 12.5h.01'},
	{id: 'phone', get label () { return tt('sourceicons.phoneTablet'); }, path: 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM11 18h2'},
	{id: 'camera', get label () { return tt('sourceicons.camera'); }, path: 'M4 8h3.5l1.5-2h6l1.5 2H20v10.5H4zM12 10.3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'},
	{id: 'usb', get label () { return tt('sourceicons.usb'); }, path: 'M12 3.5v13M12 16.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 11l4-2.5v-2M12 13.5L8 11V9M15 4.5h2.5v2H15zM6.8 7h2.4v2H6.8z'},
	{id: 'input', get label () { return tt('sourceicons.otherInput'); }, path: 'M14 4.5h5.5v15H14M3.5 12h11M10.5 8l4 4-4 4'}
];

export const SOURCE_ICON_IDS: string[] = SOURCE_ICONS.map((i) => i.id);

/** Names to step through with ← → (typing a name is also possible). */
export function suggestedNames (): string[] {
	return [
		'PlayStation 5', 'PlayStation 4', 'Xbox', 'Nintendo Switch', 'PC', tt('sourceicons.laptop'), 'Apple TV', 'Fire TV', 'Chromecast',
		'Roku', tt('sourceicons.cableBox'), 'Blu-ray', tt('sourceicons.soundbar'), tt('sourceicons.camera'), tt('sourceicons.gameConsole')
	];
}

/** What the TV's own icon file name stands for (the file names are LG's). */
const LG_ICON: Record<string, string> = {
	gameconsole: 'console', pc: 'desktop', settopbox: 'settop', streamingbox: 'tvbox', bluray: 'disc', dvd: 'disc', vcr: 'disc',
	hometheater: 'speaker', sound: 'speaker', antenna: 'antenna', satellite: 'settop', mobile: 'phone', camera: 'camera',
	usb: 'usb', 'usb-port': 'usb', tv: 'tv', av: 'input', component: 'input', scart: 'input', portaltv: 'tvbox', screenshare: 'phone',
	dlna: 'input', mediaserver: 'input', inputhub: 'input'
};

/** The icon for a source from the TV's icon file name (e.g. "gameconsole.png", "HDMI_1.png"). */
export function autoIcon (file: string): string {
	const name = file.replace(/\.[a-z]+$/i, '').toLowerCase();
	return LG_ICON[name] || 'hdmi';
}

export interface SourceEdit {
	label?: string;
	icon?: string;
	/** the user's own picture (a small data URI); wins over `icon` */
	iconData?: string;
}

export type SourceEdits = Record<string, SourceEdit>;

export const MAX_SOURCE_NAME = 24;

/** The edits as saved, cleaned: unknown icons and empty names dropped, names cut to a sensible length. */
export function cleanEdits (raw: unknown): SourceEdits {
	const out: SourceEdits = {};
	if (!raw || typeof raw !== 'object') return out;
	const src = raw as Record<string, unknown>;
	for (const key in src) {
		const e = src[key] as SourceEdit | null;
		if (!e || typeof e !== 'object' || key.length > 80) continue;
		const label = typeof e.label === 'string' ? e.label.trim().slice(0, MAX_SOURCE_NAME) : '';
		const icon = typeof e.icon === 'string' && (SOURCE_ICON_IDS.indexOf(e.icon) !== -1 || isAppIcon(e.icon)) ? e.icon : '';
		const iconData = typeof e.iconData === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(e.iconData) && e.iconData.length <= 150000 ? e.iconData : '';
		if (label || icon || iconData) out[key] = {...(label ? {label} : {}), ...(icon ? {icon} : {}), ...(iconData ? {iconData} : {})};
	}
	return out;
}

/** The edits with `patch` applied to `key` (an empty name or icon means "back to the TV's"). */
export function setEdit (edits: SourceEdits, key: string, patch: SourceEdit): SourceEdits {
	const merged: SourceEdit = {...edits[key], ...patch};
	const next: SourceEdits = {...edits};
	delete next[key];
	return cleanEdits({...next, [key]: merged});
}

export function iconPath (id: string): string {
	const icon = SOURCE_ICONS.filter((i) => i.id === id)[0];
	return icon ? icon.path : SOURCE_ICONS[SOURCE_ICONS.length - 1].path;
}

export function iconLabel (id: string): string {
	const icon = SOURCE_ICONS.filter((i) => i.id === id)[0];
	return icon ? icon.label : tt('sourceicons.otherInput');
}
