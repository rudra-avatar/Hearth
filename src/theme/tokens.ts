// Design tokens: the single source of truth for colour, spacing, type and motion.
// `applyTokens()` exposes them as CSS custom properties so the stylesheet and the
// components read the same values.
import globalCss from './global.css?raw';

export type ThemeName = 'black' | 'grey' | 'glass';

export interface Colors {
	bg: string; wallpaperStart: string; wallpaperMid: string; wallpaperEnd: string;
	textPrimary: string; textSecondary: string; textMuted: string;
	tileBg: string; tileBgFocus: string; tileBorder: string; tileBorderFocus: string;
	badge: string; badgeText: string; liftShadow: string;
	buttonBorder: string; buttonActiveBg: string; buttonActiveText: string;
	switchTrack: string; switchTrackOn: string; switchKnob: string; switchKnobOn: string;
	danger: string;
	/** dim layer behind Settings, so a wallpaper doesn't fight the text */
	overlay: string;
	pickerBg: string;
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
	overlay: 'rgba(0, 0, 0, 0.88)',
	pickerBg: '#000000'
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
	overlay: 'rgba(10, 17, 24, 0.82)',
	pickerBg: '#0a1118'
};

/** Glass, in the style of the Apple TV home screen: translucent tiles and frosted panels over a deep blue-violet
 *  background. The shapes, blur and motion that go with it are in global.css under :root[data-theme="glass"]. */
const GLASS: Colors = {
	bg: '#0b0d1c',
	wallpaperStart: '#2a2f6b',
	wallpaperMid: '#1a1d45',
	wallpaperEnd: '#07080f',
	textPrimary: '#FFFFFF',
	textSecondary: 'rgba(255, 255, 255, 0.72)',
	textMuted: 'rgba(255, 255, 255, 0.45)',
	tileBg: 'rgba(255, 255, 255, 0.10)',
	tileBgFocus: 'rgba(255, 255, 255, 0.18)',
	tileBorder: 'rgba(255, 255, 255, 0.0)',
	tileBorderFocus: '#FFFFFF',
	badge: '#FFFFFF',
	badgeText: '#0b0d1c',
	liftShadow: 'rgba(0, 0, 0, 0.55)',
	buttonBorder: 'rgba(255, 255, 255, 0.22)',
	buttonActiveBg: '#FFFFFF',
	buttonActiveText: '#0b0d1c',
	switchTrack: 'rgba(255, 255, 255, 0.22)',
	switchTrackOn: '#34C759',
	switchKnob: '#FFFFFF',
	switchKnobOn: '#FFFFFF',
	danger: '#FF6B61',
	overlay: 'rgba(12, 14, 30, 0.45)',
	pickerBg: 'rgba(16, 18, 36, 0.92)'
};

export const THEMES: Record<ThemeName, Colors> = {black: BLACK, grey: GREY, glass: GLASS};

export type GlassTint = 'violet' | 'graphite' | 'midnight' | 'sunset';

/** The Glass theme's colours (Settings → Look → Glass colour): the background gradient and the cards' tint. */
export const GLASS_TINT_COLORS: Record<GlassTint, {label: string; bg: string; start: string; mid: string; end: string; card: string}> = {
	violet:   {label: 'prefs.glassTint.violet',   bg: '#0b0d1c', start: '#2a2f6b', mid: '#1a1d45', end: '#07080f', card: 'rgba(30, 34, 62, 0.42)'},
	graphite: {label: 'prefs.glassTint.graphite', bg: '#0b0c0e', start: '#3a3d44', mid: '#232529', end: '#08090a', card: 'rgba(44, 46, 52, 0.45)'},
	midnight: {label: 'prefs.glassTint.midnight', bg: '#03070d', start: '#123150', mid: '#0a1b30', end: '#02050a', card: 'rgba(16, 36, 60, 0.45)'},
	sunset:   {label: 'prefs.glassTint.sunset',   bg: '#0d0812', start: '#7a3550', mid: '#3c1f42', end: '#0a0610', card: 'rgba(62, 30, 56, 0.42)'}
};

/** Colours for `theme`, with the Glass tint applied. */
function colorsFor (theme: ThemeName, tint: GlassTint): Colors {
	if (theme !== 'glass') return THEMES[theme];
	const t = GLASS_TINT_COLORS[tint] || GLASS_TINT_COLORS.violet;
	return {...THEMES.glass, bg: t.bg, wallpaperStart: t.start, wallpaperMid: t.mid, wallpaperEnd: t.end};
}

/** Glass card tint and the "reduce effects" switch, as attributes and a custom property on :root. */
function applyExtras (tint: GlassTint, reduced: boolean, root: HTMLElement): void {
	root.style.setProperty('--glass-card', (GLASS_TINT_COLORS[tint] || GLASS_TINT_COLORS.violet).card);
	if (reduced) root.setAttribute('data-effects', 'reduced'); else root.removeAttribute('data-effects');
}

export const FONT = {
	family: '"Inter Variable", "LG Smart UI", "Helvetica Neue", Arial, sans-serif',
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
	gridColumns: 9          // settings picker grid
} as const;

export const MOTION = {
	focusMs: 160,
	scrollMs: 260,
	focusScale: 1.12,
	liftScale: 1.2,         // a tile picked up in re-order mode
	unfocusedRowOpacity: 0.55
} as const;

/** Writes every token onto :root as --color-*, --font-*, --layout-*, --motion-*. */
export function applyTokens (theme: ThemeName = 'black', root: HTMLElement = document.documentElement, tint: GlassTint = 'violet', reduced = false): void {
	root.setAttribute('data-theme', theme);
	applyExtras(tint, reduced, root);
	const groups: Record<string, object> = {color: colorsFor(theme, tint), font: FONT, layout: LAYOUT, motion: MOTION};
	for (const group in groups) {
		const values = groups[group] as Record<string, string | number>;
		for (const key in values) {
			const value = values[key];
			const unit = typeof value === 'number' && !/scale|opacity|columns/i.test(key) ? (key.endsWith('Ms') ? 'ms' : 'px') : '';
			setVar(root, `--${group}-${kebab(key)}`, `${value}${unit}`);
		}
	}
}

/** Switch the colour theme at runtime. */
export function applyTheme (theme: ThemeName, root: HTMLElement = document.documentElement, tint: GlassTint = 'violet', reduced = false): void {
	root.setAttribute('data-theme', theme);     // global.css changes shapes and motion per theme (glass)
	applyExtras(tint, reduced, root);
	const colors = colorsFor(theme, tint) as unknown as Record<string, string>;
	for (const key in colors) setVar(root, `--color-${kebab(key)}`, colors[key]);
	refreshVarFallback();
}

const SUPPORTS_VARS = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('--a', '0');
const varValues: Record<string, string> = {};

function setVar (root: HTMLElement, name: string, value: string): void {
	root.style.setProperty(name, value);
	varValues[name] = value;
}

function refreshVarFallback (): void {
	if (SUPPORTS_VARS) return;
	let style = document.getElementById('css-var-fallback');
	if (!style) {
		style = document.createElement('style');
		style.id = 'css-var-fallback';
		document.head.appendChild(style);
	}
	style.textContent = globalCss.replace(/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
		(whole, name: string, fallback?: string) => varValues[name] ?? (fallback !== undefined ? fallback.trim() : whole));
}

function kebab (s: string): string {
	return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
