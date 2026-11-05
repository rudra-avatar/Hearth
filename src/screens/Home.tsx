import {log} from '../lib/log';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import type {TimeFormat} from '../lib/clock';
import {clampPosition, favouriteSizes, favouriteSplit, initialPosition, movePosition, positionOf, rowOffsets, splitRows, type RowsPosition} from '../lib/rows';
import {labelColorValue} from '../lib/clockcolor';
import {fontFamily, type ClockFont} from '../lib/clockfont';
import {initialStepState, stepDecision, type ScrollSpeed} from '../lib/scrollspeed';
import type {ClockConfig} from '../lib/storage';
import type {WeatherView} from '../lib/weather';
import {FONT, LAYOUT} from '../theme/tokens';
import {varScope} from '../lib/cssvars';
import {moveGroup, movesFor} from '../lib/tileorder';
import {t as tt} from '../i18n';

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
export function Home ({items: allItems, favourites, timeFormat, appearance, active, paused, onActivate, onLongPress, onDeadDown, onBack, wake, homeKey, focus, weather, moveMode, tileKeys, onMovePick, onMoveStep, onMoveExit}: Props) {
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
	const sizes = favN ? favouriteSizes(favN, items.length, open) : splitRows(items.length, appearance.rows);
	const offsets = rowOffsets(sizes);
	const at = clampPosition(sizes, position);
	const selectedItem = items[offsets[at.row] + at.cols[at.row]];
	const sizeKey = sizes.join(',') + ':' + favN + ':' + items.length;
	const openRef = useRef(false);
	const rowRef = useRef(0);
	openRef.current = open;
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

	// Quiet mode: hide the apps after quietSec without a key; the first key (or pointer move) brings them back and is used up.
	useEffect(() => {
		const secs = appearance.quietSec;
		const dimSecs = appearance.quietDimSec;
		quietRef.current = false;
		setQuiet(false);
		setDimmed(false);
		if (!secs || !active || paused) return undefined;       // while another app is in front nothing is armed; coming back starts fresh with the apps shown
		let timer = 0;
		let hidden = false;
		let swallow = false;
		let dimTimer = 0;
		const arm = () => {
			window.clearTimeout(timer);
			window.clearTimeout(dimTimer);
			timer = window.setTimeout(() => {
				hidden = true; quietRef.current = true; setQuiet(true);
				if (moveRef.current && moveCb.current.onMoveExit) moveCb.current.onMoveExit();       // U2: quiet mode puts the picked-up tile down, saves the order and leaves the move mode
				// the screen dims a set time after the apps hide
				if (dimSecs) dimTimer = window.setTimeout(() => setDimmed(true), dimSecs * 1000);
			}, secs * 1000);
		};
		const wake = () => { hidden = false; setQuiet(false); setDimmed(false); window.clearTimeout(dimTimer); };
		const onDown = () => { if (hidden) { swallow = true; wake(); } arm(); };
		const onUp = () => { if (swallow) window.setTimeout(() => { swallow = false; quietRef.current = false; }, 0); };
		const onPointer = () => { if (hidden) { wake(); quietRef.current = false; } arm(); };
		window.addEventListener('keydown', onDown, true);
		window.addEventListener('keyup', onUp, true);
		window.addEventListener('mousemove', onPointer, true);
		window.addEventListener('click', onPointer, true);
		arm();
		return () => {
			window.clearTimeout(timer);
			window.clearTimeout(dimTimer);
			window.removeEventListener('keydown', onDown, true);
			window.removeEventListener('keyup', onUp, true);
			window.removeEventListener('mousemove', onPointer, true);
			window.removeEventListener('click', onPointer, true);
			quietRef.current = false;
		};
	}, [appearance.quietSec, appearance.quietDimSec, active, paused, wake]);

	// Quiet mode also hides the wallpaper's bottom fade (CSS: `.hearth-quiet .wallpaper__fade`).
	useEffect(() => {
		document.body.classList.toggle('hearth-quiet', quiet);
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
		if (favN > 0 && key === 'down' && !openRef.current && items.length > favN) {       // bring up the row of all the other apps
			setOpen(true);
			setPosition((p) => movePosition(favouriteSizes(favN, items.length, true), p, 'down'));
			return true;
		}
		if (favN > 0 && key === 'up' && openRef.current && rowRef.current === 1) {          // back to the favourites alone
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
			if (!selectedItem || quietRef.current) return;
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
		onLongPress: () => { if (selectedItem && onLongPress && !quietRef.current && !moveRef.current) onLongPress(selectedItem); }
	}, active);

	// The row's sizes are set on the row itself (not on :root), so the Settings grid keeps its own.
	const scale = appearance.iconScale / 100;
	const tileSize = Math.round(LAYOUT.tileSize * scale);
	const tileGap = Math.round(LAYOUT.tileGap * scale * appearance.iconGap / 100);
	const rowVars = varScope('rows', {
		'--icon-opacity': String(appearance.iconOpacity / 100),
		'--label-color': labelColorValue(appearance.labelColor) || undefined,
		'--layout-tile-size': `${tileSize}px`,
		'--layout-tile-gap': `${tileGap}px`,
		'--layout-tile-radius': `${Math.round(LAYOUT.tileRadius * scale)}px`,
		'--font-tile-label': `${Math.min(30, Math.max(13, Math.round(FONT.tileLabel * scale * appearance.labelSize / 100)))}px`,
		'--label-font': appearance.labelFont === 'default' ? undefined : fontFamily(appearance.labelFont as ClockFont),
		'--label-weight': appearance.labelWeight === 400 ? undefined : String(appearance.labelWeight)
	});
	// favourites: the container spans the screen, each row takes its own side margin; the favourites row alone sits at its own bottom margin, the open pair at the usual one
	const bottom = favN > 0 && !open ? appearance.favBottomMargin : appearance.bottomMargin;
	const sideOf = (r: number) => (favN > 0 && r === 0 ? appearance.favSideMargin : appearance.sideMargin);
	const rowStyle = [`left:${favN > 0 ? 0 : appearance.sideMargin}px`, `right:${favN > 0 ? 0 : appearance.sideMargin}px`, `bottom:${bottom}px`, rowVars.css].filter(Boolean).join(';');
	// move mode: arrows on the picked-up tile dim where it cannot go on (the ends of its own row, no looping)
	const picked = moveMode && moveMode.picked && movable(moveMode.picked) ? moveMode.picked : null;
	const pickedMoves = picked && tileKeys ? movesFor(moveGroup(tileKeys, favList, picked), picked) : null;
	const pickedArrows = pickedMoves ? {left: pickedMoves.left, right: pickedMoves.right} : undefined;
	const shiftVars = varScope('shift', shift ? {'--shift-x': `${shift.x}px`, '--shift-y': `${shift.y}px`} : {});
	const classes = [rowVars.cls, 'rows', !appearance.showLabels && 'rows--no-labels', sizes.length > 1 && 'rows--multi', favN > 0 && 'rows--fav', favN > 0 && open && 'rows--fav-open', favN > 0 && !open && everOpen.current && 'rows--fav-shut', appearance.iconOpacity < 100 && 'rows--dim', quiet && 'rows--quiet', labelColorValue(appearance.labelColor) && 'rows--label-color', appearance.labelFont !== 'default' && 'rows--label-font', appearance.labelWeight !== 400 && 'rows--label-weight', appearance.tileShape !== 'rounded' && `rows--shape-${appearance.tileShape}`].filter(Boolean).join(' ');

	return (
		<div class={`screen${active ? '' : ' screen--away'}${shift ? ' screen--shift' : ''}${shiftVars.cls ? ' ' + shiftVars.cls : ''}`} style={shiftVars.css || undefined}>
			{moveMode && <div class="movehint"><div class="movehint__main">{tt('move.hint')}</div><div class="movehint__sub">{tt('move.hintBack')}</div></div>}
			{appearance.clock.show && !moveMode && <Clock now={now} format={timeFormat} config={appearance.clock} weather={weather} />}
			<div class={classes} style={rowStyle}>
				{sizes.map((size, r) => {
					const start = offsets[r];
					return (
						<Row
							key={r}
							items={items.slice(start, start + size)}
							focused={r === at.row}
							selected={at.cols[r]}
							onSelect={(col) => { pendingKey.current = null; setPosition({row: r, cols: at.cols.map((c, i) => (i === r ? col : c))}); }}
							onActivate={(col) => { if (!moveRef.current) onActivate(items[start + col]); }}
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
		</div>
	);
}
