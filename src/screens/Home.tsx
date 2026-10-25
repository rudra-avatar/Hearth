import {useCallback, useEffect, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import type {TimeFormat} from '../lib/clock';
import {clampPosition, initialPosition, movePosition, rowOffsets, splitRows, type RowsPosition} from '../lib/rows';
import type {ClockConfig} from '../lib/storage';
import type {WeatherView} from '../lib/weather';
import {FONT, LAYOUT} from '../theme/tokens';

export interface Appearance {
	/** icon size, % of the standard size */
	iconScale: number;
	/** px at 1080p */
	sideMargin: number;
	bottomMargin: number;
	showLabels: boolean;
	/** 1 or 2 rows of apps */
	rows: number;
	clock: ClockConfig;
	/** Glass theme: the clock and the weather are shown as two frosted cards of the same size */
	clockCards?: boolean;
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
	/** counts up each time the launcher is brought to the front (Home pressed): the highlight goes back to the first tile */
	wake?: number;
	/** put the highlight on the tile with this key (after it was moved); `seq` changes for each request */
	focus?: {key: string; seq: number};
	/** the weather line under the date, when it is on and known */
	weather?: WeatherView | null;
	/** quiet mode: the app row has faded out (Look → Hide the apps when idle) */
	quiet?: boolean;
}

/** The home screen: a clock and the tiles along the bottom, in one row or two.
 *  Left/Right move along a row, Up/Down change row (two rows), OK opens, holding OK opens the app's menu.
 *  Back goes to the first tile. */
export function Home ({items, timeFormat, appearance, active, paused, onActivate, onLongPress, wake, focus, weather, quiet}: Props) {
	const now = useClock(paused);
	const [position, setPosition] = useState<RowsPosition>(initialPosition);
	const sizes = splitRows(items.length, appearance.rows);
	const offsets = rowOffsets(sizes);
	const at = clampPosition(sizes, position);
	const selectedItem = items[offsets[at.row] + at.cols[at.row]];
	const sizeKey = sizes.join(',');

	// Home pressed (the launcher comes to the front): start again at the first tile.
	useEffect(() => { setPosition(initialPosition()); }, [wake]);

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
		// functional updates, so quick repeated presses never act on a stale position
		if (key === 'left' || key === 'right' || key === 'up' || key === 'down') setPosition((p) => movePosition(sizes, p, key));
		else if (key === 'back') setPosition(initialPosition());        // Back jumps to the first app
		return true;            // OK is handled by useOkPress below (press vs hold)
	}, [sizeKey]);

	useKeys(handleKey, active);
	useOkPress({
		onPress: () => { if (selectedItem) onActivate(selectedItem); },
		onLongPress: () => { if (selectedItem && onLongPress) onLongPress(selectedItem); }
	}, active);

	// The row's sizes are set on the row itself (not on :root), so the Settings grid keeps its own.
	const scale = appearance.iconScale / 100;
	const tileSize = Math.round(LAYOUT.tileSize * scale);
	const tileGap = Math.round(LAYOUT.tileGap * scale);
	const rowStyle = [
		`left:${appearance.sideMargin}px`,
		`right:${appearance.sideMargin}px`,
		`bottom:${appearance.bottomMargin}px`,
		`--layout-tile-size:${tileSize}px`,
		`--layout-tile-gap:${tileGap}px`,
		`--layout-tile-radius:${Math.round(LAYOUT.tileRadius * scale)}px`,
		`--font-tile-label:${Math.min(24, Math.max(15, Math.round(FONT.tileLabel * scale)))}px`
	].join(';');
	const classes = ['rows', !appearance.showLabels && 'rows--no-labels', sizes.length > 1 && 'rows--multi'].filter(Boolean).join(' ');

	return (
		<div class={`screen${active ? '' : ' screen--away'}${quiet ? ' screen--quiet' : ''}`}>
			<Clock now={now} format={timeFormat} config={appearance.clock} weather={weather} cards={appearance.clockCards} />
			<div class={classes} style={rowStyle}>
				{sizes.map((size, r) => {
					const start = offsets[r];
					return (
						<Row
							key={r}
							items={items.slice(start, start + size)}
							focused={r === at.row}
							selected={at.cols[r]}
							onSelect={(col) => setPosition({row: r, cols: at.cols.map((c, i) => (i === r ? col : c))})}
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
