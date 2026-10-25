// Tests for the weather widget's pure parts.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/weather.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-weather-test.mjs', platform: 'node', logLevel: 'error'});
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, entryPoints: [new URL('../src/lib/weathernet.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-weathernet-test.mjs', platform: 'node', logLevel: 'error'});
const w = await import(dir + '.cache-weather-test.mjs');
const n = await import(dir + '.cache-weathernet-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const reply = JSON.stringify({current: {temperature_2m: 29.4, weather_code: 2, is_day: 1}, daily: {temperature_2m_max: [31.2], temperature_2m_min: [25.1]}});
const d = w.parseWeather(reply, 12.97, 77.59, 1000);
eq(d && [d.tempC, d.highC, d.lowC, d.code, d.isDay, d.at], [29.4, 31.2, 25.1, 2, true, 1000], 'parses a forecast reply');
eq(w.parseWeather('not json', 0, 0, 0), null, 'garbage is not a forecast');
eq(w.parseWeather('{"current":{}}', 0, 0, 0), null, 'a reply without a temperature is rejected');
eq(w.parseWeather(JSON.stringify({current: {temperature_2m: 5, weather_code: 0, is_day: 0}}), 0, 0, 5).highC, null, 'missing daily values become null');
eq(w.parseCities('nope'), [], 'garbage gives no cities');
const cities = w.parseCities(JSON.stringify({results: [{name: 'Pune', latitude: 18.52, longitude: 73.85, country: 'India', admin1: 'Maharashtra'}, {name: 'bad'}]}));
eq(cities.length, 1, 'cities without coordinates are dropped');
eq(cities[0].name, 'Pune', 'city name is kept');

eq(w.formatTemp(21.6, 'c'), '22°', 'celsius rounds');
eq(w.formatTemp(0, 'f'), '32°', 'fahrenheit conversion');
eq(w.formatTemp(-0.2, 'c'), '0°', 'no negative zero');
eq(w.describe(0, true).icon, 'sun', 'clear day is a sun');
eq(w.describe(0, false).icon, 'moon', 'clear night is a moon');
eq(w.describe(95, true).icon, 'storm', 'thunderstorm');
eq(w.describe(61, true).icon, 'rain', 'rain');
eq(w.describe(73, true).icon, 'snow', 'snow');
const v = w.weatherView(d, 'c', true, 'Pune');
eq([v.main.indexOf('29°') === 0, v.range, v.city], [true, 'H 31°  L 25°', 'Pune'], 'the clock line');
eq(w.weatherView(d, 'c', false, '').range, '', 'range can be hidden');
eq([v.temp, v.main === v.temp + ' ' + v.text, v.text.length > 0], ['29°', true, true], 'temperature and conditions are also given apart, for the weather card');

eq(w.isFresh(d, 12.97, 77.59, 1000 + 60000), true, 'a minute old is fresh');
eq(w.isFresh(d, 12.97, 77.59, 1000 + w.FRESH_MS + 1), false, 'older than 30 minutes is not fresh');
eq(w.isFresh(d, 1, 1, 2000), false, 'a different place is not fresh');
eq(!!w.usableCached(d, 12.97, 77.59, 1000 + w.SHOWN_MS - 1), true, 'under 6 hours is still shown');
eq(w.usableCached(d, 12.97, 77.59, 1000 + w.SHOWN_MS + 1), null, 'over 6 hours is hidden');
eq(w.usableCached(d, 12.97, 77.59, 500), null, 'a reading from the future is ignored');
eq(w.validCoords(91, 0), false, 'latitude out of range');
eq(w.validCoords(10, 20), true, 'good coordinates');
eq(w.forecastUrl(12.9716, 77.5946).indexOf('latitude=12.972&longitude=77.595') > 0, true, 'coordinates are rounded in the URL');
eq(w.forecastUrl(1, 2).indexOf('hourly=temperature_2m,weather_code,is_day&forecast_hours=4') > 0, true, 'the next hours come in the same request');
{
  const hourly = {time: ['2026-10-25T13:00', '2026-10-25T14:00', 'bad', '2026-10-25T16:00', '2026-10-25T17:00'], temperature_2m: [10, 11.4, 9, 8.6, 7], weather_code: [3, 0, 0, 61, 2], is_day: [1, 1, 1, 0, 0]};
  const r = w.parseWeather(JSON.stringify({current: {temperature_2m: 10, weather_code: 3, is_day: 1}, hourly}), 0, 0, 1);
  eq(r.hours, [{hour: 14, tempC: 11.4, code: 0, isDay: true}, {hour: 16, tempC: 8.6, code: 61, isDay: false}, {hour: 17, tempC: 7, code: 2, isDay: false}], 'the next three hours, after the current one; a bad entry is skipped');
  eq(w.weatherView(r, 'c', true, '', true).hours.map((h) => [h.hour, h.temp, h.icon]), [[14, '11°', 'sun'], [16, '9°', 'rain'], [17, '7°', 'partly']], 'the card gets each hour with its temperature and picture');
  eq(w.weatherView(r, 'c', true, '', false).hours, [], 'hours can be switched off');
  const old = {...r}; delete old.hours;
  eq(w.weatherView(old, 'c', true, '', true).hours, [], 'a reading saved by an older version has no hours, and no error');
}
eq([w.hourLabel(0, '12h'), w.hourLabel(13, '12h'), w.hourLabel(9, '24h'), w.hourLabel(21, '24h')], ['12 AM', '1 PM', '09:00', '21:00'], 'hour labels follow the clock format');
eq(w.geocodeUrl('São Paulo & co').indexOf('name=S%C3%A3o%20Paulo%20%26%20co') > 0, true, 'search text is encoded');

const cmd = n.shellFetchCommand('https://x.test/a?b=1&c=2');
eq([cmd.indexOf("U='https://x.test/a?b=1&c=2';") === 0, cmd.indexOf('curl') > 0, cmd.indexOf('wget') > 0], [true, true, true], 'shell fallback tries curl then wget');
process.exit(fail ? 1 : 0);
