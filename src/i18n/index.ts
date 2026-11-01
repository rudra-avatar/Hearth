// T1: the string table. Every UI text lives in `en.ts` under a key; `t(key)` reads it synchronously (no start-up cost).
// Only the chosen language is held: English is built in, another language (T2b) is merged over it by `setStrings`,
// so a missing key always falls back to English. `{name}` in a text is a placeholder filled from `vars`.

import {en, type Key} from './en';

export type {Key};
export type Vars = Record<string, string | number>;

let table: Record<string, string> = en;

function fill (text: string, vars?: Vars): string {
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}

/** The text for `key` in the current language (English when the language lacks it). */
export function t (key: Key, vars?: Vars): string {
	return fill(table[key] !== undefined ? table[key] : en[key], vars);
}

/** Same as `t` for a key built at run time (e.g. `pref.${id}.label`); an unknown key reads as the key itself. */
export function td (key: string, vars?: Vars): string {
	const own = table[key] !== undefined ? table[key] : (en as Record<string, string>)[key];
	return fill(own !== undefined ? own : key, vars);
}

/** Switch language: `strings` are merged over English (null = English only). Called before the first screen draws. */
export function setStrings (strings: Record<string, string> | null): void {
	table = strings ? {...en, ...strings} : en;
}
