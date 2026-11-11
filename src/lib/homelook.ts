// p23b: how the home rows look, in one place: the real Home screen and the Settings home preview (components/HomePreview.tsx) both
// build their row sizes, CSS variables and class names here, so the preview can never drift from the real screen.
import {labelColorValue} from './clockcolor';
import {fontFamily, type ClockFont} from './clockfont';
import {varScope} from './cssvars';
import {FONT, LAYOUT} from '../theme/tokens';
import type {Appearance} from '../screens/Home';

/** Tile size and gap in px at 1080p (the icon size and spacing settings applied). */
export function tileSizes (a: Pick<Appearance, 'iconScale' | 'iconGap'>): {tileSize: number; tileGap: number} {
	const scale = a.iconScale / 100;
	return {tileSize: Math.round(LAYOUT.tileSize * scale), tileGap: Math.round(LAYOUT.tileGap * scale * a.iconGap / 100)};
}

/** The CSS variables of the rows (the home row's own scope, not :root). */
export function rowsScope (a: Appearance) {
	const scale = a.iconScale / 100;
	const {tileSize, tileGap} = tileSizes(a);
	return varScope('rows', {
		'--icon-opacity': String(a.iconOpacity / 100),
		'--label-color': labelColorValue(a.labelColor) || undefined,
		'--layout-tile-size': `${tileSize}px`,
		'--layout-tile-gap': `${tileGap}px`,
		'--layout-tile-radius': `${Math.round(LAYOUT.tileRadius * scale)}px`,
		'--font-tile-label': `${Math.min(30, Math.max(13, Math.round(FONT.tileLabel * scale * a.labelSize / 100)))}px`,
		'--label-font': a.labelFont === 'default' ? undefined : fontFamily(a.labelFont as ClockFont),
		'--label-weight': a.labelWeight === 400 ? undefined : String(a.labelWeight)
	});
}

export interface RowsState {
	/** more than one row */
	multi: boolean;
	/** how many favourites head the list (0 = none) */
	favN: number;
	/** the second row of a favourites list is open */
	open: boolean;
	/** the second row was open once and is shut again */
	shut: boolean;
	quiet: boolean;
}

/** The class list of the `.rows` box. `scopeClass` is the class `rowsScope` returned (legacy bundle), or ''. */
export function rowsClasses (a: Appearance, s: RowsState, scopeClass: string): string {
	return [scopeClass, 'rows', !a.showLabels && 'rows--no-labels', s.multi && 'rows--multi', s.favN > 0 && 'rows--fav', s.favN > 0 && s.open && 'rows--fav-open', s.favN > 0 && !s.open && s.shut && 'rows--fav-shut', a.iconOpacity < 100 && 'rows--dim', s.quiet && 'rows--quiet', labelColorValue(a.labelColor) && 'rows--label-color', a.labelFont !== 'default' && 'rows--label-font', a.labelWeight !== 400 && 'rows--label-weight', a.tileShape !== 'rounded' && `rows--shape-${a.tileShape}`].filter(Boolean).join(' ');
}

/** Inline position of the `.rows` box: side margins (the favourites row has its own), bottom margin, then the scope's variables. */
export function rowsStyle (a: Appearance, favN: number, open: boolean, scopeCss: string): string {
	const bottom = favN > 0 && !open ? a.favBottomMargin : a.bottomMargin;
	return [`left:${favN > 0 ? 0 : a.sideMargin}px`, `right:${favN > 0 ? 0 : a.sideMargin}px`, `bottom:${bottom}px`, scopeCss].filter(Boolean).join(';');
}

/** Side margin of row `r` (the first row of a favourites list has its own). */
export function rowSide (a: Appearance, favN: number, r: number): number {
	return favN > 0 && r === 0 ? a.favSideMargin : a.sideMargin;
}
