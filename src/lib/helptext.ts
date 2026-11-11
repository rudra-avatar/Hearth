// p22c: the text for the Settings help panel. Keys `help.tab.<tab id>`, `help.group.<group name>`, `help.pref.<row id>` in `i18n/en.ts`;
// a tab, group or row without a key has no help (the panel is not drawn). English only until p25 (a pack without the key falls back to English).
import {td} from '../i18n';
import {GROUP_PREFIX} from './prefs';

function read (key: string): string {
	const text = td(key);
	return text === key ? '' : text;          // `td` returns the key itself when no text exists
}

export function helpForTab (tabId: string): string {
	return read('help.tab.' + tabId);
}

/** `id` is a row id, or a group header id (`group:<tab>:<name>`). */
export function helpForOption (id: string): string {
	if (id.indexOf(GROUP_PREFIX) === 0) return read('help.group.' + id.split(':').slice(2).join(':'));
	return read('help.pref.' + id);
}
