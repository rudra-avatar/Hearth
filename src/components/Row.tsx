import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {LAYOUT} from '../theme/tokens';
import {clamp} from '../hooks/useKeys';
import {Tile, type TileModel} from './Tile';
import {hoverGate, hoverLater, hoverSelected, hoverShortPause, pointerClientX, edgeDirection, edgeDepth, keyPressedSince, pointerReallyMoved, pointerKeyQuiet, EDGE_SCROLL_FRAC, EDGE_SPEED_MIN, EDGE_SPEED_MAX, SETTLE_MS} from '../lib/pointer';
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
	/** p24: multiplier of the pointer edge-scroll speed (*Row scroll speed*; 1 = Medium) */
	edgeSpeed?: number;
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
export function Row ({label, items, focused, selected, emptyText, onSelect, onActivate, tileSize = LAYOUT.tileSize, tileGap = LAYOUT.tileGap, viewportWidth = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding, sideMargin, liftedKey, arrows, edgeSpeed = 1}: Props) {
	const step = tileSize + tileGap;
	const total = items.length * step - tileGap;
	// p22: the width the row really has (layout px, measured; CSS gives it as a percent of the screen); the prop is the first guess and the fallback
	const [measured, setMeasured] = useState(0);
	const vw = measured || viewportWidth;
	const fits = total <= vw;
	// 2.1.6 p16: a pointer select in the middle of the row only moves the highlight; the row scrolls by pointer only when the pointer
	// is in the outer EDGE_SCROLL_FRAC of the row on either side. `hold` keeps the shift of the row for the tile selected that way.
	const hold = useRef<{sel: number; offset: number} | null>(null);
	const curOffset = useRef(0);
	const viewportRef = useRef<HTMLDivElement>(null);
	if (hold.current && hold.current.sel !== selected) hold.current = null;
	let offset = fits ? 0 : clamp(selected * step + tileSize / 2 - vw / 2, 0, total - vw);
	if (!fits && hold.current) offset = clamp(hold.current.offset, 0, total - vw);
	curOffset.current = offset;
	// 2.1.6 p22: edge scroll is free pixel scrolling (no tile selects, no highlight changes): while the pointer is in the outer
	// EDGE_SCROLL_FRAC of the row the track moves by itself, faster the nearer the pointer is to the edge (speed in row widths per second, so it
	// scales with the screen). It ends when the pointer leaves that part, the end of the row is reached (the last / first app is highlighted) or an
	// arrow key is pressed; when it ends because of the pointer, the tile under the pointer is highlighted. p20 selected one tile per 200 ms:
	// the highlight lagged behind and the scroll depended on it. A real pointer move that stops (SETTLE_MS) highlights the tile under it too,
	// so a missed mouse-enter no longer leaves a tile without highlight.
	const live = useRef({selected, count: items.length, fits, onSelect, total, vw});
	live.current = {selected, count: items.length, fits, onSelect, total, vw};
	const edgeSpeedRef = useRef(edgeSpeed);
	edgeSpeedRef.current = edgeSpeed;
	const free = useRef({raf: 0, dir: 0, offset: 0, t: 0, at: 0, settle: 0, pos: {x: -1, y: -1}});
	const trackRef = useRef<HTMLDivElement>(null);
	const [, bump] = useState(0);
	const tileAt = (x: number): number => {
		const vp = viewportRef.current;
		const tr = trackRef.current;
		const n = live.current.count;
		if (!vp || !tr || !n || x < 0) return -1;
		const k = vp.getBoundingClientRect().width / (vp.offsetWidth || 1) || 1;   // fit scale (#47): screen px per layout px
		return clamp(Math.floor(((x - tr.getBoundingClientRect().left) / k + tileGap / 2) / step), 0, n - 1);
	};
	const endFree = (how: 'pointer' | 'end' | 'none') => {
		const f = free.current;
		if (f.raf) window.cancelAnimationFrame(f.raf);
		f.raf = 0;
		if (!f.dir) return;
		const d = f.dir;
		f.dir = 0;
		const tr = trackRef.current;
		const l = live.current;
		let pick = -1;
		if (how === 'end') pick = d > 0 ? l.count - 1 : 0;
		else if (how === 'pointer') pick = tileAt(pointerClientX());
		if (tr) {
			tr.style.transition = '';
			if (pick < 0) tr.style.transform = `translate3d(${-clamp(l.selected * step + tileSize / 2 - l.vw / 2, 0, Math.max(0, l.total - l.vw))}px, 0, 0)`;
		}
		if (pick < 0) { hold.current = null; bump((n) => n + 1); return; }
		hold.current = {sel: pick, offset: f.offset};
		hoverSelected();
		if (pick === l.selected) bump((n) => n + 1);
		else l.onSelect(pick);
	};
	const freeTick = (now: number) => {
		const f = free.current;
		f.raf = 0;
		const vp = viewportRef.current;
		const tr = trackRef.current;
		const l = live.current;
		if (!vp || !tr || l.fits || keyPressedSince(f.at)) { endFree('none'); return; }
		const r = vp.getBoundingClientRect();
		const x = pointerClientX();
		if (edgeDirection(x, r) !== f.dir) { endFree('pointer'); return; }
		const max = Math.max(0, l.total - l.vw);
		const dt = Math.max(0, Math.min(50, now - f.t));       // p22b: the first frame's time can be earlier than the pointer event's (dt <= 0)
		f.t = now;
		f.offset = clamp(f.offset + f.dir * l.vw * (EDGE_SPEED_MIN + (EDGE_SPEED_MAX - EDGE_SPEED_MIN) * edgeDepth(x, r)) * edgeSpeedRef.current * dt / 1000, 0, max);
		tr.style.transform = `translate3d(${-f.offset}px, 0, 0)`;
		if ((f.dir < 0 && f.offset <= 0) || (f.dir > 0 && f.offset >= max)) { endFree('end'); return; }       // p22b: only the end the row runs towards (starting at offset 0 to the right ended at once and highlighted the last app)
		f.raf = window.requestAnimationFrame(freeTick);
	};
	const hoverSelect = (i: number, x: number) => {
		if (i === selected) return;
		const vp = viewportRef.current;
		const r = vp ? vp.getBoundingClientRect() : null;
		const edge = fits || !r || !r.width || x < 0 || (x - r.left) / r.width < EDGE_SCROLL_FRAC || (x - r.left) / r.width > 1 - EDGE_SCROLL_FRAC;
		if (edge) hold.current = null;
		else { hold.current = {sel: i, offset: curOffset.current}; hoverShortPause(); }
		onSelect(i);
	};
	const edgeMove = (e: MouseEvent) => {
		const f = free.current;
		const vp = viewportRef.current;
		const tr = trackRef.current;
		const l = live.current;
		const moved = pointerReallyMoved(e, f.pos);
		if (!vp || !tr) return;
		const d = l.fits ? 0 : edgeDirection(e.clientX, vp.getBoundingClientRect());
		if (f.dir && d === f.dir) return;
		if (f.dir) endFree('pointer');
		if (!moved || pointerKeyQuiet(e)) return;
		if (f.settle) window.clearTimeout(f.settle);
		f.settle = 0;
		const max = Math.max(0, l.total - l.vw);
		const cur = -shiftNow(tr);
		if (d && !(d < 0 && cur <= 0.5) && !(d > 0 && cur >= max - 0.5)) {
			f.dir = d;
			f.offset = clamp(cur, 0, max);
			f.at = Date.now();
			f.t = performance.now();
			tr.style.transition = 'none';
			f.raf = window.requestAnimationFrame(freeTick);
			return;
		}
		// not scrolling: when the pointer rests, the tile under it gets the highlight
		f.settle = window.setTimeout(() => {
			f.settle = 0;
			if (f.dir) return;
			const i = tileAt(pointerClientX());
			if (i >= 0 && i !== live.current.selected && !keyPressedSince(Date.now() - SETTLE_MS - 20)) hoverSelect(i, pointerClientX());
		}, SETTLE_MS);
	};
	const edgeLeave = () => { const f = free.current; if (f.settle) { window.clearTimeout(f.settle); f.settle = 0; } if (f.dir) endFree('pointer'); };
	useLayoutEffect(() => {
		const measure = () => {
			const vp = viewportRef.current;
			if (!vp) return;
			const cs = window.getComputedStyle(vp);
			const w = vp.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
			if (w > 0) setMeasured(Math.round(w));
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, [viewportWidth, sideMargin]);
	useEffect(() => () => { const f = free.current; if (f.raf) window.cancelAnimationFrame(f.raf); if (f.settle) window.clearTimeout(f.settle); }, []);

	// Steps that follow each other quickly (a held arrow key) glide with a short linear move instead of
	// restarting the usual ease-out curve every time.
	const last = useRef({selected, at: 0, fast: false});
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
			<div ref={viewportRef} class="row__viewport" onMouseMove={edgeMove} onMouseLeave={edgeLeave}>
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
								onHover={(e) => { if (free.current.dir) return; const v = hoverGate(e); if (v === 'yes') hoverSelect(i, e.clientX); else if (v === 'later') hoverLater(e.currentTarget as Element | null, () => { if (!free.current.dir) hoverSelect(i, pointerClientX()); }); }}
								onActivate={() => onActivate(i)}
							/>
						))}
					</div>}
			</div>
		</section>
	);
}
