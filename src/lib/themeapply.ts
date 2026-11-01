// P80: applies the parts of a loaded theme that change settings: colours, fonts, icon style. Pure (no TV access).
// A part the theme does not hold changes nothing. The result is the user's normal settings, so every row can still change them.
// P81 adds the app list (order, edited names), the mismatch check and Remove theme. Icons and cities are read where they are used
// (lib/themeicons.ts, the city picker).

import {CLOCK_FONT_IDS} from './clockfont';
import {withoutInk} from './clockcolor';
import type {ThemeData} from './themefile';
import {DEFAULT_CLOCK, DEFAULT_CONFIG, DEFAULT_WALLPAPER, type UserConfig} from './storage';
import {THEME_STORE} from './themecmd';
import {setEdit} from './sourceicons';
import {themeSlug} from './themeslug';
import type {ThemeName} from '../theme/tokens';
import {t as tt} from '../i18n';

/** The settings after the theme's colours, fonts and icon style are put in (the same object when nothing changes). */
export function applyThemeParts (config: UserConfig, theme: ThemeData, avoidPath = ''): UserConfig {
	let c = config;
	const set = (patch: Partial<UserConfig>) => { c = {...c, ...patch}; };
	const col = theme.colors;
	if (col) {
		if (col.theme && col.theme !== c.theme) set({theme: col.theme as ThemeName});
		// P100: widgetInk = the theme's own colour (the colour choice reads Follow theme); a plain "widget" choice drops an earlier ink
		if (col.widgetInk) { if (c.clock.ink !== col.widgetInk || c.clock.color !== 'theme') set({clock: {...c.clock, color: 'theme', ink: col.widgetInk}}); }
		else if (col.widget && (col.widget !== c.clock.color || c.clock.ink)) set({clock: {...withoutInk(c.clock), color: col.widget as UserConfig['clock']['color']}});
		if (col.icon && col.icon !== c.iconColor) set({iconColor: col.icon});
	}
	const st = theme.iconStyle;
	if (st) {
		if (st.style && st.style !== c.iconStyle) set({iconStyle: st.style});
		if (st.tile && (st.tile === 'light') !== c.iconLight) set({iconLight: st.tile === 'light'});
	}
	const wp = theme.wallpaper;
	if (wp && (wp.file || wp.folder)) {
		// P96: the theme's own pictures in the kept folder; the page redraws the wallpaper only when its path changes, so a path equal to the
		// one in use gets a harmless "./" (another theme's picture with the same file name must still show)
		let path = `${THEME_STORE}/current/${wp.file || wp.folder}`;
		while (path === avoidPath) path = path.replace('/current/', '/current/./');
		const next = {...DEFAULT_WALLPAPER, mode: wp.file ? 'image' as const : 'folder' as const, path};
		if (wp.folder) { next.intervalSec = wp.intervalSec || c.wallpaper.intervalSec; next.shuffle = wp.shuffle !== undefined ? wp.shuffle : c.wallpaper.shuffle; }
		set({wallpaper: next});
	}
	const f = theme.fonts;
	if (f) {
		if (f.widget && f.widget !== c.clock.font) set({clock: {...c.clock, font: f.widget}});
		if (f.names && f.names !== c.labelFont) set({labelFont: f.names});
	}
	// a font of an earlier theme that this one does not carry would read as missing: back to the defaults
	if (CLOCK_FONT_IDS.indexOf(c.clock.font) === -1) set({clock: {...c.clock, font: 'inter'}});
	if (c.labelFont !== 'default' && CLOCK_FONT_IDS.indexOf(c.labelFont) === -1) set({labelFont: 'default'});
	return c;
}

/** P81: the theme's app list: its order goes first (other apps follow, in their own order), its names become edited names. */
export function applyThemeApps (config: UserConfig, theme: ThemeData): UserConfig {
	const apps = theme.apps;
	if (!apps || !apps.length) return config;
	const ids = apps.map((a) => a.id);
	let edits = config.appEdits;
	for (const a of apps) if (a.name) edits = setEdit(edits, a.id, {label: a.name});
	return {...config, appIds: ids.concat((config.appIds || []).filter((id) => ids.indexOf(id) === -1)), tileOrder: null, appEdits: edits};
}

/** Everything a theme sets in the settings (colours, fonts, icon style, app list) and the selection shown in Current theme. */
export function applyWholeTheme (config: UserConfig, theme: ThemeData, avoidPath = ''): UserConfig {
	const c = applyThemeApps(applyThemeParts(config, theme, avoidPath), theme);
	return c.themeSel === themeSlug(theme.name) ? c : {...c, themeSel: themeSlug(theme.name)};
}

/** P81 Remove theme: the parts the theme held go back to the defaults (the user's other settings stay). */
export function removeThemeParts (config: UserConfig, theme: ThemeData): UserConfig {
	let c: UserConfig = {...config, themeSel: ''};
	if (theme.colors) {
		if (theme.colors.theme) c = {...c, theme: DEFAULT_CONFIG.theme};
		if (theme.colors.widget || theme.colors.widgetInk) c = {...c, clock: {...withoutInk(c.clock), color: DEFAULT_CLOCK.color}};
		if (theme.colors.icon) c = {...c, iconColor: DEFAULT_CONFIG.iconColor};
	}
	if (theme.iconStyle) {
		if (theme.iconStyle.style) c = {...c, iconStyle: DEFAULT_CONFIG.iconStyle};
		if (theme.iconStyle.tile) c = {...c, iconLight: DEFAULT_CONFIG.iconLight};
	}
	if (theme.wallpaper && c.wallpaper.path.indexOf(THEME_STORE + '/') === 0) c = {...c, wallpaper: DEFAULT_WALLPAPER};     // P96: only while it is still the theme's own picture
	if (theme.fonts) {
		if (theme.fonts.widget) c = {...c, clock: {...c.clock, font: DEFAULT_CLOCK.font}};
		if (theme.fonts.names) c = {...c, labelFont: DEFAULT_CONFIG.labelFont};
	}
	// a theme's own fonts are gone with it
	if (theme.fonts && theme.fonts.files) {
		const own = theme.fonts.files.map((f) => f.id);
		if (own.indexOf(c.clock.font) !== -1) c = {...c, clock: {...c.clock, font: DEFAULT_CLOCK.font}};
		if (own.indexOf(c.labelFont) !== -1) c = {...c, labelFont: DEFAULT_CONFIG.labelFont};
	}
	if (theme.apps && theme.apps.length) {
		let edits = c.appEdits;
		for (const a of theme.apps) if (a.name && edits[a.id] && edits[a.id].label === a.name) edits = setEdit(edits, a.id, {label: ''});
		c = {...c, appIds: DEFAULT_CONFIG.appIds, tileOrder: DEFAULT_CONFIG.tileOrder, appEdits: edits};
	}
	return c;
}

export interface ThemeMismatch {missingApps: string[]; extraApps: string[]; missingIcons: string[]; extraIcons: string[]}

/** P81: how the theme's app list and icons differ from the apps on this TV (`current` = app ids here). Nothing is compared when the TV's list is empty. */
export function themeMismatch (theme: ThemeData, current: string[]): ThemeMismatch {
	const out: ThemeMismatch = {missingApps: [], extraApps: [], missingIcons: [], extraIcons: []};
	if (!current.length) return out;
	if (theme.apps && theme.apps.length) {
		const ids = theme.apps.map((a) => a.id);
		out.extraApps = ids.filter((id) => current.indexOf(id) === -1);
		out.missingApps = current.filter((id) => ids.indexOf(id) === -1);
	}
	if (theme.icons && theme.icons.length) {
		const ids = theme.icons.map((i) => i.app);
		out.extraIcons = ids.filter((id) => current.indexOf(id) === -1);
		out.missingIcons = current.filter((id) => ids.indexOf(id) === -1);
	}
	return out;
}

/** The pop-up text for a mismatch ('' = none). `titleOf` gives an app's name on this TV. */
export function mismatchText (m: ThemeMismatch, titleOf: (id: string) => string): string {
	const part = (ids: string[], what: string, name: (id: string) => string): string => {
		if (!ids.length) return '';
		const shown = ids.slice(0, 3).map(name).join(', ');
		return tt('themeapply.text', {length: ids.length, what, shown, v: ids.length > 3 ? ', ...' : ''});
	};
	const bits = [
		part(m.extraApps, tt('themeapply.appsOfTheThemeAre'), (id) => id),
		part(m.missingApps, tt('themeapply.appsOnThisTvAre'), titleOf),
		part(m.extraIcons, tt('themeapply.iconsOfTheThemeAre'), (id) => id),
		part(m.missingIcons, tt('themeapply.appsOnThisTvHave'), titleOf)
	].filter(Boolean);
	return bits.join('; ');
}
