// Design tokens: the single source of truth for colour, spacing, type and motion.
// `applyTokens()` exposes them as CSS custom properties so the stylesheet and the
// components read the same values.

import {setRootVars} from '../lib/cssvars';

export type ThemeName = 'black' | 'grey' | 'midnight' | 'forest' | 'teal' | 'graphite';

export interface Colors {
	bg: string; wallpaperStart: string; wallpaperMid: string; wallpaperEnd: string;
	textPrimary: string; textSecondary: string; textMuted: string;
	/** P95a: the widget's ink while its colour is Follow theme (legible on this theme's wallpaper); plain colours win */
	widgetInk: string;
	tileBg: string; tileBgFocus: string; tileBorder: string; tileBorderFocus: string;
	badge: string; badgeText: string; liftShadow: string;
	buttonBorder: string; buttonActiveBg: string; buttonActiveText: string;
	switchTrack: string; switchTrackOn: string; switchKnob: string; switchKnobOn: string;
	danger: string;
	/** dim layer behind Settings, so a wallpaper doesn't fight the text */
	overlay: string;
	pickerBg: string;
	/** W3: sub-menu rows and their edge: the tile colours with 65 % less colour (the home tiles keep theirs) */
	pickerTile: string; pickerTileFocus: string; pickerEdge: string;
	/** Dark mono icon style (P39): the colour of the icon shapes, and the tile background behind them */
	iconInk: string; iconTile: string;
	/** Soft mono (P39c): a muted shape on a slightly lifted tile; Accent mono: the shape in an accent colour; Gradient mono: the shape fades from iconInk down to gradInk */
	softInk: string; softTile: string; accentInk: string; gradInk: string;
	/** r, g, b of the soft fade over the wallpaper */
	scrim: string;
	/** opacity of the shade at the top, middle and bottom of the wallpaper (all 0: the shade is not drawn) */
	scrimTop: string; scrimMid: string; scrimBottom: string;
}

/** OLED black: pure #000 so the pixels are off, with neutral greys on top. */
const BLACK: Colors = {
	bg: '#000000',
	wallpaperStart: '#000000',
	wallpaperMid: '#000000',
	wallpaperEnd: '#000000',
	textPrimary: '#F2F2F2',
	textSecondary: '#A8A8A8',
	textMuted: '#6A6A6A',
	widgetInk: '#F2F2F2',
	tileBg: '#101010',
	tileBgFocus: '#1D1D1D',
	tileBorder: '#2A2A2A',
	tileBorderFocus: '#F2F2F2',
	badge: '#F2F2F2',
	badgeText: '#000000',
	liftShadow: 'rgba(0, 0, 0, 0.8)',
	buttonBorder: '#3A3A3A',
	buttonActiveBg: '#F2F2F2',
	buttonActiveText: '#000000',
	switchTrack: '#333333',
	switchTrackOn: '#F2F2F2',
	switchKnob: '#A8A8A8',
	switchKnobOn: '#000000',
	danger: '#EF7A73',
	overlay: 'rgba(0, 0, 0, 0.58)',
	pickerBg: '#000000',
	pickerTile: '#101010', pickerTileFocus: '#1D1D1D', pickerEdge: '#2A2A2A',
	iconInk: '#B9B9B9', iconTile: '#000000',
	softInk: '#7A7A7A', softTile: '#0A0A0A', accentInk: '#E6E6E6', gradInk: '#6E6E6E',
	scrim: '0, 0, 0', scrimTop: '0.22', scrimMid: '0.08', scrimBottom: '0.5'
};

/** The calm blue-grey look. */
const GREY: Colors = {
	bg: '#101a24',
	wallpaperStart: '#1c2b3a',
	wallpaperMid: '#25384c',
	wallpaperEnd: '#101a24',
	textPrimary: '#F2F5F8',
	textSecondary: '#B9C6D3',
	textMuted: '#7F90A1',
	widgetInk: '#CFE3F5',
	tileBg: '#1a2733',
	tileBgFocus: '#243546',
	tileBorder: '#34485c',
	tileBorderFocus: '#F2F5F8',
	badge: '#F2F5F8',
	badgeText: '#101a24',
	liftShadow: 'rgba(0, 0, 0, 0.6)',
	buttonBorder: '#43586d',
	buttonActiveBg: '#F2F5F8',
	buttonActiveText: '#101a24',
	switchTrack: '#34485c',
	switchTrackOn: '#F2F5F8',
	switchKnob: '#B9C6D3',
	switchKnobOn: '#101a24',
	danger: '#EF7A73',
	overlay: 'rgba(10, 17, 24, 0.52)',
	pickerBg: calm('#0a1118'),
	pickerTile: calm('#1a2733'), pickerTileFocus: calm('#243546'), pickerEdge: calm('#34485c'),
	iconInk: '#B9B9B9', iconTile: '#0f1923',
	softInk: '#6F8294', softTile: '#121e29', accentInk: '#6FB3D9', gradInk: '#617688',
	scrim: '0, 0, 0', scrimTop: '0.22', scrimMid: '0.08', scrimBottom: '0.5'
};

/** #rrggbb as rgba() (8-digit hex is not understood by the web view of older TVs). */
function rgba (hex: string, alpha: number): string {
	return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;
}

/** P46: the thin outline of Settings tabs, groups and rows, and the stronger one of the active tab and the open group (the text colour at 22 % and 70 %). */
function outlineVars (c: Colors): Record<string, string> {
	return {'--color-outline': rgba(c.textPrimary, 0.22), '--color-outline-strong': rgba(c.textPrimary, 0.7)};
}

/** W3: a colour with `calm` (0-1) of its colour taken out, brightness kept (sub-menu panels; "#rrggbb" in, "#rrggbb" out). */
function calm (hex: string, amount: number = 0.4): string {
	const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
	return '#' + c.map((v) => ('0' + Math.round(v + (l - v) * amount).toString(16)).slice(-2)).join('');
}

/** A dark theme from its background, tiles and accent. */
function dark (bg: string, w: [string, string, string], tile: string, focus: string, edge: string, ink: [string, string, string], mono: [string, string, string, string, string, string], widgetInk: string): Colors {
	return {
		bg, wallpaperStart: w[0], wallpaperMid: w[1], wallpaperEnd: w[2],
		textPrimary: ink[0], textSecondary: ink[1], textMuted: ink[2], widgetInk,
		tileBg: tile, tileBgFocus: focus, tileBorder: edge, tileBorderFocus: ink[0],
		badge: ink[0], badgeText: bg, liftShadow: 'rgba(0, 0, 0, 0.6)',
		buttonBorder: edge, buttonActiveBg: ink[0], buttonActiveText: bg,
		switchTrack: edge, switchTrackOn: ink[0], switchKnob: ink[1], switchKnobOn: bg,
		danger: '#EF7A73', overlay: rgba(bg, 0.52), pickerBg: calm(bg), pickerTile: calm(tile), pickerTileFocus: calm(focus), pickerEdge: calm(edge), iconInk: mono[0], iconTile: mono[1], softInk: mono[2], softTile: mono[3], accentInk: mono[4], gradInk: mono[5], scrim: '0, 0, 0', scrimTop: '0.22', scrimMid: '0.08', scrimBottom: '0.5'
	};
}

const SOFT_INK: [string, string, string] = ['#F2F5F8', '#B9C6D3', '#7F90A1'];

export const THEMES: Record<ThemeName, Colors> = {
	black: BLACK,
	grey: GREY,
	midnight: dark('#0a1020', ['#101a36', '#1b2a5c', '#0a1020'], '#121a30', '#1c2848', '#2c3d66', SOFT_INK, ['#B9B9B9', '#070c18', '#6B7AA3', '#0b1122', '#7F9BFF', '#5D6B96'], '#C3CEFF'),
	forest: dark('#0b1a12', ['#12281b', '#1d4030', '#0b1a12'], '#12231a', '#1b3326', '#2d4a3a', ['#F1F6F2', '#B7C9BC', '#7C927F'], ['#B9B9B9', '#08140d', '#6E8A78', '#0c1a12', '#7FD19A', '#607A68'], '#C2EBCF'),
	// P48 (colours are the agent's; the user picked these two themes)
	teal: dark('#08191b', ['#0d2528', '#154447', '#08191b'], '#0f2427', '#183639', '#2a4d50', ['#EFF7F6', '#B5CFCD', '#7B9A98'], ['#B9B9B9', '#061314', '#6B9A97', '#0a1b1d', '#6FD3CC', '#5E8280'], '#A9EFE8'),
	graphite: dark('#17140f', ['#201c15', '#332c20', '#17140f'], '#211d17', '#322b21', '#4a4132', ['#F4EFE6', '#CFC6B6', '#968C7A'], ['#B9B9B9', '#110f0b', '#9A8E78', '#1a1712', '#D9B36C', '#85785F'], '#F0CF8E')
};

export const FONT = {
	family: '"Inter Variable", "Noto Sans Arabic", "LG Smart UI", "Helvetica Neue", Arial, sans-serif',
	rowLabel: 20,
	tileLabel: 19,
	settingsTitle: 40,
	settingsTab: 26,
	settingsButton: 22,
	optionLabel: 26,
	optionDescription: 20,
	toast: 24
} as const;

export const LAYOUT = {
	screenWidth: 1920,
	screenHeight: 1080,
	edgePadding: 140,       // padding of the Settings screens (the home row has its own, adjustable margins)
	headerTop: 84,
	tileSize: 144,          // app / source tiles are square at 100% icon size
	tileGap: 28,
	tileRadius: 24,
	rowLabelGap: 14,        // gap between a row's subheader and its tiles
	rowGap: 28,             // vertical space between rows
	gridTileSize: 112,      // tiles in the Settings grid (Apps, Sources): smaller than on the home row so more fit
	gridColumns: 11         // tiles per line in that grid (11 x (112 + 28) = 1540 px of the 1640 px available)
} as const;

export const MOTION = {
	focusMs: 160,
	scrollMs: 260,
	focusScale: 1.12,
	liftScale: 1.2,         // the tile picked up in the home row's move mode
	unfocusedRowOpacity: 0.55
} as const;

/** The scrim is not drawn at all when all three of its strengths are 0: nothing to paint or blend. */
function scrimDisplay (c: {scrimTop: string; scrimMid: string; scrimBottom: string}): string {
	return Number(c.scrimTop) === 0 && Number(c.scrimMid) === 0 && Number(c.scrimBottom) === 0 ? 'none' : 'block';
}

/** Writes every token onto :root as --color-*, --font-*, --layout-*, --motion-*. */
export function applyTokens (theme: ThemeName = 'black'): void {
	const groups: Record<string, object> = {color: THEMES[theme], font: FONT, layout: LAYOUT, motion: MOTION};
	const vars: Record<string, string> = {};
	for (const group in groups) {
		const values = groups[group] as Record<string, string | number>;
		for (const key in values) {
			const value = values[key];
			const unit = typeof value === 'number' && !/scale|opacity|columns/i.test(key) ? (key.endsWith('Ms') ? 'ms' : 'px') : '';
			vars[`--${group}-${kebab(key)}`] = `${value}${unit}`;
		}
	}
	Object.assign(vars, outlineVars(THEMES[theme]));
	vars['--scrim-display'] = scrimDisplay(THEMES[theme]);
	setRootVars(vars);
}

/** Switch the colour theme at runtime. */
export function applyTheme (theme: ThemeName): void {
	const colors = THEMES[theme] as unknown as Record<string, string>;
	const vars: Record<string, string> = {};
	for (const key in colors) vars[`--color-${kebab(key)}`] = colors[key];
	Object.assign(vars, outlineVars(THEMES[theme]));
	vars['--scrim-display'] = scrimDisplay(THEMES[theme]);
	setRootVars(vars);
}

function kebab (s: string): string {
	return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
