// P81: the list of user themes the Current theme row steps through. Small localStorage keys only (no exec, no big reads):
// the theme that is active now, and the saved ones (an index plus one key per saved theme).

import {themeSlug} from './themeslug';

export const ACTIVE_KEY = 'hearth-theme-active-v1';      // {slug, name} of the theme in use
export const INDEX_KEY = 'hearth-themes-index-v1';        // [{slug, name}] saved themes
export const savedKey = (slug: string): string => 'hearth-theme-saved-' + slug;

export interface ThemeListItem {slug: string; name: string; saved: boolean}

function read<T> (key: string, fallback: T): T {
	try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch (e) { return fallback; }
}

export const activeTheme = (): {slug: string; name: string} | null => {
	const a = read<{slug?: unknown; name?: unknown} | null>(ACTIVE_KEY, null);
	return a && typeof a.slug === 'string' && typeof a.name === 'string' ? {slug: a.slug, name: a.name} : null;
};
export const activeSlug = (): string => { const a = activeTheme(); return a ? a.slug : ''; };

export function savedIndex (): {slug: string; name: string}[] {
	const list = read<unknown>(INDEX_KEY, []);
	return Array.isArray(list) ? list.filter((t) => t && typeof t.slug === 'string' && typeof t.name === 'string') : [];
}

/** Saved themes, then the loaded one when it is not saved yet. */
export function userThemeList (): ThemeListItem[] {
	const out: ThemeListItem[] = savedIndex().map((t) => ({slug: t.slug, name: t.name, saved: true}));
	const a = activeTheme();
	if (a && !out.some((t) => t.slug === a.slug)) out.push({slug: a.slug, name: a.name, saved: false});
	return out;
}

export const slugFor = themeSlug;
