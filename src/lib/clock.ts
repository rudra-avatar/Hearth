import {t as tt, td} from '../i18n';
// Time-of-day text. Pure functions so they are trivially testable.

export type TimeFormat = '12h' | '24h';


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
