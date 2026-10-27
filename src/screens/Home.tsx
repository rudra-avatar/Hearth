import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import type {TimeFormat} from '../lib/clock';
import {clampPosition, initialPosition, movePosition, positionOf, rowOffsets, splitRows, type RowsPosition} from '../lib/rows';
import {labelColorValue} from '../lib/clockcolor';
import type {ClockConfig} from '../lib/storage';
import type {WeatherView} from '../lib/weather';
import {FONT, LAYOUT} from '../theme/tokens';
import {varScope} from '../lib/cssvars';

export interface Appearance {
	/** icon size, % of the standard size */
	iconScale: number;
	/** icon opacity, % */
	iconOpacity: number;
	/** colour of the names under the icons ('theme' = the theme's own) */
	labelColor: string;
	/** space between the icons, % of the standard */
	iconGap: number;
	/** icon shape id (see lib/tileshape.ts) */
	tileShape: string;
	/** quiet mode: seconds without a key before the apps hide (0 = off) */
	quietSec: number;
	/** OLED shift on */
	oledShift: boolean;
	/** px at 1080p */
	sideMargin: number;
	bottomMargin: number;
	showLabels: boolean;
	/** 1 or 2 rows of apps */
	rows: number;
	clock: ClockConfig;
}

interface Props {
	/** the tiles: apps, then any chosen inputs, then LG Home and Settings (in one row, or split over two) */
	items: TileModel[];
	timeFormat: TimeFormat;
	appearance: Appearance;
	active: boolean;
	/** the launcher is in the background: stop the clock ticking */
	paused?: boolean;
	onActivate: (item: TileModel) => void;
	/** OK held on a tile */
	onLongPress?: (item: TileModel) => void;
	/** Back pressed on the home screen (opens the Recent apps panel) */
	onBack: () => void;
	/** counts up each time the launcher is brought to the front (Home pressed): the highlight goes back to the first tile,
	 *  or to the `homeKey` tile when that is set and still on the row */
	wake?: number;
	/** the tile to highlight on a wake instead of the first (Settings → Look → When Home is pressed: the last app opened) */
	homeKey?: string | null;
	/** put the highlight on the tile with this key (after it was moved); `seq` changes for each request */
	focus?: {key: string; seq: number};
	/** the weather line under the date, when it is on and known */
	weather?: WeatherView | null;
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
export function Home ({items, timeFormat, appearance, active, paused, onActivate, onLongPress, onBack, wake, homeKey, focus, weather}: Props) {
	const now = useClock(paused);
	const [position, setPosition] = useState<RowsPosition>(initialPosition);
	const sizes = splitRows(items.length, appearance.rows);
	const offsets = rowOffsets(sizes);
	const at = clampPosition(sizes, position);
	const selectedItem = items[offsets[at.row] + at.cols[at.row]];
	const sizeKey = sizes.join(',');
	const quietRef = useRef(false);                       // true while the apps are hidden and for the key press that woke them
	const [quiet, setQuiet] = useState(false);
	const shift = useShift(appearance.oledShift && !paused);

	// Quiet mode: hide the apps after quietSec without a key; the first key (or pointer move) brings them back and is used up.
	useEffect(() => {
		const secs = appearance.quietSec;
		quietRef.current = false;
		setQuiet(false);
		if (!secs || !active || paused) return undefined;       // while another app is in front nothing is armed; coming back starts fresh with the apps shown
		let timer = 0;
		let hidden = false;
		let swallow = false;
		const arm = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => { hidden = true; quietRef.current = true; setQuiet(true); }, secs * 1000);
		};
		const wake = () => { hidden = false; setQuiet(false); };
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
			window.removeEventListener('keydown', onDown, true);
			window.removeEventListener('keyup', onUp, true);
			window.removeEventListener('mousemove', onPointer, true);
			window.removeEventListener('click', onPointer, true);
			quietRef.current = false;
		};
	}, [appearance.quietSec, active, paused, wake]);

	// Home pressed (the launcher comes to the front): start again at the first tile, or at the app opened last when
	// that is chosen (it falls back to the first tile if that app or input is no longer on the row).
	// Right after a start the app list may still be loading: the tile is then placed once it appears, unless a key was pressed first.
	const pendingKey = useRef<string | null>(null);
	const homePosition = (key: string | null | undefined): RowsPosition | null => (key ? positionOf(sizes, items.findIndex((item) => item.key === key), initialPosition()) : null);
	useEffect(() => {
		const found = homePosition(homeKey);
		pendingKey.current = found ? null : homeKey || null;
		setPosition(found || initialPosition());
	}, [wake]);
	useEffect(() => {
		const found = homePosition(pendingKey.current);
		if (found) { pendingKey.current = null; setPosition(found); }
	}, [items]);

	// A tile was moved: the highlight follows it to its new place.
	useEffect(() => {
		if (!focus) return;
		const index = items.findIndex((item) => item.key === focus.key);
		setPosition((p) => positionOf(sizes, index, p) || p);
	}, [focus && focus.seq]);

	const handleKey = useCallback((key: NavKey): boolean => {
		pendingKey.current = null;                            // the person is moving: a late app list no longer moves the highlight
		if (quietRef.current) return true;                    // the key that wakes the apps does nothing else
		// functional updates, so quick repeated presses never act on a stale position
		if (key === 'left' || key === 'right' || key === 'up' || key === 'down') setPosition((p) => movePosition(sizes, p, key));
		else if (key === 'back') onBack();        // Back opens the Recent apps panel
		return true;            // OK is handled by useOkPress below (press vs hold)
	}, [sizeKey, onBack]);

	useKeys(handleKey, active);
	useOkPress({
		onPress: () => { if (selectedItem && !quietRef.current) onActivate(selectedItem); },
		onLongPress: () => { if (selectedItem && onLongPress && !quietRef.current) onLongPress(selectedItem); }
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
		'--font-tile-label': `${Math.min(24, Math.max(15, Math.round(FONT.tileLabel * scale)))}px`
	});
	const rowStyle = [`left:${appearance.sideMargin}px`, `right:${appearance.sideMargin}px`, `bottom:${appearance.bottomMargin}px`, rowVars.css].filter(Boolean).join(';');
	const shiftVars = varScope('shift', shift ? {'--shift-x': `${shift.x}px`, '--shift-y': `${shift.y}px`} : {});
	const classes = [rowVars.cls, 'rows', !appearance.showLabels && 'rows--no-labels', sizes.length > 1 && 'rows--multi', appearance.iconOpacity < 100 && 'rows--dim', quiet && 'rows--quiet', labelColorValue(appearance.labelColor) && 'rows--label-color', appearance.tileShape !== 'rounded' && `rows--shape-${appearance.tileShape}`].filter(Boolean).join(' ');

	return (
		<div class={`screen${active ? '' : ' screen--away'}${shift ? ' screen--shift' : ''}${shiftVars.cls ? ' ' + shiftVars.cls : ''}`} style={shiftVars.css || undefined}>
			<Clock now={now} format={timeFormat} config={appearance.clock} weather={weather} />
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
							onActivate={(col) => onActivate(items[start + col])}
							tileSize={tileSize}
							tileGap={tileGap}
							viewportWidth={LAYOUT.screenWidth - 2 * appearance.sideMargin}
						/>
					);
				})}
			</div>
		</div>
	);
}
