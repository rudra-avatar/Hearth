import {log} from '../lib/log';
import {exec} from '../lib/apps';
import {QUIET_OFF_COMMAND} from '../lib/quietoff';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import type {TimeFormat} from '../lib/clock';
import {clampPosition, favouriteSizes, favouriteSplit, initialPosition, movePosition, positionOf, rowOffsets, splitRows, type RowsPosition} from '../lib/rows';
import {tileSizes, rowsScope, rowsClasses, rowsStyle, rowSide} from '../lib/homelook';
import {edgeSpeedFactor, initialStepState, stepDecision, type ScrollSpeed} from '../lib/scrollspeed';
import type {ClockConfig} from '../lib/storage';
import type {WeatherView} from '../lib/weather';
import {LAYOUT} from '../theme/tokens';
import {varScope} from '../lib/cssvars';
import {moveGroup, movesFor} from '../lib/tileorder';
import {createPointerGuard} from '../lib/pointerguard';
import {tileSlot} from '../lib/tileslot';
import {hoverSelected, hoverCancel} from '../lib/pointer';
import {t as tt} from '../i18n';
import {MediaShelf} from '../components/MediaShelf';
import type {ShelfView} from '../lib/shelves';
import {START_NAV, clampNav, entersShelves, maxZone as maxZoneOf, pointAt, selectedOn, shelfLayout, shelfLift, shelfStep, type ShelfNav} from '../lib/shelfnav';

const ROWS_SHUT_MS = 520;       // p20 (user): Up, the second row goes away and the favourites row glides back down: slower and with a soft start (old: the opening glide, 360 ms ease-out, felt like springing back)
const ROWS_FADE_MS = 160;        // p25a: the second row fades out this fast on Up (p30, user: shorter; old: 240)
const ROWS_SHUT_EASE = 'cubic-bezier(0.45, 0, 0.25, 1)';
const ROWS_GLIDE_MS = 360;       // p12: how long the favourites row glides when the second row opens or shuts (p13: was 240, user wanted it slightly slower; same as the new row's fade in global.css)

export interface Appearance {
	/** icon size, % of the standard size */
	iconScale: number;
	/** icon opacity, % */
	iconOpacity: number;
	/** colour of the names under the icons ('theme' = the theme's own) */
	labelColor: string;
	labelFont: string;
	labelSize: number;
	labelWeight: number;
	scrollSpeed: ScrollSpeed;
	/** space between the icons, % of the standard */
	iconGap: number;
	/** icon shape id (see lib/tileshape.ts) */
	tileShape: string;
	iconStyle: string;
	/** quiet mode: seconds without a key before the apps hide (0 = off) */
	quietSec: number;
	/** quiet mode: seconds after the apps hide before the screen dims (0 = off) */
	quietDimSec: number;
	/** quiet mode dim strength, % darkness (10-80) */
	quietDimLevel: number;
	/** QP: seconds after the apps hide before the TV is switched off (0 = never; rooted TVs) */
	quietPowerOff: number;
	/** OLED shift on */
	oledShift: boolean;
	/** px at 1080p */
	sideMargin: number;
	bottomMargin: number;
	/** margins of the favourites row (used while favourites exist) */
	favSideMargin: number;
	favBottomMargin: number;
	showLabels: boolean;
	/** 1 or 2 rows of apps */
	rows: number;
	clock: ClockConfig;
}

interface Props {
	/** the tiles: apps, then any chosen inputs, then LG Home and Settings (in one row, or split over two) */
	items: TileModel[];
	/** tile keys marked as favourites: when any is on the row, only they show until Down opens the row of all the others */
	favourites?: string[];
	timeFormat: TimeFormat;
	appearance: Appearance;
	active: boolean;
	/** the launcher is in the background: stop the clock ticking */
	paused?: boolean;
	onActivate: (item: TileModel) => void;
	/** OK held on a tile */
	onLongPress?: (item: TileModel) => void;
	/** R10: set while the Settings tile is hidden; called when Down was pressed five times in a row with nothing to move to */
	onDeadDown?: () => void;
	/** Back pressed on the home screen (opens the Recent apps panel) */
	onBack: () => void;
	/** counts up each time the launcher is brought to the front (Home pressed): the highlight goes back to the first tile */
	wake?: number;
	/** the tile to highlight on a wake instead of the first (Settings -> Look -> When Home is pressed: the last app opened) */
	homeKey?: string | null;
	/** put the highlight on the tile with this key (after it was moved); `seq` changes for each request */
	focus?: {key: string; seq: number};
	/** the weather line under the date, when it is on and known */
	weather?: WeatherView | null;
	/** 2.0.3 T2 move mode (on while set): `picked` is the key of the tile picked up, or null when none is */
	moveMode?: {picked: string | null} | null;
	/** keys of the apps and inputs in their saved order (the tiles that can be moved) */
	tileKeys?: string[];
	onMovePick?: (key: string | null) => void;
	onMoveStep?: (key: string, dir: 'left' | 'right') => void;
	onMoveExit?: () => void;
	/** Media shelves below the home row, from any source (lib/shelves.ts; only the ones that are on and have items). Down from the
	 *  home row slides them into view; OK on an item calls the shelf's own `open`. */
	shelves?: ShelfView[];
}

/** OLED shift: the offset (px at 1080p) of the clock and the apps, changed once a minute through a small cycle. null = off. */
const SHIFT_STEPS = [{x: 0, y: 0}, {x: 4, y: 2}, {x: 8, y: 0}, {x: 4, y: -2}, {x: 0, y: -4}, {x: -4, y: -2}, {x: -8, y: 0}, {x: -4, y: 2}];
export const SHIFT_EVERY_MS = 60000;
function useShift (on: boolean): {x: number; y: number} | null {
	const [i, setI] = useState(0);
	useEffect(() => {
		if (!on) return undefined;
		const timer = window.setInterval(() => setI((n) => (n + 1) % SHIFT_STEPS.length), SHIFT_EVERY_MS);
		return () => window.clearInterval(timer);
	}, [on]);
	return on ? SHIFT_STEPS[i] : null;
}

/** The home screen: a clock and the tiles along the bottom, in one row or two.
 *  Left/Right move along a row, Up/Down change row (two rows), OK opens, holding OK opens the app's menu.
 *  Back opens the Recent apps panel. */
export function Home ({items: allItems, favourites, timeFormat, appearance, active, paused, onActivate, onLongPress, onDeadDown, onBack, wake, homeKey, focus, weather, moveMode, tileKeys, onMovePick, onMoveStep, onMoveExit, shelves}: Props) {
	const now = useClock(paused);
	const [position, setPosition] = useState<RowsPosition>(initialPosition);
	// Favourites: with any chosen, the first row holds them alone; Down brings up a second row with everything else, Up hides it again.
	const favList = favourites || [];
	const favSig = favList.join('|');
	const split = useMemo(() => favouriteSplit(allItems, (item) => item.key, favList), [allItems, favSig]);       // eslint-disable-line react-hooks/exhaustive-deps
	const items = split.list;
	const favN = split.favourites;
	const [open, setOpen] = useState(false);
	const everOpen = useRef(false);
	const rowsRef = useRef<HTMLDivElement>(null);
	const topBefore = useRef<number | null>(null);        // p12: where the favourites row was (screen pixels) before Down/Up changed the rows
	const ghostFrom = useRef<{node: HTMLElement; top: number; left: number; width: number} | null>(null);    // p25a: the second row as it was, to fade it out while the favourites row glides down
	const ghostEl = useRef<HTMLElement | null>(null);
	const dropGhost = () => { const g = ghostEl.current; ghostEl.current = null; if (g && g.parentNode) g.parentNode.removeChild(g); };
	const noteTop = (closing?: boolean) => {
		dropGhost();
		const box = rowsRef.current;
		const el = box && box.children[0] as HTMLElement | undefined;
		topBefore.current = el ? el.getBoundingClientRect().top : null;       // p25a: was offsetTop inside the bottom-anchored box = 0 before and after, so the glide never ran
		ghostFrom.current = null;
		const second = closing && box && box.children[1] as HTMLElement | undefined;
		if (second) { const r = second.getBoundingClientRect(); ghostFrom.current = {node: second.cloneNode(true) as HTMLElement, top: r.top, left: r.left, width: r.width}; }
	};
	const sizes = favN ? favouriteSizes(favN, items.length, open) : splitRows(items.length, appearance.rows);
	const offsets = rowOffsets(sizes);
	const at = clampPosition(sizes, position);
	const selectedItem = items[offsets[at.row] + at.cols[at.row]];
	const sizeKey = sizes.join(',') + ':' + favN + ':' + items.length;
	const openRef = useRef(false);
	const rowRef = useRef(0);
	openRef.current = open;
	// p12 (user, option B): the favourites row glides to its new place with a transform (compositor only) instead of the whole block fading in; the new row only fades (CSS)
	useLayoutEffect(() => {
		const before = topBefore.current;
		topBefore.current = null;
		const ghost = ghostFrom.current;
		ghostFrom.current = null;
		const box = rowsRef.current;
		const el = box && box.children[0] as HTMLElement | undefined;
		if (before === null || !el || !box) return;
		const rect = el.getBoundingClientRect();
		const scale = el.offsetHeight && rect.height ? rect.height / el.offsetHeight : 1;       // a fitted screen is scaled: transforms are in unscaled pixels
		const delta = (before - rect.top) / scale;
		if (!delta || delta > 600 || delta < -600) return;
		const ms = open ? ROWS_GLIDE_MS : ROWS_SHUT_MS;
		let fadeTimer = 0;
		if (ghost && !open) {          // p25a: Up: the second row fades out where it was while the favourites row glides down (it used to vanish at once)
			const b = box.getBoundingClientRect();
			const g = ghost.node;
			g.style.cssText = `position:absolute;margin:0;pointer-events:none;top:${(ghost.top - b.top) / scale}px;left:${(ghost.left - b.left) / scale}px;width:${ghost.width / scale}px;opacity:1;-webkit-transition:opacity ${ROWS_FADE_MS}ms ease-out;transition:opacity ${ROWS_FADE_MS}ms ease-out`;
			box.appendChild(g);
			ghostEl.current = g;
			void g.offsetWidth;
			g.style.opacity = '0';
			fadeTimer = window.setTimeout(dropGhost, ROWS_FADE_MS + 80);
		}
		el.style.position = 'relative';
		el.style.zIndex = '1';
		el.style.transition = 'none';
		el.style.transform = `translate3d(0, ${delta}px, 0)`;
		void el.offsetWidth;
		el.style.transition = `transform ${ms}ms ${open ? 'ease-out' : ROWS_SHUT_EASE}`;
		el.style.transform = 'translate3d(0, 0, 0)';
		const reset = () => { el.style.transition = ''; el.style.transform = ''; el.style.position = ''; el.style.zIndex = ''; };
		const t = window.setTimeout(reset, ms + 60);
		return () => { window.clearTimeout(t); window.clearTimeout(fadeTimer); reset(); dropGhost(); };
	}, [open]);
	if (open) everOpen.current = true;
	rowRef.current = at.row;
	const posRef = useRef(position);
	posRef.current = position;
	const deadRef = useRef(0);                           // R10: Down presses in a row that moved nothing
	const deadCall = useRef(onDeadDown);
	deadCall.current = onDeadDown;
	const quietRef = useRef(false);                       // true while the apps are hidden and for the key press that woke them
	const [quiet, setQuiet] = useState(false);
	const [dimmed, setDimmed] = useState(false);
	const stepRef = useRef(initialStepState());
	const speedRef = useRef(appearance.scrollSpeed);
	speedRef.current = appearance.scrollSpeed;
	const shift = useShift(appearance.oledShift && !paused);
	const moveRef = useRef(moveMode);                     // move mode: the key handler is registered once, so it reads refs
	moveRef.current = moveMode;
	const moveCb = useRef({onMovePick, onMoveStep, onMoveExit});
	moveCb.current = {onMovePick, onMoveStep, onMoveExit};
	const movable = (key: string | undefined): boolean => !!key && !!tileKeys && tileKeys.indexOf(key) !== -1;
	const tileKeysRef = useRef(tileKeys);
	tileKeysRef.current = tileKeys;

	// Media shelves below the home row. Zone 0 is the home row(s) as before, 1..n the shelves, and with favourites set n+1 is the
	// row of all the other apps, which then sits below the shelves (user 2026-11-12: Down goes favourites, shelves, all apps).
	// With no shelf showing (off, signed out, empty) nothing here changes the home screen. Move mode leaves the shelves out.
	// The rules are in lib/shelfnav.ts (tested); this only keeps the state and measures the screen.
	const shelfList = moveMode ? [] : (shelves || []);
	const nShelves = shelfList.length;
	const layout = shelfLayout(favN, items.length, shelfList.map((s) => s.items.length));
	const tailApps = layout.tailApps;
	const maxZone = maxZoneOf(layout);
	const [navRaw, setNav] = useState<ShelfNav>(START_NAV);
	const nav = clampNav(navRaw, layout);
	const zone = nav.zone;
	const tailCol = nav.tailCol;
	const zoneRef = useRef(zone);
	zoneRef.current = zone;
	const setZone = (z: number) => setNav((n) => (n.zone === z ? n : {...n, zone: z}));
	const shelfAt = (s: number): number => selectedOn(nav, layout, s);
	const layoutRef = useRef(layout);
	layoutRef.current = layout;
	const shelfListRef = useRef(shelfList);
	shelfListRef.current = shelfList;
	const shelfSig = shelfList.map((s) => s.id + ':' + s.items.length).join('|') + (tailApps ? '+apps' : '');
	const stageRef = useRef<HTMLDivElement>(null);
	const shelvesRef = useRef<HTMLDivElement>(null);
	const [lift, setLift] = useState(0);
	// The stage slides up just far enough: the home row stays near the top while the shelves fit, and the focused shelf
	// (or the all-apps row below them) is always fully on screen.
	useLayoutEffect(() => {
		if (zone === 0) { if (lift) setLift(0); return; }
		const box = shelvesRef.current;
		const rows = rowsRef.current;
		const sec = box && box.children[zone - 1] as HTMLElement | undefined;
		if (!box || !rows || !sec) return;
		const next = shelfLift(zone, {rowsTop: rows.offsetTop, shelvesHeight: box.offsetHeight, sectionTop: sec.offsetTop, sectionHeight: sec.offsetHeight});
		if (next !== lift) setLift(next);
	}, [zone, shelfSig]);       // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => { if (tailApps && open) setOpen(false); }, [tailApps, open]);

	// The tile under the pointer gets the highlight (wake from quiet mode). Reads refs: it is called from an effect registered once.
	const pickRef = useRef<(node: unknown) => void>(() => undefined);
	pickRef.current = (node) => {
		const slot = tileSlot(node);
		if (!slot || moveRef.current || slot.row >= sizes.length || slot.col >= sizes[slot.row]) return;
		pendingKey.current = null;
		hoverSelected();
		setPosition((p) => ({row: slot.row, cols: clampPosition(sizes, p).cols.map((c, i) => (i === slot.row ? slot.col : c))}));
	};
	useEffect(() => hoverCancel, []);

	// Quiet mode: hide the apps after quietSec without a key; the first key (or pointer move) brings them back and is used up.
	useEffect(() => {
		const secs = appearance.quietSec;
		const dimSecs = appearance.quietDimSec;
		const offSecs = appearance.quietPowerOff;
		quietRef.current = false;
		setQuiet(false);
		setDimmed(false);
		if (!secs || !active || paused) return undefined;       // while another app is in front nothing is armed; coming back starts fresh with the apps shown
		let timer = 0;
		let hidden = false;
		let swallow = false;
		let dimTimer = 0;
		let offTimer = 0;
		const arm = () => {
			window.clearTimeout(timer);
			window.clearTimeout(dimTimer);
			window.clearTimeout(offTimer);
			timer = window.setTimeout(() => {
				hidden = true; quietRef.current = true; setQuiet(true);
				if (moveRef.current && moveCb.current.onMoveExit) moveCb.current.onMoveExit();       // U2: quiet mode puts the picked-up tile down, saves the order and leaves the move mode
				// the screen dims a set time after the apps hide
				if (dimSecs) dimTimer = window.setTimeout(() => setDimmed(true), dimSecs * 1000);
				// QP: the TV switches off a set time after the apps hide (rooted TVs; a failed call changes nothing)
				if (offSecs) offTimer = window.setTimeout(() => { exec(QUIET_OFF_COMMAND, 15000).catch(() => undefined); }, offSecs * 1000);
			}, secs * 1000);
		};
		const wake = () => { hidden = false; setQuiet(false); setDimmed(false); window.clearTimeout(dimTimer); window.clearTimeout(offTimer); };
		const onDown = () => { if (hidden) { swallow = true; wake(); } arm(); };
		const onUp = () => { if (swallow) window.setTimeout(() => { swallow = false; quietRef.current = false; }, 0); };
		// Pointer (2.1.6 M1): a waking move wakes the apps and selects the tile under the pointer once; nothing is held back after that.
		// A waking press only wakes (its release and click are used up), also selecting the tile it points at. Repeated moves at one spot and
		// tremor under 3 px are ignored (they neither wake nor keep awake); enter/over events never wake.
		const guard = createPointerGuard();
		const onPointer = (e: Event) => {
			const type = e.type;
			if (type === 'mouseover' || type === 'mouseenter') return;
			if (type === 'mouseup') { if (guard.blocks(type)) e.stopImmediatePropagation(); return; }
			if (type === 'mousemove') { const m = e as MouseEvent; if (guard.sameSpot(m.screenX, m.screenY) || !guard.farEnough(m.screenX, m.screenY)) return; }
			if (hidden) {
				guard.wake(type); wake(); quietRef.current = false;
				if (type === 'mousemove' || type === 'mousedown') pickRef.current(e.target);
			}
			if (guard.blocks(type)) e.stopImmediatePropagation();
			arm();
		};
		const PTR = ['mousemove', 'mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click', 'wheel'];
		window.addEventListener('keydown', onDown, true);
		window.addEventListener('keyup', onUp, true);
		for (const type of PTR) window.addEventListener(type, onPointer, true);
		arm();
		return () => {
			window.clearTimeout(timer);
			window.clearTimeout(dimTimer);
			window.clearTimeout(offTimer);
			window.removeEventListener('keydown', onDown, true);
			window.removeEventListener('keyup', onUp, true);
			for (const type of PTR) window.removeEventListener(type, onPointer, true);
			guard.stop();
			quietRef.current = false;
		};
	}, [appearance.quietSec, appearance.quietDimSec, appearance.quietPowerOff, active, paused, wake]);

	// Quiet mode also hides the wallpaper's bottom fade (CSS: `.hearth-quiet .wallpaper__fade`).
	useEffect(() => {
		document.body.classList.toggle('hearth-quiet', quiet);
		if (quiet) setZone(0);       // the shelves slide away with the apps; the first key brings back the home row
		return () => document.body.classList.remove('hearth-quiet');
	}, [quiet]);

	// The dimmed screen: a dark layer over everything (CSS: `body.hearth-dim::after`, only exists while dimmed).
	useEffect(() => {
		const cls = `hearth-dim-${appearance.quietDimLevel}`;
		document.body.classList.toggle('hearth-dim', dimmed);
		document.body.classList.toggle(cls, dimmed);
		return () => { document.body.classList.remove('hearth-dim'); document.body.classList.remove(cls); };
	}, [dimmed, appearance.quietDimLevel]);

	// Home pressed (the launcher comes to the front): start again at the first tile.
	// With "When Home is pressed" = the last app opened (PR #20): the highlight starts on that tile when it is in the row that shows
	// (with favourites: only when it is a favourite), else on the first. Right after a start the app list may still be loading:
	// the tile is then placed once it appears, unless a key was pressed first.
	const pendingKey = useRef<string | null>(null);
	const homePosition = (key: string | null | undefined): RowsPosition | null => {
		if (!key) return null;
		const closed = favN ? favouriteSizes(favN, items.length, false) : sizes;
		return positionOf(closed, items.findIndex((item) => item.key === key), initialPosition());
	};
	useEffect(() => {
		const found = homePosition(homeKey);
		if (wake && wake > 0) log(`home: shown, wanted tile ${homeKey || 'none (first)'}, ${found ? 'placed' : homeKey ? 'not in the visible row yet' : 'first'}`);   // P64: why the last-app highlight may not apply
		pendingKey.current = found ? null : homeKey || null;
		setPosition(found || initialPosition());
		setOpen(false);
		setZone(0);
		if (moveRef.current && moveCb.current.onMoveExit) moveCb.current.onMoveExit();       // Hearth came back to the front: the move mode ends
	}, [wake]);
	useEffect(() => {
		if (!pendingKey.current) return;
		const found = homePosition(pendingKey.current);
		if (found) { pendingKey.current = null; setPosition(found); }
	}, [allItems]);

	// A tile was moved: the highlight follows it to its new place.
	useEffect(() => {
		if (!focus) return;
		const index = items.findIndex((item) => item.key === focus.key);
		if (index === -1) return;
		const wantOpen = favN > 0 && (open || index >= favN);
		if (wantOpen !== open) setOpen(wantOpen);
		const sz = favN ? favouriteSizes(favN, items.length, wantOpen) : sizes;
		const off = rowOffsets(sz);
		let row = 0;
		while (row < sz.length - 1 && index >= off[row] + sz[row]) row++;
		setPosition((p) => ({row, cols: clampPosition(sz, p).cols.map((c, r) => (r === row ? index - off[row] : c))}));
	}, [focus && focus.seq]);

	const handleKey = useCallback((key: NavKey, event?: KeyboardEvent): boolean => {
		pendingKey.current = null;                            // the person is moving: a late app list no longer moves the highlight
		if (key !== 'down') deadRef.current = 0;
		if (quietRef.current) return true;                    // the key that wakes the apps does nothing else
		const z = zoneRef.current;
		const lay = layoutRef.current;
		if (z > 0) {                                          // on a shelf, or on the all-apps row below the shelves (lib/shelfnav.ts)
			if (key === 'left' || key === 'right') {
				const d = stepDecision(stepRef.current, Date.now(), !!(event && event.repeat), speedRef.current);
				stepRef.current = d.state;
				if (!d.move) return true;
			}
			if (key === 'left' || key === 'right' || key === 'up' || key === 'down' || key === 'back') setNav((n) => shelfStep(clampNav(n, lay), lay, key));
			return true;
		}
		const mv = moveRef.current;
		if (mv) {
			const cb = moveCb.current;
			if (key === 'back') {                              // first Back puts the picked-up tile down, the next one leaves the mode
				if (mv.picked) { if (cb.onMovePick) cb.onMovePick(null); } else if (cb.onMoveExit) cb.onMoveExit();
				return true;
			}
			if (key === 'left' || key === 'right') {
				const d = stepDecision(stepRef.current, Date.now(), !!(event && event.repeat), mv.picked ? 'slow' : speedRef.current);       // U2: a picked-up tile moves at the calm pace, whatever the scroll speed
				stepRef.current = d.state;
				if (!d.move) return true;
				if (mv.picked) { if (cb.onMoveStep) cb.onMoveStep(mv.picked, key); return true; }
				const cur = clampPosition(sizes, posRef.current);          // nothing picked up: the highlight walks the row, no looping
				const col = cur.cols[cur.row] + (key === 'left' ? -1 : 1);
				if (col >= 0 && col < sizes[cur.row]) setPosition((p) => movePosition(sizes, p, key));
				return true;
			}
			if ((key === 'up' || key === 'down') && mv.picked && cb.onMovePick) cb.onMovePick(null);       // changing row puts the tile down where it is
		}
		if (key === 'left' || key === 'right') {
			// a held key repeats faster than the row can glide: thin the repeats out, gently at first
			const d = stepDecision(stepRef.current, Date.now(), !!(event && event.repeat), speedRef.current);
			stepRef.current = d.state;
			if (!d.move) return true;
		}
		if (key === 'down' && !mv) {                          // from the last home row (or the favourites row) down to the first shelf
			const cur = clampPosition(sizes, posRef.current);
			if (entersShelves(lay, favN, movePosition(sizes, cur, 'down').row === cur.row)) { deadRef.current = 0; setZone(1); return true; }
		}
		if (favN > 0 && key === 'down' && !openRef.current && items.length > favN) {       // bring up the row of all the other apps
			noteTop();
			setOpen(true);
			setPosition((p) => movePosition(favouriteSizes(favN, items.length, true), p, 'down'));
			return true;
		}
		if (favN > 0 && key === 'up' && openRef.current && rowRef.current === 1) {          // back to the favourites alone
			noteTop(true);
			setOpen(false);
			setPosition((p) => movePosition(favouriteSizes(favN, items.length, true), p, 'up'));
			return true;
		}
		if (key === 'down' && deadCall.current && !moveRef.current) {             // R10: five Down presses that do nothing bring the hidden Settings tile back
			const cur = clampPosition(sizes, posRef.current);
			const nx = movePosition(sizes, cur, 'down');
			if (nx.row !== cur.row) deadRef.current = 0;
			else if (!(event && event.repeat) && ++deadRef.current >= 5) { deadRef.current = 0; deadCall.current(); }
		}
		// functional updates, so quick repeated presses never act on a stale position
		if (key === 'left' || key === 'right' || key === 'up' || key === 'down') setPosition((p) => movePosition(sizes, p, key));
		else if (key === 'back') onBack();        // Back opens the Recent apps panel
		return true;            // OK is handled by useOkPress below (press vs hold)
	}, [sizeKey, onBack]);

	useKeys(handleKey, active);
	useOkPress({
		onPress: () => {
			if (quietRef.current) return;
			const z = zoneRef.current;
			if (z > 0) {
				const list = shelfListRef.current;
				if (z <= list.length) {
					const shelf = list[z - 1];
					const item = shelf.items[shelfAt(z - 1)];
					if (item) shelf.open(item);
				} else if (items[favN + tailCol]) onActivate(items[favN + tailCol]);
				return;
			}
			if (!selectedItem) return;
			const mv = moveRef.current;
			if (mv) {                                          // move mode: OK picks the tile up or puts it down
				const cb = moveCb.current;
				if (!cb.onMovePick) return;
				if (mv.picked) cb.onMovePick(null);
				else if (tileKeysRef.current && tileKeysRef.current.indexOf(selectedItem.key) !== -1) cb.onMovePick(selectedItem.key);
				return;
			}
			onActivate(selectedItem);
		},
		onLongPress: () => {
			if (!onLongPress || quietRef.current || moveRef.current) return;
			const z = zoneRef.current;
			if (z === 0) { if (selectedItem) onLongPress(selectedItem); }
			else if (z > shelfListRef.current.length && items[favN + tailCol]) onLongPress(items[favN + tailCol]);       // the all-apps row below the shelves keeps the app menu
		}
	}, active);

	// The row's sizes are set on the row itself (not on :root), so the Settings grid keeps its own.
	const {tileSize, tileGap} = tileSizes(appearance);
	const rowVars = rowsScope(appearance);
	// favourites: the container spans the screen, each row takes its own side margin; the favourites row alone sits at its own bottom margin, the open pair at the usual one
	const sideOf = (r: number) => rowSide(appearance, favN, r);
	const rowStyle = rowsStyle(appearance, favN, open, rowVars.css);
	// move mode: arrows on the picked-up tile dim where it cannot go on (the ends of its own row, no looping)
	const picked = moveMode && moveMode.picked && movable(moveMode.picked) ? moveMode.picked : null;
	const pickedMoves = picked && tileKeys ? movesFor(moveGroup(tileKeys, favList, picked), picked) : null;
	const pickedArrows = pickedMoves ? {left: pickedMoves.left, right: pickedMoves.right} : undefined;
	const shiftVars = varScope('shift', shift ? {'--shift-x': `${shift.x}px`, '--shift-y': `${shift.y}px`} : {});
	const classes = rowsClasses(appearance, {multi: sizes.length > 1, favN, open, shut: everOpen.current, quiet}, rowVars.cls);

	return (
		<div class={`screen${active ? '' : ' screen--away'}${shift ? ' screen--shift' : ''}${shiftVars.cls ? ' ' + shiftVars.cls : ''}`} style={shiftVars.css || undefined}>
			{moveMode && <div class="movehint"><div class="movehint__main">{tt('move.hint')}</div><div class="movehint__sub">{tt('move.hintBack')}</div></div>}
			<div ref={stageRef} class={nShelves > 0 ? 'home-stage home-stage--shelves' : 'home-stage'} style={lift && nShelves > 0 ? {transform: `translate3d(0, ${-lift}px, 0)`} : undefined}>
			{appearance.clock.show && !moveMode && <Clock now={now} format={timeFormat} config={appearance.clock} weather={weather} />}
			<div ref={rowsRef} class={classes} style={rowStyle}>
				{sizes.map((size, r) => {
					const start = offsets[r];
					return (
						<Row
							key={r}
							items={items.slice(start, start + size)}
							focused={r === at.row && zone === 0}
							selected={at.cols[r]}
							onSelect={(col) => { pendingKey.current = null; setPosition({row: r, cols: at.cols.map((c, i) => (i === r ? col : c))}); }}
							onActivate={(col) => { if (!moveRef.current) onActivate(items[start + col]); }}
							edgeSpeed={edgeSpeedFactor(appearance.scrollSpeed)}
							tileSize={tileSize}
							tileGap={tileGap}
							viewportWidth={LAYOUT.screenWidth - 2 * sideOf(r)}
							sideMargin={favN > 0 ? sideOf(r) : undefined}
							liftedKey={picked}
							arrows={pickedArrows}
						/>
					);
				})}
			</div>
			{nShelves > 0 && (
				<div ref={shelvesRef} class={`shelves${quiet ? ' shelves--quiet' : ''}`} style={{left: `${appearance.sideMargin}px`, right: `${appearance.sideMargin}px`}}>
					{shelfList.map((shelf, s) => (
						<MediaShelf
							key={shelf.id}
							shelf={shelf}
							focused={zone === s + 1}
							selected={shelfAt(s)}
							width={LAYOUT.screenWidth - 2 * appearance.sideMargin}
							onSelect={(i) => setNav((n) => pointAt(clampNav(n, layout), layout, s + 1, i))}
							onActivate={(i) => { if (shelf.items[i]) shelf.open(shelf.items[i]); }}
						/>
					))}
					{tailApps && (
						<div class={rowsClasses(appearance, {multi: false, favN: 0, open: false, shut: false, quiet}, rowVars.cls) + ' shelves__apps'} style={rowVars.css || undefined}>
							<Row
								items={items.slice(favN)}
								focused={zone === maxZone}
								selected={tailCol}
								onSelect={(col) => setNav((n) => pointAt(clampNav(n, layout), layout, maxZone, col))}
								onActivate={(col) => onActivate(items[favN + col])}
								edgeSpeed={edgeSpeedFactor(appearance.scrollSpeed)}
								tileSize={tileSize}
								tileGap={tileGap}
								viewportWidth={LAYOUT.screenWidth - 2 * appearance.sideMargin}
							/>
						</div>
					)}
				</div>
			)}
			</div>
		</div>
	);
}
