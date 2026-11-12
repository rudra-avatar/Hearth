// Tests for the PlxNative shelves' sign-in store (src/lib/plexstore.ts) and fetching (src/lib/plexnet.ts), with a fake
// localStorage and a fake XMLHttpRequest: nothing reaches plex.tv or a server.   Run: npm test
import {build} from 'esbuild';
import {fileURLToPath, pathToFileURL} from 'node:url';
const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const load = async (src, name) => {
  const out = path(`../node_modules/.cache-${name}-test.mjs`);
  await build({entryPoints: [path(src)], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
  return import(pathToFileURL(out).href);
};

const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};

// a fake network: `routes` maps an address to a reply ({status, body}); status 0 = no answer. Every request is recorded.
let routes = {};
const sent = [];
globalThis.XMLHttpRequest = class {
  constructor () { this.headers = {}; this.status = 0; this.responseText = ''; }
  open (method, url) { this.method = method; this.url = url; }
  setRequestHeader (k, v) { this.headers[k] = v; }
  send () {
    sent.push({method: this.method, url: this.url, headers: this.headers, timeout: this.timeout});
    const r = routes[this.url];
    setTimeout(() => {
      if (!r || r.status === 0) { if (this.onerror) this.onerror(); return; }
      this.status = r.status; this.responseText = r.body; if (this.onload) this.onload();
    }, 0);
  }
};

const st = await load('../src/lib/plexstore.ts', 'plexstore');
const net = await load('../src/lib/plexnet.ts', 'plexnet');
const ps = await load('../src/lib/plexsource.ts', 'plexsource');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const rejects = (promise) => promise.then(() => 'resolved', (e) => (e && typeof e.status === 'number' ? e.status : 'rejected'));
const AUTH = 'customlauncher-plex-auth-v1';
const PIN = 'customlauncher-plex-pin-v1';

// ---- the sign-in store ----
let a = st.readAuth();
eq(Object.keys(store), [], 'reading at start writes nothing (people who never sign in leave no trace)');
eq([/^hearth-[0-9a-f]{24}$/.test(a.clientId), a.token, a.server, st.isSignedIn(a)], [true, '', null, false], 'nothing saved: a new client id, signed out');
st.keepClientId(a);
eq(st.readAuth().clientId, a.clientId, 'once a sign-in starts, the client id is kept');
const server = {id: 'home-12345678', name: 'Home', uri: 'http://192.168.1.10:32400', token: 'srvtok1234'};
st.writeAuth({...a, token: 'acctok1234', account: 'Dee', server});
a = st.readAuth();
eq([a.token, a.account, a.server && a.server.uri, st.isSignedIn(a)], ['acctok1234', 'Dee', 'http://192.168.1.10:32400', true], 'a sign-in and a server are read back');
store[AUTH] = JSON.stringify({clientId: a.clientId, token: 'acctok1234', server: {...server, uri: 'javascript:alert(1)'}});
eq(st.readAuth().server, null, 'a saved server with an unsafe address is dropped');
store[AUTH] = JSON.stringify({clientId: a.clientId, token: 'bad token"', server});
eq([st.readAuth().token, st.readAuth().server], ['', null], 'a saved token with odd characters reads as signed out, and no server without a token');
store[AUTH] = '{not json';
eq(st.readAuth().token, '', 'an unreadable store reads as signed out');
st.writeAuth({clientId: a.clientId, token: 'acctok1234', account: 'Dee', server});
st.savePendingPin({id: 7, code: 'AB12'}, 1000);
const out = st.signOut();
eq([out.clientId, out.token, out.account, out.server, PIN in store], [a.clientId, '', '', null, false], 'sign out keeps the client id and forgets the token, the server and a waiting code');

// ---- a code waiting to be entered ----
st.savePendingPin({id: 7, code: 'AB12'}, 1000);
eq(st.readPendingPin(1000 + 60000), {id: 7, code: 'AB12'}, 'a code from a minute ago is still waiting');
eq(st.readPendingPin(1000 + st.PIN_LIFE_MS + 1), null, 'an older code has run out');
eq(st.readPendingPin(500), null, 'a code from the future is ignored');
st.clearPendingPin();
eq(st.readPendingPin(1001), null, 'a cleared code is gone');

// ---- plex.tv ----
routes = {
  'https://plex.tv/api/v2/pins?strong=false': {status: 201, body: JSON.stringify({id: 55, code: 'zx9q'})},
  'https://plex.tv/api/v2/pins/55': {status: 200, body: JSON.stringify({id: 55, authToken: null})}
};
eq(await net.requestPin('cid-1'), {id: 55, code: 'ZX9Q'}, 'a code is asked for');
const pinReq = sent[sent.length - 1];
eq([pinReq.method, pinReq.headers['X-Plex-Client-Identifier'], 'X-Plex-Token' in pinReq.headers], ['POST', 'cid-1', false], 'by POST, with the client id and no token');
eq(await net.checkPin('cid-1', 55), null, 'no token while the code was not entered');
routes['https://plex.tv/api/v2/pins/55'] = {status: 200, body: JSON.stringify({id: 55, authToken: 'acctok1234'})};
eq(await net.checkPin('cid-1', 55), 'acctok1234', 'the token once it was entered');
routes['https://plex.tv/api/v2/pins?strong=false'] = {status: 0};
eq(await rejects(net.requestPin('cid-1')), 0, 'plex.tv not answering (or the request blocked) rejects with status 0');

// ---- finding a connection ----
const conns = [
  {uri: 'http://192.168.1.10:32400', local: true, relay: false},
  {uri: 'https://other.plex.direct:32400', local: false, relay: false},
  {uri: 'https://right.plex.direct:32400', local: false, relay: false}
];
const srv = {name: 'Home', id: 'home-12345678', token: 'srvtok1234', owned: true, connections: conns};
const ident = (id) => ({status: 200, body: JSON.stringify({MediaContainer: {machineIdentifier: id}})});
routes = {'http://192.168.1.10:32400/identity': {status: 0}, 'https://other.plex.direct:32400/identity': ident('someone-else-123'), 'https://right.plex.direct:32400/identity': ident('home-12345678')};
sent.length = 0;
eq(await net.findConnection(srv, 'cid-1'), 'https://right.plex.direct:32400', 'skips one that does not answer and one that is another server');
eq(sent.map((r) => r.timeout), [3000, 8000, 8000], 'a local connection gets a short wait, the others longer');
routes = {};
eq(await rejects(net.findConnection(srv, 'cid-1')), 0, 'none answering rejects');

// ---- the shelves ----
const chosen = {id: 'home-12345678', name: 'Home', uri: 'http://h:1', token: 'srvtok1234'};
const movie = (rk) => ({type: 'movie', ratingKey: rk, title: 'Film ' + rk});
const container = (list) => ({status: 200, body: JSON.stringify({MediaContainer: {Metadata: list}})});
const HUB = 'http://h:1/hubs/continueWatching?count=20&X-Plex-Container-Start=0&X-Plex-Container-Size=20';
const DECK = 'http://h:1/library/onDeck?X-Plex-Container-Start=0&X-Plex-Container-Size=20';
const RECENT = 'http://h:1/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=20';
routes = {[HUB]: container([movie('1')]), [DECK]: container([movie('2')]), [RECENT]: container([movie('3'), movie('4')])};
sent.length = 0;
let s = await net.fetchShelves(chosen, 'cid-1', {continue: true, recent: true}, () => 42);
eq([s.origin, s.at, s.lists.continue.map((i) => i.key), s.lists.recent.map((i) => i.key)], ['home-12345678', 42, ['1'], ['3', '4']], 'both shelves from a newer server, as a shared ShelfSet');
eq(sent.every((r) => r.headers['X-Plex-Token'] === 'srvtok1234' && r.url.indexOf('srvtok1234') === -1), true, "the server's token goes in a header, never in the address");
const keysOrStatus = (promise) => promise.then((x) => x.lists.continue.map((i) => i.key), (err) => 'rejected ' + (err && err.status));
routes[HUB] = {status: 404, body: 'Not Found'};
eq(await keysOrStatus(net.fetchShelves(chosen, 'cid-1', {continue: true, recent: false})), ['2'], 'an older server without the hub: On Deck instead');
routes[HUB] = {status: 200, body: 'not a container'};
eq(await keysOrStatus(net.fetchShelves(chosen, 'cid-1', {continue: true, recent: false})), ['2'], 'a hub reply that is no server answer: On Deck too');
sent.length = 0;
s = await net.fetchShelves(chosen, 'cid-1', {continue: false, recent: true});
eq([Object.keys(s.lists), sent.length], [['recent'], 1], 'a shelf that is off is not asked for and not in the set');
routes[RECENT] = {status: 401, body: ''};
eq(await rejects(net.fetchShelves(chosen, 'cid-1', {continue: false, recent: true})), 401, 'a sign-in no longer valid rejects with 401 (app.tsx says so once)');
routes = {};
eq(await rejects(net.fetchShelves(chosen, 'cid-1', {continue: true, recent: true})), 0, 'a server that does not answer rejects with 0 (the shared refresh then calls recover)');

// ---- PlxNative as a shelf source (lib/plexsource.ts) ----
const cfg = (continueOn, recentOn, action = 'play') => ({continueOn, recentOn, action});
const auth = {clientId: 'cid-1', token: 'acctok1234', account: 'Dee', server: chosen};
let got = null;
const src = (c, a = auth) => ps.plexSource(a, c, (next) => { got = next; });
eq([src(cfg(true, true)).id, src(cfg(true, true)).appId, src(cfg(true, true)).appName], ['plxnative', 'com.beb.plxnative', 'PlxNative'], 'it names itself and the app items open in');
eq(src(cfg(true, true)).lists.map((l) => [l.id, l.title]), [['continue', 'Continue watching'], ['recent', 'Recently added']], 'both lists in order, with their headings');
eq(src(cfg(false, true)).lists.map((l) => l.id), ['recent'], 'only the lists that are on');
eq([src(cfg(true, false)).ready, src(cfg(false, false)).ready], [true, false], 'ready only with a list on');
eq(src(cfg(true, true), {...auth, token: ''}).ready, false, 'not ready when signed out');
eq(src(cfg(true, true), {...auth, server: null}).ready, false, 'not ready without a server');
eq(src(cfg(true, true)).origin, 'home-12345678', "the origin is the server's machine id (a saved copy for another server is not shown)");
eq(src(cfg(true, true)).sig === src(cfg(true, true)).sig, true, 'the same choices give the same signature');
eq(src(cfg(true, true)).sig === src(cfg(true, false)).sig, false, 'switching a list changes the signature (the refresh starts over)');
eq(src(cfg(true, true)).sig === src(cfg(true, true), {...auth, server: {...chosen, uri: 'http://h:2'}}).sig, false, 'a new server address changes it too');
eq(src(cfg(true, true)).launch({key: '101', type: 'episode'}), {plex: {server: 'home-12345678', ratingKey: '101', action: 'play'}}, "launch parameters follow PlxNative's contract");
eq(src(cfg(true, true, 'open')).launch({key: '101', type: 'episode'}).plex.action, 'open', 'with Open details chosen, items open their page');
eq(src(cfg(true, true)).image({thumb: '/library/metadata/1/thumb/2'}, 176, 264).indexOf('http://h:1/photo/:/transcode?width=176&height=264'), 0, "posters come from the server's scaler at the drawn size");
s = await src(cfg(true, true)).fetch().catch((err) => err);
eq(s.status, 0, 'fetch goes to the chosen server (no routes: no answer)');
// recover: the server moved to a new address
const resources = (uri) => ({status: 200, body: JSON.stringify([{name: 'Home', provides: 'server', owned: true, clientIdentifier: 'home-12345678', accessToken: 'srvtok1234',
  connections: [{uri, local: false, relay: false}]}])});
routes = {'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1': resources('https://new.plex.direct:32400'), 'https://new.plex.direct:32400/identity': ident('home-12345678')};
got = null;
await src(cfg(true, true)).recover();
eq(got && got.server.uri, 'https://new.plex.direct:32400', 'recover finds the new address and hands back the changed sign-in');
eq(JSON.parse(store[AUTH]).server.uri, 'https://new.plex.direct:32400', '... and saves it');
routes = {'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1': resources('http://h:1'), 'http://h:1/identity': ident('home-12345678')};
got = null;
await src(cfg(true, true)).recover();
eq(got, null, 'the same address: nothing changes');
routes = {'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1': {status: 200, body: '[]'}};
eq(await src(cfg(true, true)).recover().then(() => 'resolved', () => 'rejected'), 'rejected', 'a server no longer on the account: recover fails (the refresh tries again later)');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall plex store and network tests passed');
