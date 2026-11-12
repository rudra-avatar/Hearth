// The settings screens as data: every option on the Look, Clock, Wallpaper and Options tabs,
// how it reads the config, and how OK / ← → change it. The app builds the Settings lists
// from this table and applies a change with `applyPref`.

import {recordedCode} from './homekeycore';
import {extraCount} from './extrakeyscore';
import {sizeLabel} from './clock';
import type {OptionItem} from '../components/OptionList';
import type {ThemeName} from '../theme/tokens';
import {BACKGROUND_IDS, PHOTO_SHOW, backgroundLabel} from './backgrounds';
import {
	DEFAULT_CLOCK, DEFAULT_CONFIG, DEFAULT_WALLPAPER, DEFAULT_WEATHER, INTERVAL_VALUES, RANGES, rangeValues, stepValue,
	type ClockAlign, type ClockFormat, type ClockWeight, type RangeName, type UserConfig
} from './storage';
import {LABEL_WEIGHTS, LABEL_SIZES, isMonoStyle, effectiveIconStyle, hasLightTile, hasPrefsBackup} from './storage';
import {CLOCK_FONT_IDS, LABEL_FONT_IDS, fontLabel, type ClockFont} from './clockfont';
import {activeSlug, activeTheme, savedIndex, userThemeList} from './themelist';
import {SCROLL_SPEED_IDS, scrollSpeedText} from './scrollspeed';
import {TILE_SHAPE_IDS, tileShapeText} from './tileshape';
import {CLOCK_COLOR_IDS, LABEL_COLOR_IDS, iconColorValues, iconColorEffective, iconColorText, colorInfo, labelColorText, withoutInk, type ClockColor} from './clockcolor';
import {baseName} from './wallpaper';
import {QUIET_POWEROFF_VALUES} from './quietoff';
import {SAVER_FIT_VALUES, fitText, SAVER_INTERVAL_VALUES, SAVER_POWEROFF_VALUES, powerOffText, SAVER_PHOTOS, SAVER_VIDEO, saverIsSlideshow} from './saverconfig';
import {PLEX_ENABLED, WEATHER_ENABLED} from '../config/features';
import type {TempUnit} from './weather';
import {lastFailure, rootState, type RootState} from './failure';
import {APP_ID} from '../config/constants';
import {HOME_FOCUS_IDS, homeFocusText} from './homefocus';
import type {LogoState} from './system';
import {needsRestart, powerOnName, type PowerOnStatus} from './poweroncmd';
import {LANGUAGES, PACK_ID, languageLabel, languageOf} from './languages';
import {hasPack, packName} from '../i18n/pack';
import {td} from '../i18n';
import {HEARTH_VERSION} from '../config/version';

export type PrefTab = 'essentials' | 'look' | 'clock' | 'wallpaper' | 'saver' | 'system';

/** Facts about the TV (not user settings) that some rows display. */
export interface SystemInfo {
	/** K2: the TV has a memory list that Keep Hearth ready can change (false: none; null/undefined: unknown) */
	keepList?: boolean | null;
	/** the hand-over watcher: running, and whether it starts at boot (null while unknown) */
	homeHook: {running: boolean; linked: boolean} | null;
	/** 2.0.3 (R3): the SAM stand-in method (null/undefined while unknown) */
	/** F2: the SAM set-up or switch-off is running (the row is not pressable meanwhile) */
	samBusy?: boolean;
	samHome?: {enabled: boolean; mounted: boolean; web: boolean; linked: boolean; watching: boolean; restartUsed: boolean} | null;
	/** the launcher is in the TV's input list (null while unknown) */
	tvInput?: boolean | null;
	/** "When the TV turns on, open...": what is on the TV (null while unknown or not readable) */
	powerOn?: PowerOnStatus | null;
	/** names of the chosen and the loaded power-on apps for the row (the app list knows them, not the TV) */
	powerOnNames?: {chosen?: string; loaded?: string};
	/** the TV's "show the LG logo at start" setting (null while unknown) */
	logo?: LogoState | null;
	/** can this TV run commands through the Homebrew Channel (rooted)? */
	root?: RootState;
	/** the remote button that opens Hearth (0 or null: none; undefined: read it from what Hearth saved) */
	homeKey?: number | null;
	/** the app the TV's Home button opens (its Home app setting): '' when the TV has no such setting (null while unknown) */
	homeApp?: string | null;
	/** P61i: Input Hook is installed and holds button settings that are not Hearth's (greys out the Remote control rows) */
	inputHook?: boolean;
	/** free memory in MB (-1: could not be read; undefined: not read yet) */
	/** what the TV said when it could not (shown under a greyed-out row) */
	rootDetail?: string;
	/** the Plex sign-in, for the PlxNative rows of the Widgets tab (names only; the token never comes here) */
	plex?: {signedIn: boolean; account: string; server: string};
}

/** The options that run shell commands, so they can't work without root. */
/** System rows that stay while root has failed (P83). */
export const NO_ROOT_ROWS = ['updates', 'language', 'languageRemove', 'tvApps', 'noRootGuide', 'showDebug'];
export const ROOT_OPTIONS = ['remap', 'replaceHome', 'samHome', 'homeApp', 'homeKey', 'preload', 'keepReady', 'keepRelaunch', 'tvInput', 'powerOnApp', 'lgLogo', 'quietPowerOff', 'screensaver', 'screensaverPictures', 'screensaverInterval', 'screensaverShuffle', 'screensaverCare', 'screensaverFit', 'screensaverDim', 'screensaverPowerOff', 'screensaverShow', 'undoAll'];


/** Why a row is greyed out, or null when it is usable. */
/** Is the TV's Home app setting naming Hearth? What the TV says once it has been read; until then, the saved choice. */
function homeAppIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	if (info && typeof info.homeApp === 'string') return info.homeApp === APP_ID;
	return !!(config && config.homeApp);
}

function helperIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.replaceHome) || !!(info && info.homeHook && (info.homeHook.running || info.homeHook.linked));
}

function samIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.samHome) || !!(info && info.samHome && (info.samHome.enabled || info.samHome.linked));
}

/** Is any way of replacing LG Home on (helper, SAM stand-in, Home app setting)? Used before a button is given the LG Home job. */
export function homeReplacementOn (info?: SystemInfo, config?: UserConfig): boolean {
	return homeAppIsOn(info, config) || helperIsOn(info, config) || samIsOn(info, config);
}

export function disabledReason (id: string, info?: SystemInfo, config?: UserConfig): string | null {
	if (id === 'rows' && config && config.favourites && config.favourites.length > 0) return td('disabled.rows');
	// the Home app setting and the helper + Home button are two ways of replacing LG Home: only one at a time (a row that is on stays usable, so it can be switched off)
	// 2.0.3 (R3, F2): helper, SAM stand-in and Home app: any one that is on greys the other two out (a row that is on stays usable, so it can be switched off)
	if (id === 'samHome' && info && info.samBusy) return td('disabled.samBusy');
	if (id === 'homeApp' && !homeAppIsOn(info, config)) {
		if (helperIsOn(info, config)) return td('disabled.homeApp');
		if (samIsOn(info, config)) return td('disabled.replaceHomeSam');
	}
	if (id === 'replaceHome' && !helperIsOn(info, config)) {
		if (homeAppIsOn(info, config)) return td('disabled.replaceHome');
		if (samIsOn(info, config)) return td('disabled.replaceHomeSam');
	}
	if (id === 'samHome' && !samIsOn(info, config)) {
		if (helperIsOn(info, config)) return td('disabled.samHome');
		if (homeAppIsOn(info, config)) return td('disabled.replaceHome');
	}
	if ((id === 'homeKey' || id === 'remap') && info && info.inputHook) return td('disabled.inputHook');
	if (id === 'powerOnApp' && info && info.powerOn && !info.powerOn.supported) return td('disabled.powerOn');
	// K2: no memory list on this TV: Keep cannot work (a row that is on stays usable, so it can be switched off)
	if ((id === 'keepReady' || id === 'keepRelaunch') && info && info.keepList === false && config && !config.keepReady && !config.keepRelaunch) return td('disabled.keepList');
	// Reopen needs Keep Hearth ready (a row that is on stays usable, so it can be switched off)
	if (id === 'keepRelaunch' && config && !config.keepReady && !config.keepRelaunch) return td('disabled.keepRelaunch');
	if (id === 'lgLogo' && info && info.logo === 'unsupported') return td('disabled.lgLogo');
	if (!info || info.root !== 'no' || ROOT_OPTIONS.indexOf(id) === -1) return null;
	const kind = lastFailure();
	const why = td(kind === 'denied' ? 'disabled.rootDenied' : 'disabled.rootDown');
	return td('disabled.needsRoot', {why}) + (info.rootDetail ? td('disabled.tvSaid', {detail: info.rootDetail}) : '');
}

/** How a key press changes a setting: OK steps and wraps round; ← → nudge and stop at the ends. */
export type Press = 'ok' | 'left' | 'right';

export interface Pref {
	id: string;
	tab: PrefTab;
	/** T1: read from the string table by row id (`pref.<id>.label`), so the language can change */
	label: string;
	/** `pref.<id>.desc` */
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
	/** like `visible`, but may look at the TV's facts (hides the row when it returns false) */
	shownWith?: (c: UserConfig, info?: SystemInfo) => boolean;
	/** the collapsible group the row sits in (set from LAYOUT; none = always shown) */
	group?: string;
}

/** A row as written in the tables below: its texts come from the string table by id. */
type PrefDef = Omit<Pref, 'label' | 'description'>;

function withTexts (p: PrefDef): Pref {
	const row = {...p} as Pref;
	Object.defineProperty(row, 'label', {get: () => td(`pref.${p.id}.label`), enumerable: true});
	Object.defineProperty(row, 'description', {get: () => td(`pref.${p.id}.desc`), enumerable: true});
	return row;
}

const isSlideshow = (c: UserConfig): boolean => c.wallpaper.mode === 'folder' || (c.wallpaper.mode === 'gradient' && c.background === PHOTO_SHOW);
const USER_THEME = 'u:';
const delta = (press: Press): number => (press === 'left' ? -1 : 1);

function toggle (id: string, tab: PrefTab, get: (c: UserConfig) => boolean, set: (c: UserConfig, v: boolean) => UserConfig, visible?: (c: UserConfig) => boolean): PrefDef {
	return {
		id, tab, kind: 'toggle', visible,
		on: get,
		change: (c, press) => (press === 'ok' ? set(c, !get(c)) : c)       // arrows leave switches alone
	};
}

function choice<T> (id: string, tab: PrefTab, values: readonly T[], get: (c: UserConfig) => T, set: (c: UserConfig, v: T) => UserConfig, text: (v: T) => string): PrefDef {
	return {
		id, tab, kind: 'choice',
		text: (c) => text(get(c)),
		change: (c, press) => set(c, stepValue(values, get(c), delta(press), press === 'ok'))
	};
}

function range (id: string, tab: PrefTab, name: RangeName, get: (c: UserConfig) => number, set: (c: UserConfig, v: number) => UserConfig, text: (v: number) => string): PrefDef {
	return choice(id, tab, rangeValues(name), get, set, text);
}

export function intervalText (seconds: number): string {
	if (seconds < 60) return td('time.seconds', {n: seconds});
	if (seconds < 3600) return seconds === 60 ? td('time.oneMinute') : td('time.minutes', {n: seconds / 60});
	return seconds === 3600 ? td('time.oneHour') : td('time.hours', {n: seconds / 3600});
}

const THEMES: readonly ThemeName[] = ['black', 'grey', 'midnight', 'forest', 'teal', 'graphite'];
const CLOCK_FORMATS: readonly ClockFormat[] = ['12h', '24h', 'tv'];
const WEIGHTS: readonly ClockWeight[] = [200, 300, 400, 500, 600, 700];
const UNITS: readonly TempUnit[] = ['c', 'f'];

const themeText = (v: ThemeName): string => td(`theme.${v}`);
const formatText = (v: ClockFormat): string => td(`timeFormat.${v}`);
const weightText = (v: ClockWeight): string => td(`weight.${v}`);

/** The look, margins, clock and weather back to their defaults (apps, sources and wallpaper are left alone). */
export function resetLook (c: UserConfig): UserConfig {
	return {
		...c,
		theme: 'black',
		themeSel: '',
		background: DEFAULT_CONFIG.background,   // P108: the default photo (shown as Photo: 1)
		wallpaper: {...DEFAULT_WALLPAPER},
		iconScale: RANGES.iconScale.def,
		iconOpacity: RANGES.iconOpacity.def,
		iconGap: RANGES.iconGap.def,
		wallpaperOpacity: RANGES.wallpaperOpacity.def,
		fadeStrength: RANGES.fadeStrength.def,
		fadeHeight: RANGES.fadeHeight.def,
		tileShape: 'rounded',
		iconStyle: 'original',
		iconLight: false,
		iconColor: 'theme',
		recentsW: RANGES.recentsW.def,
		recentsH: RANGES.recentsH.def,
		oledShift: true,
		quietSec: RANGES.quietSec.def,        // P109: quiet mode, Home focus, tiles and input status are reset too
		quietDimSec: RANGES.quietDimSec.def,
		quietDimLevel: RANGES.quietDimLevel.def,
		homeFocus: DEFAULT_CONFIG.homeFocus,
		showLgHome: DEFAULT_CONFIG.showLgHome,
		showSystem: DEFAULT_CONFIG.showSystem,
		inputStatus: DEFAULT_CONFIG.inputStatus,
		labelColor: 'theme',
		labelFont: 'default',
		labelSize: 100,
		labelWeight: 400,
		scrollSpeed: 'medium',
		showLabels: true,
		minimal: false,
		rows: 1,
		sideMargin: RANGES.sideMargin.def,
		bottomMargin: RANGES.bottomMargin.def,
		favSideMargin: RANGES.favSideMargin.def,
		favBottomMargin: RANGES.favBottomMargin.def,
		clockFormat: 'tv',
		clock: {...DEFAULT_CLOCK},
		weather: {...DEFAULT_WEATHER}
	};
}

/** The Weather tab's rows (left out of builds made without the weather widget). */
const WEATHER_PREFS: PrefDef[] = [
	toggle('weatherOn', 'clock',
		(c) => c.weather.on, (c, v) => ({...c, weather: {...c.weather, on: v && c.weather.city !== null}})),
	{
		id: 'weatherCity', tab: 'clock', kind: 'action',
		text: (c) => (c.weather.city ? c.weather.city.name : td('pref.notSet'))
	},
	choice('weatherUnit', 'clock',
		UNITS, (c) => c.weather.unit, (c, v) => ({...c, weather: {...c.weather, unit: v}}), (v) => (v === 'f' ? td('pref.fahrenheit') : td('pref.celsius'))),
	toggle('weatherCityName', 'clock',
		(c) => c.weather.showCity, (c, v) => ({...c, weather: {...c.weather, showCity: v}})),
	toggle('weatherRange', 'clock',
		(c) => c.weather.showRange, (c, v) => ({...c, weather: {...c.weather, showRange: v}}))
];

/** The PlxNative group of the Widgets tab: the two shelves below the home row, the account (always there while signed in, so
 *  Sign out is never hidden), and with a shelf on the server and what OK does. Account and server names come from
 *  `SystemInfo.plex` (the sign-in is kept apart from the settings, lib/plexstore.ts). Another shelf source adds its own group
 *  the same way (lib/shelves.ts). */
const plexAny = (c: UserConfig): boolean => c.plex.continueOn || c.plex.recentOn;
const plexIn = (info?: SystemInfo): boolean => !!(info && info.plex && info.plex.signedIn);
const PLEX_ACTIONS: readonly ('play' | 'open')[] = ['play', 'open'];
const PLEX_PREFS: PrefDef[] = [
	toggle('plexContinue', 'clock', (c) => c.plex.continueOn, (c, v) => ({...c, plex: {...c.plex, continueOn: v}})),
	toggle('plexRecent', 'clock', (c) => c.plex.recentOn, (c, v) => ({...c, plex: {...c.plex, recentOn: v}})),
	{
		id: 'plexAccount', tab: 'clock', kind: 'action',
		shownWith: (c, info) => plexAny(c) || plexIn(info),
		text: (_c, info) => (info && info.plex && info.plex.account ? info.plex.account : plexIn(info) ? td('pref.plexSignedIn') : td('pref.plexSignIn'))
	},
	{
		id: 'plexServer', tab: 'clock', kind: 'action', visible: plexAny,
		shownWith: (_c, info) => plexIn(info),
		text: (_c, info) => (info && info.plex && info.plex.server ? info.plex.server : td('pref.notSet'))
	},
	{...choice('plexAction', 'clock', PLEX_ACTIONS, (c) => c.plex.action, (c, v) => ({...c, plex: {...c.plex, action: v}}), (v) => (v === 'open' ? td('pref.plexOpen') : td('pref.plexPlay'))), visible: plexAny}
];

/** Groups of the Widgets tab that are their own widgets (shelves below the home row), not part of the clock: they stay when the
 *  clock widget is switched off. */
const WIDGET_GROUPS = ['PlxNative'];


// ----- merged rows (P35c): one row over two saved values; the saved values themselves are unchanged -----
type Level = 'off' | 'light' | 'medium' | 'strong';
const levelText = (v: Level): string => td(`level.${v}`);

const ICON_STYLES = ['original', 'minimal', 'glyph', 'mono', 'soft', 'accent', 'gradient', 'tinted'] as const;
type IconStyleRow = typeof ICON_STYLES[number];
const icon_styleText = (v: IconStyleRow): string => td(`iconStyle.${v}`);
const ICON_TILES = ['dark', 'light'] as const;
const iconStyleOf = (c: UserConfig): IconStyleRow => (isMonoStyle(c.iconStyle) || c.iconStyle === 'tinted' ? (effectiveIconStyle(c.iconStyle, c.theme) as IconStyleRow) : c.minimal ? 'minimal' : 'original');
/** Accent mono is not offered in OLED black (P59b) */
const iconStyleValues = (c: UserConfig): readonly IconStyleRow[] => (c.theme === 'black' ? ICON_STYLES.filter((v) => v !== 'accent') : ICON_STYLES);

const CLOCK_ALIGNS: readonly ClockAlign[] = ['left', 'center', 'right'];
const alignText = (v: ClockAlign): string => td(`align.${v}`);

type ShadowLevel = Level | 'max';
const SHADOW_LEVELS: readonly ShadowLevel[] = ['off', 'light', 'medium', 'strong', 'max'];
const shadowText = (v: ShadowLevel): string => td(v === 'max' ? 'level.max' : `level.${v}`);
const SHADOW_VALUES: Record<ShadowLevel, {shadow: boolean; shadowStrength?: number}> = {off: {shadow: false}, light: {shadow: true, shadowStrength: 30}, medium: {shadow: true, shadowStrength: 50}, strong: {shadow: true, shadowStrength: 80}, max: {shadow: true, shadowStrength: 100}};
const shadowLevel = (c: UserConfig): ShadowLevel => (!c.clock.shadow ? 'off' : c.clock.shadowStrength <= 30 ? 'light' : c.clock.shadowStrength <= 60 ? 'medium' : c.clock.shadowStrength <= 90 ? 'strong' : 'max');

// 2.0.3 (R1, F1): the gradient behind the widget: Off, then 5-100 % in steps of 5 (100 % = the earlier 50 % darkness)
const SCRIM_VALUES: readonly number[] = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const scrimText = (v: number): string => (v === 0 ? td('common.off') : `${v}%`);

const FADE_LEVELS: readonly Level[] = ['off', 'light', 'medium', 'strong'];
const FADE_VALUES: Record<Level, {fadeStrength: number; fadeHeight?: number}> = {off: {fadeStrength: 0}, light: {fadeStrength: 15, fadeHeight: 35}, medium: {fadeStrength: 30, fadeHeight: 50}, strong: {fadeStrength: 55, fadeHeight: 70}};
const fadeLevel = (c: UserConfig): Level => (c.fadeStrength === 0 ? 'off' : c.fadeStrength <= 20 ? 'light' : c.fadeStrength <= 40 ? 'medium' : 'strong');

type Panel = 'small' | 'medium' | 'large';
const PANEL_SIZES: readonly Panel[] = ['small', 'medium', 'large'];
const panelText = (v: Panel): string => td(`panel.${v}`);
const PANEL_VALUES: Record<Panel, {recentsW: number; recentsH: number}> = {small: {recentsW: 45, recentsH: 30}, medium: {recentsW: 60, recentsH: 30}, large: {recentsW: 80, recentsH: 45}};
const panelSize = (c: UserConfig): Panel => (c.recentsW <= 50 ? 'small' : c.recentsW <= 70 ? 'medium' : 'large');

const SAVER_BRIGHTNESS: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80];       // 0 = Bright, else the dim strength in %
const saverBrightness = (c: UserConfig): number => (!c.screensaverDim ? 0 : Math.min(80, Math.max(10, Math.round(c.screensaverDimLevel / 10) * 10)));

/** The power-on row: the app chosen, and whether the TV still needs a restart to use it (P55b, PR #25 by Obednal97). */
function powerOnText (c: UserConfig, info?: SystemInfo): string {
	const status = info && info.powerOn;
	const names = (info && info.powerOnNames) || {};
	if (!status) return c.powerOnApp ? powerOnName(c.powerOnApp, names.chosen) + (c.powerOnNetwork ? td('pref.network') : '') : td('pref.tvDefault');
	if (!status.supported) return td('common.notOnTv');
	if (status.foreign) return td('pref.byOtherTool');
	const chosen = status.chosen ? powerOnName(status.chosen, names.chosen) + (status.network ? td('pref.network') : '') : td('pref.tvDefault');
	return needsRestart(status) ? td('pref.afterRestart', {name: chosen}) : chosen;
}

const BASE_PREFS: PrefDef[] = [
	// ----- Look -----
	{
		id: 'theme', tab: 'look', kind: 'choice',
		text: (c) => { const t = c.themeSel ? userThemeList().filter((x) => x.slug === c.themeSel)[0] : undefined; return t ? t.name : themeText(c.theme); },
		change: (c, press) => {
			const values = (THEMES as string[]).concat(userThemeList().map((t) => USER_THEME + t.slug));
			const v = stepValue(values, c.themeSel ? USER_THEME + c.themeSel : c.theme, delta(press), press === 'ok');
			return v.indexOf(USER_THEME) === 0 ? {...c, themeSel: v.slice(USER_THEME.length)} : {...c, theme: v as typeof c.theme, themeSel: ''};
		}
	},
	{
		id: 'themeExport', tab: 'look', kind: 'action',
		text: () => td('act.export'),
		shownWith: (_c, info) => !!(info && info.root === 'yes')
	},
	{
		id: 'themeSave', tab: 'look', kind: 'action',
		text: () => td('act.save'),
		shownWith: (c, info) => !!c.themeSel && !!(info && info.root === 'yes') && !!activeTheme() && !savedIndex().some((t) => t.slug === activeSlug())
	},
	{
		id: 'themeRemove', tab: 'look', kind: 'action',
		text: () => td('act.delete'),
		shownWith: (c, info) => !!c.themeSel && !!(info && info.root === 'yes') && !!activeTheme()
	},
	choice('quietSec', 'look',
		rangeValues('quietSec'), (c) => c.quietSec, (c, v) => ({...c, quietSec: v}), (v) => (v === 0 ? td('level.off') : td('time.seconds', {n: v}))),
	{...choice('quietDimSec', 'look',
		rangeValues('quietDimSec'), (c) => c.quietDimSec, (c, v) => ({...c, quietDimSec: v}), (v) => (v === 0 ? td('level.off') : td('time.seconds', {n: v}))), visible: (c) => c.quietSec > 0},
	{...choice('quietPowerOff', 'look',
		QUIET_POWEROFF_VALUES, (c) => c.quietPowerOff, (c, v) => ({...c, quietPowerOff: v}), powerOffText), visible: (c) => c.quietSec > 0},
	{...choice('quietDimLevel', 'look',
		rangeValues('quietDimLevel'), (c) => c.quietDimLevel, (c, v) => ({...c, quietDimLevel: v}), (v) => td('pref.darker', {n: v})), visible: (c) => c.quietSec > 0 && c.quietDimSec > 0},
	range('iconScale', 'look',
		'iconScale', (c) => c.iconScale, (c, v) => ({...c, iconScale: v}), (v) => `${v}%`),
	range('iconGap', 'look',
		'iconGap', (c) => c.iconGap, (c, v) => ({...c, iconGap: v}), (v) => `${v}%`),
	choice('tileShape', 'look',
		TILE_SHAPE_IDS, (c) => c.tileShape, (c, v) => ({...c, tileShape: v}), tileShapeText),
	{
		id: 'iconStyle', tab: 'look', kind: 'choice',
		text: (c) => icon_styleText(iconStyleOf(c)),
		change: (c, press) => {
			const v = stepValue(iconStyleValues(c), iconStyleOf(c), delta(press), press === 'ok');
			return {...c, iconStyle: v === 'original' || v === 'minimal' ? 'original' : v, minimal: v === 'minimal'};
		}
	},
	{...choice('iconLight', 'look',
		ICON_TILES, (c) => (c.iconLight ? 'light' : 'dark'), (c, v) => ({...c, iconLight: v === 'light'}), (v) => (v === 'light' ? td('pref.tileLight') : td('pref.tileDark'))), visible: (c) => hasLightTile(effectiveIconStyle(c.iconStyle, c.theme))},
	{...choice('iconColor', 'look',
		LABEL_COLOR_IDS, (c) => c.iconColor, (c, v) => ({...c, iconColor: v}), labelColorText),
		text: (c) => iconColorText(iconColorEffective(c.iconColor, c.iconLight)),
		change: (c, press) => ({...c, iconColor: stepValue(iconColorValues(c.iconLight), iconColorEffective(c.iconColor, c.iconLight), delta(press), press === 'ok')}),
		visible: (c) => isMonoStyle(effectiveIconStyle(c.iconStyle, c.theme))},
	choice('rows', 'look',
		[1, 2] as const, (c) => c.rows, (c, v) => ({...c, rows: v}), (v) => (v === 1 ? td('pref.row1') : td('pref.rows2'))),
	toggle('showLabels', 'look',
		(c) => c.showLabels, (c, v) => ({...c, showLabels: v})),
	choice('labelColor', 'look',
		LABEL_COLOR_IDS, (c) => c.labelColor, (c, v) => ({...c, labelColor: v}), labelColorText),
	choice('labelFont', 'look',
		LABEL_FONT_IDS, (c) => c.labelFont, (c, v) => ({...c, labelFont: v}), (v) => (v === 'default' ? td('common.default') : fontLabel(v as ClockFont))),
	choice('labelSize', 'look',
		LABEL_SIZES, (c) => c.labelSize, (c, v) => ({...c, labelSize: v}), (v) => `${v}%`),
	choice('labelWeight', 'look',
		LABEL_WEIGHTS, (c) => c.labelWeight, (c, v) => ({...c, labelWeight: v}), (v) => weightText(v as ClockWeight)),
	choice('homeFocus', 'look',
		HOME_FOCUS_IDS, (c) => c.homeFocus, (c, v) => ({...c, homeFocus: v}), homeFocusText),
	choice('scrollSpeed', 'look',
		SCROLL_SPEED_IDS, (c) => c.scrollSpeed, (c, v) => ({...c, scrollSpeed: v}), (v) => scrollSpeedText(v)),
	toggle('inputStatus', 'look',
		(c) => c.inputStatus, (c, v) => ({...c, inputStatus: v})),
	toggle('showLgHome', 'look',
		(c) => c.showLgHome, (c, v) => ({...c, showLgHome: v})),
	toggle('showSystem', 'look',
		(c) => c.showSystem, (c, v) => ({...c, showSystem: v})),
	toggle('hideSettings', 'look',
		(c) => c.hideSettings, (c, v) => ({...c, hideSettings: v})),
	range('sideMargin', 'look',
		'sideMargin', (c) => c.sideMargin, (c, v) => ({...c, sideMargin: v}), (v) => `${v} px`),
	range('bottomMargin', 'look',
		'bottomMargin', (c) => c.bottomMargin, (c, v) => ({...c, bottomMargin: v}), (v) => `${v} px`),

	{...range('favSideMargin', 'look',
		'favSideMargin', (c) => c.favSideMargin, (c, v) => ({...c, favSideMargin: v}), (v) => `${v} px`), visible: (c) => c.favourites.length > 0},
	{...range('favBottomMargin', 'look',
		'favBottomMargin', (c) => c.favBottomMargin, (c, v) => ({...c, favBottomMargin: v}), (v) => `${v} px`), visible: (c) => c.favourites.length > 0},
	choice('recentsSize', 'look',
		PANEL_SIZES, (c) => panelSize(c), (c, v) => ({...c, ...PANEL_VALUES[v]}), (v) => panelText(v)),
	toggle('oledShift', 'look',
		(c) => c.oledShift, (c, v) => ({...c, oledShift: v})),

	{
		id: 'restoreLook', tab: 'look', kind: 'action',
		text: () => td('act.restore'),
		visible: () => hasPrefsBackup()
	},
	{
		id: 'resetLook', tab: 'look', kind: 'action',
		text: () => td('act.reset')
	},

	// ----- Clock -----
	choice('clockFormat', 'clock',
		CLOCK_FORMATS, (c) => c.clockFormat, (c, v) => ({...c, clockFormat: v}), (v) => formatText(v)),
	range('clockSize', 'clock',
		'clockSize', (c) => c.clock.size, (c, v) => ({...c, clock: {...c.clock, size: v}}), (v) => `${sizeLabel(v)}`),
	toggle('widgetOn', 'clock',
		(c) => c.clock.show, (c, v) => ({...c, clock: {...c.clock, show: v}})),
	choice('clockFont', 'clock',
		CLOCK_FONT_IDS, (c) => c.clock.font, (c, v) => ({...c, clock: {...c.clock, font: v}}), (v) => fontLabel(v)),
	choice('clockWeight', 'clock',
		WEIGHTS, (c) => c.clock.weight, (c, v) => ({...c, clock: {...c.clock, weight: v}}), (v) => weightText(v)),
	range('clockTop', 'clock',
		'clockTop', (c) => c.clock.top, (c, v) => ({...c, clock: {...c.clock, top: v}}), (v) => `${v}%`),
	range('clockLeft', 'clock',
		'clockLeft', (c) => c.clock.left, (c, v) => ({...c, clock: {...c.clock, left: v}}), (v) => `${v}%`),
	toggle('showDate', 'clock',
		(c) => c.clock.showDate, (c, v) => ({...c, clock: {...c.clock, showDate: v}})),
	toggle('showPeriod', 'clock',
		(c) => c.clock.showPeriod, (c, v) => ({...c, clock: {...c.clock, showPeriod: v}})),

	// ----- Wallpaper -----
	{
		// ← → step the built-in backgrounds (and switch back to one from a picture or slideshow); OK opens the picture picker
		id: 'wallpaper', tab: 'wallpaper', kind: 'choice',
		text: (c) => c.wallpaper.mode === 'image' ? td('pref.picture', {name: baseName(c.wallpaper.path)})
			: c.wallpaper.mode === 'folder' ? td('pref.slideshow', {name: baseName(c.wallpaper.path)}) + (c.wallpaper.recursive ? td('pref.withSubfolders') : '') : td('pref.builtIn', {name: backgroundLabel(c.background)}),
		change: (c, press) => {
			if (press === 'ok') return c;
			if (c.wallpaper.mode !== 'gradient') return {...c, wallpaper: {...DEFAULT_WALLPAPER, intervalSec: c.wallpaper.intervalSec, shuffle: c.wallpaper.shuffle, fit: c.wallpaper.fit}};
			return {...c, background: stepValue(BACKGROUND_IDS, c.background, delta(press), false)};
		}
	},
	{...choice('wallpaperFit', 'wallpaper',
		SAVER_FIT_VALUES, (c) => (c.wallpaper.fit === 'fit' ? 'fit' : 'fill'), (c, v) => ({...c, wallpaper: {...c.wallpaper, fit: v}}), fitText), visible: (c) => c.wallpaper.mode !== 'gradient' || c.background.indexOf('photo-') === 0},
	{...choice('interval', 'wallpaper',
		INTERVAL_VALUES, (c) => c.wallpaper.intervalSec, (c, v) => ({...c, wallpaper: {...c.wallpaper, intervalSec: v}}), (v) => v === 0 ? td('time.eachVisit') : intervalText(v)), visible: isSlideshow},
	{...toggle('shuffle', 'wallpaper',
		(c) => c.wallpaper.shuffle, (c, v) => ({...c, wallpaper: {...c.wallpaper, shuffle: v}})), visible: isSlideshow},
	choice('clockColor', 'wallpaper',
		CLOCK_COLOR_IDS, (c) => c.clock.color, (c, v) => ({...c, clock: {...withoutInk(c.clock), color: v}}), (v: ClockColor) => colorInfo(v).label),
	choice('fadeStrength', 'wallpaper',
		FADE_LEVELS, (c) => fadeLevel(c), (c, v) => ({...c, ...FADE_VALUES[v]}), (v) => levelText(v)),
	choice('clockAlign', 'clock',
		CLOCK_ALIGNS, (c) => c.clock.align, (c, v) => ({...c, clock: {...c.clock, align: v}}), (v) => alignText(v)),
	range('clockOpacity', 'wallpaper',
		'clockOpacity', (c) => c.clock.opacity, (c, v) => ({...c, clock: {...c.clock, opacity: v}}), (v) => `${v}%`),
	range('wallpaperOpacity', 'wallpaper',
		'wallpaperOpacity', (c) => c.wallpaperOpacity, (c, v) => ({...c, wallpaperOpacity: v}), (v) => `${v}%`),
	choice('clockShadow', 'wallpaper',
		SHADOW_LEVELS, (c) => shadowLevel(c), (c, v) => ({...c, clock: {...c.clock, ...SHADOW_VALUES[v]}}), (v) => shadowText(v)),
	choice('clockScrim', 'wallpaper',
		SCRIM_VALUES, (c) => c.clock.scrim, (c, v) => ({...c, clock: {...c.clock, scrim: v}}), (v) => scrimText(v)),
	range('iconOpacity', 'wallpaper',
		'iconOpacity', (c) => c.iconOpacity, (c, v) => ({...c, iconOpacity: v}), (v) => `${v}%`),

	// ----- Options -----
	{
		// 2.0.3 R2-a: press-only update check (opens its own screen); the row shows the version in use
		id: 'updates', tab: 'system', kind: 'action',
		text: () => HEARTH_VERSION
	},
	{
		id: 'homeKey', tab: 'system', kind: 'action',
		text: (_c, info) => {
			const code = info && info.homeKey !== undefined ? info.homeKey : recordedCode();
			return code ? td('pref.button', {code}) : td('common.off');
		}
	},
	{
		id: 'preload', tab: 'system', kind: 'action',
		text: (c) => (c.preloadOff > 0 ? td('pref.nOff', {n: c.preloadOff}) : td('pref.lgDefault'))
	},
	toggle('keepReady', 'system',
		(c) => c.keepReady, (c, v) => ({...c, keepReady: v})),
	toggle('keepRelaunch', 'system',
		(c) => c.keepRelaunch, (c, v) => ({...c, keepRelaunch: v})),
	{
		id: 'tvApps', tab: 'system', kind: 'action',
		text: (c) => (c.tvApps ? td('common.on') : td('common.off')),
		visible: (c) => rootState() !== 'yes' || c.tvApps       // not for rooted users (kept while on, so it can be turned off)
	},
	{
		id: 'noRootGuide', tab: 'system', kind: 'action',
		text: () => td('act.read'),
		visible: () => rootState() !== 'yes'
	},
	{
		id: 'replaceHome', tab: 'system', kind: 'action',
		text: (_c, info) => (!info || !info.homeHook ? td('common.unknown') : info.homeHook.running ? td('common.on') : td('common.off'))
	},
	{
		// 2.0.3 (R3): the SAM stand-in method, back as an experimental row; OK asks first, then installs and switches on, or off
		id: 'samHome', tab: 'system', kind: 'action',
		text: (c, info) => (info && info.samHome ? (info.samHome.enabled || info.samHome.linked ? td('common.on') : td('common.off')) : c.samHome ? td('common.on') : td('common.off'))
	},
	{
		// P58c (PR #18, Obednal97): the TV's own Home app setting; the row is never greyed out for the webOS version
		id: 'homeApp', tab: 'system', kind: 'action',
		text: (c, info) => {
			if (info && typeof info.homeApp === 'string') return info.homeApp === '' ? td('common.notOnTv') : info.homeApp === APP_ID ? td('common.on') : td('common.off');
			return c.homeApp ? td('common.on') : td('common.off');
		}
	},
	{
		// 2.0.2 (D1): one toggle row: OK adds Hearth to the TV's inputs, or takes it out when it is listed
		id: 'tvInput', tab: 'system', kind: 'action',
		text: (_c, info) => (info && info.tvInput ? td('common.on') : td('common.off'))
	},
	{
		id: 'powerOnApp', tab: 'system', kind: 'action',
		text: powerOnText
	},
	{
		id: 'remap', tab: 'system', kind: 'action',
		text: () => {
			const n = extraCount();
			return n ? (n === 1 ? td('pref.oneButton') : td('pref.nButtons', {n})) : td('common.off');
		}
	},
	{
		id: 'lgLogo', tab: 'system', kind: 'action',
		text: (_c, info) => (!info || info.logo === null || info.logo === undefined || info.logo === 'unsupported' ? td('common.unknown') : info.logo === 'on' ? td('common.on') : td('common.off'))
	},
	{
		id: 'screensaver', tab: 'system', kind: 'action',
		text: (c) => (c.screensaver ? td('common.on') : td('common.off'))
	},
	{
		id: 'screensaverPictures', tab: 'system', kind: 'action',
		text: (c) => (c.screensaverSource === SAVER_PHOTOS ? td('pref.saverPhotos') : c.screensaverSource === SAVER_VIDEO ? td('pref.saverVideo') : c.screensaverSource ? (c.screensaverSource.slice(c.screensaverSource.lastIndexOf('/') + 1) || c.screensaverSource) + (c.screensaverRecursive ? td('pref.withSubfolders') : '') : td('picker.sameAsTheWallpaper')),
		visible: (c) => c.screensaver
	},
	{...choice('screensaverInterval', 'system',
		SAVER_INTERVAL_VALUES, (c) => c.screensaverInterval, (c, v) => ({...c, screensaverInterval: v}), intervalText), visible: (c) => c.screensaver && saverIsSlideshow(c)},
	{...toggle('screensaverShuffle', 'system',
		(c) => c.screensaverShuffle, (c, v) => ({...c, screensaverShuffle: v})), visible: (c) => c.screensaver && saverIsSlideshow(c)},
	{...toggle('screensaverCare', 'system',
		(c) => c.screensaverCare, (c, v) => ({...c, screensaverCare: v})), visible: (c) => c.screensaver},
	{...choice('screensaverFit', 'system',
		SAVER_FIT_VALUES, (c) => c.screensaverFit, (c, v) => ({...c, screensaverFit: v}), fitText), visible: (c) => c.screensaver},
	{...choice('screensaverDim', 'saver',
		SAVER_BRIGHTNESS, (c) => saverBrightness(c), (c, v) => (v === 0 ? {...c, screensaverDim: false} : {...c, screensaverDim: true, screensaverDimLevel: v}), (v) => (v === 0 ? td('pref.saverBright') : td('pref.saverDim', {n: v}))), visible: (c) => c.screensaver},
	{...choice('screensaverPowerOff', 'system',
		SAVER_POWEROFF_VALUES, (c) => c.screensaverPowerOff, (c, v) => ({...c, screensaverPowerOff: v}), powerOffText), visible: (c) => c.screensaver},
	{
		id: 'screensaverShow', tab: 'system', kind: 'action',
		text: () => '',
		visible: (c) => c.screensaver
	},
	{
		// T2b/T4: English, the languages shipped in the app, and the user's own language file once one is loaded (arrows switch; OK loads a file on a rooted TV)
		id: 'language', tab: 'system', kind: 'choice',
		text: (c) => (c.language === PACK_ID && hasPack() ? packName() : languageLabel(c.language)),
		change: (c, press) => {
			const values = LANGUAGES.map((l) => l.id).concat(hasPack() ? [PACK_ID] : []);
			return {...c, language: stepValue(values, c.language === PACK_ID && hasPack() ? PACK_ID : languageOf(c.language).id, delta(press), press === 'ok')};
		}
	},
	{
		id: 'languageRemove', tab: 'system', kind: 'action',
		text: () => td('act.remove'),
		shownWith: () => hasPack()
	},
	toggle('showDebug', 'system',
		(c) => c.showDebug, (c, v) => ({...c, showDebug: v})),
	{
		id: 'undoAll', tab: 'system', kind: 'action',
		text: () => td('act.undoAll')
	},
	{
		// S3: the last Essentials row opens the list where the user adds, removes and reorders the rows of that tab
		id: 'essentialsEdit', tab: 'essentials', kind: 'action',
		text: () => ''
	}
];

/** Where every row lives, in order: tab, group ('' = no group, always shown), row ids. */
const LAYOUT: [PrefTab, string, string[]][] = [
	['look', '', ['restoreLook']],
	['look', 'Theme', ['theme', 'themeExport', 'themeSave', 'themeRemove']],
	['look', 'Icons', ['iconScale', 'tileShape', 'iconStyle', 'iconLight', 'iconColor', 'iconGap', 'iconOpacity']],
	['look', 'Home row', ['rows', 'scrollSpeed', 'homeFocus', 'sideMargin', 'bottomMargin', 'inputStatus', 'showLgHome', 'showSystem', 'hideSettings']],
	['look', 'Labels', ['showLabels', 'labelColor', 'labelFont', 'labelSize', 'labelWeight']],
	['look', 'Quiet mode', ['quietSec', 'quietDimSec', 'quietDimLevel', 'quietPowerOff', 'oledShift']],
	['look', 'Favourites', ['favSideMargin', 'favBottomMargin']],
	['look', 'Recent apps', ['recentsSize']],
	['look', '', ['resetLook']],
	['clock', '', ['widgetOn']],
	['clock', 'Time and date', ['clockFormat', 'showPeriod', 'showDate']],
	['clock', 'Widget look', ['clockSize', 'clockFont', 'clockWeight', 'clockTop', 'clockLeft', 'clockAlign', 'clockColor', 'clockShadow', 'clockScrim', 'clockOpacity']],
	['clock', 'Weather', ['weatherOn', 'weatherUnit', 'weatherCity', 'weatherCityName', 'weatherRange']],
	['clock', 'PlxNative', ['plexContinue', 'plexRecent', 'plexAccount', 'plexServer', 'plexAction']],
	['wallpaper', '', ['wallpaper', 'wallpaperFit', 'interval', 'shuffle', 'wallpaperOpacity', 'fadeStrength']],   // P66b: few rows, no groups (was Background and Picture)
	['saver', '', ['screensaver', 'screensaverPictures', 'screensaverInterval', 'screensaverShuffle', 'screensaverFit', 'screensaverCare', 'screensaverDim', 'screensaverPowerOff', 'screensaverShow']],
	['system', '', ['updates', 'language', 'languageRemove']],
	['system', 'Remote control', ['homeKey', 'remap']],
	['system', 'TV start', ['tvApps', 'noRootGuide', 'tvInput', 'replaceHome', 'samHome', 'powerOnApp', 'lgLogo', 'homeApp']],
	['system', 'Memory', ['preload', 'keepReady', 'keepRelaunch']],
	['system', '', ['showDebug', 'undoAll']]
];

const PLACE: Record<string, {tab: PrefTab; group: string; order: number}> = {};
LAYOUT.forEach(([tab, group, ids], g) => ids.forEach((id, i) => { PLACE[id] = {tab, group, order: g * 100 + i}; }));

const ALL_PREFS: PrefDef[] = (WEATHER_ENABLED ? BASE_PREFS.concat(WEATHER_PREFS) : BASE_PREFS).concat(PLEX_ENABLED ? PLEX_PREFS : []);
export const PREFS: Pref[] = ALL_PREFS.map((p) => withTexts(((): PrefDef => {
	if (!PLACE[p.id]) return p;
	const placed = {...p, tab: PLACE[p.id].tab, group: PLACE[p.id].group};
	if (placed.tab !== 'clock' || p.id === 'widgetOn' || WIDGET_GROUPS.indexOf(placed.group) !== -1) return placed;
	const own = p.visible;       // P41f: with the widget off its rows are hidden
	return {...placed, visible: (c: UserConfig) => c.clock.show && (!own || own(c))};
})()));

export function findPref (id: string): Pref | undefined {
	return PREFS.find((p) => p.id === id);
}

/** `open` value meaning "the first group is open" (the default). */
export const FIRST_GROUP = '@first';
export const GROUP_PREFIX = 'group:';

/** S2 (user 2026-11-09): the Essentials tab lists copies of the rows people change often; each row also stays in its own tab.
 *  Same `Pref` objects, no saved value changes; no groups; root-only rows are left out when root failed.
 *  S3 (user 2026-11-09): the user edits the list (`config.essentials`, row ids in order; null = this default list, so later changes to it
 *  reach users who never edited). Rows that do not apply still hide by their own rules. */
export const ESSENTIALS_DEFAULT: readonly string[] = ['theme', 'wallpaper', 'interval', 'widgetOn', 'screensaver', 'screensaverPictures', 'quietSec', 'iconScale', 'showLabels', 'updates'];
/** Never offered in Essentials: rows that undo, reset, restore or delete things, and the edit row itself (it is always last). */
export const ESSENTIALS_EXCLUDED: readonly string[] = ['undoAll', 'restoreLook', 'resetLook', 'themeRemove', 'languageRemove', 'essentialsEdit'];
export const ESSENTIALS_EDIT = 'essentialsEdit';

/** The row ids chosen for Essentials: the saved list or the default; unknown, excluded and repeated ids dropped. */
export function essentialIds (config: UserConfig): string[] {
	const list = config.essentials ? config.essentials : ESSENTIALS_DEFAULT;
	return list.filter((id, i) => list.indexOf(id) === i && ESSENTIALS_EXCLUDED.indexOf(id) === -1 && !!findPref(id));
}

/** Every row that can be put in Essentials, in the order of the Settings tabs (the edit list's second half). */
export function essentialChoices (): string[] {
	return PREFS.filter((p) => ESSENTIALS_EXCLUDED.indexOf(p.id) === -1 && !!PLACE[p.id])
		.sort((a, b) => PLACE[a.id].order - PLACE[b.id].order).map((p) => p.id);
}

/** The tab a row lives in (for the edit list's detail line). */
export function prefTab (id: string): PrefTab | '' {
	const p = findPref(id);
	return p ? p.tab : '';
}

function essentialRows (config: UserConfig, info?: SystemInfo): Pref[] {
	const out: Pref[] = [];
	essentialIds(config).forEach((id) => {
		const p = findPref(id);
		if (!p || (p.visible && !p.visible(config)) || (p.shownWith && !p.shownWith(config, info))) return;
		if (rootState() === 'no' && ROOT_OPTIONS.indexOf(id) !== -1) return;
		out.push({...p, group: ''});
	});
	const edit = findPref(ESSENTIALS_EDIT);
	if (edit) out.push({...edit, group: ''});
	return out;
}

/** The Settings list for one tab. With `open` undefined every row is listed flat. With `open` set, the tab's
 *  groups become header rows (id `group:<tab>:<name>`, OK opens or closes) and only the rows of the open group
 *  show: `open` is a group name, '' (all closed) or FIRST_GROUP. Rows with no group always show. */
export function optionsFor (tab: PrefTab, config: UserConfig, info?: SystemInfo, open?: string): OptionItem[] {
	let rows = tab === 'essentials' ? essentialRows(config, info) : PREFS.filter((p) => p.tab === tab && (!p.visible || p.visible(config)) && (!p.shownWith || p.shownWith(config, info)))
		.sort((a, b) => (PLACE[a.id] ? PLACE[a.id].order : 1e6) - (PLACE[b.id] ? PLACE[b.id].order : 1e6));
	// P83: while root has failed, System keeps only the SSAP switch and the Debug switch (no group header)
	if (tab === 'system' && rootState() === 'no') rows = rows.filter((p) => NO_ROOT_ROWS.indexOf(p.id) !== -1).map((p) => ({...p, group: ''}));
	const item = (p: Pref, grouped: boolean): OptionItem => ({
		id: p.id,
		label: p.label,
		description: p.description,
		disabled: disabledReason(p.id, info, config) || undefined,
		value: p.kind === 'toggle' && p.on ? p.on(config) : undefined,
		valueText: p.kind !== 'toggle' && p.text ? p.text(config, info) : undefined,
		stepper: p.kind === 'choice',
		grouped: grouped || undefined
	});
	if (open === undefined) return rows.map((p) => item(p, false));
	const firstGroup = rows.filter((p) => p.group)[0];
	const opened = open === FIRST_GROUP ? (firstGroup ? firstGroup.group : '') : open;
	const out: OptionItem[] = [];
	let seen = '';
	rows.forEach((p) => {
		if (!p.group) { out.push(item(p, false)); return; }
		if (p.group !== seen) {
			seen = p.group;
			out.push({id: `${GROUP_PREFIX}${tab}:${p.group}`, label: td(`group.${p.group}`), description: '', header: true, open: p.group === opened});
		}
		if (p.group === opened) out.push(item(p, true));
	});
	return out;
}

/** The config after pressing OK / ← / → on option `id`; the same config when nothing changes. */
export function applyPref (config: UserConfig, id: string, press: Press): UserConfig {
	const pref = findPref(id);
	return pref && pref.change ? pref.change(config, press) : config;
}
