// R2-a: asking GitHub for the update list. Only on a press (the Check for updates screen), never at start-up.
// Direct first (the web view); on a rooted TV the TV's own curl or wget is the second try (old TVs and certificates).

import {fetchText} from './weathernet';
import {rootState} from './failure';
import {log} from './log';
import {UPDATES_URL, parseUpdates, type UpdateEntry} from './updatecore';

export type UpdateCheck = {ok: true; entries: UpdateEntry[]} | {ok: false};

export function checkUpdates (): Promise<UpdateCheck> {
	// the address changes every minute so a cached copy does not hide a new version; the file ignores the query
	const url = `${UPDATES_URL}?v=${Math.floor(Date.now() / 60000)}`;
	return fetchText(url, rootState() === 'yes').then(
		(text): UpdateCheck => {
			const entries = parseUpdates(text);
			if (!entries) { log('updates: unreadable list'); return {ok: false}; }
			log(`updates: list read, ${entries.length} versions`);
			return {ok: true, entries};
		},
		(error: Error): UpdateCheck => { log(`updates: no answer (${String(error && error.message ? error.message : error).slice(0, 80)})`); return {ok: false}; }
	);
}
