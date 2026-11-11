// Tests for the city presets (W3): grouped by country, only shipped-language countries, at most 50 per country, Italy and Thailand have 50, data well formed.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/cities.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-cities-test.mjs', platform: 'node', logLevel: 'error'});
const c = await import(dir + '.cache-cities-test.mjs');
let fail = 0;
const ok = (cond, m) => { if (!cond) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const list = c.countries();
const SHIPPED = ['Brazil','Egypt','France','Germany','India','Indonesia','Italy','Mexico','Poland','Russia','Saudi Arabia','Spain','Thailand','United Arab Emirates','United Kingdom','United States'];
ok(list.map((k) => k.name).join('|') === SHIPPED.join('|'), 'only the countries of the shipped languages are listed (' + list.length + ')');
ok(list.filter((k) => k.cities.length >= 48).length >= 13, 'most countries have about 50 cities');
ok(list.every((k) => k.cities.length >= 1 && k.cities.length <= c.MAX_CITIES_PER_COUNTRY), 'every country has 1..50 cities');
const names = list.map((k) => k.name);
ok(new Set(names).size === names.length, 'no country twice');
ok(names.join('|') === names.slice().sort((a, b) => a.localeCompare(b)).join('|'), 'countries are alphabetical');
const italy = list.filter((k) => k.name === 'Italy')[0];
ok(italy && italy.cities.length === 50, 'Italy has 50 cities');
ok(italy && italy.cities.some((x) => x.name === 'Rome' && x.detail === 'Lazio, Italy'), 'Italian detail is region, country');
ok(italy && italy.cities.every((x) => x.lat > 35 && x.lat < 48 && x.lon > 6 && x.lon < 19), 'Italian coordinates lie inside Italy\'s box');
ok(new Set(italy.cities.map((x) => x.name)).size === 50, 'no Italian city twice');
const thai = list.filter((k) => k.name === 'Thailand')[0];
ok(thai && thai.cities.length === 50, 'Thailand has 50 cities');
ok(thai && thai.cities.some((x) => x.name === 'Bangkok' && x.detail === 'Bangkok, Thailand'), 'Thai detail is province, country');
ok(thai && thai.cities.every((x) => x.lat > 5.5 && x.lat < 20.5 && x.lon > 97.3 && x.lon < 105.7), 'Thai coordinates lie inside Thailand\'s box');
ok(thai && new Set(thai.cities.map((x) => x.name)).size === 50, 'no Thai city twice');
ok(list.every((k) => k.cities.every((x) => isFinite(x.lat) && isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180)), 'all coordinates are valid');
const india = list.filter((k) => k.name === 'India')[0];
ok(india && india.cities.some((x) => x.name === 'Delhi' && x.detail === 'India'), 'a city without a region has just the country as detail');
ok(india && india.cities.some((x) => x.name === 'Thiruvananthapuram' && x.detail === 'Kerala, India'), 'old preset kept with the same detail');
ok(c.DEFAULT_CITY.name === 'Delhi' && c.DEFAULT_CITY.detail === 'India', 'default city unchanged');
ok(c.parseCountry('X', 'A|1|2|R;bad|x|y|;|1|2|').cities.length === 1, 'bad entries are skipped');
ok(c.countries() === list, 'parsed once, then kept');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
