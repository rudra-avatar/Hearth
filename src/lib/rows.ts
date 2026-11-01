// The home screen's apps in one row or two, and moving the highlight around them.
// Pure functions (no UI), so they can be tested on their own.

export type Direction = 'left' | 'right' | 'up' | 'down';

/** How many tiles go in each row: one row takes everything; two rows split the tiles in half (the top row gets the extra one). */
export function splitRows (count: number, rows: number): number[] {
	if (rows < 2 || count < 2) return [count];
	const first = Math.ceil(count / 2);
	return [first, count - first];
}

/** Index of each row's first tile in the full list. */
export function rowOffsets (sizes: number[]): number[] {
	let sum = 0;
	return sizes.map((size) => { const start = sum; sum += size; return start; });
}

/** Which row has the highlight, and the column last highlighted in each row. */
export interface RowsPosition {
	row: number;
	cols: number[];
}

export function initialPosition (): RowsPosition {
	return {row: 0, cols: [0, 0]};
}

/** The position made valid for rows of these sizes (after the number of tiles or rows changed). */
export function clampPosition (sizes: number[], position: RowsPosition): RowsPosition {
	const row = Math.min(Math.max(0, position.row), Math.max(0, sizes.length - 1));
	const cols = sizes.map((size, r) => Math.min(Math.max(0, position.cols[r] || 0), Math.max(0, size - 1)));
	return {row, cols: cols.length ? cols : [0]};
}

/** The position with the highlight on the tile at `index` of the whole list (the other rows keep their column from `from`),
 *  or null when there is no such tile. (PR #20, Obednal97) */
export function positionOf (sizes: number[], index: number, from: RowsPosition): RowsPosition | null {
	const offsets = rowOffsets(sizes);
	const total = sizes.reduce((sum, size) => sum + size, 0);
	if (index < 0 || index >= total) return null;
	let row = 0;
	while (row < sizes.length - 1 && index >= offsets[row] + sizes[row]) row++;
	return {row, cols: clampPosition(sizes, from).cols.map((c, r) => (r === row ? index - offsets[row] : c))};
}

/** Left and right move along the row and loop round at its ends (right on the last tile goes to the first, left on the first to the last); up and down change row, keeping the same column where there is one. */
export function movePosition (sizes: number[], position: RowsPosition, direction: Direction): RowsPosition {
	const at = clampPosition(sizes, position);
	const cols = at.cols.slice();
	let row = at.row;
	if (direction === 'left') {
		cols[row] = cols[row] > 0 ? cols[row] - 1 : Math.max(0, sizes[row] - 1);
	} else if (direction === 'right') {
		cols[row] = cols[row] < sizes[row] - 1 ? cols[row] + 1 : 0;
	} else {
		const target = direction === 'up' ? row - 1 : row + 1;
		if (target >= 0 && target < sizes.length) {
			cols[target] = Math.max(0, Math.min(cols[row], sizes[target] - 1));
			row = target;
		}
	}
	return {row, cols};
}

/** Favourites mode: the favourite tiles first, then every other tile, each group in its own order.
 *  `favourites` is the number of favourite tiles at the start of the returned list; 0 means no favourites row. */
export function favouriteSplit<T> (items: T[], keyOf: (item: T) => string, favourites: string[]): {list: T[]; favourites: number} {
	if (favourites.length === 0) return {list: items, favourites: 0};
	const isFav: Record<string, boolean> = {};
	favourites.forEach((k) => { isFav[k] = true; });
	const favs = items.filter((item) => isFav[keyOf(item)]);
	if (favs.length === 0) return {list: items, favourites: 0};
	return {list: favs.concat(items.filter((item) => !isFav[keyOf(item)])), favourites: favs.length};
}

/** Row sizes in favourites mode: the favourites row alone, or (opened with Down) the favourites row above one row of everything else. */
export function favouriteSizes (favourites: number, total: number, open: boolean): number[] {
	return open && total > favourites ? [favourites, total - favourites] : [favourites];
}
