import {useState} from 'preact/hooks';
import {posterSrc, type ShelfView} from '../lib/shelves';

/** Poster size and gap at 1080p (layout px). Small enough for two shelves under the home row, large enough to read from the sofa. */
export const POSTER_W = 176;
export const POSTER_H = 264;
export const POSTER_GAP = 28;
const STEP = POSTER_W + POSTER_GAP;

interface Props {
	shelf: ShelfView;
	/** the highlight is on this shelf */
	focused: boolean;
	selected: number;
	/** the width the shelf has (layout px) */
	width: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

/** One media shelf (any source, lib/shelves.ts): a heading and a row of posters with the title (and episode or year) under each,
 *  like PlxNative's own shelves. The row scrolls so the highlighted poster stays second from the left (the first one at the start). */
export function MediaShelf ({shelf, focused, selected, width, onSelect, onActivate}: Props) {
	const total = shelf.items.length * STEP - POSTER_GAP;
	const max = Math.max(0, total - width);
	const offset = Math.max(0, Math.min(max, (selected - 1) * STEP));
	// posters that did not load (server off, item gone): the fetch (rev) they failed in, by item key; see posterSrc
	const [failed, setFailed] = useState<Record<string, number>>({});
	const fail = (key: string) => setFailed((f) => (f[key] === shelf.rev ? f : {...f, [key]: shelf.rev}));
	return (
		<section class={`shelf${focused ? ' shelf--focused' : ''}`}>
			<h2 class="shelf__title">{shelf.title}</h2>
			<div class="shelf__viewport" style={{width: `${width}px`}}>
				<div class="shelf__track" style={{transform: `translate3d(${-offset}px, 0, 0)`}}>
					{shelf.items.map((item, i) => {
						const src = posterSrc(shelf.image(item), shelf.rev, failed[item.key] || 0);
						return (
							<div
								key={item.key}
								class={`poster${focused && i === selected ? ' poster--focused' : ''}`}
								style={{width: `${POSTER_W}px`, marginRight: i === shelf.items.length - 1 ? '0' : `${POSTER_GAP}px`}}
								onMouseEnter={() => onSelect(i)}
								onClick={() => onActivate(i)}
							>
								<div class="poster__frame" style={{width: `${POSTER_W}px`, height: `${POSTER_H}px`}}>
									{src ? <img key={src} class="poster__image" src={src} alt="" onError={() => fail(item.key)} /> : <div class="poster__fallback">{item.title}</div>}
									{item.progress > 0 && <div class="poster__progress"><div class="poster__progress-bar" style={{width: `${Math.round(item.progress * 100)}%`}} /></div>}
									<div class="poster__ring" />
								</div>
								<div class="poster__title">{item.title}</div>
								{item.subtitle && <div class="poster__subtitle">{item.subtitle}</div>}
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
