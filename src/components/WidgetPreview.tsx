import {useEffect, useState} from 'preact/hooks';
import {Clock} from './Clock';
import {layoutSize, layoutX} from '../lib/fitscale';
import type {TimeFormat} from '../lib/clock';
import type {ClockConfig} from '../lib/storage';
import type {WeatherView} from '../lib/weather';
import type {StatsView} from '../lib/tvstats';

const STRIP_W = 1000;      // the widget is drawn at full size in a strip this wide, then scaled to the free space
const STRIP_H = 400;
const SIZE = 190;          // the widget size shown here is fixed (the Widget size setting is not followed), so the preview is always as large as it can be
const GAP = 16;            // clear space between the option list and the preview
const EDGE = 20;           // clear space at the right of the screen
const MIN_W = 160;         // narrower than this: no preview

/** Settings -> Widget: a miniature of the home screen's widget, drawn from the live settings (P76).
 *  Only the widget is shown (no screen, no frame): the real Clock is drawn at full size in a strip and scaled so the strip
 *  fills the free space right of the option list (measured from the list itself, so it never overlaps the rows).
 *  The size and position settings are not shown: the widget sits left, centre or right of the strip, following the alignment. */
export function WidgetPreview ({now, format, config, weather, stats}: {now: Date; format: TimeFormat; config: ClockConfig; weather: WeatherView | null; stats?: StatsView | null}) {
	const [free, setFree] = useState<{left: number; width: number} | null>(null);
	useEffect(() => {
		const measure = () => {
			const list = document.querySelector('.options');
			const right = list ? layoutX(list.getBoundingClientRect().right) : 1465;
			const left = Math.round(right + GAP);
			const width = Math.floor(layoutSize().w - EDGE - left);
			setFree((was) => (was && was.left === left && was.width === width ? was : {left, width}));
		};
		measure();
		const timer = window.setTimeout(measure, 150);      // the list may still be drawing when the tab opens
		window.addEventListener('resize', measure);
		return () => { window.clearTimeout(timer); window.removeEventListener('resize', measure); };
	}, []);
	if (!free || free.width < MIN_W) return null;
	const scale = free.width / STRIP_W;
	const shown = {...config, size: SIZE, top: 0, left: config.align === 'left' ? 0 : config.align === 'right' ? 100 : 50};
	const t = `scale(${scale.toFixed(4)})`;
	return (
		<div class="widget-preview" style={{left: `${free.left}px`, width: `${free.width}px`, height: `${Math.round(STRIP_H * scale)}px`}} aria-hidden="true">
			<div class="widget-preview__strip" style={{width: `${STRIP_W}px`, height: `${STRIP_H}px`, transform: t, WebkitTransform: t}}>
				<Clock now={now} format={format} config={shown} weather={weather} stats={stats} />
			</div>
		</div>
	);
}
