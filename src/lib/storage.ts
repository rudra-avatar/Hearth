// The user's choices: which apps and inputs appear on the home row, in order, the look
// (theme, sizes, margins), the clock, the wallpaper, and a few options. Persisted in
// localStorage (private to this app on the TV).

import {STORAGE_KEY, WALLPAPER} from '../config/constants';
import type {ThemeName} from '../theme/tokens';
import {BACKGROUND_IDS} from './backgrounds';
import {currentPhotoId, currentSaverSource} from './legacyids';
import {cleanEdits, type SourceEdits} from './sourceicons';
import {CLOCK_FONT_IDS, restoreThemeFonts, type ClockFont} from './clockfont';
import {SCROLL_SPEED_IDS, type ScrollSpeed} from './scrollspeed';
import {writeWithRoom} from './storeguard';
import {log} from './log';

/** thickness choices for the app names */
export const LABEL_WEIGHTS: readonly number[] = [300, 400, 500, 600, 700];
export const LABEL_SIZES: readonly number[] = [80, 90, 100, 110, 120, 130, 140];
import {CLOCK_COLOR_IDS, LABEL_COLOR_IDS, PLAIN_COLOR_IDS, REMOVED_CLOCK_COLORS, validInk, type ClockColor} from './clockcolor';
import {cleanRemap, DEFAULT_REMAP, type RemapConfig} from './remapcmd';
import {TILE_SHAPE_IDS} from './tileshape';
import type {HomeFocus} from './homefocus';
import {DEFAULT_CITY} from './cities';
import {validCoords, type City, type TempUnit} from './weather';
import {DEFAULT_LANGUAGE, languageId} from './languages';

export type WallpaperMode = 'gradient' | 'image' | 'folder';
export type ClockFormat = 'tv' | '12h' | '24h';
export type {ClockColor};
export type ClockWeight = 200 | 300 | 400 | 500 | 600 | 700;

/** Numeric settings: the values they can take (OK steps through them, ← → nudge them). */
export const RANGES = {
	iconScale:    {min: 50,  max: 140, step: 10, def: 90},   // % of the standard tile size
	sideMargin:   {min: 0,   max: 300, step: 10, def: 20},    // px at 1080p, left and right of the app row
	bottomMargin: {min: 0,   max: 200, step: 10, def: 10},    // px at 1080p, below the app row
	favSideMargin:   {min: 0, max: 300, step: 10, def: 20},   // px at 1080p, left and right of the favourites row
	favBottomMargin: {min: 0, max: 400, step: 10, def: 30},   // px at 1080p, below the favourites row while it is alone (a high row is possible)
	clockSize:    {min: 80,  max: 240, step: 10, def: 140},   // px, height of the digits
	clockTop:     {min: 0,   max: 70,  step: 2,  def: 20},   // % of the screen height (0 = the very top)
	clockLeft:    {min: 0,   max: 100, step: 2,  def: 50},   // % of the screen width (where the clock's centre sits)
	clockShadow: {min: 10,  max: 100, step: 10, def: 100},     // % (strength of the widget's drop shadow)
	clockScrim:  {min: 0,   max: 100, step: 5,  def: 25},     // strength behind the widget (fresh installs 25; a saved config without the key loads as 0, see loadConfig; 0 = off; 100 = the old 50 % darkness, see Clock.tsx)
	clockOpacity: {min: 10,  max: 100, step: 10, def: 100},   // % (how solid the clock, date and weather are)
	iconOpacity:  {min: 30,  max: 100, step: 10, def: 100},   // % (how solid the icons of the home row are)
	iconGap:      {min: 50,  max: 200, step: 10, def: 100},   // % of the standard space between the home row's icons
	wallpaperOpacity: {min: 30, max: 100, step: 10, def: 100}, // % (how solid the picture is; lower lets the background show through)
	quietSec:     {min: 0,   max: 60,  step: 10, def: 20},     // seconds without a key before the apps hide (0 = off)
	quietDimLevel: {min: 10, max: 80,  step: 10, def: 30},    // % darkness of the quiet-mode dim
	quietDimSec:  {min: 0,   max: 60,  step: 10, def: 20},     // seconds after the apps hide before the screen dims (0 = off)
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

export type ClockAlign = 'left' | 'center' | 'right';


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
	/** P41f: the whole widget (time, date, weather) is shown */
	show: boolean;
	/** P100: a loaded theme's own widget ink ('#RRGGBB'); used instead of the colour above (which is then 'theme'); changing the Widget colour row drops it */
	ink?: string;
	/** a slight drop shadow behind the time, date and weather */
	shadow: boolean;
	/** how strong that shadow is, % (see RANGES.clockShadow) */
	shadowStrength: number;
	/** R1: strength of a soft gradient behind the widget, % (0 = off; 5-100, where 100 = the earlier 50 % darkness, see RANGES.clockScrim) */
	scrim: number;
	/** how solid the whole widget is, % */
	opacity: number;
	showDate: boolean;
	/** AM/PM beside the time (12-hour mode only) */
	showPeriod: boolean;
	/** which side of its position the clock, date and weather line up on */
	align: ClockAlign;
}

/** The Plex shelves below the home row (lib/plex.ts). The sign-in itself is kept apart (lib/plexstore.ts), never in here. */
export interface PlexConfig {
	/** show the Continue watching shelf */
	continueOn: boolean;
	/** show the Recently added shelf */
	recentOn: boolean;
	/** OK on an item: play it in PlxNative (resume) or open its page there */
	action: 'play' | 'open';
}

export const DEFAULT_PLEX: PlexConfig = {continueOn: false, recentOn: false, action: 'play'};

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
	/** a folder slideshow also uses the folders inside the folder (all levels, no limit) */
	recursive: boolean;
	/** 2.0.2: 'fill' crops the picture to the screen (the look before 2.0.2), 'fit' shows the whole picture (the background shows at the sides); a missing value reads as 'fill' */
	fit: 'fit' | 'fill';
}

/** Icon styles stored in `iconStyle`: 'original'; 'tinted' (P48: the artwork on a themed dark tile, no mask); all others draw the icon
 *  as a mask (Dark, Soft, Accent and Gradient mono, P39c). 'glyph' (2.0.3 W1): the same mask without a tile, Minimal's focus (larger only). */
export const ICON_STYLE_IDS = ['original', 'mono', 'soft', 'accent', 'gradient', 'tinted', 'glyph'];
/** Accent mono is not offered in OLED black (user, P59b): a saved Accent mono there is drawn as Soft mono (the saved value is kept for other themes). */
export const effectiveIconStyle = (style: string, theme: string): string => (style === 'accent' && theme === 'black' ? 'soft' : style);
/** The inverted tile (P59b) exists for Dark, Soft and Accent mono (not Gradient mono, not Tinted tile). */
export const hasLightTile = (style: string): boolean => style === 'mono' || style === 'soft' || style === 'accent' || style === 'glyph';
export const isMonoStyle = (style: string): boolean => style !== 'original' && style !== 'tinted' && ICON_STYLE_IDS.indexOf(style) !== -1;

/** P41f: bumped when this version's one-time reset of saved look settings must run again */
export const DEFAULTS_VERSION = 1;

export interface UserConfig {
	/** P41f: the defaults version these settings were last reset to (missing = never; the look is reset once) */
	defaultsV: number;
	/** the order the user arranged the apps in (apps not listed follow, in the TV's order); null → the TV's order */
	appIds: string[] | null;
	/** apps the user hid; every other app shows. null → settings from an older version, converted when the app list loads */
	hiddenIds: string[] | null;
	/** ordered input appIds (com.webos.app.hdmiN) shown after the apps; empty → none */
	sourceIds: string[];
	/** the order of the apps and inputs together on the home row (tile keys); null → apps, then inputs */
	tileOrder: string[] | null;
	/** S3 (2.1.6): the Essentials rows the user chose, in order (row ids; unknown ids ignored); null = the default list (follows later changes to it) */
	essentials: string[] | null;
	/** tile keys (apps and inputs) the user marked as favourites; empty → no favourites row */
	favourites: string[];
	/** read the live app list through the Homebrew Channel (root) */
	/** end LG's own home app when the launcher opens, to free memory */
	/** end LG's home app each time the launcher opens. No row any more: only the safety switch (LG Home kept coming back) turns it off */
	closeHome: boolean;
	/** EXPERIMENTAL: read the app list from the TV's remote-control service when there is no root (Options row) */
	tvApps: boolean;
	/** P86 (experimental, no root): the Home service opens Hearth when LG Home shows */
	/** Hearth's interface language id (T0; only 'en' so far; System tab, first row) */
	language: string;
	/** show the Debug tab in Settings (Options → last row) */
	showDebug: boolean;
	/** a watcher opens this launcher whenever LG Home comes to the front (kept running whenever the launcher opens) */
	replaceHome: boolean;
	/** "Set Hearth as the TV's Home app" (experimental, webOS 4.x; PR #18): Hearth's id is in the TV's Home app setting; see src/homeapp */
	homeApp: boolean;
	/** the app that setting named before Hearth, put back when it is switched off ('' when not known) */
	homeAppPrevious: string;
	/** how many LG preloaded apps are switched off (Settings -> System -> Memory); 0 = LG's own setting */
	preloadOff: number;
	/** P69 keep Hearth ready (experimental): 0 off, 1 keep alive, 2 + load again, 3 + memory list */
	keepReady: boolean;
	/** P75 (experimental): with keepReady on, open Hearth once with keepAlive when the TV closed it and LG Home is in front */
	keepRelaunch: boolean;
	/** LEGACY: the removed SAM method was on (set by an older version). Cleaned up once at start, then false. Never set by this version. */
	takeoverHome: boolean;
	/** 2.0.3 (R3): Hearth sits in LG Home's place through SAM (experimental, rooted); additive, off by default */
	samHome: boolean;
	/** the TV's screen saver plays the wallpaper photos (experimental, rooted TVs) */
	screensaver: boolean;
	/** folder, picture, GIF or video chosen for the screen saver; '' = follow the wallpaper; '@photos' = the built-in photos; '@video' = the built-in video */
	screensaverSource: string;
	/** seconds between pictures in the saver's own slideshow (own setting, not the wallpaper's) */
	screensaverInterval: number;
	/** the saver's slideshow plays in random order (own setting; turned on again whenever a folder is chosen for it) */
	screensaverShuffle: boolean;
	/** seconds of screen saver after which the TV is switched off (standby); 0 = never */
	screensaverPowerOff: number;
	/** OLED care when the saver plays ONE item (picture, GIF or video): a thin black frame and a slow drift */
	screensaverCare: boolean;
	/** Dim: the saver is drawn at about 60% brightness (a black layer; the picture only, not the TV's backlight) */
	screensaverDim: boolean;
	/** how dark Dim is, % (10-80; 40 = about 60% brightness) */
	screensaverDimLevel: number;
	/** Picture size in the saver (pictures, GIFs and videos): 'fit' = whole picture, 'fill' = cropped to fill the screen */
	screensaverFit: 'fit' | 'fill';
	/** a folder chosen for the saver also uses the folders inside it (all levels, no limit) */
	screensaverRecursive: boolean;
	/** "When the TV turns on, open...": the app chosen last ('' = the TV's default); the TV's own files say what is in place, this
	 *  is shown until they have been read (P55b, from PR #25 by Obednal97) */
	powerOnApp: string;
	/** and network wake-ups open it too (only where LG's table has those keys) */
	powerOnNetwork: boolean;
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
	/** 'original' or a mono style (experimental: app icons drawn as shapes on dark tiles; see ICON_STYLE_IDS) */
	iconStyle: string;
	/** P59b: Dark, Soft and Accent mono as a light tile with a dark shape (Settings -> Look -> Icon tile) */
	iconLight: boolean;
	/** P81: slug of the user theme picked under Current theme ('' = a built-in colour theme) */
	themeSel: string;
	/** P77: colour of the shapes of the mono icon styles: 'theme' (the theme's own ink) or a plain colour id */
	iconColor: string;
	/** P61c: which remote is drawn on the Remote control pages */
	remoteModel: 'ir' | 'magic-2016' | 'magic-2019' | 'magic-2021' | 'magic-2025';
	/** size of the Recent apps panel, % of the screen */
	recentsW: number;
	recentsH: number;
	/** quiet mode: hide the apps after this many seconds without a key (0 = off) */
	quietSec: number;
	/** quiet mode: seconds after the apps hide before the whole screen dims (0 = off) */
	quietDimSec: number;
	/** quiet mode dim strength: % darkness */
	quietDimLevel: number;
	/** quiet mode: seconds after the apps hide before the TV is switched off (0 = never; rooted TVs only, QP) */
	quietPowerOff: number;
	/** OLED shift: the clock and the apps move a few pixels now and then so nothing burns in */
	oledShift: boolean;
	/** colour of the names under the icons: 'theme' or a plain colour id (see LABEL_COLOR_IDS) */
	labelColor: string;
	/** typeface of the names under the icons: 'default' (the launcher's own) or a clock font id */
	labelFont: string;
	/** size of the names, % of the standard */
	labelSize: number;
	/** thickness of the names (300-700) */
	labelWeight: number;
	/** how fast a held Left/Right key moves along the home row */
	scrollSpeed: ScrollSpeed;
	/** where the highlight lands when Hearth comes back to the front (Home): the first tile, or the app or input opened last (PR #20) */
	homeFocus: HomeFocus;
	/** show each app's name under its icon on the home row */
	showLabels: boolean;
	/** minimalist look: no borders around icons or on the selected one; the selected icon is simply larger */
	minimal: boolean;
	/** the LG Home and System Settings tiles at the end of the row (Hearth's own Settings tile is always there) */
	showLgHome: boolean;
	/** inputs with nothing plugged in are greyed out and HDMI-CEC device names are shown (P62, PR #16) */
	inputStatus: boolean;
	showSystem: boolean;
	/** R10: the Hearth Settings tile is hidden (hold OK on an app opens Settings; Down x5 on Home shows the tile until the next start) */
	hideSettings: boolean;
	/** the home row shows the most opened tiles first (Settings -> Apps / Sources, "Most used"; before 2.1.6 "Order by last opened", same saved key); the manual order stays saved */
	orderByRecent: boolean;
	/** "Reassign remote buttons" (P61, from PR #19 by Obednal97): what the remote's app buttons do instead; see remapcmd.ts */
	remap: RemapConfig;
	/** the user confirmed the remote still works, so the buttons are also set at every TV start (the boot link exists) */
	remapKept: boolean;
	/** the names and icons the user gave to sources, by the source's app id */
	sourceEdits: SourceEdits;
	/** the user's own name and picture for apps (same shape as sourceEdits, keyed by app id) */
	appEdits: SourceEdits;
	/** apps in one row or two */
	rows: 1 | 2;
	sideMargin: number;
	bottomMargin: number;
	/** margins of the favourites row (used only while favourites exist) */
	favSideMargin: number;
	favBottomMargin: number;
	/** 'tv' follows the TV's own 12/24-hour setting */
	clockFormat: ClockFormat;
	clock: ClockConfig;
	weather: WeatherConfig;
	wallpaper: WallpaperConfig;
	plex: PlexConfig;
}

export const THEME_IDS: ThemeName[] = ['black', 'grey', 'midnight', 'forest', 'teal', 'graphite'];
/** The light themes removed in P39b: a saved one falls back to OLED black (and the dark-grey widget colour made for them to white). */
const REMOVED_LIGHT_THEMES = ['cloud', 'sand', 'mist'];

/** A saved widget colour: a removed gradient becomes a plain colour (P77); an unknown or missing one reads as White (saved settings never change). */
function widgetColor (saved: unknown, theme: unknown): ClockColor {
	const id = typeof saved === 'string' && REMOVED_CLOCK_COLORS[saved] ? REMOVED_CLOCK_COLORS[saved] : saved;
	if (CLOCK_COLOR_IDS.indexOf(id as ClockColor) === -1 || (id === 'charcoal' && REMOVED_LIGHT_THEMES.indexOf(theme as string) !== -1)) return 'white';
	return id as ClockColor;
}

export const DEFAULT_WALLPAPER: WallpaperConfig = {
	mode: 'gradient',
	path: '',
	intervalSec: 60,
	shuffle: true,
	recursive: false,
	fit: 'fill'
};

export const DEFAULT_WEATHER: WeatherConfig = {
	on: false,                       // P41c: off on a fresh install and after the visual reset
	city: DEFAULT_CITY,
	unit: 'c',
	showCity: true,
	showRange: false
};

export const DEFAULT_CLOCK: ClockConfig = {
	show: true,
	size: RANGES.clockSize.def,
	weight: 400,                // P41f: Regular (was Thin 200)
	font: 'outfit',             // P41f (was Inter)
	top: RANGES.clockTop.def,
	left: RANGES.clockLeft.def,
	color: 'theme',          // P77: Follow theme (identical to white on OLED black); saved settings keep their colour
	shadow: true,
	shadowStrength: RANGES.clockShadow.def,
	scrim: RANGES.clockScrim.def,
	opacity: RANGES.clockOpacity.def,
	showDate: true,
	showPeriod: true,
	align: 'center'             // P113 (P41f had left)
};

export const DEFAULT_CONFIG: UserConfig = {
	defaultsV: DEFAULTS_VERSION,
	appIds: null,
	hiddenIds: [],
	sourceIds: [],
	tileOrder: null,
	essentials: null,
	favourites: [],
	closeHome: true,
	tvApps: false,
	language: DEFAULT_LANGUAGE,
	showDebug: false,
	replaceHome: false,
	homeApp: false,
	homeAppPrevious: '',
	preloadOff: 0,
	keepReady: false,
	keepRelaunch: false,
	takeoverHome: false,
	samHome: false,
	screensaver: true,                // P41c: on by default (rooted TVs; a failed set-up turns it off with a message)
	screensaverSource: '@video',
	screensaverInterval: 60,
	screensaverShuffle: true,
	screensaverCare: true,
	screensaverPowerOff: 300,         // P41c: 5 minutes
	screensaverDim: false,
	screensaverDimLevel: 40,
	screensaverFit: 'fit',
	screensaverRecursive: false,
	powerOnApp: '',
	powerOnNetwork: false,
	theme: 'black',
	background: 'photo-17',           // P41f/P113: the default photo (fish); shown as "Photo: 1" (P107, P113: labels and list order swapped, ids and files unchanged; photo-20 is now "Photo: 17")
	iconScale: RANGES.iconScale.def,
	iconOpacity: RANGES.iconOpacity.def,
	iconGap: RANGES.iconGap.def,
	wallpaperOpacity: RANGES.wallpaperOpacity.def,
	fadeStrength: RANGES.fadeStrength.def,
	fadeHeight: RANGES.fadeHeight.def,
	tileShape: 'rounded',
	iconStyle: 'original',
	iconLight: false,
	themeSel: '',
	iconColor: 'theme',
	remoteModel: 'ir',
	recentsW: RANGES.recentsW.def,
	recentsH: RANGES.recentsH.def,
	quietSec: RANGES.quietSec.def,
	quietDimSec: RANGES.quietDimSec.def,
	quietDimLevel: RANGES.quietDimLevel.def,
	quietPowerOff: 0,                  // QP: never (additive; saved settings keep working)
	oledShift: true,
	labelColor: 'theme',
	labelFont: 'default',
	labelSize: 100,
	labelWeight: 400,
	scrollSpeed: 'medium',
	homeFocus: 'first',               // p22b (user 2026-11-10): fresh installs and the Look reset start on the first app (P41c: 'last'); saved settings keep theirs, see the parse below
	showLabels: true,
	minimal: false,
	showLgHome: false,                // P41c: hidden on a fresh install (saved settings keep theirs)
	inputStatus: true,
	showSystem: false,                // P41c: same
	hideSettings: false,              // R10: additive, off
	orderByRecent: false,
	remap: DEFAULT_REMAP,
	remapKept: false,
	sourceEdits: {},
	appEdits: {},
	rows: 1,
	sideMargin: RANGES.sideMargin.def,
	bottomMargin: RANGES.bottomMargin.def,
	favSideMargin: RANGES.favSideMargin.def,
	favBottomMargin: RANGES.favBottomMargin.def,
	clockFormat: 'tv',
	clock: DEFAULT_CLOCK,
	weather: DEFAULT_WEATHER,
	wallpaper: DEFAULT_WALLPAPER,
	plex: DEFAULT_PLEX
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

/** Fields left alone by the P41f reset: the user's own apps, order, names and favourites, and everything installed on the TV (helper, Home key, power-on app, saver, keep-ready, remote, debug). */
const KEPT_ON_RESET: readonly (keyof UserConfig)[] = ['appIds', 'hiddenIds', 'sourceIds', 'tileOrder', 'essentials', 'favourites', 'sourceEdits', 'appEdits', 'closeHome', 'tvApps', 'showDebug', 'language', 'hideSettings',
	'replaceHome', 'homeApp', 'homeAppPrevious', 'preloadOff', 'keepReady', 'keepRelaunch', 'takeoverHome', 'samHome', 'screensaver', 'screensaverSource', 'screensaverInterval', 'screensaverShuffle',
	'screensaverCare', 'screensaverPowerOff', 'screensaverDim', 'screensaverDimLevel', 'screensaverFit', 'screensaverRecursive', 'powerOnApp', 'powerOnNetwork', 'remoteModel', 'remap', 'remapKept', 'defaultsV',
	'plex'];       // the PlxNative shelves are a feature choice, not a look: a look reset leaves them as they are

/** P41f: the saved settings with every look, widget, wallpaper, home-row and quiet-mode value at its default. */
export function withDefaultLook (c: UserConfig): UserConfig {
	const out = {...DEFAULT_CONFIG, clock: {...DEFAULT_CLOCK}, weather: {...DEFAULT_WEATHER}, wallpaper: {...DEFAULT_WALLPAPER}} as unknown as Record<string, unknown>;
	const old = c as unknown as Record<string, unknown>;
	KEPT_ON_RESET.forEach((k) => { out[k] = old[k]; });
	out.defaultsV = DEFAULTS_VERSION;
	return out as unknown as UserConfig;
}

/** P106: the look, widget, wallpaper, home-row and quiet-mode values from before the P41f reset, kept once so one row in Look can bring them back. */
const BACKUP_KEY = 'hearth-prefs-backup-v1';
let backupSeen: boolean | null = null;

function lookOnly (c: UserConfig): Record<string, unknown> {
	const src = c as unknown as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	Object.keys(src).forEach((k) => { if (KEPT_ON_RESET.indexOf(k as keyof UserConfig) === -1) out[k] = src[k]; });
	return out;
}

/** Written only when the reset is about to run and no backup exists yet. */
function backUpLook (c: UserConfig): void {
	try {
		if (localStorage.getItem(BACKUP_KEY)) return;
		localStorage.setItem(BACKUP_KEY, JSON.stringify(lookOnly(c)));
		backupSeen = true;
	} catch { /* no room: the reset goes ahead without a backup */ }
}

/** Is there a backup to restore (read once, when the Look tab is built). */
export function hasPrefsBackup (): boolean {
	if (backupSeen === null) {
		try { backupSeen = !!localStorage.getItem(BACKUP_KEY); } catch { backupSeen = false; }
	}
	return backupSeen;
}

/** The current settings with the backed-up look values put back; apps, order, names and TV-installed features stay as they are now. Null when there is no usable backup. */
export function withBackedUpLook (c: UserConfig): UserConfig | null {
	try {
		const raw = localStorage.getItem(BACKUP_KEY);
		if (!raw) return null;
		const b = JSON.parse(raw) as Record<string, unknown>;
		if (!b || typeof b !== 'object' || !b.clock || !b.weather || !b.wallpaper) return null;
		const out = {...c} as unknown as Record<string, unknown>;
		Object.keys(b).forEach((k) => { if (KEPT_ON_RESET.indexOf(k as keyof UserConfig) === -1) out[k] = b[k]; });
		return out as unknown as UserConfig;
	} catch { return null; }
}

/** Delete the backup (after it was used). */
export function dropPrefsBackup (): void {
	try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
	backupSeen = false;
}

const RESCUE_KEY = 'hearth-config-rescue-v1';

export function loadConfig (): UserConfig {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {...DEFAULT_CONFIG};
		restoreThemeFonts();          // P80: the kept theme's font ids must be known before the saved font is checked
		const parsed = JSON.parse(raw) as Partial<UserConfig> & {wallpaper?: Partial<WallpaperConfig>; clock?: Partial<ClockConfig>; weather?: Partial<WeatherConfig>};
		// Issue #32: the 1.2.0 photos (nature-NN) are other numbers in 2.0: a lookup table (lib/legacyids.ts), never a plain rename; runs BEFORE the backup below, so the backup carries the right id
		if (typeof parsed.background === 'string') parsed.background = currentPhotoId(parsed.background);
		if (typeof parsed.screensaverSource === 'string') parsed.screensaverSource = currentSaverSource(parsed.screensaverSource);
		const w: Partial<WallpaperConfig> = parsed.wallpaper || {};
		const c: Partial<ClockConfig> = parsed.clock || {};
		const wx: Partial<WeatherConfig> = parsed.weather || DEFAULT_WEATHER;
		const px: Partial<PlexConfig> = parsed.plex && typeof parsed.plex === 'object' ? parsed.plex : DEFAULT_PLEX;
		const wc = wx.city as Partial<City> | null | undefined;
		const city: City | null = wc && typeof wc.name === 'string' && wc.name && validCoords(wc.lat, wc.lon) ? {name: wc.name.slice(0, 60), lat: wc.lat as number, lon: wc.lon as number, detail: typeof wc.detail === 'string' ? wc.detail.slice(0, 80) : undefined} : null;
		const mode: WallpaperMode = w.mode === 'image' || w.mode === 'folder' ? w.mode : 'gradient';
		const path = typeof w.path === 'string' ? w.path : '';
		const interval = typeof w.intervalSec === 'number' && (w.intervalSec === 0 || w.intervalSec >= 5) ? w.intervalSec : DEFAULT_WALLPAPER.intervalSec;
		const out: UserConfig = {
			defaultsV: DEFAULTS_VERSION,
			appIds: stringList(parsed.appIds),
			// older settings listed the apps to SHOW: they are converted once the app list is known
			hiddenIds: stringList(parsed.hiddenIds) !== null ? stringList(parsed.hiddenIds) : (stringList(parsed.appIds) === null ? [] : null),
			sourceIds: stringList(parsed.sourceIds) || [],
			tileOrder: stringList(parsed.tileOrder),
			essentials: stringList(parsed.essentials),
			favourites: stringList(parsed.favourites) || [],
			closeHome: parsed.closeHome !== false,
			tvApps: parsed.tvApps === true,
			language: typeof parsed.language === 'string' ? languageId(parsed.language) : DEFAULT_LANGUAGE,
			showDebug: parsed.showDebug === true,
			replaceHome: parsed.replaceHome === true,
			homeApp: parsed.homeApp === true,
			homeAppPrevious: typeof parsed.homeAppPrevious === 'string' && /^[A-Za-z0-9._-]+$/.test(parsed.homeAppPrevious) ? parsed.homeAppPrevious : '',
			powerOnApp: typeof parsed.powerOnApp === 'string' && /^[A-Za-z0-9._-]+$/.test(parsed.powerOnApp) ? parsed.powerOnApp : '',
			powerOnNetwork: parsed.powerOnNetwork === true,
			keepReady: parsed.keepReady === true || (parsed.keepReady as unknown) === 3,   // P73: one switch; a saved level 3 reads as On, levels 1 and 2 as Off
			keepRelaunch: parsed.keepRelaunch === true,
			preloadOff: typeof parsed.preloadOff === 'number' && parsed.preloadOff > 0 && parsed.preloadOff < 500 ? Math.floor(parsed.preloadOff) : 0,
			takeoverHome: parsed.takeoverHome === true,
			samHome: parsed.samHome === true,
			screensaver: parsed.screensaver !== false,        // P41c: a saved setting without the field (updaters) reads as On
			screensaverSource: typeof parsed.screensaverSource !== 'string' ? DEFAULT_CONFIG.screensaverSource : (parsed.screensaverSource.charAt(0) === '/' || /^@(photos|video|photo:photo-[0-9][0-9])$/.test(parsed.screensaverSource)) && parsed.screensaverSource.length < 400 ? parsed.screensaverSource : '',   // P41c: the built-in choices (@photos, @video) were dropped on reload before
			screensaverInterval: typeof parsed.screensaverInterval === 'number' && parsed.screensaverInterval >= 5 && parsed.screensaverInterval <= 3600 ? Math.round(parsed.screensaverInterval) : 60,
			screensaverShuffle: parsed.screensaverShuffle !== false,
			screensaverPowerOff: typeof parsed.screensaverPowerOff === 'number' && parsed.screensaverPowerOff >= 0 && parsed.screensaverPowerOff <= 86400 ? (parsed.screensaverPowerOff === 30 ? 60 : Math.round(parsed.screensaverPowerOff)) : (parsed.screensaverPowerOff === undefined ? DEFAULT_CONFIG.screensaverPowerOff : 0),
			screensaverCare: parsed.screensaverCare !== false && (parsed.screensaverCare as unknown) !== 'off',
			screensaverDim: parsed.screensaverDim === true,
			screensaverFit: parsed.screensaverFit === 'fill' ? 'fill' : 'fit',
			screensaverRecursive: parsed.screensaverRecursive === true,
			theme: THEME_IDS.indexOf(parsed.theme as ThemeName) !== -1 ? (parsed.theme as ThemeName) : 'black',
			background: BACKGROUND_IDS.indexOf(parsed.background as string) !== -1 ? (parsed.background as string) : 'theme',
			iconScale: ranged(parsed.iconScale, 'iconScale'),
			iconOpacity: ranged(parsed.iconOpacity, 'iconOpacity'),
			iconGap: ranged(parsed.iconGap, 'iconGap'),
			wallpaperOpacity: ranged(parsed.wallpaperOpacity, 'wallpaperOpacity'),
			fadeStrength: ranged(parsed.fadeStrength, 'fadeStrength'),
			fadeHeight: ranged(parsed.fadeHeight, 'fadeHeight'),
			iconStyle: ICON_STYLE_IDS.indexOf(parsed.iconStyle as string) !== -1 ? (parsed.iconStyle as string) : 'original',
			iconLight: parsed.iconLight === true,
			themeSel: typeof parsed.themeSel === 'string' && /^[a-z0-9-]{1,40}$/.test(parsed.themeSel) ? parsed.themeSel : '',
			iconColor: PLAIN_COLOR_IDS.indexOf(parsed.iconColor as string) !== -1 ? (parsed.iconColor as string) : 'theme',
			remoteModel: parsed.remoteModel === 'magic-2016' || parsed.remoteModel === 'magic-2019' || parsed.remoteModel === 'magic-2021' || parsed.remoteModel === 'magic-2025' ? parsed.remoteModel : 'ir',
			tileShape: TILE_SHAPE_IDS.indexOf(parsed.tileShape as string) !== -1 ? (parsed.tileShape as string) : 'rounded',
			recentsW: ranged(parsed.recentsW, 'recentsW'),
			recentsH: ranged(parsed.recentsH, 'recentsH'),
			quietSec: ranged(parsed.quietSec, 'quietSec'),
			quietDimSec: ranged(parsed.quietDimSec, 'quietDimSec'),
			quietDimLevel: ranged(parsed.quietDimLevel, 'quietDimLevel'),
			quietPowerOff: typeof parsed.quietPowerOff === 'number' && parsed.quietPowerOff >= 0 && parsed.quietPowerOff <= 86400 ? Math.round(parsed.quietPowerOff) : 0,
			screensaverDimLevel: typeof parsed.screensaverDimLevel === 'number' && parsed.screensaverDimLevel >= 10 && parsed.screensaverDimLevel <= 80 ? Math.round(parsed.screensaverDimLevel / 10) * 10 : 40,
			oledShift: parsed.oledShift !== false,
			labelColor: LABEL_COLOR_IDS.indexOf(parsed.labelColor as string) !== -1 ? (parsed.labelColor as string) : 'theme',
			labelFont: parsed.labelFont === 'default' || CLOCK_FONT_IDS.indexOf(parsed.labelFont as ClockFont) !== -1 ? (parsed.labelFont as string) : 'default',
			labelSize: typeof parsed.labelSize === 'number' && parsed.labelSize >= 80 && parsed.labelSize <= 140 ? Math.round(parsed.labelSize / 10) * 10 : 100,
			labelWeight: LABEL_WEIGHTS.indexOf(parsed.labelWeight as number) !== -1 ? (parsed.labelWeight as number) : 400,
			homeFocus: parsed.homeFocus === 'first' ? 'first' : 'last',          // p22b: a saved setting without a valid value keeps reading as 'last' (as before); only a fresh install and the reset use the new default
			scrollSpeed: SCROLL_SPEED_IDS.indexOf(parsed.scrollSpeed as ScrollSpeed) !== -1 ? (parsed.scrollSpeed as ScrollSpeed) : 'medium',
			showLabels: parsed.showLabels !== false,
			minimal: parsed.minimal === true,
			showLgHome: parsed.showLgHome !== false,
			inputStatus: parsed.inputStatus !== false,   // P41c: a saved setting without the field (updaters) reads as On; an explicit Off stays
			showSystem: parsed.showSystem !== false,
			hideSettings: parsed.hideSettings === true,
			orderByRecent: parsed.orderByRecent === true,
			remap: cleanRemap(parsed.remap),
			remapKept: parsed.remapKept === true,
			sourceEdits: cleanEdits(parsed.sourceEdits),
			appEdits: cleanEdits(parsed.appEdits),
			rows: parsed.rows === 2 ? 2 : 1,
			sideMargin: ranged(parsed.sideMargin, 'sideMargin'),
			bottomMargin: ranged(parsed.bottomMargin, 'bottomMargin'),
			favSideMargin: ranged(parsed.favSideMargin, 'favSideMargin'),
			favBottomMargin: ranged(parsed.favBottomMargin, 'favBottomMargin'),
			clockFormat: parsed.clockFormat === 'tv' || parsed.clockFormat === '24h' || parsed.clockFormat === '12h' ? parsed.clockFormat : DEFAULT_CONFIG.clockFormat,
			clock: {
				size: ranged(c.size, 'clockSize'),
				show: c.show !== false,
				weight: c.weight === 300 || c.weight === 400 || c.weight === 500 || c.weight === 600 || c.weight === 700 ? c.weight : 400,
				font: CLOCK_FONT_IDS.indexOf(c.font as ClockFont) !== -1 ? (c.font as ClockFont) : 'outfit',
				top: ranged(c.top, 'clockTop'),
				left: ranged(c.left, 'clockLeft'),
				color: widgetColor(c.color, parsed.theme),
				...(validInk(c.ink) ? {ink: validInk(c.ink)} : {}),
				shadow: c.shadow !== false,
				shadowStrength: ranged(c.shadowStrength, 'clockShadow'),
				scrim: typeof c.scrim === 'number' ? ranged(c.scrim, 'clockScrim') : 0,   // saved config from before the row existed: stays Off (no change for updaters)
				opacity: ranged(c.opacity, 'clockOpacity'),
				showDate: c.showDate !== false,
				showPeriod: c.showPeriod !== false,
				align: c.align === 'center' || c.align === 'right' ? c.align : 'left'
			},
			weather: {
				on: wx.on === true && city !== null,
				city,
				unit: wx.unit === 'f' ? 'f' : 'c',
				showCity: wx.showCity !== false,
				showRange: wx.showRange === true   // P109: a saved setting without the field reads as Off (same as a fresh install)
			},
			wallpaper: {
				mode: path ? mode : 'gradient',
				path,
				intervalSec: interval,
				shuffle: w.shuffle !== false,
				recursive: mode === 'folder' && w.recursive === true,
				fit: w.fit === 'fit' ? 'fit' : 'fill'
			},
			plex: {
				continueOn: px.continueOn === true,
				recentOn: px.recentOn === true,
				action: px.action === 'open' ? 'open' : 'play'
			}
		};
		if (parsed.defaultsV !== DEFAULTS_VERSION) {          // P41f: once per version, every saved look setting (own wallpaper included) goes back to the defaults
			backUpLook(out);          // P106: the old look stays available through one row in Look
			const fresh = withDefaultLook(out);
			saveConfig(fresh);
			return fresh;
		}
		return out;
	} catch (e) {
		// 2.0.3 I2: the unreadable value is kept once (only when it fits; never freed for) and the reason is logged; the next save would overwrite it with defaults
		let kept = false;
		try { if (raw && !localStorage.getItem(RESCUE_KEY)) { localStorage.setItem(RESCUE_KEY, raw); kept = true; } } catch { /* no room: no rescue copy */ }
		log(`settings: stored value unreadable (${e instanceof Error ? e.message.slice(0, 40) : 'error'}); defaults used${kept ? '; raw copy kept' : ''}`);
		return {...DEFAULT_CONFIG};
	}
}

let saveFailHandler: (() => void) | null = null;
/** Called (at most once per page) when a save still fails after freeing caches. */
export function setSaveFailHandler (fn: (() => void) | null): void { saveFailHandler = fn; }
let failReported = false;

/** Saves the settings. A full store frees rebuildable caches (lib/storeguard.ts) and retries. Returns whether the value was stored. */
export function saveConfig (config: UserConfig): boolean {
	let json = '';
	try { json = JSON.stringify(config); } catch { return false; }
	const r = writeWithRoom(localStorage, STORAGE_KEY, json);
	if (r.freed.length) log(`settings: store full, freed ${r.freed.join(', ')}; save ${r.ok ? 'ok' : 'FAILED'}`);
	else if (!r.ok) log('settings: save FAILED (nothing left to free)');
	if (!r.ok && !failReported) { failReported = true; if (saveFailHandler) saveFailHandler(); }
	return r.ok;
}

/** Saves and reads the value back: true only when what is stored equals what was written. */
export function saveConfigVerified (config: UserConfig): boolean {
	if (!saveConfig(config)) return false;
	try { return localStorage.getItem(STORAGE_KEY) === JSON.stringify(config); } catch { return false; }
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
