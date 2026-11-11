import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {Clock} from './Clock';
import {Row} from './Row';
import type {TileModel} from './Tile';
import {favouriteSizes, favouriteSplit, splitRows, rowOffsets} from '../lib/rows';
import {rowsScope, rowsClasses, rowsStyle, rowSide, tileSizes} from '../lib/homelook';
import type {Appearance} from '../screens/Home';
import type {TimeFormat} from '../lib/clock';
import type {WeatherView} from '../lib/weather';
import {LAYOUT} from '../theme/tokens';

const noop = () => undefined;
const WATCH_MS = 15000;      // after a settings change the real wallpaper may still be loading its new picture (it waits 3 s without input, then fades): copy it again for this long; later picture changes (a slideshow) are ignored

/** p23b: a 16:9 miniature of the real home screen, drawn at 1920x1080 and scaled to the width of its box (the help column).
 *  Built from the same pieces as the real screen (Row, Tile, Clock; sizes, variables and class names from lib/homelook.ts), from the live settings.
 *  Mounted by Settings only while one of the preview rows is highlighted (nothing runs at start-up or while idle).
 *  p22d (user): it changes only when the user changes a setting: no clock tick (the time is read once when it opens), no timers. The wallpaper is a copy of the
 *  picture layers on screen (no second loader, no second decode); it is copied again when a setting changes and, for WATCH_MS after that, whenever the real
 *  wallpaper element changes (the new picture arriving and fading in). `wallpaperRev` = what the Wallpaper tab changes. The first app is highlighted. */
export function HomePreview ({items, favourites, appearance, timeFormat, weather, wallpaperRev}: {items: TileModel[]; favourites: string[]; appearance: Appearance; timeFormat: TimeFormat; weather: WeatherView | null; wallpaperRev: string}) {
	const box = useRef<HTMLDivElement>(null);
	const bg = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0);
	const [now] = useState(() => new Date());          // read once: the preview never ticks
	const changed = useRef(0);
	useLayoutEffect(() => {
		const measure = () => { const w = box.current ? box.current.offsetWidth : 0; if (w > 0) setScale((was) => (was === w / LAYOUT.screenWidth ? was : w / LAYOUT.screenWidth)); };
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);
	useLayoutEffect(() => {          // the picture on screen now: a copy of the wallpaper element (the real one keeps fading on its own)
		changed.current = Date.now();
		const holder = bg.current;
		const live = document.querySelector('#root .wallpaper');
		if (!holder || !live) return undefined;
		let copy: HTMLElement | null = null;
		const clear = () => { if (copy && copy.parentNode) copy.parentNode.removeChild(copy); copy = null; };
		const draw = () => { clear(); copy = live.cloneNode(true) as HTMLElement; holder.appendChild(copy); };
		draw();
		const Observer = (window as any).MutationObserver;
		const watch = Observer ? new Observer(() => { if (Date.now() - changed.current < WATCH_MS) draw(); }) : null;
		if (watch) watch.observe(live, {attributes: true, subtree: true, attributeFilter: ['class', 'style']});
		return () => { if (watch) watch.disconnect(); clear(); };
	}, [appearance, wallpaperRev, scale > 0]);          // again when a look or wallpaper setting changes (a theme brings its own veil and shade); and once the strip exists (p28a: it is drawn only after the first width measure, so the first run found no holder and the picture showed only after a change)

	const split = favouriteSplit(items, (item) => item.key, favourites);
	const favN = split.favourites;
	const sizes = favN ? favouriteSizes(favN, split.list.length, false) : splitRows(split.list.length, appearance.rows);
	const offsets = rowOffsets(sizes);
	const {tileSize, tileGap} = tileSizes(appearance);
	const vars = rowsScope(appearance);
	const classes = rowsClasses(appearance, {multi: sizes.length > 1, favN, open: false, shut: false, quiet: false}, vars.cls);
	const t = `scale(${scale.toFixed(5)})`;
	return (
		<div class="homeprev" ref={box} aria-hidden="true">
			{scale > 0 && (
				<div class="homeprev__strip" style={{width: `${LAYOUT.screenWidth}px`, height: `${LAYOUT.screenHeight}px`, transform: t, WebkitTransform: t}}>
					<div class="homeprev__bg" ref={bg} />
					<div class="screen homeprev__screen">
						{appearance.clock.show && <Clock now={now} format={timeFormat} config={appearance.clock} weather={weather} />}
						<div class={classes} style={rowsStyle(appearance, favN, false, vars.css)}>
							{sizes.map((size, r) => {
								const side = rowSide(appearance, favN, r);
								const vw = LAYOUT.screenWidth - 2 * side;
								const step = tileSize + tileGap;
								const shown = Math.ceil(vw / step) + 1;           // tiles beyond the visible width are never drawn here (the row does not centre, as on the real screen)
								return (
									<Row
										key={r}
										items={split.list.slice(offsets[r], offsets[r] + size).slice(0, shown)}
										focused={r === 0}
										selected={0}
										onSelect={noop}
										onActivate={noop}
										tileSize={tileSize}
										tileGap={tileGap}
										viewportWidth={vw}
										sideMargin={favN > 0 ? side : undefined}
									/>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
