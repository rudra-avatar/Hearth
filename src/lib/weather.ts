import {t as tt} from '../i18n';
// The weather line under the clock's date: data from Open-Meteo (free, no key). This file is the pure part
// (reading the reply, describing it, formatting, the saved copy); weathernet.ts does the fetching.

export type TempUnit = 'c' | 'f';
export type WeatherIcon = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface City {
	name: string;
	lat: number;
	lon: number;
	/** region and country, for telling cities of the same name apart */
	detail?: string;
}

export interface WeatherData {
	/** the place it is for */
	lat: number;
	lon: number;
	/** °C, as the service gives it (converted for display) */
	tempC: number;
	highC: number | null;
	lowC: number | null;
	/** WMO weather code */
	code: number;
	isDay: boolean;
	/** when it was read (ms since 1970) */
	at: number;
}

export const WEATHER_CACHE_KEY = 'customlauncher-weather-v1';
/** A reading younger than this is not fetched again. */
export const FRESH_MS = 30 * 60 * 1000;
/** An older reading than this is no longer shown (the TV was off for a long while). */
export const SHOWN_MS = 6 * 60 * 60 * 1000;

const num = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? x : null);

/** Coordinates as they go into a web address: plain numbers only, nothing else can get in. */
function coord (n: number): string {
	return (Math.round(n * 1000) / 1000).toFixed(3);
}

export function validCoords (lat: unknown, lon: unknown): boolean {
	return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function forecastUrl (lat: number, lon: number): string {
	return 'https://api.open-meteo.com/v1/forecast?latitude=' + coord(lat) + '&longitude=' + coord(lon)
		+ '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
}

export function geocodeUrl (query: string): string {
	return 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query.trim().slice(0, 60)) + '&count=8&language=en&format=json';
}

/** Reads Open-Meteo's forecast reply; null when it isn't one. */
export function parseWeather (json: string, lat: number, lon: number, now: number): WeatherData | null {
	try {
		const data = JSON.parse(json);
		const current = data && data.current;
		const temp = current ? num(current.temperature_2m) : null;
		const code = current ? num(current.weather_code) : null;
		if (temp === null || code === null) return null;
		const daily = data.daily || {};
		const first = (list: unknown): number | null => (Array.isArray(list) ? num(list[0]) : null);
		return {lat, lon, tempC: temp, highC: first(daily.temperature_2m_max), lowC: first(daily.temperature_2m_min), code, isDay: current.is_day !== 0, at: now};
	} catch {
		return null;
	}
}

/** Reads Open-Meteo's place-search reply into a list of cities. */
export function parseCities (json: string): City[] {
	try {
		const data = JSON.parse(json);
		const list = data && Array.isArray(data.results) ? data.results : [];
		const out: City[] = [];
		list.forEach((r: Record<string, unknown>) => {
			if (typeof r.name !== 'string' || !validCoords(r.latitude, r.longitude)) return;
			const detail = [r.admin1, r.country].filter((x) => typeof x === 'string' && x).join(', ');
			out.push({name: r.name, lat: r.latitude as number, lon: r.longitude as number, detail: detail || undefined});
		});
		return out;
	} catch {
		return [];
	}
}

/** Words and a picture for a WMO weather code. */
export function describe (code: number, isDay: boolean): {text: string; icon: WeatherIcon} {
	if (code === 0) return {text: tt('weather.clear'), icon: isDay ? 'sun' : 'moon'};
	if (code === 1) return {text: tt('weather.mostlyClear'), icon: isDay ? 'sun' : 'moon'};
	if (code === 2) return {text: tt('weather.partlyCloudy'), icon: 'partly'};
	if (code === 3) return {text: tt('weather.overcast'), icon: 'cloud'};
	if (code === 45 || code === 48) return {text: tt('weather.fog'), icon: 'fog'};
	if (code >= 51 && code <= 55) return {text: tt('weather.drizzle'), icon: 'rain'};
	if (code === 56 || code === 57) return {text: tt('weather.freezingDrizzle'), icon: 'rain'};
	if (code === 61) return {text: tt('weather.lightRain'), icon: 'rain'};
	if (code === 63) return {text: tt('weather.rain'), icon: 'rain'};
	if (code === 65) return {text: tt('weather.heavyRain'), icon: 'rain'};
	if (code === 66 || code === 67) return {text: tt('weather.freezingRain'), icon: 'rain'};
	if (code === 71) return {text: tt('weather.lightSnow'), icon: 'snow'};
	if (code === 73) return {text: tt('weather.snow'), icon: 'snow'};
	if (code === 75) return {text: tt('weather.heavySnow'), icon: 'snow'};
	if (code === 77) return {text: tt('weather.snowGrains'), icon: 'snow'};
	if (code === 80) return {text: tt('weather.lightShowers'), icon: 'rain'};
	if (code === 81) return {text: tt('weather.showers'), icon: 'rain'};
	if (code === 82) return {text: tt('weather.heavyShowers'), icon: 'rain'};
	if (code === 85 || code === 86) return {text: tt('weather.snowShowers'), icon: 'snow'};
	if (code === 95) return {text: tt('weather.thunderstorm'), icon: 'storm'};
	if (code === 96 || code === 99) return {text: tt('weather.thunderstormHail'), icon: 'storm'};
	return {text: tt('weather.cloudy'), icon: 'cloud'};
}

/** "29°" (always whole degrees, in the chosen unit). */
export function formatTemp (celsius: number, unit: TempUnit): string {
	const value = unit === 'f' ? celsius * 9 / 5 + 32 : celsius;
	const rounded = Math.round(value);
	return (rounded === 0 ? 0 : rounded) + '°';        // no "-0°"
}

export interface WeatherView {
	icon: WeatherIcon;
	/** "29° Partly cloudy" */
	main: string;
	/** "H 31° L 25°", or empty */
	range: string;
	city: string;
}

/** What the clock shows. */
export function weatherView (data: WeatherData, unit: TempUnit, showRange: boolean, cityName: string): WeatherView {
	const d = describe(data.code, data.isDay);
	const range = showRange && data.highC !== null && data.lowC !== null ? 'H ' + formatTemp(data.highC, unit) + '  L ' + formatTemp(data.lowC, unit) : '';
	return {icon: d.icon, main: formatTemp(data.tempC, unit) + ' ' + d.text, range, city: cityName};
}

export function isFresh (data: WeatherData | null, lat: number, lon: number, now: number): boolean {
	return !!data && data.lat === lat && data.lon === lon && now - data.at < FRESH_MS && now >= data.at;
}

/** The saved reading, if it is for this place and not too old. */
export function usableCached (data: WeatherData | null, lat: number, lon: number, now: number): WeatherData | null {
	return data && data.lat === lat && data.lon === lon && now - data.at < SHOWN_MS && now >= data.at ? data : null;
}

export function readWeatherCache (): WeatherData | null {
	try {
		const raw = localStorage.getItem(WEATHER_CACHE_KEY);
		if (!raw) return null;
		const d = JSON.parse(raw);
		if (!validCoords(d.lat, d.lon) || num(d.tempC) === null || num(d.code) === null || num(d.at) === null) return null;
		return {lat: d.lat, lon: d.lon, tempC: d.tempC, highC: num(d.highC), lowC: num(d.lowC), code: d.code, isDay: d.isDay !== false, at: d.at};
	} catch {
		return null;
	}
}

export function writeWeatherCache (data: WeatherData): void {
	try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data)); } catch { /* storage full: it is just fetched again */ }
}
