import {Component} from 'preact';
import {clamp} from '../hooks/useKeys';
import type {ContinueItem} from '../lib/plex';

interface Props {
	items: ContinueItem[];
	focused: boolean;
	selected: number;
	/** the width the row has to fit in (px at 1080p) */
	viewportWidth: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

/** card width and gap (px at 1080p); keep in sync with .continue__card in global.css */
export const CONTINUE_CARD = {width: 320, height: 180, gap: 28};

/** One card; skips its redraw unless its own focus or item changed (moving the highlight redraws two cards). */
class Card extends Component<{item: ContinueItem; focused: boolean; onHover: () => void; onActivate: () => void}> {
	shouldComponentUpdate (next: {item: ContinueItem; focused: boolean}): boolean {
		return next.focused !== this.props.focused || next.item !== this.props.item;
	}

	render () {
		const {item, focused, onHover, onActivate} = this.props;
		return (
			<div class={`continue__card${focused ? ' continue__card--focused' : ''}`} onMouseEnter={onHover} onClick={onActivate}>
				<div class="continue__frame">
					{item.imageUrl ? <img class="continue__image" src={item.imageUrl} alt="" /> : <div class="continue__blank">{item.title.charAt(0)}</div>}
					{item.progress > 0 && <div class="continue__bar"><div class="continue__fill" style={{transform: `scaleX(${item.progress.toFixed(3)})`}} /></div>}
					<div class="continue__ring" />
				</div>
				<div class="continue__title">{item.title}</div>
				<div class="continue__detail">{item.detail}</div>
			</div>
		);
	}
}

/** "Continue Watching" above the home row: wide cards, a carousel that keeps the selected card in view. */
export function ContinueRow ({items, focused, selected, viewportWidth, onSelect, onActivate}: Props) {
	const step = CONTINUE_CARD.width + CONTINUE_CARD.gap;
	const total = items.length * step - CONTINUE_CARD.gap;
	const fits = total <= viewportWidth;
	const offset = fits ? 0 : clamp(selected * step + CONTINUE_CARD.width / 2 - viewportWidth / 2, 0, total - viewportWidth);
	return (
		<section class={`row continue${focused ? ' row--focused' : ''}`}>
			<h2 class="row__label">Continue Watching</h2>
			<div class="row__viewport">
				<div class={`row__track${fits ? ' row__track--centered' : ''}`} style={{transform: `translate3d(${-offset}px, 0, 0)`}}>
					{items.map((item, i) => (
						<Card key={item.key} item={item} focused={focused && i === selected} onHover={() => onSelect(i)} onActivate={() => onActivate(i)} />
					))}
				</div>
			</div>
		</section>
	);
}
