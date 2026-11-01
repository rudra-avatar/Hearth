// The typefaces the clock can use. All but "TV font" are bundled with the launcher (so they look the
// same on every TV and webOS version); "TV font" is whatever the TV's own web view uses for its UI.

export type BuiltinFont = 'inter' | 'tv' | 'poppins' | 'oswald' | 'mono' | 'serif' | 'outfit' | 'worksans' | 'bricolage' | 'bigshoulders' | 'jura' | 'tektur' | 'jetbrains' | 'lora' | 'poiret' | 'pixelify' | 'nunito' | 'montserrat' | 'jost' | 'raleway' | 'playfair' | 'bebas' | 'bevan' | 'alfaslab' | 'greatvibes' | 'pinyon' | 'kaushan';
/** a built-in id, or (P80) the id of a font carried by the loaded theme */
export type ClockFont = string;

export interface ClockFontInfo {
	id: ClockFont;
	label: string;
	/** CSS font-family list, with fallbacks for while a font loads or if it is missing */
	family: string;
}

export const BUILTIN_FONTS: readonly ClockFontInfo[] = [
	{id: 'inter', label: 'Inter (default)', family: '"Inter Variable", "LG Smart UI", "Helvetica Neue", Arial, sans-serif'},
	{id: 'tv', label: 'TV font', family: '"LG Smart UI", "Helvetica Neue", Helvetica, Arial, sans-serif'},
	{id: 'poppins', label: 'Poppins (rounded)', family: '"Poppins", "Helvetica Neue", Arial, sans-serif'},
	{id: 'oswald', label: 'Oswald (tall, narrow)', family: '"Oswald", "Arial Narrow", Arial, sans-serif'},
	{id: 'mono', label: 'Roboto Mono (digital)', family: '"Roboto Mono", "Courier New", monospace'},
	{id: 'serif', label: 'Cormorant (elegant serif)', family: '"Cormorant Garamond", Georgia, "Times New Roman", serif'},
	{id: 'outfit', label: 'Outfit (geometric)', family: '"Outfit", "Helvetica Neue", Arial, sans-serif'},
	{id: 'worksans', label: 'Work Sans (clean)', family: '"Work Sans", "Helvetica Neue", Arial, sans-serif'},
	{id: 'bricolage', label: 'Bricolage Grotesque (quirky)', family: '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif'},
	{id: 'bigshoulders', label: 'Big Shoulders (tall, condensed)', family: '"Big Shoulders", "Arial Narrow", Arial, sans-serif'},
	{id: 'jura', label: 'Jura (techno)', family: '"Jura", "Helvetica Neue", Arial, sans-serif'},
	{id: 'tektur', label: 'Tektur (futuristic)', family: '"Tektur", "Helvetica Neue", Arial, sans-serif'},
	{id: 'jetbrains', label: 'JetBrains Mono (code)', family: '"JetBrains Mono", "Courier New", monospace'},
	{id: 'lora', label: 'Lora (classic serif)', family: '"Lora", Georgia, "Times New Roman", serif'},
	{id: 'poiret', label: 'Poiret One (art deco)', family: '"Poiret One", "Helvetica Neue", Arial, sans-serif'},
	{id: 'pixelify', label: 'Pixelify Sans (pixel)', family: '"Pixelify Sans", "Courier New", monospace'},
	{id: 'nunito', label: 'Nunito (rounded, bold)', family: '"Nunito", "Inter Variable", "Helvetica Neue", Arial, sans-serif'},
	{id: 'montserrat', label: 'Montserrat (minimal sans)', family: '"Montserrat", "Helvetica Neue", Arial, sans-serif'},
	{id: 'jost', label: 'Jost (geometric sans)', family: '"Jost", "Helvetica Neue", Arial, sans-serif'},
	{id: 'raleway', label: 'Raleway (hairline sans)', family: '"Raleway", "Helvetica Neue", Arial, sans-serif'},
	{id: 'playfair', label: 'Playfair Display (classic serif)', family: '"Playfair Display", Georgia, \"Times New Roman\", serif'},
	{id: 'bebas', label: 'Bebas Neue (bold display)', family: '"Bebas Neue", Impact, \"Arial Narrow\", Arial, sans-serif'},
	{id: 'bevan', label: 'Bevan (slab serif)', family: '"Bevan", Georgia, \"Times New Roman\", serif'},
	{id: 'alfaslab', label: 'Alfa Slab One (heavy slab)', family: '"Alfa Slab One", Georgia, \"Times New Roman\", serif'},
	{id: 'greatvibes', label: 'Great Vibes (elegant script)', family: '"Great Vibes", \"Brush Script MT\", cursive'},
	{id: 'pinyon', label: 'Pinyon Script (copperplate script)', family: '"Pinyon Script", \"Brush Script MT\", cursive'},
	{id: 'kaushan', label: 'Kaushan Script (brush script)', family: '"Kaushan Script", \"Brush Script MT\", cursive'}
];

export const BUILTIN_FONT_IDS: readonly string[] = BUILTIN_FONTS.map((f) => f.id);

// P80: the fonts of the loaded theme are added to these two lists in place (so every holder of the lists sees them);
// no theme = exactly the built-in fonts.
export const CLOCK_FONTS: ClockFontInfo[] = BUILTIN_FONTS.slice();
export const CLOCK_FONT_IDS: ClockFont[] = BUILTIN_FONT_IDS.slice();
/** the Name font choices: Default + every font (kept in step with CLOCK_FONT_IDS) */
export const LABEL_FONT_IDS: string[] = ['default'].concat(BUILTIN_FONT_IDS);
export const THEME_FONT_PREFIX = 'Hearth Theme ';
/** the loaded theme (localStorage, written by lib/theme.ts) */
export const THEME_STORE_KEY = 'hearth-theme-v1';
/** P81: just the theme's font ids and labels (small, read at start-up instead of the whole theme) */
export const THEME_FONTS_KEY = 'hearth-theme-fonts-v1';

/** Replaces the theme's fonts in the lists (none = removes them). Built-in ids are never touched. */
export function setThemeFonts (list: {id: string; label: string}[]): void {
	CLOCK_FONTS.length = BUILTIN_FONTS.length;
	CLOCK_FONT_IDS.length = BUILTIN_FONT_IDS.length;
	LABEL_FONT_IDS.length = BUILTIN_FONT_IDS.length + 1;
	for (const f of list) {
		if (BUILTIN_FONT_IDS.indexOf(f.id) !== -1 || f.id === 'default' || CLOCK_FONT_IDS.indexOf(f.id) !== -1) continue;
		CLOCK_FONTS.push({id: f.id, label: f.label, family: `"${THEME_FONT_PREFIX}${f.id}", "Inter Variable", "LG Smart UI", Arial, sans-serif`});
		CLOCK_FONT_IDS.push(f.id);
		LABEL_FONT_IDS.push(f.id);
	}
}

/** Is this font id one of the loaded theme's fonts (not a built-in one)? */
export const isThemeFont = (id: string): boolean => CLOCK_FONT_IDS.indexOf(id) !== -1 && BUILTIN_FONT_IDS.indexOf(id) === -1;

/** Start-up: puts the kept theme's font names back in the lists, so a saved font id still reads right. Costs one small read, and only when a theme was loaded. */
export function restoreThemeFonts (): void {
	try {
		const raw = localStorage.getItem(THEME_FONTS_KEY);
		if (!raw) return;
		const files = JSON.parse(raw);
		if (Array.isArray(files)) setThemeFonts(files.filter((f: {id?: unknown}) => f && typeof f.id === 'string').map((f: {id: string; label?: unknown}) => ({id: f.id, label: typeof f.label === 'string' ? f.label : f.id})));
	} catch (e) { /* no theme fonts */ }
}

/** LA3: the bundled Arabic font is inserted before the final generic family, so Arabic weekday/month names have glyphs in every typeface. */
const withArabic = (family: string): string => {
	const at = family.lastIndexOf(',');
	return at < 0 || family.indexOf('Noto Sans Arabic') >= 0 ? family : family.slice(0, at) + ', "Noto Sans Arabic"' + family.slice(at);
};

export function fontFamily (id: ClockFont): string {
	for (const f of CLOCK_FONTS) if (f.id === id) return withArabic(f.family);
	return withArabic(CLOCK_FONTS[0].family);
}

export function fontLabel (id: ClockFont): string {
	for (const f of CLOCK_FONTS) if (f.id === id) return f.label;
	return CLOCK_FONTS[0].label;
}
