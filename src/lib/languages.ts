/** Hearth's interface languages (T0, T4). The saved id is `UserConfig.language`; an unknown id reads as English. */
export interface Language { id: string; name: string }

import {BUNDLED_LANGUAGES} from '../config/bundledlanguages';

/** English plus the languages shipped inside the app (T4; accepted packs from docs/languages/packs, loaded only when picked). */
export const LANGUAGES: readonly Language[] = [{id: 'en', name: 'English'} as Language].concat(BUNDLED_LANGUAGES as Language[]);
export const isBundledLanguage = (id: string): boolean => id !== 'en' && languageOf(id).id === id;

export const DEFAULT_LANGUAGE = 'en';

/** T2b: the id saved while the user's own language file is the language in use (the name shown comes from `lib/langpack.ts`). */
export const PACK_ID = 'pack';
export const languageId = (id: string): string => (id === PACK_ID ? PACK_ID : languageOf(id).id);

export function languageOf (id: string): Language {
	for (let i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].id === id) return LANGUAGES[i];
	return LANGUAGES[0];
}

/** User 2026-11-01: every bundled language except English is shown on the language row with this suffix (the packs are machine-made; own files are not marked). */
export const MACHINE_SUFFIX = ' (machine translated)';
/** 2.0.2 (user 2026-11-02): packs written or reviewed by a native speaker (fr #33, pl #35) carry no suffix. */
export const HUMAN_LANGUAGES: readonly string[] = ['fr', 'pl'];
export const languageLabel = (id: string): string => { const l = languageOf(id); return l.id === 'en' || HUMAN_LANGUAGES.indexOf(l.id) >= 0 ? l.name : l.name + MACHINE_SUFFIX; };
