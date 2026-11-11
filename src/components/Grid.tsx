import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {LAYOUT} from '../theme/tokens';
import {varScope} from '../lib/cssvars';
import {clamp} from '../hooks/useKeys';
import {Tile, type TileModel} from './Tile';

interface Props {
	items: TileModel[];
	checkedKeys: string[];
	focused: boolean;
	selected: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

const VIEWPORT_HEIGHT = 650;          // first guess until the viewport is measured: .grid__viewport is 69.4% of the Settings area (650 px at 1080 high; p22c, was fixed 650px)
const LABEL_HEIGHT = 60;              // two-line tile label + its top margin (see .tile__label)
const GRID_ROW_GAP = 40;              // matches .grid__track grid-row-gap
const ROW_STEP = LAYOUT.gridTileSize + LABEL_HEIGHT + GRID_ROW_GAP;

/** Full grid of tiles; scrolls vertically to keep the focused row in view. */
export function Grid ({items, checkedKeys, focused, selected, onSelect, onActivate}: Props) {
	const viewRef = useRef<HTMLDivElement>(null);
	const [viewH, setViewH] = useState(VIEWPORT_HEIGHT);
	// p22c: the viewport's height is a share of the Settings area, so it is read once here (layout pixels: not changed by the screen-fit scale) and again if the window changes
	useLayoutEffect(() => {
		const measure = () => {
			const el = viewRef.current;
			if (!el) return;
			const h = el.offsetHeight;
			if (h >= 200) setViewH((was) => (was === h ? was : h));
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);
	const rows = Math.ceil(items.length / LAYOUT.gridColumns);
	const total = rows * ROW_STEP - GRID_ROW_GAP;
	const rowIndex = Math.floor(selected / LAYOUT.gridColumns);
	const offset = total <= viewH ? 0
		: clamp(rowIndex * ROW_STEP - (viewH - ROW_STEP) / 2, 0, total - viewH);

	const vars = varScope('grid', {'--layout-tile-size': `${LAYOUT.gridTileSize}px`, '--layout-tile-radius': '18px'});

	return (
		<div ref={viewRef} class={`grid__viewport${vars.cls ? ' ' + vars.cls : ''}`} style={vars.css || undefined}>
			<div class="grid__track" style={{transform: `translateY(${-offset}px)`}}>
				{items.map((item, i) => {
					const checked = checkedKeys.indexOf(item.key) !== -1;
					return (
						<Tile
							key={item.key}
							model={item}
							focused={focused && i === selected}
							checked={checked}
							dimmed={!checked}
							onHover={() => onSelect(i)}
							onActivate={() => onActivate(i)}
						/>
					);
				})}
			</div>
		</div>
	);
}
