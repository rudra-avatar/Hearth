import {useRef} from 'preact/hooks';
import {LAYOUT} from '../theme/tokens';
import {clamp} from '../hooks/useKeys';
import {Tile, type TileModel} from './Tile';
import {useLanguage} from '../hooks/useLanguage';

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
}

/** Horizontal strip of tiles. Centred when it fits; otherwise a carousel that keeps
 *  the selected tile in the middle (clamped at the ends). */
export function Row ({label, items, focused, selected, emptyText, onSelect, onActivate, tileSize = LAYOUT.tileSize, tileGap = LAYOUT.tileGap, viewportWidth = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding}: Props) {
	const {t} = useLanguage();
	const step = tileSize + tileGap;
	const total = items.length * step - tileGap;
	const fits = total <= viewportWidth;
	const offset = fits ? 0 : clamp(selected * step + tileSize / 2 - viewportWidth / 2, 0, total - viewportWidth);

	// Steps that follow each other quickly (a held arrow key) glide with a short linear move instead of
	// restarting the usual ease-out curve every time.
	const last = useRef({selected, at: 0, fast: false});
	if (last.current.selected !== selected) {
		const now = Date.now();
		last.current = {selected, at: now, fast: now - last.current.at < 280};
	}

	return (
		<section class={`row${focused ? ' row--focused' : ''}`}>
			{label && <h2 class="row__label">{label}</h2>}
			<div class="row__viewport">
				{items.length === 0
					? <div class="row__empty">{emptyText || t('row.empty')}</div>
					: <div class={`row__track${fits ? ' row__track--centered' : ''}${last.current.fast ? ' row__track--fast' : ''}`} style={{transform: `translate3d(${-offset}px, 0, 0)`}}>
						{items.map((item, i) => (
							<Tile
								key={item.key}
								model={item}
								focused={focused && i === selected}
								onHover={() => onSelect(i)}
								onActivate={() => onActivate(i)}
							/>
						))}
					</div>}
			</div>
		</section>
	);
}
