// The user's choices: which apps and inputs appear on the home row, in order, the look
// (theme, sizes, margins), the clock, the wallpaper, and a few options. Persisted in
// localStorage (private to this app on the TV).

import {STORAGE_KEY, WALLPAPER} from '../config/constants';
import type {ThemeName} from '../theme/tokens';
import {BACKGROUND_IDS} from './backgrounds';
import {cleanEdits, type SourceEdits} from './sourceicons';
import {CLOCK_FONT_IDS, type ClockFont} from './clockfont';
import {CLOCK_COLOR_IDS, LABEL_COLOR_IDS, type ClockColor} from './clockcolor';
import {TILE_SHAPE_IDS} from './tileshape';
import {DEFAULT_CITY} from './cities';
import {validCoords, type City, type TempUnit} from './weather';
import {cleanRemap, DEFAULT_REMAP, type RemapConfig} from './remapcmd';

export type WallpaperMode = 'gradient' | 'image' | 'folder';
export type ClockFormat = 'tv' | '12h' | '24h';
export type {ClockColor};
export type ClockWeight = 200 | 300 | 400 | 500 | 600 | 700;

/** Numeric settings: the values they can take (OK steps through them, ← → nudge them). */
export const RANGES = {
	iconScale:    {min: 50,  max: 140, step: 10, def: 90},   // % of the standard tile size
	sideMargin:   {min: 0,   max: 300, step: 10, def: 20},    // px at 1080p, left and right of the app row
	bottomMargin: {min: 0,   max: 200, step: 10, def: 10},    // px at 1080p, below the app row
	clockSize:    {min: 80,  max: 220, step: 10, def: 140},   // px, height of the digits
	clockTop:     {min: 0,   max: 70,  step: 2,  def: 28},    // % of the screen height (0 = the very top)
	clockLeft:    {min: 0,   max: 100, step: 2,  def: 50},    // % of the screen width (where the clock's centre sits)
	clockShadow: {min: 10,  max: 100, step: 10, def: 50},     // % (strength of the widget's drop shadow)
	clockOpacity: {min: 10,  max: 100, step: 10, def: 100},   // % (how solid the clock, date and weather are)
	iconOpacity:  {min: 30,  max: 100, step: 10, def: 100},   // % (how solid the icons of the home row are)
	iconGap:      {min: 50,  max: 200, step: 10, def: 100},   // % of the standard space between the home row's icons
	wallpaperOpacity: {min: 30, max: 100, step: 10, def: 100}, // % (how solid the picture is; lower lets the background show through)
	quietSec:     {min: 0,   max: 60,  step: 10, def: 0},     // seconds without a key before the apps hide (0 = off)
	fadeStrength: {min: 0,   max: 100, step: 5,  def: 30},    // % darkness of the bottom fade over the wallpaper (0 = off)
	fadeHeight:   {min: 20,  max: 100, step: 5,  def: 50},    // % of the screen height the bottom fade covers
	recentsW:     {min: 30,  max: 100, step: 5,  def: 60},    // % of the screen width of the Recent apps panel
	recentsH:     {min: 30,  max: 60,  step: 5,  def: 30}     // % of the screen height of the Recent apps panel
} as const;

export type RangeName = keyof typeof RANGES;

export function rangeValues (name: RangeName): number[] {
	const r = RANGES[name];
	const out: number[] = [];
	for (let v = r.min; v <= r.max; v += r.step) out.push(v);
	return out;
}

export interface ClockConfig {
	size: number;
	weight: ClockWeight;
	/** the typeface of the time and date */
	font: ClockFont;
	/** distance of the clock from the top of the screen, % of the screen height */
	top: number;
	/** where the clock's centre sits across the screen, % of the screen width */
	left: number;
	color: ClockColor;
	/** a slight drop shadow behind the time, date and weather */
	shadow: boolean;
	/** how strong that shadow is, % (see RANGES.clockShadow) */
	shadowStrength: number;
	/** how solid the whole widget is, % */
	opacity: number;
	showDate: boolean;
	/** AM/PM beside the time (12-hour mode only) */
	showPeriod: boolean;
}

export interface WeatherConfig {
	/** show the weather line under the date */
	on: boolean;
	city: City | null;
	unit: TempUnit;
	showCity: boolean;
	/** today's high and low */
	showRange: boolean;
}

export interface WallpaperConfig {
	/** gradient: the default background (black or the calm gradient, per theme). image: one picture. folder: a slideshow. */
	mode: WallpaperMode;
	/** absolute path of the picture or the folder (empty for the default background) */
	path: string;
	/** seconds between pictures in a slideshow */
	intervalSec: number;
	/** play the slideshow in random order */
	shuffle: boolean;
}

export interface UserConfig {
	/** the order the user arranged the apps in (apps not listed follow, in the TV's order); null → the TV's order */
	appIds: string[] | null;
	/** apps the user hid; every other app shows. null → settings from an older version, converted when the app list loads */
	hiddenIds: string[] | null;
	/** ordered input appIds (com.webos.app.hdmiN) shown after the apps; empty → none */
	sourceIds: string[];
	/** the order of the apps and inputs together on the home row (tile keys); null → apps, then inputs */
	tileOrder: string[] | null;
	/** read the live app list through the Homebrew Channel (root) */
	/** end LG's own home app when the launcher opens, to free memory */
	/** end LG's home app each time the launcher opens. No row any more: only the safety switch (LG Home kept coming back) turns it off */
	closeHome: boolean;
	/** EXPERIMENTAL: read the app list from the TV's remote-control service when there is no root (Options row) */
	tvApps: boolean;
	/** show the Debug tab in Settings (Options → last row) */
	showDebug: boolean;
	/** a watcher opens this launcher whenever LG Home comes to the front (kept running whenever the launcher opens) */
	replaceHome: boolean;
	/** "Replace LG Home with a script and SAM": Hearth holds LG Home's own place, so the TV never opens LG Home at all; see src/takeover */
	takeoverHome: boolean;
	/** "Reassign remote buttons": what the remote's app buttons (and others) do instead (see remapcmd.ts) */
	remap: RemapConfig;
	theme: ThemeName;
	/** a built-in background (see backgrounds.ts); 'theme' is the theme's own */
	background: string;
	iconScale: number;
	/** how solid the home row's icons are, % */
	iconOpacity: number;
	/** space between the home row's icons, % of the standard */
	iconGap: number;
	/** the wallpaper picture's opacity, % */
	wallpaperOpacity: number;
	/** bottom fade over the wallpaper: darkness % (0 = off) and height % of the screen */
	fadeStrength: number;
	fadeHeight: number;
	/** shape of the home-row icons (see TILE_SHAPES) */
	tileShape: string;
	/** size of the Recent apps panel, % of the screen */
	recentsW: number;
	recentsH: number;
	/** quiet mode: hide the apps after this many seconds without a key (0 = off) */
	quietSec: number;
	/** OLED shift: the clock and the apps move a few pixels now and then so nothing burns in */
	oledShift: boolean;
	/** colour of the names under the icons: 'theme' or a plain colour id (see LABEL_COLOR_IDS) */
	labelColor: string;
	/** show each app's name under its icon on the home row */
	showLabels: boolean;
	/** minimalist look: no borders around icons or on the selected one; the selected icon is simply larger */
	minimal: boolean;
	/** the LG Home and System Settings tiles at the end of the row (Hearth's own Settings tile is always there) */
	showLgHome: boolean;
	showSystem: boolean;
	/** the names and icons the user gave to sources, by the source's app id */
	sourceEdits: SourceEdits;
	/** the user's own name and picture for apps (same shape as sourceEdits, keyed by app id) */
	appEdits: SourceEdits;
	/** apps in one row or two */
	rows: 1 | 2;
	sideMargin: number;
	bottomMargin: number;
	/** 'tv' follows the TV's own 12/24-hour setting */
	clockFormat: ClockFormat;
	clock: ClockConfig;
	weather: WeatherConfig;
	wallpaper: WallpaperConfig;
}

export const THEME_IDS: ThemeName[] = ['black', 'grey', 'midnight', 'forest', 'cloud', 'sand', 'mist'];

export const DEFAULT_WALLPAPER: WallpaperConfig = {
	mode: 'gradient',
	path: '',
	intervalSec: 60,
	shuffle: true
};

export const DEFAULT_WEATHER: WeatherConfig = {
	on: true,
	city: DEFAULT_CITY,
	unit: 'c',
	showCity: true,
	showRange: false
};

export const DEFAULT_CLOCK: ClockConfig = {
	size: RANGES.clockSize.def,
	weight: 200,
	font: 'inter',
	top: RANGES.clockTop.def,
	left: RANGES.clockLeft.def,
	color: 'white',
	shadow: true,
	shadowStrength: RANGES.clockShadow.def,
	opacity: RANGES.clockOpacity.def,
	showDate: true,
	showPeriod: true
};

export const DEFAULT_CONFIG: UserConfig = {
	appIds: null,
	hiddenIds: [],
	sourceIds: [],
	tileOrder: null,
	closeHome: true,
	tvApps: false,
	showDebug: false,
	replaceHome: false,
	takeoverHome: false,
	remap: DEFAULT_REMAP,
	theme: 'black',
	background: 'theme',
	iconScale: RANGES.iconScale.def,
	iconOpacity: RANGES.iconOpacity.def,
	iconGap: RANGES.iconGap.def,
	wallpaperOpacity: RANGES.wallpaperOpacity.def,
	fadeStrength: RANGES.fadeStrength.def,
	fadeHeight: RANGES.fadeHeight.def,
	tileShape: 'rounded',
	recentsW: RANGES.recentsW.def,
	recentsH: RANGES.recentsH.def,
	quietSec: RANGES.quietSec.def,
	oledShift: true,
	labelColor: 'theme',
	showLabels: true,
	minimal: false,
	showLgHome: true,
	showSystem: true,
	sourceEdits: {},
	appEdits: {},
	rows: 1,
	sideMargin: RANGES.sideMargin.def,
	bottomMargin: RANGES.bottomMargin.def,
	clockFormat: 'tv',
	clock: DEFAULT_CLOCK,
	weather: DEFAULT_WEATHER,
	wallpaper: DEFAULT_WALLPAPER
};

function stringList (value: unknown): string[] | null {
	return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : null;
}

/** A number within the range's limits, snapped to its step; the default when it isn't a number. */
function ranged (value: unknown, name: RangeName): number {
	const r = RANGES[name];
	if (typeof value !== 'number' || !isFinite(value)) return r.def;
	const snapped = r.min + Math.round((Math.min(r.max, Math.max(r.min, value)) - r.min) / r.step) * r.step;
	return Math.min(r.max, snapped);
}

export function loadConfig (): UserConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {...DEFAULT_CONFIG};
		const parsed = JSON.parse(raw) as Partial<UserConfig> & {wallpaper?: Partial<WallpaperConfig>; clock?: Partial<ClockConfig>; weather?: Partial<WeatherConfig>};
		const w: Partial<WallpaperConfig> = parsed.wallpaper || {};
		const c: Partial<ClockConfig> = parsed.clock || {};
		const wx: Partial<WeatherConfig> = parsed.weather || DEFAULT_WEATHER;
		const wc = wx.city as Partial<City> | null | undefined;
		const city: City | null = wc && typeof wc.name === 'string' && wc.name && validCoords(wc.lat, wc.lon) ? {name: wc.name.slice(0, 60), lat: wc.lat as number, lon: wc.lon as number, detail: typeof wc.detail === 'string' ? wc.detail.slice(0, 80) : undefined} : null;
		const mode: WallpaperMode = w.mode === 'image' || w.mode === 'folder' ? w.mode : 'gradient';
		const path = typeof w.path === 'string' ? w.path : '';
		const interval = typeof w.intervalSec === 'number' && w.intervalSec >= 5 ? w.intervalSec : DEFAULT_WALLPAPER.intervalSec;
		return {
			appIds: stringList(parsed.appIds),
			// older settings listed the apps to SHOW: they are converted once the app list is known
			hiddenIds: stringList(parsed.hiddenIds) !== null ? stringList(parsed.hiddenIds) : (stringList(parsed.appIds) === null ? [] : null),
			sourceIds: stringList(parsed.sourceIds) || [],
			tileOrder: stringList(parsed.tileOrder),
			closeHome: parsed.closeHome !== false,
			tvApps: parsed.tvApps === true,
			showDebug: parsed.showDebug === true,
			replaceHome: parsed.replaceHome === true,
			takeoverHome: parsed.takeoverHome === true,
			remap: cleanRemap(parsed.remap),
			theme: THEME_IDS.indexOf(parsed.theme as ThemeName) !== -1 ? (parsed.theme as ThemeName) : 'black',
			background: BACKGROUND_IDS.indexOf(parsed.background as string) !== -1 ? (parsed.background as string) : 'theme',
			iconScale: ranged(parsed.iconScale, 'iconScale'),
			iconOpacity: ranged(parsed.iconOpacity, 'iconOpacity'),
			iconGap: ranged(parsed.iconGap, 'iconGap'),
			wallpaperOpacity: ranged(parsed.wallpaperOpacity, 'wallpaperOpacity'),
			fadeStrength: ranged(parsed.fadeStrength, 'fadeStrength'),
			fadeHeight: ranged(parsed.fadeHeight, 'fadeHeight'),
			tileShape: TILE_SHAPE_IDS.indexOf(parsed.tileShape as string) !== -1 ? (parsed.tileShape as string) : 'rounded',
			recentsW: ranged(parsed.recentsW, 'recentsW'),
			recentsH: ranged(parsed.recentsH, 'recentsH'),
			quietSec: ranged(parsed.quietSec, 'quietSec'),
			oledShift: parsed.oledShift !== false,
			labelColor: LABEL_COLOR_IDS.indexOf(parsed.labelColor as string) !== -1 ? (parsed.labelColor as string) : 'theme',
			showLabels: parsed.showLabels !== false,
			minimal: parsed.minimal === true,
			showLgHome: parsed.showLgHome !== false,
			showSystem: parsed.showSystem !== false,
			sourceEdits: cleanEdits(parsed.sourceEdits),
			appEdits: cleanEdits(parsed.appEdits),
			rows: parsed.rows === 2 ? 2 : 1,
			sideMargin: ranged(parsed.sideMargin, 'sideMargin'),
			bottomMargin: ranged(parsed.bottomMargin, 'bottomMargin'),
			clockFormat: parsed.clockFormat === 'tv' || parsed.clockFormat === '24h' || parsed.clockFormat === '12h' ? parsed.clockFormat : DEFAULT_CONFIG.clockFormat,
			clock: {
				size: ranged(c.size, 'clockSize'),
				weight: c.weight === 300 || c.weight === 400 || c.weight === 500 || c.weight === 600 || c.weight === 700 ? c.weight : 200,
				font: CLOCK_FONT_IDS.indexOf(c.font as ClockFont) !== -1 ? (c.font as ClockFont) : 'inter',
				top: ranged(c.top, 'clockTop'),
				left: ranged(c.left, 'clockLeft'),
				color: CLOCK_COLOR_IDS.indexOf(c.color as ClockColor) !== -1 ? (c.color as ClockColor) : 'white',
				shadow: c.shadow !== false,
				shadowStrength: ranged(c.shadowStrength, 'clockShadow'),
				opacity: ranged(c.opacity, 'clockOpacity'),
				showDate: c.showDate !== false,
				showPeriod: c.showPeriod !== false
			},
			weather: {
				on: wx.on === true && city !== null,
				city,
				unit: wx.unit === 'f' ? 'f' : 'c',
				showCity: wx.showCity !== false,
				showRange: wx.showRange !== false
			},
			wallpaper: {
				mode: path ? mode : 'gradient',
				path,
				intervalSec: interval,
				shuffle: w.shuffle !== false
			}
		};
	} catch {
		return {...DEFAULT_CONFIG};
	}
}

export function saveConfig (config: UserConfig): void {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
	catch { /* nothing sensible to do on a TV */ }
}

/** Toggle an ID in an ordered list: remove if present, else append. */
export function toggleId (ids: string[], id: string): string[] {
	return ids.indexOf(id) === -1 ? ids.concat(id) : ids.filter((x) => x !== id);
}

/** Step through a list of allowed values: `delta` is +1 or -1; `wrap` loops round at the ends
 *  (OK key) instead of stopping there (arrow keys). */
export function stepValue<T> (values: readonly T[], current: T, delta: number, wrap: boolean): T {
	const i = values.indexOf(current);
	const from = i === -1 ? 0 : i;
	const next = wrap ? (from + delta + values.length) % values.length : Math.min(values.length - 1, Math.max(0, from + delta));
	return values[next];
}

export const INTERVAL_VALUES: readonly number[] = WALLPAPER.intervals;
