// The city a fresh install starts with, and the picker's presets (W3: grouped by country, parsed only when the picker opens).
// Coordinates are approximate city centres; the weather service does not need more.

import type {City} from './weather';
import {CITY_DATA} from './citydata';

/** The city a fresh install (and "Reset Hearth visual settings to default") starts with. The only city used at start-up. */
export const DEFAULT_CITY: City = {name: 'Delhi', lat: 28.6139, lon: 77.2090, detail: 'India'};

/** At most this many presets per country (checked by scripts/test-cities.mjs). */
export const MAX_CITIES_PER_COUNTRY = 50;

export interface Country {
	name: string;
	cities: City[];
}

let parsed: Country[] | null = null;

/** Parses one country's data string: 'name|lat|lon|region;...'. Entries with bad numbers are skipped. */
export function parseCountry (country: string, data: string): Country {
	const cities: City[] = [];
	data.split(';').forEach((entry) => {
		const p = entry.split('|');
		const lat = parseFloat(p[1]);
		const lon = parseFloat(p[2]);
		if (!p[0] || isNaN(lat) || isNaN(lon)) return;
		cities.push({name: p[0], lat, lon, detail: p[3] ? p[3] + ', ' + country : country});
	});
	return {name: country, cities};
}

/** All countries with their preset cities (parsed on first call, then kept; never called at start-up). */
export function countries (): Country[] {
	if (!parsed) parsed = CITY_DATA.map((c) => parseCountry(c[0], c[1]));
	return parsed;
}
