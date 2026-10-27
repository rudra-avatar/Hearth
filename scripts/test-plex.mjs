// Tests for src/lib/plex.ts (Continue Watching: server addresses, the cards, opening an item).   Run: npm test
import {build} from 'esbuild';

const launched = [];
globalThis.__launched = launched;
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
const out = new URL('../node_modules/.cache-plex-test.mjs', import.meta.url).pathname;
await build({
	entryPoints: [new URL('../src/lib/plex.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
	plugins: [{name: 'stub-launch', setup (b) {
		b.onResolve({filter: /^\.\/launch$/}, () => ({path: 'launch-stub', namespace: 'stub'}));
		b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
			contents: 'export const launchApp = (id, params) => { globalThis.__launched.push([id, params]); return Promise.resolve(); }; export const appExists = (id) => Promise.resolve(globalThis.__installed === id);',
			loader: 'js'
		}));
	}}]
});
const t = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// ---- server addresses ----
const res = {name: 'Home', httpsRequired: false, connections: [
	{protocol: 'https', address: '192.168.0.10', port: 32400, uri: 'https://192-168-0-10.x.plex.direct:32400', local: true, relay: false},
	{protocol: 'https', address: '203.0.113.9', port: 14348, uri: 'https://203-0-113-9.x.plex.direct:14348', local: false, relay: false},
	{protocol: 'https', address: '198.51.100.2', port: 8443, uri: 'https://198-51-100-2.x.plex.direct:8443', local: false, relay: true}
]};
eq(t.candidates(res), ['http://192.168.0.10:32400', 'https://192-168-0-10.x.plex.direct:32400', 'https://203-0-113-9.x.plex.direct:14348'], 'plain http on the home network first, then secure local, then remote; never the relay');
eq(t.candidates({...res, httpsRequired: true})[0], 'https://192-168-0-10.x.plex.direct:32400', 'no plain http when the server requires secure connections');

// ---- cards ----
const server = {name: 'Home', uri: 'http://192.168.0.10:32400', token: 'TKN'};
const ep = t.toContinueItem({ratingKey: '101', guid: 'plex://episode/abc', type: 'episode', title: 'The Pilot', grandparentTitle: 'Example Show', parentIndex: 2, index: 5, thumb: '/library/metadata/101/thumb/1', viewOffset: 2340000, duration: 3600000}, server, 320, 180);
eq([ep.key, ep.title, ep.detail], ['101', 'Example Show', 'S2 · E5 · 21m left'], 'an episode card shows the show, the episode and the time left');
eq(Math.round(ep.progress * 100), 65, 'progress is the part watched');
eq(ep.imageUrl.indexOf('http://192.168.0.10:32400/photo/:/transcode?width=320&height=180&minSize=1&upscale=1&url=%2Flibrary%2Fmetadata%2F101%2Fthumb%2F1'), 0, 'pictures come small, through the server\'s resizer');
const sp = t.toContinueItem({ratingKey: '9', type: 'episode', title: 'Xmas', grandparentTitle: 'Show', parentIndex: 0, index: 2}, server, 320, 180);
eq(sp.detail, 'Special 2', 'specials are not "S0"');
const mv = t.toContinueItem({ratingKey: '202', guid: 'plex://movie/def', type: 'movie', title: 'Night of the Living Dead', art: '/a', thumb: '/t', viewOffset: 2040000, duration: 5760000}, server, 320, 180);
eq([mv.title, mv.detail], ['Night of the Living Dead', '1h 2m left'], 'a movie card shows its title and the time left');
eq(mv.imageUrl.indexOf('url=%2Fa') !== -1, true, 'movies use their wide artwork');

// ---- sign-in state ----
eq(t.plexSignedIn(), false, 'not signed in at first');
eq(typeof JSON.parse(store['customlauncher-plex-v1']).clientId, 'string', 'a client id is kept for this TV');
store['customlauncher-plex-v1'] = JSON.stringify({clientId: 'c', token: 'tok', server});
eq([t.plexSignedIn(), t.plexServerName()], [true, 'Home'], 'signed in with a server');
store['customlauncher-plex-continue-v1'] = JSON.stringify([mv]);
eq(t.cachedContinue().length, 1, 'the last list is kept for the next start');
t.plexSignOut();
eq([t.plexSignedIn(), t.cachedContinue().length, JSON.parse(store['customlauncher-plex-v1']).clientId], [false, 0, 'c'], 'signing out forgets the token and the list, keeps the client id');

// ---- opening ----
await t.openContinue(mv);
eq(launched.pop(), ['cdp-30', {contentTarget: 'plex://movie/def'}], 'without another client the official Plex app opens at the item');
await t.openContinue({...mv, guid: ''});
eq(launched.pop(), ['cdp-30', {}], 'an item without a Plex guid just opens the Plex app');
eq(t.PLEX_CLIENTS, [], 'no other clients are preferred by default');
t.PLEX_CLIENTS.push('com.example.plexclient');
await t.openContinue(mv);
eq(launched.pop(), ['cdp-30', {contentTarget: 'plex://movie/def'}], 'a preferred client that is not installed is skipped');
globalThis.__installed = 'com.example.plexclient';
await t.openContinue(mv, true);
eq(launched.pop(), ['com.example.plexclient', {ratingKey: '202', action: 'details'}], 'an installed preferred client gets the item and what to do with it');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
