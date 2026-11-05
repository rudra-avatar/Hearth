import {useLayoutEffect, useRef} from 'preact/hooks';
import {LAYOUT} from '../theme/tokens';
import {clamp} from '../hooks/useKeys';
import {Tile, type TileModel} from './Tile';
import {hoverMayselect} from '../lib/pointer';
import {t as tt} from '../i18n';

interface Props {
	label?: string;
	items: TileModel[];
	focused: boolean;
	selected: number;
	emptyText?: string;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
	/** tile size and gap in px, and the width the row has to fit in; the CSS must use the same sizes */
	tileSize?: number;
	tileGap?: number;
	viewportWidth?: number;
	/** left and right margin of this row, px (the favourites row has its own); undefined: the container's */
	sideMargin?: number;
	/** move mode: the key of the picked-up tile (it is lifted and shows arrows, the other tiles show no highlight) */
	liftedKey?: string | null;
	arrows?: {left: boolean; right: boolean};
}

/** 2.0.3 U2: the length of the glide in move mode (CSS `.hearth-move .row__track` uses the same time). */
const MOVE_MS = 150;

/** The sideways shift a tile has right now (a glide may still be running). */
function shiftNow (el: HTMLElement): number {
	const m = /matrix(3d)?\(([^)]+)\)/.exec(window.getComputedStyle(el).transform || '');
	if (!m) return 0;
	const v = m[2].split(',');
	return parseFloat(m[1] ? v[12] : v[4]) || 0;
}

/** Horizontal strip of tiles. Centred when it fits; otherwise a carousel that keeps
 *  the selected tile in the middle (clamped at the ends). */
export function Row ({label, items, focused, selected, emptyText, onSelect, onActivate, tileSize = LAYOUT.tileSize, tileGap = LAYOUT.tileGap, viewportWidth = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding, sideMargin, liftedKey, arrows}: Props) {
	const step = tileSize + tileGap;
	const total = items.length * step - tileGap;
	const fits = total <= viewportWidth;
	const offset = fits ? 0 : clamp(selected * step + tileSize / 2 - viewportWidth / 2, 0, total - viewportWidth);

	// Steps that follow each other quickly (a held arrow key) glide with a short linear move instead of
	// restarting the usual ease-out curve every time.
	const last = useRef({selected, at: 0, fast: false});
	const trackRef = useRef<HTMLDivElement>(null);
	const slots = useRef<Record<string, number>>({});
	if (last.current.selected !== selected) {
		const now = Date.now();
		last.current = {selected, at: now, fast: now - last.current.at < 280};
	}

	// Move mode (U2): the tile order changes at once, so the two tiles that swapped places start from their old place and glide
	// to the new one together with the track (the picked-up tile therefore stays where it is on the screen). Only these two
	// tiles get a style, and it is removed again afterwards.
	useLayoutEffect(() => {
		const before = slots.current;
		const now: Record<string, number> = {};
		items.forEach((item, i) => { now[item.key] = i; });
		slots.current = now;
		const track = trackRef.current;
		if (!liftedKey || !track) return;
		const moved: Array<[HTMLElement, number]> = [];
		for (let i = 0; i < items.length; i++) {
			const was = before[items[i].key];
			const el = track.children[i] as HTMLElement | undefined;
			if (el && was !== undefined && was !== i) moved.push([el, shiftNow(el) + (was - i) * step]);
		}
		if (!moved.length) return;
		moved.forEach(([el, x]) => { el.style.transition = 'none'; el.style.transform = `translate3d(${x}px, 0, 0)`; });
		void track.offsetWidth;
		const stamp = Date.now() + Math.random();
		moved.forEach(([el]) => { (el as any).__mv = stamp; el.style.transition = `transform ${MOVE_MS}ms linear`; el.style.transform = 'translate3d(0, 0, 0)'; });
		window.setTimeout(() => moved.forEach(([el]) => { if ((el as any).__mv === stamp) { el.style.transition = ''; el.style.transform = ''; } }), MOVE_MS + 60);
	});

	return (
		<section class={`row${focused ? ' row--focused' : ''}`} style={sideMargin === undefined ? undefined : {marginLeft: `${sideMargin}px`, marginRight: `${sideMargin}px`}}>
			{label && <h2 class="row__label">{label}</h2>}
			<div class="row__viewport">
				{items.length === 0
					? <div class="row__empty">{emptyText || tt('row.nothingHereYet')}</div>
					: <div ref={trackRef} class={`row__track${fits ? ' row__track--centered' : ''}${last.current.fast ? ' row__track--fast' : ''}`} style={{transform: `translate3d(${-offset}px, 0, 0)`}}>
						{items.map((item, i) => (
							<Tile
								key={item.key}
								model={item}
								focused={focused && i === selected && !liftedKey}
								lifted={!!liftedKey && item.key === liftedKey}
								arrows={!!liftedKey && item.key === liftedKey ? arrows : undefined}
								onHover={() => { if (hoverMayselect()) onSelect(i); }}
								onActivate={() => onActivate(i)}
							/>
						))}
					</div>}
			</div>
		</section>
	);
}
