// PlxNative as a shelf source (lib/shelves.ts): Plex's lists, posters and launch parameters behind the shared interface.
// This is the file a new source copies (a Jellyfin source would have its own jellyfin.ts, jellyfinnet.ts and jellyfinstore.ts behind it).

import {PLEX_LISTS, PLX_APP_ID, PLX_APP_NAME, imageUrl, launchParams} from './plex';
import {fetchServers, fetchShelves, findConnection} from './plexnet';
import {writeAuth, type PlexAuth} from './plexstore';
import type {PlexConfig} from './storage';
import type {ShelfSource} from './shelves';
import {td} from '../i18n';

export const PLEX_SOURCE_ID = 'plxnative';

/** The source for the current sign-in and settings. `onAuth` receives a sign-in whose server address changed (after `recover`). */
export function plexSource (auth: PlexAuth, config: PlexConfig, onAuth: (next: PlexAuth) => void): ShelfSource {
	const server = auth.server;
	const want = {continue: config.continueOn, recent: config.recentOn};
	const lists = PLEX_LISTS.filter((id) => want[id]).map((id) => ({id, title: td(id === 'continue' ? 'plex.continue' : 'plex.recent')}));
	return {
		id: PLEX_SOURCE_ID,
		appId: PLX_APP_ID,
		appName: PLX_APP_NAME,
		ready: !!auth.token && !!server && lists.length > 0,
		origin: server ? server.id : '',
		sig: [server ? server.id + '@' + server.uri : '', auth.token ? 'in' : 'out', lists.map((l) => l.id).join(',')].join('|'),
		lists,
		fetch: () => (server ? fetchShelves(server, auth.clientId, want) : Promise.reject({status: -1})),
		// the server did not answer: ask plex.tv for its addresses again (they change with the home network or a new router)
		recover: () => {
			if (!server) return Promise.reject(new Error('no server'));
			return fetchServers(auth.clientId, auth.token).then((list) => {
				const found = list.filter((x) => x.id === server.id)[0];
				if (!found) throw new Error('not on the account');
				return findConnection(found, auth.clientId).then((uri) => {
					if (uri === server.uri && found.token === server.token) return;
					const next: PlexAuth = {...auth, server: {...server, uri, token: found.token}};
					writeAuth(next);
					onAuth(next);
				});
			});
		},
		image: (item, width, height) => (server ? imageUrl(server.uri, item.thumb, server.token, width, height) : ''),
		launch: (item) => launchParams(item, server ? server.id : '', config.action)
	};
}
