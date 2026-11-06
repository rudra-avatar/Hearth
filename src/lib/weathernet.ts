// Fetching the weather and searching for places. The web view asks the service directly. Some older TVs
// cannot verify modern web certificates, so when that fails and the Homebrew Channel is available, the same
// address is fetched through the TV's own curl or wget instead (the last two attempts skip the certificate
// check: the reply is public weather data that is only ever read as numbers and a place name).

import {exec} from './apps';
import {FORECAST_HOSTS, forecastUrl, geocodeUrl, parseCities, parseWeather, validCoords, type City, type ForecastHost, type WeatherData} from './weather';

/** Only plain https addresses made of safe characters ever reach a shell. */
const SAFE_URL = /^https:\/\/[A-Za-z0-9._\/?=&,%-]+$/;

function viaWebView (url: string, timeoutMs: number): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open('GET', url, true);
		request.timeout = timeoutMs;
		request.onload = () => (request.status >= 200 && request.status < 300 ? resolve(request.responseText) : reject(new Error('HTTP ' + request.status)));
		request.onerror = () => reject(new Error('network error'));
		request.ontimeout = () => reject(new Error('timed out'));
		request.send();
	});
}

export function shellFetchCommand (url: string): string {
	return `U='${url}'; curl -s -m 12 "$U" || curl -sk -m 12 "$U" || wget -qO- -T 12 "$U" || wget -qO- -T 12 --no-check-certificate "$U"`;
}

function viaShell (url: string): Promise<string> {
	if (!SAFE_URL.test(url)) return Promise.reject(new Error('unsafe address'));
	return exec(shellFetchCommand(url), 40000);
}

/** The text at `url`: asked directly first, then (if allowed) through the TV's shell. */
export function fetchText (url: string, allowShell: boolean): Promise<string> {
	return viaWebView(url, 10000).catch((error: Error) => (allowShell ? viaShell(url) : Promise.reject(error)));
}

// The forecast host that answered last is kept and asked first next time, so a network that blocks the official
// address does not wait for it on every refresh.
const HOST_KEY = 'customlauncher-weather-host';

function savedHost (): ForecastHost | null {
	try {
		const v = localStorage.getItem(HOST_KEY);
		return v && (FORECAST_HOSTS as readonly string[]).indexOf(v) >= 0 ? v as ForecastHost : null;
	} catch { return null; }
}

function saveHost (host: ForecastHost): void {
	try { localStorage.setItem(HOST_KEY, host); } catch { /* ignore */ }
}

/** The hosts in the order to try: the one that worked last, then the rest in their usual order. */
export function hostOrder (last: ForecastHost | null): ForecastHost[] {
	const all = FORECAST_HOSTS.slice() as ForecastHost[];
	return last ? [last].concat(all.filter((h) => h !== last)) : all;
}

function forecastFrom (city: City, host: ForecastHost, viaShellToo: boolean): Promise<WeatherData> {
	const url = forecastUrl(city.lat, city.lon, host);
	return (viaShellToo ? viaShell(url) : viaWebView(url, 10000)).then((text) => {
		const data = parseWeather(text, city.lat, city.lon, Date.now());
		if (!data) throw new Error('unreadable reply');
		return data;
	});
}

export function fetchWeather (city: City, allowShell: boolean): Promise<WeatherData> {
	if (!validCoords(city.lat, city.lon)) return Promise.reject(new Error('bad place'));
	const hosts = hostOrder(savedHost());
	// every host through the web view first (quick), then, on a rooted TV, every host through the TV's curl/wget
	const plan: Array<[ForecastHost, boolean]> = hosts.map((h): [ForecastHost, boolean] => [h, false]);
	if (allowShell) hosts.forEach((h) => plan.push([h, true]));
	const attempt = (i: number, lastError: Error | null): Promise<WeatherData> => {
		if (i >= plan.length) return Promise.reject(lastError || new Error('no weather host answered'));
		const [host, shell] = plan[i];
		return forecastFrom(city, host, shell).then(
			(data) => { saveHost(host); return data; },
			(error: Error) => attempt(i + 1, error)
		);
	};
	return attempt(0, null);
}

export function searchCities (query: string, allowShell: boolean): Promise<City[]> {
	if (query.trim().length < 2) return Promise.resolve([]);
	return fetchText(geocodeUrl(query), allowShell).then(parseCities);
}
