// The typefaces the clock can use. All but "TV font" are bundled with the launcher (so they look the
// same on every TV and webOS version); "TV font" is whatever the TV's own web view uses for its UI.

import {t} from './i18n';

export type ClockFont = 'inter' | 'tv' | 'poppins' | 'oswald' | 'mono' | 'serif';

export interface ClockFontInfo {
	id: ClockFont;
	label: string;
	/** CSS font-family list, with fallbacks for while a font loads or if it is missing */
	family: string;
}

export const CLOCK_FONTS: readonly ClockFontInfo[] = [
	{id: 'inter', label: 'font.inter', family: '"Inter Variable", "LG Smart UI", "Helvetica Neue", Arial, sans-serif'},
	{id: 'tv', label: 'font.tv', family: '"LG Smart UI", "Helvetica Neue", Helvetica, Arial, sans-serif'},
	{id: 'poppins', label: 'font.poppins', family: '"Poppins", "Helvetica Neue", Arial, sans-serif'},
	{id: 'oswald', label: 'font.oswald', family: '"Oswald", "Arial Narrow", Arial, sans-serif'},
	{id: 'mono', label: 'font.mono', family: '"Roboto Mono", "Courier New", monospace'},
	{id: 'serif', label: 'font.serif', family: '"Cormorant Garamond", Georgia, "Times New Roman", serif'}
];

export const CLOCK_FONT_IDS: readonly ClockFont[] = CLOCK_FONTS.map((f) => f.id);

export function fontFamily (id: ClockFont): string {
	for (const f of CLOCK_FONTS) if (f.id === id) return f.family;
	return CLOCK_FONTS[0].family;
}

export function fontLabel (id: ClockFont): string {
	for (const f of CLOCK_FONTS) if (f.id === id) return t(f.label);
	return t(CLOCK_FONTS[0].label);
}
