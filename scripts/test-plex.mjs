// Tests for the Plex shelves' pure part (lib/plex.ts).   Run: npm test
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const dir = fileURLToPath(new URL('../node_modules/', import.meta.url));
await build({entryPoints: [fileURLToPath(new URL('../src/lib/plex.ts', import.meta.url))], bundle: true, format: 'esm', outfile: dir + '.cache-plex-test.mjs', platform: 'node', logLevel: 'error'});
const p = await import('file://' + dir.replace(/\\/g, '/') + '.cache-plex-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// sign-in
eq(p.parsePin(JSON.stringify({id: 123, code: 'ab12'})), {id: 123, code: 'AB12'}, 'a link code is read and upper-cased');
eq(p.parsePin('{"id":0,"code":"AB12"}'), null, 'a code without an id is rejected');
eq(p.parsePin('{"id":5,"code":"a b"}'), null, 'a code with odd characters is rejected');
eq(p.parsePin('<html>'), null, 'garbage is no code');
eq(p.parsePinToken(JSON.stringify({id: 1, authToken: null})), null, 'no token while the code was not entered');
eq(p.parsePinToken(JSON.stringify({id: 1, authToken: 'abcDEF123_-xyz'})), 'abcDEF123_-xyz', 'the token once entered');
eq(p.parsePinToken(JSON.stringify({authToken: 'bad token"'})), null, 'a token with odd characters is rejected');
eq(p.pinCheckUrl(42.7), 'https://plex.tv/api/v2/pins/42', 'pin id is a whole number in the address');
eq(/^hearth-[0-9a-f]{24}$/.test(p.newClientId()), true, 'client id shape');
eq(p.plexHeaders('c1')['X-Plex-Token'], undefined, 'no token header without a token');
eq(p.plexHeaders('c1', 'tok12345')['X-Plex-Token'], 'tok12345', 'token header with a token');
eq(p.parseAccountName(JSON.stringify({username: 'u', friendlyName: 'Dee'})), 'Dee', 'friendly name first');

// servers
const resources = JSON.stringify([
	{name: 'Player', provides: 'client,player', clientIdentifier: 'player-123456', accessToken: 'tok12345', connections: []},
	{name: 'Shared', provides: 'server', owned: false, clientIdentifier: 'shared-1234567', accessToken: 'tokshared1',
		connections: [{uri: 'https://1-2-3-4.abc.plex.direct:32400', local: false, relay: false, address: '1.2.3.4', port: 32400}]},
	{name: 'Home', provides: 'server', owned: true, clientIdentifier: 'home-12345678', accessToken: 'tokhome123',
		connections: [
			{uri: 'https://9-9-9-9.abc.plex.direct:8443', relay: true, local: false, address: '9.9.9.9', port: 8443},
			{uri: 'https://5-6-7-8.abc.plex.direct:32400', local: false, relay: false, address: '5.6.7.8', port: 32400},
			{uri: 'https://192-168-1-10.abc.plex.direct:32400/', local: true, relay: false, address: '192.168.1.10', port: 32400},
			{uri: 'javascript:alert(1)', local: true, relay: false}
		]},
	{name: 'NoToken', provides: 'server', clientIdentifier: 'notoken-12345', connections: [{uri: 'http://10.0.0.1:32400', local: true}]}
]);
const servers = p.parseServers(resources);
eq(servers.map((s) => s.name), ['Home', 'Shared'], 'only servers with a token; own servers first; players left out');
eq(servers[0].connections.map((c) => c.uri), [
	'http://192.168.1.10:32400',
	'https://192-168-1-10.abc.plex.direct:32400',
	'https://5-6-7-8.abc.plex.direct:32400',
	'https://9-9-9-9.abc.plex.direct:8443'
], 'local http first, then local https, remote, relay last; unsafe addresses dropped; trailing slash removed');
eq(servers[1].connections.length, 1, 'a remote connection gets no plain http twin');
eq(p.parseServers('{}'), [], 'not a list: no servers');
eq(p.parseIdentity(JSON.stringify({MediaContainer: {machineIdentifier: 'home-12345678'}})), 'home-12345678', 'identity');

// shelves
const hub = JSON.stringify({MediaContainer: {Hub: [{Metadata: [
	{type: 'episode', ratingKey: '101', title: 'Pilot', grandparentTitle: 'The Show', parentIndex: 1, index: 2, grandparentThumb: '/library/metadata/100/thumb/1', viewOffset: 600000, duration: 2400000},
	{type: 'movie', ratingKey: '202', title: 'A Film', year: 2010, thumb: '/library/metadata/202/thumb/9', viewOffset: 0, duration: 5400000},
	{type: 'track', ratingKey: '303', title: 'Song'},
	{type: 'movie', ratingKey: '202', title: 'Duplicate'},
	{type: 'movie', ratingKey: '12a', title: 'Bad key'}
]}]}});
const items = p.parseItems(hub);
eq(items.length, 2, 'films and episodes kept; music, duplicates and bad keys dropped');
eq([items[0].title, items[0].subtitle, items[0].thumb, items[0].progress], ['The Show', 'S1 · E2', '/library/metadata/100/thumb/1', 0.25], 'an episode shows its show, season and episode, the show poster, progress');
eq([items[1].title, items[1].subtitle, items[1].progress], ['A Film', '2010', 0], 'a film shows its year, not started');
const lib = JSON.stringify({MediaContainer: {Metadata: [{type: 'season', ratingKey: '7', title: 'Season 2', parentTitle: 'Other Show', thumb: '/t'}]}});
eq(p.parseItems(lib).map((i) => [i.type, i.title, i.subtitle]), [['season', 'Other Show', 'Season 2']], 'a library reply (recently added season)');
eq(p.parseItems(hub, 1).length, 1, 'at most max items');
eq(p.isContainer('{"MediaContainer":{}}'), true, 'a server reply');
eq(p.isContainer('Not found'), false, 'not a server reply');
eq(p.continueUrl('http://h:1', 5), 'http://h:1/hubs/continueWatching?count=5&X-Plex-Container-Start=0&X-Plex-Container-Size=5', 'continue address');

// images
eq(p.imageUrl('http://h:1', '/library/metadata/1/thumb/2', 'to/k', 200, 300),
	'http://h:1/photo/:/transcode?width=200&height=300&minSize=1&upscale=1&url=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2&X-Plex-Token=to%2Fk', 'poster address is scaled by the server');
eq(p.imageUrl('http://h:1', 'http://elsewhere/x.jpg', 't', 1, 1), '', 'only server paths become posters');

// shared shape (lib/shelves.ts): the ratingKey is the item's key
eq(items.map((i) => i.key), ['101', '202'], 'the ratingKey becomes the shared item key');
eq(Object.keys(items[0]).sort(), ['key', 'progress', 'subtitle', 'thumb', 'title', 'type'], 'items have exactly the shared fields');

// launching PlxNative
eq(p.launchParams(items[0], 'home-12345678', 'play'), {plex: {server: 'home-12345678', ratingKey: '101', action: 'play'}}, 'an episode plays');
eq(p.launchParams({key: '7', type: 'season'}, 'srv', 'play').plex.action, 'open', 'a season always opens its page');
eq(p.launchParams(items[1], 'srv', 'open').plex.action, 'open', 'open stays open');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall plex tests passed');
