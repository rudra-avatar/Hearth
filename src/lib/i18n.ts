// Simple i18n: translation tables keyed by string, with {{param}} substitution.
// The language is stored in user config; default is 'en'. Call t(key, params) anywhere.
import type {UserConfig} from './storage';

export type Lang = 'en' | 'es';

const TABLES: Record<Lang, Record<string, string>> = {
	en: {},
	es: {}
};

let current: Lang = 'en';

export function setLang (lang: Lang): void {
	current = lang;
}

export function getLang (): Lang {
	return current;
}

export function initLang (config: UserConfig | null): void {
	const lang = config && (config.language === 'en' || config.language === 'es') ? config.language : 'en';
	current = lang;
}

export function t (key: string, params?: Record<string, string | number>): string {
	let text = TABLES[current][key] || TABLES.en[key] || key;
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.replace(new RegExp(`{{${name}}}`, 'g'), String(value));
		}
	}
	return text;
}

export function loadTables (tables: Partial<Record<Lang, Record<string, string>>>): void {
	for (const [lang, entries] of Object.entries(tables)) {
		if (entries) TABLES[lang as Lang] = {...TABLES[lang as Lang], ...entries};
	}
}
