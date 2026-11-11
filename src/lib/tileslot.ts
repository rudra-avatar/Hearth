// Which home-row tile (row number, column number) holds a DOM node? Walks up to the `.tile`, then reads its place from the markup
// section.row > .row__viewport > .row__track > .tile, inside `.rows`. No data attributes: a tile that moves keeps no stale number.
// Plain DOM only (no `closest`: the legacy bundle runs on Chromium 38).

export interface Slot {row: number; col: number}

interface Nodeish {
	classList?: {contains: (name: string) => boolean};
	parentNode?: Nodeish | null;
	children?: ArrayLike<Nodeish>;
}

const has = (n: Nodeish | null | undefined, name: string): boolean => !!n && !!n.classList && n.classList.contains(name);
const indexIn = (parent: Nodeish | null | undefined, child: Nodeish): number => {
	const list = parent && parent.children;
	if (!list) return -1;
	for (let i = 0; i < list.length; i++) if (list[i] === child) return i;
	return -1;
};

export function tileSlot(node: unknown): Slot | null {
	let n = node as Nodeish | null | undefined;
	while (n && !has(n, 'tile')) n = n.parentNode;
	if (!n) return null;
	const track = n.parentNode;
	const viewport = track && track.parentNode;
	const section = viewport && viewport.parentNode;
	const rows = section && section.parentNode;
	if (!has(track, 'row__track') || !has(viewport, 'row__viewport') || !has(section, 'row') || !has(rows, 'rows')) return null;
	const col = indexIn(track, n);
	const row = indexIn(rows, section as Nodeish);
	return col < 0 || row < 0 ? null : {row, col};
}
