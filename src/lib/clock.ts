// Time-of-day text. Pure functions so they are trivially testable.

import {t} from './i18n';

export type TimeFormat = '12h' | '24h';

const DAY_KEYS = ['time.day.sunday', 'time.day.monday', 'time.day.tuesday', 'time.day.wednesday', 'time.day.thursday', 'time.day.friday', 'time.day.saturday'];
const MONTH_KEYS = ['time.month.january', 'time.month.february', 'time.month.march', 'time.month.april', 'time.month.may', 'time.month.june', 'time.month.july', 'time.month.august', 'time.month.september', 'time.month.october', 'time.month.november', 'time.month.december'];

export function greeting (date: Date): string {
	const h = date.getHours();
	if (h < 12) return t('time.greeting.morning');
	if (h < 18) return t('time.greeting.afternoon');
	return t('time.greeting.evening');
}

export function dayName (date: Date): string {
	return t(DAY_KEYS[date.getDay()]);
}

/** "23 September" */
export function dateText (date: Date): string {
	return t('time.date', {day: String(date.getDate()), month: t(MONTH_KEYS[date.getMonth()])});
}

/** "Sunday, 11 October 2026" */
export function fullDate (date: Date): string {
	return t('time.fullDate', {day: dayName(date), date: dateText(date), year: String(date.getFullYear())});
}

export interface TimeParts {
	/** "15:42" or "3:42" */
	time: string;
	/** "AM" / "PM" in 12-hour format, otherwise empty */
	period: string;
}

export function timeParts (date: Date, format: TimeFormat): TimeParts {
	const h = date.getHours();
	const m = pad(date.getMinutes());
	if (format === '24h') return {time: `${pad(h)}:${m}`, period: ''};
	return {time: `${h % 12 || 12}:${m}`, period: h < 12 ? 'AM' : 'PM'};
}

function pad (n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** How far (px) to move the clock up so its bottom stays `gap` above `limit` (the top of the app row), without
 *  moving its top above `minTop`. `top` and `bottom` are where it is drawn when not moved. 0 when it already fits. */
export function liftToClear (top: number, bottom: number, limit: number, gap: number, minTop: number): number {
	const needed = bottom + gap - limit;
	if (needed <= 0) return 0;
	return Math.max(0, Math.min(needed, top - minTop));
}

export interface CardFit {
	/** px to move the cards up (centred layout) */
	lift: number;
	/** the weather card keeps its own height instead of matching the clock card */
	compact: boolean;
	/** 1, or less when the cards must shrink to fit (corner layout) */
	scale: number;
}

/** Fits the Glass cards above the app row. `top` is where the cards start, `height` and `compactHeight` their
 *  height with two equal cards and with the weather card at its own height, and `limit` the top of the app row.
 *  Centred cards may move up (not above `minTop`); cards in the corner stay where they are and shrink instead. */
export function fitCards (corner: boolean, top: number, height: number, compactHeight: number, limit: number, gap: number, minTop: number): CardFit {
	const room = limit - gap;
	if (corner) {
		if (top + height <= room) return {lift: 0, compact: false, scale: 1};
		if (top + compactHeight <= room) return {lift: 0, compact: true, scale: 1};
		return {lift: 0, compact: true, scale: Math.max(0.4, Math.floor((room - top) / compactHeight * 100) / 100)};
	}
	const lift = liftToClear(top, top + height, limit, gap, minTop);
	if (top - lift + height <= room) return {lift, compact: false, scale: 1};
	return {lift: liftToClear(top, top + compactHeight, limit, gap, minTop), compact: true, scale: 1};
}

/** OLED care: where the clock is nudged to at `time` (ms), in px. It steps round nine spots at most `reach` px from
 *  where it was placed, one step every `stepMs`, so no part of the screen shows the same thing for hours. */
const SHIFT_STEPS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export function shiftAt (time: number, reach = 8, stepMs = 3 * 60 * 1000): {x: number; y: number} {
	const [x, y] = SHIFT_STEPS[Math.floor(time / stepMs) % SHIFT_STEPS.length];
	return {x: x * reach, y: y * reach};
}
