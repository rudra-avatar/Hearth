// The settings screens as data: every option on the Look, Clock, Wallpaper and Options tabs,
// how it reads the config, and how OK / ← → change it. The app builds the Settings lists
// from this table and applies a change with `applyPref`.

import type {OptionItem} from '../components/OptionList';
import {LIGHT_THEMES, type ThemeName} from '../theme/tokens';
import {BACKGROUND_IDS, NATURE_SHOW, backgroundLabel} from './backgrounds';
import {
	DEFAULT_CLOCK, DEFAULT_WALLPAPER, DEFAULT_WEATHER, INTERVAL_VALUES, RANGES, rangeValues, stepValue,
	type ClockFormat, type ClockWeight, type RangeName, type UserConfig
} from './storage';
import {CLOCK_FONT_IDS, fontLabel} from './clockfont';
import {TILE_SHAPE_IDS, tileShapeText} from './tileshape';
import {CLOCK_COLOR_IDS, LABEL_COLOR_IDS, colorInfo, labelColorText, type ClockColor} from './clockcolor';
import {baseName} from './wallpaper';
import {WEATHER_ENABLED} from '../config/features';
import type {TempUnit} from './weather';
import {lastFailure, rootState, type RootState} from './failure';
import type {LogoState} from './system';
import type {TakeoverStatus} from './takeovercmd';
import {needsRestart, powerOnName, type PowerOnStatus} from './poweroncmd';

export type PrefTab = 'look' | 'clock' | 'weather' | 'wallpaper' | 'options';

/** Facts about the TV (not user settings) that some rows display. */
export interface SystemInfo {
	/** the hand-over watcher: running, and whether it starts at boot (null while unknown) */
	homeHook: {running: boolean; linked: boolean} | null;
	/** Hearth in LG Home's own place ("Replace LG Home with a script and SAM"): what is in place (null while unknown) */
	takeover?: TakeoverStatus | null;
	/** "When the TV turns on, open…": what is on the TV (null while unknown or not readable) */
	powerOn?: PowerOnStatus | null;
	/** the names of the chosen and the loaded power-on apps, for the row (the app list knows them, not the TV) */
	powerOnNames?: {chosen?: string; loaded?: string};
	/** the launcher is in the TV's input list (null while unknown) */
	tvInput?: boolean | null;
	/** the TV's "show the LG logo at start" setting (null while unknown) */
	logo?: LogoState | null;
	/** can this TV run commands through the Homebrew Channel (rooted)? */
	root?: RootState;
	/** free memory in MB (-1: could not be read; undefined: not read yet) */
	/** what the TV said when it could not (shown under a greyed-out row) */
	rootDetail?: string;
}

/** The options that run shell commands, so they can't work without root. */
export const ROOT_OPTIONS = ['takeover', 'replaceHome', 'tvInput', 'powerOnApp', 'lgLogo'];

/** The two ways of replacing LG Home cannot be on together: the helper script reacts to LG Home coming to the front, the
 *  SAM method keeps LG Home from ever starting. Each greys the other out. */
function helperIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.replaceHome) || !!(info && info.homeHook && (info.homeHook.running || info.homeHook.linked));
}

function takeoverIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.takeoverHome) || !!(info && info.takeover && info.takeover.enabled);
}

/** Why a row is greyed out, or null when it is usable. */
export function disabledReason (id: string, info?: SystemInfo, config?: UserConfig): string | null {
	if (id === 'lgLogo' && info && info.logo === 'unsupported') return "This TV doesn't have a setting for the LG logo at start.";
	if (id === 'powerOnApp' && info && info.powerOn && !info.powerOn.supported) return "This TV's software doesn't have the power-on setting Hearth uses (tested on webOS 4.5).";
	if (id === 'takeover' && helperIsOn(info, config)) return 'Switch "Replace LG Home with a helper script" off first. The two would fight over the Home button.';
	if (id === 'replaceHome' && takeoverIsOn(info, config)) return 'Not used while "Replace LG Home with a script and SAM" is on, which already keeps LG Home from showing. Switch that off to use the helper instead.';
	if (!info || info.root !== 'no' || ROOT_OPTIONS.indexOf(id) === -1) return null;
	const kind = lastFailure();
	const why = kind === 'denied' ? 'the TV refused the command. If this TV is rooted, updating the Homebrew Channel may help. On webOS 11, run once over SSH: sh /media/developer/apps/usr/palm/applications/tld.my.customlauncher/tools/webos11-permission.sh (see "webOS 11" in the README).' : 'the Homebrew Channel service is not running. If this TV is rooted, open the Homebrew Channel once, then reopen Settings.';
	return 'Needs a rooted TV: ' + why + (info.rootDetail ? ` (TV said: ${info.rootDetail})` : '');
}

/** How a key press changes a setting: OK steps and wraps round; ← → nudge and stop at the ends. */
export type Press = 'ok' | 'left' | 'right';

export interface Pref {
	id: string;
	tab: PrefTab;
	label: string;
	description: string;
	kind: 'toggle' | 'choice' | 'action';
	/** toggle: is it on */
	on?: (c: UserConfig) => boolean;
	/** choice / action: the current value as text */
	text?: (c: UserConfig, info?: SystemInfo) => string;
	/** the new config after a key press (toggle: any press flips it) */
	change?: (c: UserConfig, press: Press) => UserConfig;
	/** false hides the row for this config (default: always shown) */
	visible?: (c: UserConfig) => boolean;
}

/** The power-on row: the app chosen, and whether the TV still needs a restart to use it. */
function powerOnText (c: UserConfig, info?: SystemInfo): string {
	const status = info && info.powerOn;
	const names = (info && info.powerOnNames) || {};
	if (!status) return c.powerOnApp ? powerOnName(c.powerOnApp, names.chosen) + (c.powerOnNetwork ? ' + network' : '') : 'Unknown';
	if (!status.supported) return 'Not on this TV';
	if (status.foreign) return 'Set by another tool';
	const chosen = status.chosen ? powerOnName(status.chosen, names.chosen) + (status.network ? ' + network' : '') : 'TV default';
	return needsRestart(status) ? `${chosen} (after a restart)` : chosen;
}

const isSlideshow = (c: UserConfig): boolean => c.wallpaper.mode === 'folder' || (c.wallpaper.mode === 'gradient' && c.background === NATURE_SHOW);
const delta = (press: Press): number => (press === 'left' ? -1 : 1);

function toggle (id: string, tab: PrefTab, label: string, description: string, get: (c: UserConfig) => boolean, set: (c: UserConfig, v: boolean) => UserConfig): Pref {
	return {
		id, tab, label, description, kind: 'toggle',
		on: get,
		change: (c, press) => (press === 'ok' ? set(c, !get(c)) : c)       // arrows leave switches alone
	};
}

function choice<T> (id: string, tab: PrefTab, label: string, description: string, values: readonly T[], get: (c: UserConfig) => T, set: (c: UserConfig, v: T) => UserConfig, text: (v: T) => string): Pref {
	return {
		id, tab, label, description, kind: 'choice',
		text: (c) => text(get(c)),
		change: (c, press) => set(c, stepValue(values, get(c), delta(press), press === 'ok'))
	};
}

function range (id: string, tab: PrefTab, label: string, description: string, name: RangeName, get: (c: UserConfig) => number, set: (c: UserConfig, v: number) => UserConfig, text: (v: number) => string): Pref {
	return choice(id, tab, label, description, rangeValues(name), get, set, text);
}

export function intervalText (seconds: number): string {
	if (seconds < 60) return `${seconds} seconds`;
	if (seconds < 3600) return seconds === 60 ? '1 minute' : `${seconds / 60} minutes`;
	return seconds === 3600 ? '1 hour' : `${seconds / 3600} hours`;
}

const THEMES: readonly ThemeName[] = ['black', 'grey', 'midnight', 'forest', 'cloud', 'sand', 'mist'];
const CLOCK_FORMATS: readonly ClockFormat[] = ['12h', '24h', 'tv'];
const WEIGHTS: readonly ClockWeight[] = [200, 300, 400, 500, 600, 700];
const UNITS: readonly TempUnit[] = ['c', 'f'];

const THEME_TEXT: Record<ThemeName, string> = {black: 'OLED black', grey: 'Calm blue-grey', midnight: 'Midnight blue', forest: 'Deep forest', cloud: 'Light: cloud', sand: 'Light: sand', mist: 'Light: mist'};
const FORMAT_TEXT: Record<ClockFormat, string> = {'12h': '12-hour (AM/PM)', '24h': '24-hour', tv: 'Same as the TV'};
const WEIGHT_TEXT: Record<ClockWeight, string> = {200: 'Thin', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold'};

/** The look, margins, clock and weather back to their defaults (apps, sources and wallpaper are left alone). */
export function resetLook (c: UserConfig): UserConfig {
	return {
		...c,
		theme: 'black',
		iconScale: RANGES.iconScale.def,
		iconOpacity: RANGES.iconOpacity.def,
		iconGap: RANGES.iconGap.def,
		wallpaperOpacity: RANGES.wallpaperOpacity.def,
		fadeStrength: RANGES.fadeStrength.def,
		fadeHeight: RANGES.fadeHeight.def,
		tileShape: 'rounded',
		recentsW: RANGES.recentsW.def,
		recentsH: RANGES.recentsH.def,
		oledShift: true,
		labelColor: 'theme',
		showLabels: true,
		minimal: false,
		rows: 1,
		sideMargin: RANGES.sideMargin.def,
		bottomMargin: RANGES.bottomMargin.def,
		clockFormat: 'tv',
		clock: {...DEFAULT_CLOCK},
		weather: {...DEFAULT_WEATHER}
	};
}

/** The Weather tab's rows (left out of builds made without the weather widget). */
const WEATHER_PREFS: Pref[] = [
	toggle('weatherOn', 'weather', 'Show the weather', 'The temperature and conditions under the date.',
		(c) => c.weather.on, (c, v) => ({...c, weather: {...c.weather, on: v && c.weather.city !== null}})),
	{
		id: 'weatherCity', tab: 'weather', label: 'City', kind: 'action',
		description: 'Pick a city from the list, or search for any place by name. Needs an internet connection.',
		text: (c) => (c.weather.city ? c.weather.city.name : 'Not set')
	},
	choice('weatherUnit', 'weather', 'Temperature unit', 'Celsius or Fahrenheit.',
		UNITS, (c) => c.weather.unit, (c, v) => ({...c, weather: {...c.weather, unit: v}}), (v) => (v === 'f' ? 'Fahrenheit (°F)' : 'Celsius (°C)')),
	toggle('weatherCityName', 'weather', 'Show the city name', 'The city\'s name before the temperature.',
		(c) => c.weather.showCity, (c, v) => ({...c, weather: {...c.weather, showCity: v}})),
	toggle('weatherRange', 'weather', 'Show today\'s high and low', 'For example H 31°  L 25°.',
		(c) => c.weather.showRange, (c, v) => ({...c, weather: {...c.weather, showRange: v}}))
];

const BASE_PREFS: Pref[] = [
	// ----- Look -----
	choice('theme', 'look', 'Theme', 'Colours of the tiles, text and background. OLED black keeps unused pixels off. On the light themes a white clock turns dark grey so it can be read (change it under Wallpaper).',
		THEMES, (c) => c.theme, (c, v) => ({...c, theme: v, clock: {...c.clock, color: LIGHT_THEMES.indexOf(v) !== -1 && c.clock.color === 'white' ? 'charcoal' : LIGHT_THEMES.indexOf(c.theme) !== -1 && LIGHT_THEMES.indexOf(v) === -1 && c.clock.color === 'charcoal' ? 'white' : c.clock.color}}), (v) => THEME_TEXT[v]),
	choice('quietSec', 'look', 'Quiet mode', 'Hides the apps (the clock stays) when no key is pressed for this long. Any key brings them back; that first key does nothing else. ← → or OK change it.',
		rangeValues('quietSec'), (c) => c.quietSec, (c, v) => ({...c, quietSec: v}), (v) => (v === 0 ? 'Off' : `${v} seconds`)),
	toggle('minimal', 'look', 'Minimalist icons', 'No border around the icons and no white or black frame on the selected one. The selected icon is simply bigger.',
		(c) => c.minimal, (c, v) => ({...c, minimal: v})),
	range('iconScale', 'look', 'Icon size', 'Make the app icons smaller or bigger. ← → adjust.',
		'iconScale', (c) => c.iconScale, (c, v) => ({...c, iconScale: v}), (v) => `${v}%`),
	range('iconGap', 'look', 'Icon spacing', 'The space between the icons on the home row, from 50% to 200% of the usual. ← → adjust.',
		'iconGap', (c) => c.iconGap, (c, v) => ({...c, iconGap: v}), (v) => `${v}%`),
	choice('tileShape', 'look', 'Icon shape', 'The shape of the icons on the home row: rounded square, sharp square, squircle, circle, leaf, arch or teardrop.',
		TILE_SHAPE_IDS, (c) => c.tileShape, (c, v) => ({...c, tileShape: v}), tileShapeText),
	choice('rows', 'look', 'Rows of apps', 'Show the apps in one row, or split over two rows (up/down moves between them).',
		[1, 2] as const, (c) => c.rows, (c, v) => ({...c, rows: v}), (v) => (v === 1 ? '1 row' : '2 rows')),
	toggle('showLabels', 'look', 'Show app names', 'The name under each icon on the home row. Switch off for icons only.',
		(c) => c.showLabels, (c, v) => ({...c, showLabels: v})),
	choice('labelColor', 'look', 'Name colour', 'The colour of the app names under the icons. "The theme\'s own" follows the theme.',
		LABEL_COLOR_IDS, (c) => c.labelColor, (c, v) => ({...c, labelColor: v}), labelColorText),
	toggle('showLgHome', 'look', 'Show the LG Home tile', 'The LG Home tile at the end of the row. If Hearth is your home screen (the helper), this tile is the way back to LG\'s own Home.',
		(c) => c.showLgHome, (c, v) => ({...c, showLgHome: v})),
	toggle('showSystem', 'look', 'Show the System Settings tile', 'The tile that opens the TV\'s own settings. The Hearth Settings tile always stays, so you can always get back here.',
		(c) => c.showSystem, (c, v) => ({...c, showSystem: v})),
	range('sideMargin', 'look', 'Side margin', 'Space left and right of the app row. ← → adjust.',
		'sideMargin', (c) => c.sideMargin, (c, v) => ({...c, sideMargin: v}), (v) => `${v} px`),
	range('bottomMargin', 'look', 'Bottom margin', 'Space below the app row. ← → adjust.',
		'bottomMargin', (c) => c.bottomMargin, (c, v) => ({...c, bottomMargin: v}), (v) => `${v} px`),

	range('recentsW', 'look', 'Recent apps panel width', 'How wide the panel is that Back opens on the home screen, as a share of the screen. ← → adjust.',
		'recentsW', (c) => c.recentsW, (c, v) => ({...c, recentsW: v}), (v) => `${v}%`),
	range('recentsH', 'look', 'Recent apps panel height', 'How tall that panel is, as a share of the screen. The icons in it grow with the height. ← → adjust.',
		'recentsH', (c) => c.recentsH, (c, v) => ({...c, recentsH: v}), (v) => `${v}%`),
	toggle('oledShift', 'look', 'OLED shift', 'Moves the clock and the apps a few pixels every minute so nothing stays in one place and burns in. Reset look and clock turns it on.',
		(c) => c.oledShift, (c, v) => ({...c, oledShift: v})),

	{
		id: 'resetLook', tab: 'look', label: 'Reset look and clock', kind: 'action',
		description: 'Theme, icon size, margins and clock back to their defaults.',
		text: () => 'Reset'
	},

	// ----- Clock -----
	choice('clockFormat', 'clock', 'Time format', '12-hour, 24-hour, or the same as the TV.',
		CLOCK_FORMATS, (c) => c.clockFormat, (c, v) => ({...c, clockFormat: v}), (v) => FORMAT_TEXT[v]),
	range('clockSize', 'clock', 'Clock size', 'How big the time is. ← → adjust.',
		'clockSize', (c) => c.clock.size, (c, v) => ({...c, clock: {...c.clock, size: v}}), (v) => `${v}`),
	choice('clockFont', 'clock', 'Clock font', 'The typeface of the time and date. "TV font" is the TV\'s own; the others come with the launcher.',
		CLOCK_FONT_IDS, (c) => c.clock.font, (c, v) => ({...c, clock: {...c.clock, font: v}}), (v) => fontLabel(v)),
	choice('clockWeight', 'clock', 'Clock thickness', 'From thin to bold. A font with fewer weights uses its nearest one (or a synthetic bold).',
		WEIGHTS, (c) => c.clock.weight, (c, v) => ({...c, clock: {...c.clock, weight: v}}), (v) => WEIGHT_TEXT[v]),
	range('clockTop', 'clock', 'Clock position (vertical)', 'How far down from the top of the screen (0% is the very top). ← → adjust.',
		'clockTop', (c) => c.clock.top, (c, v) => ({...c, clock: {...c.clock, top: v}}), (v) => `${v}%`),
	range('clockLeft', 'clock', 'Clock position (horizontal)', 'Move the clock left or right (50% is the centre). ← → adjust.',
		'clockLeft', (c) => c.clock.left, (c, v) => ({...c, clock: {...c.clock, left: v}}), (v) => `${v}%`),
	toggle('showDate', 'clock', 'Show the date', 'The day and date under the time.',
		(c) => c.clock.showDate, (c, v) => ({...c, clock: {...c.clock, showDate: v}})),
	toggle('showPeriod', 'clock', 'Show AM / PM', 'The small AM or PM beside the time (12-hour only).',
		(c) => c.clock.showPeriod, (c, v) => ({...c, clock: {...c.clock, showPeriod: v}})),

	// ----- Wallpaper -----
	{
		// ← → step the built-in backgrounds (and switch back to one from a picture or slideshow); OK opens the picture picker
		id: 'wallpaper', tab: 'wallpaper', label: 'Wallpaper', kind: 'choice',
		description: '← → choose a built-in background (plain colours, gradients, a few nature photos). OK chooses your own picture, a folder of pictures for a slideshow, or a slideshow of the nature photos that come with Hearth. The picker has size advice and how to copy files.',
		text: (c) => c.wallpaper.mode === 'image' ? `Picture: ${baseName(c.wallpaper.path)}`
			: c.wallpaper.mode === 'folder' ? `Slideshow: ${baseName(c.wallpaper.path)}` : `Built-in: ${backgroundLabel(c.background)}`,
		change: (c, press) => {
			if (press === 'ok') return c;
			if (c.wallpaper.mode !== 'gradient') return {...c, wallpaper: {...DEFAULT_WALLPAPER, intervalSec: c.wallpaper.intervalSec, shuffle: c.wallpaper.shuffle}};
			return {...c, background: stepValue(BACKGROUND_IDS, c.background, delta(press), false)};
		}
	},
	{...choice('interval', 'wallpaper', 'Change picture every', 'How long each picture stays up in a slideshow.',
		INTERVAL_VALUES, (c) => c.wallpaper.intervalSec, (c, v) => ({...c, wallpaper: {...c.wallpaper, intervalSec: v}}), intervalText), visible: isSlideshow},
	{...toggle('shuffle', 'wallpaper', 'Shuffle', 'Random order. When off, pictures play A to Z.',
		(c) => c.wallpaper.shuffle, (c, v) => ({...c, wallpaper: {...c.wallpaper, shuffle: v}})), visible: isSlideshow},
	choice('clockColor', 'wallpaper', 'Widget colour (clock, date, weather)', 'White is hard to read on a light picture. For light wallpapers pick a dark colour or one of the gradients; for dark ones the light colours look best.',
		CLOCK_COLOR_IDS, (c) => c.clock.color, (c, v) => ({...c, clock: {...c.clock, color: v}}), (v: ClockColor) => colorInfo(v).label),
	toggle('clockShadow', 'wallpaper', 'Widget shadow', 'A slight drop shadow behind the time, date and weather, so they stay readable on a bright picture. Not used with dark colours.',
		(c) => c.clock.shadow, (c, v) => ({...c, clock: {...c.clock, shadow: v}})),
	{...range('clockShadowStrength', 'wallpaper', 'Widget shadow strength', 'How strong the drop shadow is, from 10% to 100%. ← → adjust.',
		'clockShadow', (c) => c.clock.shadowStrength, (c, v) => ({...c, clock: {...c.clock, shadowStrength: v}}), (v) => `${v}%`), visible: (c) => c.clock.shadow},
	range('clockOpacity', 'wallpaper', 'Widget opacity', 'How solid the clock, date and weather are, from 10% to 100%. Lower it if a dark colour looks too heavy. ← → adjust.',
		'clockOpacity', (c) => c.clock.opacity, (c, v) => ({...c, clock: {...c.clock, opacity: v}}), (v) => `${v}%`),
	range('wallpaperOpacity', 'wallpaper', 'Wallpaper opacity', 'How solid your picture or slideshow is, from 30% to 100%. Lower it to darken or soften it against the theme\'s background. Built-in backgrounds are not changed. ← → adjust.',
		'wallpaperOpacity', (c) => c.wallpaperOpacity, (c, v) => ({...c, wallpaperOpacity: v}), (v) => `${v}%`),
	range('fadeStrength', 'wallpaper', 'Bottom fade: darkness', 'How dark the wallpaper gets at the very bottom edge, fading out further up, so the icons read well on bright pictures. 0% is off. ← → adjust.',
		'fadeStrength', (c) => c.fadeStrength, (c, v) => ({...c, fadeStrength: v}), (v) => (v === 0 ? 'Off' : `${v}%`)),
	range('fadeHeight', 'wallpaper', 'Bottom fade: how far up', 'How much of the screen, from the bottom, the fade covers. Only matters when the darkness is above 0%. ← → adjust.',
		'fadeHeight', (c) => c.fadeHeight, (c, v) => ({...c, fadeHeight: v}), (v) => `${v}%`),
	range('iconOpacity', 'wallpaper', 'Icon opacity', 'How solid the app and source icons on the home row are, from 30% to 100%. Lower it to let the wallpaper show through. ← → adjust.',
		'iconOpacity', (c) => c.iconOpacity, (c, v) => ({...c, iconOpacity: v}), (v) => `${v}%`),

	// ----- Options -----
	{
		id: 'takeover', tab: 'options', label: 'Replace LG Home with a script and SAM', kind: 'action',
		description: 'Puts a black stand-in in LG Home\'s own place and opens this launcher the moment the TV shows it, so LG Home never draws. Restarts the TV\'s app manager (SAM) once, so the screen may blink. Not together with the helper script. OK turns it on or off.',
		text: (c, info) => {
			if (info && info.takeover) return info.takeover.enabled ? (info.takeover.web ? 'On' : 'On (not in place yet)') : 'Off';
			return c.takeoverHome ? 'On' : info ? 'Off' : 'Unknown';
		}
	},
	{
		id: 'replaceHome', tab: 'options', label: 'Replace LG Home with a helper script', kind: 'action',
		description: 'A small background helper, started at boot, opens this launcher whenever LG Home comes to the front (Home, Back). LG Home can flash for a moment first: the Input Hook app avoids that. Not together with the SAM method. OK turns it on or off.',
		text: (_c, info) => (!info || !info.homeHook ? 'Unknown' : info.homeHook.running ? 'On' : 'Off')
	},
	{
		id: 'tvInput', tab: 'options', label: 'Add the launcher as a TV input (start the TV on it)', kind: 'action',
		description: 'Adds this launcher to the TV\'s input list, like HDMI 1. Then set the TV to start on its last input and pick this one: the TV boots straight into the launcher. OK adds or removes it.',
		text: (_c, info) => (!info || info.tvInput === null || info.tvInput === undefined ? 'Unknown' : info.tvInput ? 'Added' : 'Not added')
	},
	{
		id: 'powerOnApp', tab: 'options', label: 'When the TV turns on, open…', kind: 'action',
		description: 'What the TV shows when you switch it on with the remote or the TV\'s button: Live TV or the last input as usual, Hearth, or any app. Casting and HDMI-CEC go where they ask; so do network wake-ups (phone apps, Home Assistant) unless you include them in the list. Starts working after the TV restarts once. OK chooses.',
		text: powerOnText
	},
	{
		id: 'lgLogo', tab: 'options', label: 'Show the LG logo when the TV starts', kind: 'action',
		description: 'LG\'s own switch (normally hidden): turn it off for a clean start straight into this launcher. OK turns it on or off.',
		text: (_c, info) => (!info || info.logo === null || info.logo === undefined || info.logo === 'unsupported' ? 'Unknown' : info.logo === 'on' ? 'On' : 'Off')
	},
	{
		id: 'tvApps', tab: 'options', label: 'Load apps from the TV (experimental, no root)', kind: 'action',
		description: 'For TVs that are not rooted: asks the TV itself for its full app list. Needs "LG Connect Apps" on in the TV settings. OK starts pairing: the TV asks to allow the connection, press OK on it. Might not work on every TV. If it does not, add apps by hand: see the guide on adding custom apps and icons at github.com/partridgeworks/webos-launcher. OK again turns it off.',
		text: (c) => (c.tvApps ? 'On' : 'Off'),
		visible: (c) => rootState() !== 'yes' || c.tvApps       // not for rooted users (kept while on, so it can be turned off)
	},
	toggle('showDebug', 'options', 'Show the Debug tab',
		'Adds the Debug tab (facts about this TV and the latest events) and the Tests tab (checks of what this TV allows) to Settings, for reporting a problem. OK turns it on or off.',
		(c) => c.showDebug, (c, v) => ({...c, showDebug: v}))
];

export const PREFS: Pref[] = WEATHER_ENABLED ? BASE_PREFS.concat(WEATHER_PREFS) : BASE_PREFS;

export function findPref (id: string): Pref | undefined {
	return PREFS.find((p) => p.id === id);
}

/** The order of the Options tab (anything not listed goes last). */
const OPTIONS_ORDER = ['tvInput', 'takeover', 'replaceHome', 'powerOnApp', 'lgLogo', 'tvApps', 'showDebug'];

function orderOf (tab: PrefTab, id: string): number {
	if (tab !== 'options') return 0;
	const i = OPTIONS_ORDER.indexOf(id);
	return i === -1 ? OPTIONS_ORDER.length : i;
}

/** The Settings list for one tab. */
export function optionsFor (tab: PrefTab, config: UserConfig, info?: SystemInfo): OptionItem[] {
	return PREFS.filter((p) => p.tab === tab && (!p.visible || p.visible(config))).sort((a, b) => orderOf(tab, a.id) - orderOf(tab, b.id)).map((p) => ({
		id: p.id,
		label: p.label,
		description: p.description,
		disabled: disabledReason(p.id, info, config) || undefined,
		value: p.kind === 'toggle' && p.on ? p.on(config) : undefined,
		valueText: p.kind !== 'toggle' && p.text ? p.text(config, info) : undefined,
		stepper: p.kind === 'choice'
	}));
}

/** The config after pressing OK / ← / → on option `id`; the same config when nothing changes. */
export function applyPref (config: UserConfig, id: string, press: Press): UserConfig {
	const pref = findPref(id);
	return pref && pref.change ? pref.change(config, press) : config;
}
