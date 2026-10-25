// The settings screens as data: every option on the Look, Clock, Wallpaper and Options tabs,
// how it reads the config, and how OK / ← → change it. The app builds the Settings lists
// from this table and applies a change with `applyPref`.

import type {OptionItem} from '../components/OptionList';
import type {ThemeName} from '../theme/tokens';
import {
	DEFAULT_CLOCK, INTERVAL_VALUES, RANGES, rangeValues, stepValue,
	type ClockFormat, type ClockWeight, type RangeName, type UserConfig
} from './storage';
import {APP_ID} from '../config/constants';
import {CLOCK_FONT_IDS, fontLabel} from './clockfont';
import {CLOCK_COLOR_IDS, colorInfo, type ClockColor} from './clockcolor';
import {baseName} from './wallpaper';
import {builtinWallpaper} from './builtinwallpapers';
import {WEATHER_ENABLED} from '../config/features';
import type {TempUnit} from './weather';
import {lastFailure, type RootState} from './failure';
import type {LogoState} from './system';
import {COLOR_KEYS, type ColorKey, type RemoteState} from './inputhook';
import {t} from './i18n';
import {GLASS_TINT_COLORS, type GlassTint} from '../theme/tokens';
import {GLASS_TINTS, QUIET_VALUES, type HomeFocus, type QuietAfter} from './storage';

export type PrefTab = 'look' | 'clock' | 'weather' | 'wallpaper' | 'options';

/** Facts about the TV (not user settings) that some rows display. */
export interface SystemInfo {
	/** the app the TV's Home button opens (null while unknown) */
	homeApp: string | null;
	/** the hand-over watcher: running, and whether it starts at boot (null while unknown) */
	homeHook: {running: boolean; linked: boolean} | null;
	/** the launcher is in the TV's input list (null while unknown) */
	tvInput?: boolean | null;
	/** the TV's "show the LG logo at start" setting (null while unknown) */
	logo?: LogoState | null;
	/** can this TV run commands through the Homebrew Channel (rooted)? */
	root?: RootState;
	/** what the TV said when it could not (shown under a greyed-out row) */
	rootDetail?: string;
	/** the remote buttons set up through LG Input Hook (null while unknown) */
	remote?: RemoteState | null;
	/** app titles by id, for the colour-button rows */
	appTitles?: Record<string, string>;
}

const KEY_LABEL: Record<ColorKey, string> = {red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue'};
/** The Options rows for the colour buttons: keyRed, keyGreen, keyYellow, keyBlue. */
export const COLOR_KEY_ROWS: Record<string, ColorKey> = {keyRed: 'red', keyGreen: 'green', keyYellow: 'yellow', keyBlue: 'blue'};
const REMOTE_OPTIONS = ['homeButton'].concat(Object.keys(COLOR_KEY_ROWS));

/** The options that run shell commands, so they can't work without root. */
export const ROOT_OPTIONS = ['closeHome', 'useHomebrew', 'useAsHome', 'replaceHome', 'startAtBoot', 'tvInput', 'closeHomeNow', 'lgLogo'].concat(REMOTE_OPTIONS);

/** Why a row is greyed out, or null when it is usable. */
export function disabledReason (id: string, info?: SystemInfo): string | null {
	if (id === 'lgLogo' && info && info.logo === 'unsupported') return t('prefs.disabled.noLogoSetting');
	if (REMOTE_OPTIONS.indexOf(id) !== -1 && info && info.remote && !info.remote.installed) return t('prefs.disabled.needsInputHook');
	if (!info || info.root !== 'no' || ROOT_OPTIONS.indexOf(id) === -1) return null;
	const kind = lastFailure();
	const why = kind === 'denied' ? t('prefs.disabled.deniedWebos11') : t('prefs.disabled.noService');
	return t('prefs.disabled.needsRoot', {why, detail: info.rootDetail ? ` (${t('prefs.disabled.tvSaid')}: ${info.rootDetail})` : ''});
}

/** How a key press changes a setting: OK steps and wraps round; ← → nudge and stop at the ends. */
export type Press = 'ok' | 'left' | 'right';

export interface Pref {
	id: string;
	tab: PrefTab;
	/** the label: a translation key, or a function that returns the translated text (for keys with dynamic params) */
	label: string | (() => string);
	/** same as label */
	description: string | (() => string);
	kind: 'toggle' | 'choice' | 'action';
	/** toggle: is it on */
	on?: (c: UserConfig) => boolean;
	/** choice / action: the current value as text */
	text?: (c: UserConfig, info?: SystemInfo) => string;
	/** the new config after a key press (toggle: any press flips it) */
	change?: (c: UserConfig, press: Press) => UserConfig;
}

const delta = (press: Press): number => (press === 'left' ? -1 : 1);

function remoteText (info: SystemInfo | undefined, text: (r: RemoteState) => string): string {
	if (!info || !info.remote) return t('prefs.useAsHome.unknown');
	if (!info.remote.installed) return t('prefs.disabled.needsInputHook');
	return text(info.remote);
}

/** The next choice for a colour button: nothing, then each app in `ids`, stepping with OK (wraps) or ← →. */
export function nextKeyApp (current: string | null, ids: string[], press: Press): string | null {
	const values: (string | null)[] = [null, ...ids];
	return stepValue(values, values.indexOf(current) === -1 ? null : current, delta(press), press === 'ok');
}

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
	if (seconds < 60) return t('prefs.interval.seconds', {n: seconds});
	if (seconds < 3600) return seconds === 60 ? t('prefs.interval.oneMinute') : t('prefs.interval.minutes', {n: seconds / 60});
	return seconds === 3600 ? t('prefs.interval.oneHour') : t('prefs.interval.hours', {n: seconds / 3600});
}

const THEMES: readonly ThemeName[] = ['black', 'grey', 'glass'];
const CLOCK_FORMATS: readonly ClockFormat[] = ['12h', '24h', 'tv'];
const WEIGHTS: readonly ClockWeight[] = [200, 300, 400];
const UNITS: readonly TempUnit[] = ['c', 'f'];

const THEME_TEXT: Record<ThemeName, string> = {black: 'prefs.theme.black', grey: 'prefs.theme.grey', glass: 'prefs.theme.glass'};
const FORMAT_TEXT: Record<ClockFormat, string> = {'12h': 'prefs.clockFormat.12h', '24h': 'prefs.clockFormat.24h', tv: 'prefs.clockFormat.tv'};
const WEIGHT_TEXT: Record<ClockWeight, string> = {200: 'prefs.clockWeight.thin', 300: 'prefs.clockWeight.light', 400: 'prefs.clockWeight.regular'};

/** The look, margins and clock back to their defaults (apps, sources and wallpaper are left alone). */
export function resetLook (c: UserConfig): UserConfig {
	return {
		...c,
		theme: 'black',
		glassTint: 'violet',
		iconScale: RANGES.iconScale.def,
		showLabels: true,
		rows: 1,
		sideMargin: RANGES.sideMargin.def,
		bottomMargin: RANGES.bottomMargin.def,
		clockFormat: '12h',
		clock: {...DEFAULT_CLOCK}
	};
}

/** The Weather tab's rows (left out of builds made without the weather widget). */
const WEATHER_PREFS: Pref[] = [
	toggle('weatherOn', 'weather', 'prefs.weatherOn.label', 'prefs.weatherOn.description',
		(c) => c.weather.on, (c, v) => ({...c, weather: {...c.weather, on: v && c.weather.city !== null}})),
	{
		id: 'weatherCity', tab: 'weather', label: 'prefs.weatherCity.label', kind: 'action',
		description: 'prefs.weatherCity.description',
		text: (c) => (c.weather.city ? c.weather.city.name : t('prefs.weatherCity.notSet'))
	},
	choice('weatherUnit', 'weather', 'prefs.weatherUnit.label', 'prefs.weatherUnit.description',
		UNITS, (c) => c.weather.unit, (c, v) => ({...c, weather: {...c.weather, unit: v}}), (v) => (v === 'f' ? t('prefs.weatherUnit.f') : t('prefs.weatherUnit.c'))),
	toggle('weatherCityName', 'weather', 'prefs.weatherCityName.label', 'prefs.weatherCityName.description',
		(c) => c.weather.showCity, (c, v) => ({...c, weather: {...c.weather, showCity: v}})),
	toggle('weatherRange', 'weather', 'prefs.weatherRange.label', 'prefs.weatherRange.description',
		(c) => c.weather.showRange, (c, v) => ({...c, weather: {...c.weather, showRange: v}})),
	toggle('weatherHours', 'weather', 'prefs.weatherHours.label', 'prefs.weatherHours.description',
		(c) => c.weather.showHours, (c, v) => ({...c, weather: {...c.weather, showHours: v}}))
];

const BASE_PREFS: Pref[] = [
	// ----- Look -----
	choice('theme', 'look', 'prefs.theme.label', 'prefs.theme.description',
		THEMES, (c) => c.theme, (c, v) => ({...c, theme: v}), (v) => t(THEME_TEXT[v])),
	choice('glassTint', 'look', 'prefs.glassTint.label', 'prefs.glassTint.description',
		GLASS_TINTS, (c) => c.glassTint, (c, v) => ({...c, glassTint: v}), (v: GlassTint) => t(GLASS_TINT_COLORS[v].label as unknown as string)),
	toggle('reduceEffects', 'look', 'prefs.reduceEffects.label', 'prefs.reduceEffects.description',
		(c) => c.reduceEffects, (c, v) => ({...c, reduceEffects: v})),
	range('iconScale', 'look', 'prefs.iconScale.label', 'prefs.iconScale.description',
		'iconScale', (c) => c.iconScale, (c, v) => ({...c, iconScale: v}), (v) => `${v}%`),
	choice('rows', 'look', 'prefs.rows.label', 'prefs.rows.description',
		[1, 2] as const, (c) => c.rows, (c, v) => ({...c, rows: v}), (v) => (v === 1 ? t('prefs.rows.one') : t('prefs.rows.two'))),
	toggle('showLabels', 'look', 'prefs.showLabels.label', 'prefs.showLabels.description',
		(c) => c.showLabels, (c, v) => ({...c, showLabels: v})),
	range('sideMargin', 'look', 'prefs.sideMargin.label', 'prefs.sideMargin.description',
		'sideMargin', (c) => c.sideMargin, (c, v) => ({...c, sideMargin: v}), (v) => `${v} px`),
	range('bottomMargin', 'look', 'prefs.bottomMargin.label', 'prefs.bottomMargin.description',
		'bottomMargin', (c) => c.bottomMargin, (c, v) => ({...c, bottomMargin: v}), (v) => `${v} px`),
	choice('homeFocus', 'look', 'prefs.homeFocus.label', 'prefs.homeFocus.description',
		['first', 'last'] as const, (c) => c.homeFocus, (c, v) => ({...c, homeFocus: v}), (v: HomeFocus) => (v === 'last' ? t('prefs.homeFocus.last') : t('prefs.homeFocus.first'))),
	choice('quietAfter', 'look', 'prefs.quietAfter.label', 'prefs.quietAfter.description',
		QUIET_VALUES, (c) => c.quietAfter, (c, v) => ({...c, quietAfter: v}), (v: QuietAfter) => (v === 0 ? t('prefs.quietAfter.never') : v === 1 ? t('prefs.quietAfter.one') : t('prefs.quietAfter.many', {n: v}))),

	{
		id: 'resetLook', tab: 'look', label: 'prefs.resetLook.label', kind: 'action',
		description: 'prefs.resetLook.description',
		text: () => t('prefs.resetLook.text')
	},

	// ----- Clock -----
	choice('clockFormat', 'clock', 'prefs.clockFormat.label', 'prefs.clockFormat.description',
		CLOCK_FORMATS, (c) => c.clockFormat, (c, v) => ({...c, clockFormat: v}), (v) => t(FORMAT_TEXT[v] as unknown as string)),
	range('clockSize', 'clock', 'prefs.clockSize.label', 'prefs.clockSize.description',
		'clockSize', (c) => c.clock.size, (c, v) => ({...c, clock: {...c.clock, size: v}}), (v) => `${v}`),
	choice('clockFont', 'clock', 'prefs.clockFont.label', 'prefs.clockFont.description',
		CLOCK_FONT_IDS, (c) => c.clock.font, (c, v) => ({...c, clock: {...c.clock, font: v}}), (v) => fontLabel(v)),
	choice('clockWeight', 'clock', 'prefs.clockWeight.label', 'prefs.clockWeight.description',
		WEIGHTS, (c) => c.clock.weight, (c, v) => ({...c, clock: {...c.clock, weight: v}}), (v) => t(WEIGHT_TEXT[v] as unknown as string)),
	range('clockTop', 'clock', 'prefs.clockTop.label', 'prefs.clockTop.description',
		'clockTop', (c) => c.clock.top, (c, v) => ({...c, clock: {...c.clock, top: v}}), (v) => `${v}%`),
	range('clockLeft', 'clock', 'prefs.clockLeft.label', 'prefs.clockLeft.description',
		'clockLeft', (c) => c.clock.left, (c, v) => ({...c, clock: {...c.clock, left: v}}), (v) => `${v}%`),
	toggle('showDate', 'clock', 'prefs.showDate.label', 'prefs.showDate.description',
		(c) => c.clock.showDate, (c, v) => ({...c, clock: {...c.clock, showDate: v}})),
	toggle('showPeriod', 'clock', 'prefs.showPeriod.label', 'prefs.showPeriod.description',
		(c) => c.clock.showPeriod, (c, v) => ({...c, clock: {...c.clock, showPeriod: v}})),
	toggle('clockCorner', 'clock', 'prefs.clockCorner.label', 'prefs.clockCorner.description',
		(c) => c.clock.corner, (c, v) => ({...c, clock: {...c.clock, corner: v}})),
	toggle('clockShift', 'clock', 'prefs.clockShift.label', 'prefs.clockShift.description',
		(c) => c.clock.shift, (c, v) => ({...c, clock: {...c.clock, shift: v}})),

	// ----- Wallpaper -----
	{
		id: 'wallpaper', tab: 'wallpaper', label: 'prefs.wallpaper.label', kind: 'action',
		description: 'prefs.wallpaper.description',
		text: (c) => c.wallpaper.mode === 'image' ? t('prefs.wallpaper.image', {name: baseName(c.wallpaper.path)})
			: c.wallpaper.mode === 'folder' ? t('prefs.wallpaper.folder', {name: baseName(c.wallpaper.path)})
			: c.wallpaper.mode === 'builtin' ? `${t('prefs.wallpaper.builtin', {name: t((builtinWallpaper(c.wallpaper.path) || {label: 'wallpaper.builtin.default'}).label)})}` : t('prefs.wallpaper.default')
	},
	choice('interval', 'wallpaper', 'prefs.interval.label', 'prefs.interval.description',
		INTERVAL_VALUES, (c) => c.wallpaper.intervalSec, (c, v) => ({...c, wallpaper: {...c.wallpaper, intervalSec: v}}), intervalText),
	toggle('shuffle', 'wallpaper', 'prefs.shuffle.label', 'prefs.shuffle.description',
		(c) => c.wallpaper.shuffle, (c, v) => ({...c, wallpaper: {...c.wallpaper, shuffle: v}})),
	choice('clockColor', 'wallpaper', 'prefs.clockColor.label', 'prefs.clockColor.description',
		CLOCK_COLOR_IDS, (c) => c.clock.color, (c, v) => ({...c, clock: {...c.clock, color: v}}), (v: ClockColor) => t(colorInfo(v).label as unknown as string)),
	range('clockOpacity', 'wallpaper', 'prefs.clockOpacity.label', 'prefs.clockOpacity.description',
		'clockOpacity', (c) => c.clock.opacity, (c, v) => ({...c, clock: {...c.clock, opacity: v}}), (v) => `${v}%`),

	// ----- Options -----
	toggle('closeHome', 'options', 'prefs.closeHome.label', 'prefs.closeHome.description',
		(c) => c.closeHome, (c, v) => ({...c, closeHome: v})),
	toggle('useHomebrew', 'options', 'prefs.useHomebrew.label', 'prefs.useHomebrew.description',
		(c) => c.useHomebrew, (c, v) => ({...c, useHomebrew: v})),
	{
		id: 'useAsHome', tab: 'options', label: 'prefs.useAsHome.label', kind: 'action',
		description: 'prefs.useAsHome.description',
		text: (_c, info) => (info && info.homeApp === APP_ID ? t('prefs.useAsHome.on') : info && info.homeApp ? t('prefs.useAsHome.off') : t('prefs.useAsHome.unknown'))
	},
	{
		id: 'replaceHome', tab: 'options', label: 'prefs.replaceHome.label', kind: 'action',
		description: 'prefs.replaceHome.description',
		text: (_c, info) => (!info || !info.homeHook ? t('prefs.replaceHome.unknown') : info.homeHook.running ? t('prefs.replaceHome.on') : t('prefs.replaceHome.off'))
	},
	{
		id: 'startAtBoot', tab: 'options', label: 'prefs.startAtBoot.label', kind: 'action',
		description: 'prefs.startAtBoot.description',
		text: (_c, info) => (!info || !info.homeHook ? t('prefs.startAtBoot.unknown') : info.homeHook.linked ? t('prefs.startAtBoot.on') : t('prefs.startAtBoot.off'))
	},
	{
		id: 'tvInput', tab: 'options', label: 'prefs.tvInput.label', kind: 'action',
		description: 'prefs.tvInput.description',
		text: (_c, info) => (!info || info.tvInput === null || info.tvInput === undefined ? t('prefs.tvInput.unknown') : info.tvInput ? t('prefs.tvInput.added') : t('prefs.tvInput.notAdded'))
	},
	{
		id: 'lgLogo', tab: 'options', label: 'prefs.lgLogo.label', kind: 'action',
		description: 'prefs.lgLogo.description',
		text: (_c, info) => (!info || info.logo === null || info.logo === undefined || info.logo === 'unsupported' ? t('prefs.lgLogo.unknown') : info.logo === 'on' ? t('prefs.lgLogo.on') : t('prefs.lgLogo.off'))
	},
	{
		id: 'homeButton', tab: 'options', label: 'prefs.homeButton.label', kind: 'action',
		description: 'prefs.homeButton.description',
		text: (_c, info) => remoteText(info, (r) => (r.home ? t('prefs.homeButton.on') : t('prefs.homeButton.off')))
	},
	...COLOR_KEYS.map((k): Pref => ({
		id: 'key' + KEY_LABEL[k], tab: 'options', label: () => t('prefs.key.button.opens', {name: KEY_LABEL[k]}), kind: 'action',
		description: () => t('prefs.key.button.description', {name: KEY_LABEL[k]}),
		text: (_c, info) => remoteText(info, (r) => {
			const id = r.keys[k];
			return id ? ((info && info.appTitles && info.appTitles[id]) || id) : t('prefs.key.nothing');
		})
	})),
	{
		id: 'closeHomeNow', tab: 'options', label: 'prefs.closeHomeNow.label', kind: 'action',
		description: 'prefs.closeHomeNow.description',
		text: () => t('prefs.closeHomeNow.text')
	},
	choice('language', 'options', 'language.label', 'language.description',
		['en', 'es'] as const, (c) => c.language, (c, v) => ({...c, language: v}), (v) => (v === 'es' ? t('prefs.language.es') : t('prefs.language.en')))
];

export const PREFS: Pref[] = WEATHER_ENABLED ? BASE_PREFS.concat(WEATHER_PREFS) : BASE_PREFS;

export function findPref (id: string): Pref | undefined {
	return PREFS.find((p) => p.id === id);
}

/** The order of the Options tab (anything not listed goes last). */
const OPTIONS_ORDER = ['tvInput', 'useHomebrew', 'replaceHome', 'startAtBoot', 'homeButton', 'keyRed', 'keyGreen', 'keyYellow', 'keyBlue', 'lgLogo', 'closeHome', 'closeHomeNow', 'useAsHome'];

function orderOf (tab: PrefTab, id: string): number {
	if (tab !== 'options') return 0;
	const i = OPTIONS_ORDER.indexOf(id);
	return i === -1 ? OPTIONS_ORDER.length : i;
}

/** The Settings list for one tab. */
export function optionsFor (tab: PrefTab, config: UserConfig, info?: SystemInfo): OptionItem[] {
	return PREFS.filter((p) => p.tab === tab).sort((a, b) => orderOf(tab, a.id) - orderOf(tab, b.id)).map((p) => ({
		id: p.id,
		label: typeof p.label === 'function' ? p.label() : t(p.label),
		description: typeof p.description === 'function' ? p.description() : t(p.description),
		disabled: disabledReason(p.id, info) || undefined,
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
