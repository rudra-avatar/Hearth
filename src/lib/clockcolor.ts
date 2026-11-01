import {t as tt, td} from '../i18n';
// The colours the clock, date and weather can have (Settings → Widget → Widget colour), also the plain colours offered for
// the icon colour and the names. 'theme' = the theme's own text colour. The light ones suit dark backgrounds; the dark ones
// stay readable on light pictures. (P77: the widget gradients Ember, Ocean and Dusk were removed.)

export type ClockColor = 'theme' | 'white' | 'warm' | 'blue' | 'amber' | 'grey' | 'charcoal' | 'black';

export interface ClockColorInfo {
	id: ClockColor;
	label: string;
	/** a plain colour; none for 'theme' (the text keeps the theme's own colour) */
	color?: string;
	/** a dark colour: the soft shadow behind it is light instead of dark */
	dark?: boolean;
}

export const CLOCK_COLORS: readonly Omit<ClockColorInfo, 'label'>[] = [
	{id: 'theme'},
	{id: 'white', color: '#F2F2F2'},
	{id: 'warm', color: '#FFE9C7'},
	{id: 'blue', color: '#C4E2FF'},
	{id: 'amber', color: '#FFB74D'},
	{id: 'grey', color: '#9AA0A6'},
	{id: 'charcoal', color: '#3C4043', dark: true},
	{id: 'black', color: '#0A0A0A', dark: true}
];

export const CLOCK_COLOR_IDS: readonly ClockColor[] = CLOCK_COLORS.map((c) => c.id);

export function colorInfo (id: ClockColor): ClockColorInfo {
	for (const c of CLOCK_COLORS) if (c.id === id) return {...c, label: td(`color.${c.id}`)};
	return {...CLOCK_COLORS[1], label: td(`color.${CLOCK_COLORS[1].id}`)};
}

/** Saved widget gradients (removed in P77) become the nearest plain colour. */
export const REMOVED_CLOCK_COLORS: Record<string, ClockColor> = {ember: 'amber', ocean: 'blue', dusk: 'warm'};

/** The plain colours (no 'theme'): the choices of the icon colour row. */
export const PLAIN_COLOR_IDS: readonly string[] = CLOCK_COLORS.filter((c) => !!c.color).map((c) => c.id);

/** The icon colours offered: on the Dark tile the two dark colours are left out (their shapes would vanish); the Light tile offers all. */
export function iconColorValues (light: boolean): readonly string[] {
	return light ? LABEL_COLOR_IDS : LABEL_COLOR_IDS.filter((id) => id === 'theme' || !colorInfo(id as ClockColor).dark);
}

/** A saved dark colour stays saved but reads as Follow theme while the Dark tile is on. */
export function iconColorEffective (id: string, light: boolean): string {
	return iconColorValues(light).indexOf(id) === -1 ? 'theme' : id;
}

/** The text of an icon colour (Follow theme, or the colour's name). */
export function iconColorText (id: string): string {
	return colorInfo(id as ClockColor).label;
}

/** The colours the names under the home row's icons can have: the theme's own, or one of the plain colours above. */
export const LABEL_COLOR_IDS: readonly string[] = ['theme'].concat(CLOCK_COLORS.filter((c) => !!c.color).map((c) => c.id));

export function labelColorText (id: string): string {
	return id === 'theme' ? tt('clockcolor.theThemeSOwn') : colorInfo(id as ClockColor).label;
}

export function labelColorValue (id: string): string | null {
	return id === 'theme' ? null : colorInfo(id as ClockColor).color || null;
}

/** P77: the theme variables the icon colour overrides (the shape colour of Dark, Soft, Accent and Gradient mono; the gradient
 *  fades to a darker shade of the same colour). null = Follow theme. */
export function iconInkVars (id: string, light: boolean): Record<string, string> | null {
	const hex = iconColorEffective(id, light) === 'theme' ? null : colorInfo(id as ClockColor).color;
	if (!hex) return null;
	const n = parseInt(hex.slice(1), 16);
	const dim = (v: number) => Math.round(v * 0.55);
	const low = `rgb(${dim((n >> 16) & 255)}, ${dim((n >> 8) & 255)}, ${dim(n & 255)})`;
	return {'--color-icon-ink': hex, '--color-soft-ink': hex, '--color-accent-ink': hex, '--color-grad-ink': low};
}

/** P100: a theme's own widget ink: '#RRGGBB' (six hex digits), else undefined. */
export function validInk (v: unknown): string | undefined {
	return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : undefined;
}

/** P100: a dark ink: the soft shadow behind it is light instead of dark (same meaning as `ClockColorInfo.dark`). */
export function inkIsDark (hex: string): boolean {
	const n = parseInt(hex.slice(1), 16);
	return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
}

/** P100: the widget settings without a theme's own ink (any change of the Widget colour row drops it). */
export function withoutInk<T extends {ink?: string}> (clock: T): T {
	if (!clock.ink) return clock;
	const out = {...clock};
	delete out.ink;
	return out;
}
