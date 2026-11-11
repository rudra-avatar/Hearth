import {t as tt, td} from '../i18n';
// Time-of-day text. Pure functions so they are trivially testable.

export type TimeFormat = '12h' | '24h';

/** 2.1.6 p2: the date and weather text sizes follow the clock size. Floor 20 px (was 26 / 24); above 140 px the share grows
 *  (date 20% -> 24%, weather 17% -> 20% at 240) so the big clock does not dwarf them. Old values: floors 26 / 24, shares 20% / 17% flat. */
const share = (size: number, base: number, extra: number): number => (size > 140 ? base + extra * (size - 140) / 100 : base);
export const dateFontPx = (size: number): number => Math.max(20, Math.round(size * share(size, 0.2, 0.04)));
export const weatherFontPx = (size: number): number => Math.max(20, Math.round(size * share(size, 0.17, 0.03)));
/** The number the Widget size row shows: the saved px minus 40 (saved values stay as they are). */
export const sizeLabel = (storedPx: number): number => storedPx - 40;


export function greeting (date: Date): string {
	const h = date.getHours();
	if (h < 12) return tt('clock.goodMorning');
	if (h < 18) return tt('clock.goodAfternoon');
	return tt('clock.goodEvening');
}

export function dayName (date: Date): string {
	return td('clock.day' + date.getDay());
}

/** "23 September" */
export function dateText (date: Date): string {
	return `${date.getDate()} ${td('clock.month' + date.getMonth())}`;
}

/** "Sunday, 11 October 2026" */
export function fullDate (date: Date): string {
	return `${dayName(date)}, ${dateText(date)} ${date.getFullYear()}`;
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
