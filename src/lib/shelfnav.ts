// Moving between the home row and the PlxNative shelves below it (screens/Home.tsx): the pure part, so it can be tested.
// Zone 0 is the home row(s), unchanged. Zones 1..n are the shelves. With favourites set, zone n+1 is the row of all the
// other apps, which then sits below the shelves (user 2026-11-12: Down goes favourites, shelves, all apps).

export type ShelfKey = 'left' | 'right' | 'up' | 'down' | 'back';

export interface ShelfLayout {
	/** how many shelves show (only the ones that are on and have items) */
	nShelves: number;
	/** items on each shelf */
	lens: number[];
	/** the all-apps row sits below the shelves (favourites set, shelves showing, apps beyond the favourites) */
	tailApps: boolean;
	/** apps in that row */
	tailLen: number;
}

export interface ShelfNav {
	zone: number;
	/** the highlighted item on each shelf (kept while moving between shelves) */
	sel: number[];
	/** the highlighted app in the all-apps row below the shelves */
	tailCol: number;
}

export const START_NAV: ShelfNav = {zone: 0, sel: [], tailCol: 0};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function shelfLayout (favN: number, itemCount: number, lens: number[]): ShelfLayout {
	const nShelves = lens.length;
	return {nShelves, lens, tailApps: favN > 0 && nShelves > 0 && itemCount > favN, tailLen: Math.max(0, itemCount - favN)};
}

export function maxZone (l: ShelfLayout): number {
	return l.nShelves + (l.tailApps ? 1 : 0);
}

/** The highlighted item on shelf `s` (0-based), kept inside the shelf. */
export function selectedOn (nav: ShelfNav, l: ShelfLayout, s: number): number {
	return clamp(nav.sel[s] || 0, 0, Math.max(0, (l.lens[s] || 0) - 1));
}

/** The navigation as it can be shown now: a zone that no longer exists (a shelf emptied, switched off) goes back home. */
export function clampNav (nav: ShelfNav, l: ShelfLayout): ShelfNav {
	const zone = nav.zone > maxZone(l) || nav.zone < 0 ? 0 : nav.zone;
	const tailCol = clamp(nav.tailCol, 0, Math.max(0, l.tailLen - 1));
	return zone === nav.zone && tailCol === nav.tailCol ? nav : {...nav, zone, tailCol};
}

/** Does Down from the home row go to the first shelf? With favourites: from the favourites row (the all-apps row comes after the
 *  shelves). Without: from the last home row only. Never when no shelf shows. */
export function entersShelves (l: ShelfLayout, favN: number, onLastRow: boolean): boolean {
	return l.nShelves > 0 && (favN > 0 || onLastRow);
}

/** A key on a shelf or on the all-apps row below them (zone > 0). Left/right stop at the ends; Up goes back towards the home row;
 *  Down stops at the last zone; Back goes straight home (the next Back opens Recent apps, as before). */
export function shelfStep (nav: ShelfNav, l: ShelfLayout, key: ShelfKey): ShelfNav {
	const z = nav.zone;
	if (z <= 0) return nav;
	if (key === 'back') return {...nav, zone: 0};
	if (key === 'up') return {...nav, zone: z - 1};
	if (key === 'down') return z < maxZone(l) ? {...nav, zone: z + 1} : nav;
	const dir = key === 'left' ? -1 : 1;
	if (z <= l.nShelves) {
		const sel = nav.sel.slice();
		sel[z - 1] = clamp(selectedOn(nav, l, z - 1) + dir, 0, Math.max(0, l.lens[z - 1] - 1));
		return {...nav, sel};
	}
	return {...nav, tailCol: clamp(nav.tailCol + dir, 0, Math.max(0, l.tailLen - 1))};
}

/** The pointer rests on item `index` of zone `zone` (a shelf or the all-apps row). */
export function pointAt (nav: ShelfNav, l: ShelfLayout, zone: number, index: number): ShelfNav {
	if (zone <= 0 || zone > maxZone(l)) return nav;
	if (zone <= l.nShelves) { const sel = nav.sel.slice(); sel[zone - 1] = clamp(index, 0, Math.max(0, l.lens[zone - 1] - 1)); return {...nav, zone, sel}; }
	return {...nav, zone, tailCol: clamp(index, 0, Math.max(0, l.tailLen - 1))};
}

export interface LiftMeasure {
	/** top of the home row(s) on the stage (layout px) */
	rowsTop: number;
	/** height of the whole shelves block below the screen */
	shelvesHeight: number;
	/** top and height of the focused shelf (or all-apps row) inside the shelves block */
	sectionTop: number;
	sectionHeight: number;
}

/** How far the stage slides up (px): enough to bring the home row near the top (48 px) while the shelves fit, and always enough to
 *  show the focused shelf whole with 24 px below it; never more than the shelves need. 0 at home. */
export function shelfLift (zone: number, m: LiftMeasure): number {
	if (zone <= 0) return 0;
	const base = Math.min(m.rowsTop - 48, m.shelvesHeight + 24);
	const need = m.sectionTop + m.sectionHeight + 24;
	return Math.max(0, Math.round(Math.max(base, need)));
}
