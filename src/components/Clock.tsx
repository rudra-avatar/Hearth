import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {fitCards, fullDate, shiftAt, timeParts, type CardFit, type TimeFormat} from '../lib/clock';
import type {ClockConfig} from '../lib/storage';
import {colorInfo} from '../lib/clockcolor';
import {fontFamily} from '../lib/clockfont';
import {hourLabel, type WeatherView} from '../lib/weather';
import {WeatherGlyph} from './Glyph';
import {useLanguage} from '../hooks/useLanguage';

/** Glass cards: space kept above the app row, and how close to the top of the screen they may be moved. */
const GAP_ABOVE_APPS = 28;
const MIN_TOP = 36;
/** Glass cards in the top-left corner: where they start. Their size is the clock size setting, as when centred. */
const CORNER = {top: 56, left: 72};

interface Props {
	now: Date;
	format: TimeFormat;
	config: ClockConfig;
	weather?: WeatherView | null;
	/** Glass theme: the clock and the weather as two frosted cards of the same size, the weather under the clock */
	cards?: boolean;
}

/** The clock: the time (with a small AM/PM beside it in 12-hour mode) and the date, and the weather when it is on.
 *  Size, thickness, colour, position and what is shown all come from the settings. */
export function Clock ({now, format, config, weather, cards}: Props) {
	const {t} = useLanguage();
	const size = config.size;
	const info = colorInfo(config.color);
	const style: Record<string, string> = {top: `${config.top}%`, left: `${config.left}%`, fontFamily: fontFamily(config.font), '--clock-accent': info.accent};
	if (info.gradient) style['--clock-gradient'] = info.gradient; else style.color = info.color as string;
	if (config.opacity < 100) style.opacity = String(config.opacity / 100);
	if (config.shift) {
		// OLED care: a few pixels' nudge every few minutes (margins, so the move or shrink below is not disturbed)
		const nudge = shiftAt(now.getTime());
		style.marginLeft = `${nudge.x}px`;
		style.marginTop = `${nudge.y}px`;
	}
	const corner = !!(cards && config.corner);
	const classes = ['clock', info.gradient && 'clock--gradient', info.dark && 'clock--dark', cards && 'clock--cards', corner && 'clock--corner'].filter(Boolean).join(' ');

	// The stacked cards are tall. Centred, they move up to clear the app row; in the corner they stay put and shrink
	// instead. When two cards of the same height can't fit, the weather card is only as tall as its content.
	// offsetTop/offsetHeight are the layout size, before the move or shrink already applied (transforms don't change them).
	const box = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState<CardFit>({lift: 0, compact: false, scale: 1});
	const hasWeather = !!weather;
	const hasRange = !!(weather && weather.range);
	const hourCount = weather ? weather.hours.length : 0;
	useLayoutEffect(() => {
		const el = box.current;
		const stack = el && el.firstElementChild;
		const rows = el && el.parentElement && el.parentElement.querySelector('.rows') as HTMLElement | null;
		if (!cards || !el || !stack || !rows) { if (fit.lift || fit.compact || fit.scale !== 1) setFit({lift: 0, compact: false, scale: 1}); return; }
		const heightWith = (compact: boolean) => { stack.classList.toggle('clock__cards--compact', compact); return el.offsetHeight; };
		const height = heightWith(false);
		const compactHeight = hasWeather ? heightWith(true) : height;
		stack.classList.toggle('clock__cards--compact', fit.compact);     // back as rendered; a state change below re-renders it
		const next = fitCards(corner, el.offsetTop, height, compactHeight, rows.offsetTop, GAP_ABOVE_APPS, MIN_TOP);
		if (next.lift !== fit.lift || next.compact !== fit.compact || next.scale !== fit.scale) setFit(next);
	}, [cards, corner, size, config.top, config.showDate, config.showPeriod, config.font, config.weight, hasWeather, hasRange, hourCount]);
	if (cards && corner) {
		style.top = `${CORNER.top}px`;
		style.left = `${CORNER.left}px`;
		style.transform = fit.scale !== 1 ? `scale(${fit.scale})` : 'none';   // replaces the centring shift; shrinks from the corner (transform-origin in global.css)
	} else if (cards && fit.lift) style.transform = `translate(-50%, -${fit.lift}px)`;

	if (cards) {
		return (
			<div class={classes} style={style} ref={box}>
				<div class={`clock__cards${fit.compact ? ' clock__cards--compact' : ''}`} style={{fontSize: `${Math.max(22, Math.round(size * 0.18))}px`}}>
					<div class="clock__card clock__card--time">
						<TimeAndDate now={now} format={format} config={config} />
					</div>
					{weather && (
						<div class="clock__card clock__card--weather">
							<div class="clock__card-inner">
							<div class="clock__card-head">
								<WeatherGlyph icon={weather.icon} />
								<span>{weather.city || t('clock.weather')}</span>
							</div>
							<div class="clock__card-body">
								<span class="clock__card-temp">{weather.temp}</span>
								<span class="clock__card-side">
									<span class="clock__card-text">{weather.text}</span>
									{weather.range && <span class="clock__card-range">{weather.range}</span>}
								</span>
							</div>
							{weather.hours.length > 0 && (
								<div class="clock__card-hours">
									{weather.hours.map((h) => (
										<div class="clock__card-hour" key={h.hour}>
											<span class="clock__card-hour-time">{hourLabel(h.hour, format)}</span>
											<WeatherGlyph icon={h.icon} />
											<span class="clock__card-hour-temp">{h.temp}</span>
										</div>
									))}
								</div>
							)}
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div class={classes} style={style}>
			<TimeAndDate now={now} format={format} config={config} />
			{weather && (
				<div class="clock__weather" style={{fontSize: `${Math.max(24, Math.round(size * 0.17))}px`, marginTop: `${Math.round(size * 0.1)}px`}}>
					<WeatherGlyph icon={weather.icon} />
					<span>{weather.city ? weather.city + '  ·  ' : ''}{weather.main}{weather.range ? '  ·  ' + weather.range : ''}</span>
				</div>
			)}
		</div>
	);
}

function TimeAndDate ({now, format, config}: {now: Date; format: TimeFormat; config: ClockConfig}) {
	const {time, period} = timeParts(now, format);
	const size = config.size;
	return (
		<>
			<div class="clock__time" style={{fontSize: `${size}px`, fontWeight: config.weight, letterSpacing: `${(size * 0.045).toFixed(1)}px`}}>
				{time}
				{period && config.showPeriod && (
					<span class="clock__period" style={{fontSize: `${Math.round(size * 0.27)}px`, marginLeft: `${Math.round(size * 0.12)}px`}}>{period}</span>
				)}
			</div>
			{config.showDate && (
				<div class="clock__date" style={{fontSize: `${Math.max(26, Math.round(size * 0.2))}px`, marginTop: `${Math.round(size * 0.16)}px`}}>{fullDate(now)}</div>
			)}
		</>
	);
}
