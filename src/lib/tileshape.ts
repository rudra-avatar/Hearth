import {td} from '../i18n';
/** Shapes of the home-row icons. Each is only a border-radius (see `.rows--shape-*` in global.css), so it costs nothing. */
export const TILE_SHAPES: {id: string}[] = [
	{id: 'rounded'},
	{id: 'square'},
	{id: 'squircle'},
	{id: 'circle'},
	{id: 'leaf'},
	{id: 'arch'},
	{id: 'drop'}
];
export const TILE_SHAPE_IDS: string[] = TILE_SHAPES.map((s) => s.id);

export function tileShapeText (id: string): string {
	const s = TILE_SHAPES.filter((x) => x.id === id)[0];
	return td('shape.' + (s ? s.id : TILE_SHAPES[0].id));
}
