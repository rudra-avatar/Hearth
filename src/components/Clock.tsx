import {fullDate, timeParts, type TimeFormat} from '../lib/clock';
import type {ClockConfig} from '../lib/storage';
import {colorInfo, inkIsDark, validInk} from '../lib/clockcolor';
import {fontFamily} from '../lib/clockfont';
import type {WeatherView} from '../lib/weather';
import {WeatherGlyph} from './Glyph';
import {varScope} from '../lib/cssvars';

/** The clock: the time (with a small AM/PM beside it in 12-hour mode) and the date.
 *  Size, thickness, colour, position and what is shown all come from the settings. */
export function Clock ({now, format, config, weather}: {now: Date; format: TimeFormat; config: ClockConfig; weather?: WeatherView | null}) {
	const {time, period} = timeParts(now, format);
	const size = config.size;
	const info = colorInfo(config.color);
	const ink = validInk(config.ink);          // P100: a theme's own ink wins over the colour choice
	const vars: Record<string, string | undefined> = {};
	const style: Record<string, string> = {top: `${config.top}%`, left: `${config.left}%`, fontFamily: fontFamily(config.font)};
	if (ink) style.color = ink;
	else if (info.color) style.color = info.color;          // 'Follow theme': no colour set, the text keeps the theme's own
	if (config.shadow) {
		// strength 50% = the standard slight shadow (40% black, 8 px blur); the blur grows a little with the strength
		const a = (config.shadowStrength * 0.008).toFixed(2);
		const blur = Math.round(4 + config.shadowStrength * 0.08);
		vars['--clock-shadow'] = `0 2px ${blur}px rgba(0, 0, 0, ${a})`;
		vars['--clock-drop'] = `drop-shadow(0 2px ${blur}px rgba(0, 0, 0, ${a}))`;
	}
	const dark = ink ? inkIsDark(ink) : info.dark;
	// R1: a soft gradient behind the widget (black behind light text, white behind dark text); static, no blur
	const scrimTone = dark ? '255, 255, 255' : '0, 0, 0';
	const scrimA = config.scrim / 200;          // F1: 100 % = 0.5 opacity (the earlier maximum was 60 % opacity at the old 60; now 100 = old 50)
	const scrimBg = config.scrim > 0 ? `radial-gradient(ellipse at center, rgba(${scrimTone}, ${scrimA.toFixed(3)}) 0%, rgba(${scrimTone}, ${(scrimA * 0.6).toFixed(3)}) 35%, rgba(${scrimTone}, 0) 70%)` : '';
	const scope = varScope('clock', vars);
	for (const k in scope.obj) style[k] = scope.obj[k];
	if (config.opacity < 100) style.opacity = String(config.opacity / 100);
	const classes = [scope.cls, 'clock', dark && 'clock--dark', !config.shadow && 'clock--noshadow', config.align === 'left' && 'clock--left', config.align === 'right' && 'clock--right'].filter(Boolean).join(' ');
	return (
		<div class={classes} style={style}>
			{scrimBg && <div class="clock__scrim" style={{background: scrimBg}} />}
			<div class="clock__time" style={{fontSize: `${size}px`, fontWeight: config.weight, letterSpacing: `${(size * 0.045).toFixed(1)}px`}}>
				{time}
				{period && config.showPeriod && (
					<span class="clock__period" style={{fontSize: `${Math.round(size * 0.27)}px`, marginLeft: `${Math.round(size * 0.12)}px`}}>{period}</span>
				)}
			</div>
			{config.showDate && (
				<div class="clock__date" style={{fontSize: `${Math.max(26, Math.round(size * 0.2))}px`, marginTop: `${Math.round(size * 0.16)}px`}}>{fullDate(now)}</div>
			)}
			{weather && (
				<div class="clock__weather" style={{fontSize: `${Math.max(24, Math.round(size * 0.17))}px`, marginTop: `${Math.round(size * 0.1)}px`}}>
					<WeatherGlyph icon={weather.icon} />
					<span>{weather.city ? weather.city + '  ·  ' : ''}{weather.main}{weather.range ? '  ·  ' + weather.range : ''}</span>
				</div>
			)}
		</div>
	);
}
