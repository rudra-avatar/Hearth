import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import {ContinueRow} from '../components/ContinueRow';
import type {ContinueItem} from '../lib/plex';
import type {TileModel} from '../components/Tile';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import type {TimeFormat} from '../lib/clock';
import {clampPosition, initialPosition, movePosition, rowOffsets, splitRows, type RowsPosition} from '../lib/rows';
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
	/** counts up each time the launcher is brought to the front (Home pressed): the highlight goes back to the first tile */
	wake?: number;
	/** put the highlight on the tile with this key (after it was moved); `seq` changes for each request */
	focus?: {key: string; seq: number};
	/** the weather line under the date, when it is on and known */
	weather?: WeatherView | null;
	/** "Continue Watching" above the apps (empty or absent: no row) */
	continueItems?: ContinueItem[];
	/** OK on a Continue Watching card (details: OK was held, open the title's page instead of playing) */
	onContinue?: (item: ContinueItem, details: boolean) => void;
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
export function Home ({items, timeFormat, appearance, active, paused, onActivate, onLongPress, onBack, wake, focus, weather, continueItems, onContinue}: Props) {
	const cw = continueItems || [];
	const [inCw, setInCw] = useState(false);            // the highlight is on the Continue Watching row
	const [cwIndex, setCwIndex] = useState(0);
	const onCw = inCw && cw.length > 0;
	const cwAt = Math.min(cwIndex, Math.max(0, cw.length - 1));
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

	// Home pressed (the launcher comes to the front): start again at the first tile.
	useEffect(() => { setPosition(initialPosition()); setInCw(false); setCwIndex(0); }, [wake]);

	// A tile was moved: the highlight follows it to its new place.
	useEffect(() => {
		if (!focus) return;
		const index = items.findIndex((item) => item.key === focus.key);
		if (index === -1) return;
		let row = 0;
		while (row < sizes.length - 1 && index >= offsets[row] + sizes[row]) row++;
		setPosition((p) => ({row, cols: clampPosition(sizes, p).cols.map((c, r) => (r === row ? index - offsets[row] : c))}));
	}, [focus && focus.seq]);

	const handleKey = useCallback((key: NavKey): boolean => {
		if (quietRef.current) return true;                    // the key that wakes the apps does nothing else
		if (key === 'back') { onBack(); return true; }      // Back opens the Recent apps panel
		if (onCw) {
			if (key === 'left' || key === 'right') setCwIndex((i) => Math.max(0, Math.min(cw.length - 1, i + (key === 'right' ? 1 : -1))));
			else if (key === 'down') setInCw(false);
			return true;
		}
		// Up from the top row of apps reaches Continue Watching
		if (key === 'up' && cw.length > 0 && clampPosition(sizes, position).row === 0) { setInCw(true); return true; }
		// functional updates, so quick repeated presses never act on a stale position
		if (key === 'left' || key === 'right' || key === 'up' || key === 'down') setPosition((p) => movePosition(sizes, p, key));
		return true;            // OK is handled by useOkPress below (press vs hold)
	}, [sizeKey, onBack, onCw, cw.length, position]);

	useKeys(handleKey, active);
	useOkPress({
		onPress: () => {
			if (quietRef.current) return;
			if (onCw) { if (onContinue) onContinue(cw[cwAt], false); return; }
			if (selectedItem) onActivate(selectedItem);
		},
		onLongPress: () => {
			if (quietRef.current) return;
			if (onCw) { if (onContinue) onContinue(cw[cwAt], true); return; }
			if (selectedItem && onLongPress) onLongPress(selectedItem);
		}
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
				{cw.length > 0 && (
					<ContinueRow
						items={cw}
						focused={onCw}
						selected={cwAt}
						viewportWidth={LAYOUT.screenWidth - 2 * appearance.sideMargin}
						onSelect={(i) => { setInCw(true); setCwIndex(i); }}
						onActivate={(i) => { if (onContinue) onContinue(cw[i], false); }}
					/>
				)}
				{sizes.map((size, r) => {
					const start = offsets[r];
					return (
						<Row
							key={r}
							items={items.slice(start, start + size)}
							focused={!onCw && r === at.row}
							selected={at.cols[r]}
							onSelect={(col) => { setInCw(false); setPosition({row: r, cols: at.cols.map((c, i) => (i === r ? col : c))}); }}
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
