// Tests for the media shelves shared by every source (no Plex in here): moving between the home row and the shelves
// (src/lib/shelfnav.ts), when they are fetched, the saved copy and opening an item (src/lib/shelves.ts).   Run: npm test
import {build} from 'esbuild';
import {fileURLToPath, pathToFileURL} from 'node:url';
const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const load = async (src, name) => {
  const out = path(`../node_modules/.cache-${name}-test.mjs`);
  await build({entryPoints: [path(src)], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
  return import(pathToFileURL(out).href);
};

// a fake webOS bridge for opening items: `apps` lists the installed apps, `refuse` makes every launch fail
const luna = {apps: ['com.example.app'], refuse: false, calls: []};
globalThis.window = globalThis;
globalThis.PalmServiceBridge = class {
  call (uri, params) {
    const p = JSON.parse(params);
    luna.calls.push({uri, p});
    let reply;
    if (/\/launch$/.test(uri)) reply = !luna.refuse && luna.apps.indexOf(p.id) !== -1 ? {returnValue: true} : {returnValue: false, errorText: 'no'};
    else reply = {returnValue: true, exist: luna.apps.indexOf(p.appId) !== -1};
    setTimeout(() => this.onservicecallback(JSON.stringify(reply)), 0);
  }
};

const n = await load('../src/lib/shelfnav.ts', 'shelfnav');
const p = await load('../src/lib/shelves.ts', 'shelves');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// ---- layout ----
eq(n.shelfLayout(0, 10, [5, 3]).tailApps, false, 'no favourites: the all-apps row stays where it is');
eq(n.shelfLayout(3, 10, [5, 3]).tailApps, true, 'favourites and shelves: the all-apps row moves below the shelves');
eq(n.shelfLayout(3, 10, []).tailApps, false, 'favourites, no shelf showing: nothing changes');
eq(n.shelfLayout(3, 3, [5]).tailApps, false, 'only favourites: no all-apps row');
eq(n.shelfLayout(3, 10, [5]).tailLen, 7, 'the all-apps row holds the apps after the favourites');
eq(n.maxZone(n.shelfLayout(3, 10, [5, 3])), 3, 'two shelves and the all-apps row: zones 1 to 3');
eq(n.maxZone(n.shelfLayout(0, 10, [5])), 1, 'one shelf, no favourites: zone 1 only');

// ---- entering the shelves ----
const plain = n.shelfLayout(0, 10, [5, 3]);
const fav = n.shelfLayout(3, 10, [5, 3]);
eq(n.entersShelves(n.shelfLayout(0, 10, []), 0, true), false, 'no shelf showing: Down never leaves the home row');
eq(n.entersShelves(plain, 0, false), false, 'two home rows: Down from the first row goes to the second, not the shelves');
eq(n.entersShelves(plain, 0, true), true, 'Down from the last home row goes to the first shelf');
eq(n.entersShelves(fav, 3, false), true, 'favourites: Down from the favourites row goes to the shelves (user 2026-11-12)');

// ---- keys on the shelves ----
let nav = {...n.START_NAV, zone: 1};
const keys = (start, list, l) => list.reduce((s, k) => n.shelfStep(s, l, k), start);
eq(keys(nav, ['down', 'down', 'down', 'down'], fav).zone, 3, 'favourites: Down walks shelf 1, shelf 2, all apps, then stops');
eq(keys(nav, ['down', 'down'], plain).zone, 2, 'no favourites: Down stops at the last shelf');
eq(keys({...nav, zone: 3}, ['up', 'up', 'up'], fav).zone, 0, 'Up walks back to the home row');
eq(n.shelfStep({...nav, zone: 2}, fav, 'back').zone, 0, 'Back on a shelf goes straight home');
eq(n.shelfStep({...nav, zone: 0}, fav, 'down').zone, 0, 'at home the shelf rules do nothing (Home.tsx handles zone 0)');
eq(keys(nav, ['left', 'left'], plain).sel[0], 0, 'Left stops at the first item');
eq(keys(nav, ['right', 'right', 'right', 'right', 'right', 'right', 'right'], plain).sel[0], 4, 'Right stops at the last item (5 items)');
nav = keys(nav, ['right', 'right', 'down', 'right', 'up'], plain);
eq([nav.zone, nav.sel[0], nav.sel[1]], [1, 2, 1], 'each shelf keeps its own highlight when moving between shelves');
nav = keys({...n.START_NAV, zone: 3}, ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'], fav);
eq(nav.tailCol, 6, 'the all-apps row stops at its last app (7 apps)');
eq(n.shelfStep({...n.START_NAV, zone: 3, tailCol: 0}, fav, 'left').tailCol, 0, 'and at its first');

// ---- shelves that change under the highlight ----
eq(n.clampNav({...n.START_NAV, zone: 3}, n.shelfLayout(3, 10, [5])).zone, 0, 'a zone that no longer exists (a shelf emptied under the highlight): back home');
eq(n.clampNav({...n.START_NAV, zone: 2}, n.shelfLayout(0, 10, [5])).zone, 0, 'the highlighted shelf disappeared: back home');
eq(n.clampNav({...n.START_NAV, zone: 1, tailCol: 9}, n.shelfLayout(3, 6, [5])).tailCol, 2, 'fewer apps: the all-apps highlight moves to the last one');
eq(n.selectedOn({...n.START_NAV, sel: [9]}, n.shelfLayout(0, 1, [4]), 0), 3, 'a shelf that got shorter: its highlight moves to the last item');
eq(n.selectedOn(n.START_NAV, n.shelfLayout(0, 1, [0]), 0), 0, 'an empty shelf reads as item 0');

// ---- the pointer ----
eq(n.pointAt(n.START_NAV, fav, 2, 1).zone, 2, 'pointing at a shelf item moves the highlight to that shelf');
eq(n.pointAt(n.START_NAV, fav, 2, 1).sel[1], 1, '... and to that item');
eq(n.pointAt(n.START_NAV, fav, 3, 4).tailCol, 4, 'pointing at an app below the shelves');
eq(n.pointAt(n.START_NAV, fav, 9, 1), n.START_NAV, 'a zone that does not exist is ignored');

// ---- how far the screen slides up ----
eq(n.shelfLift(0, {rowsTop: 800, shelvesHeight: 700, sectionTop: 36, sectionHeight: 330}), 0, 'at home the screen is where it always is');
eq(n.shelfLift(1, {rowsTop: 800, shelvesHeight: 700, sectionTop: 36, sectionHeight: 330}), 724, 'both shelves fit: everything is shown below the home row');
eq(n.shelfLift(1, {rowsTop: 600, shelvesHeight: 1000, sectionTop: 36, sectionHeight: 330}), 552, 'shelves too tall: the home row stops 48 px from the top');
eq(n.shelfLift(3, {rowsTop: 600, shelvesHeight: 1000, sectionTop: 700, sectionHeight: 250}), 974, 'a deeper row slides further, so it is shown whole');
eq(n.shelfLift(1, {rowsTop: 20, shelvesHeight: 10, sectionTop: -100, sectionHeight: 10}), 0, 'never below zero');

// ---- when the shelves are fetched ----
const M = 60000;
const base = {changed: false, first: true, known: null, origin: 'srv', now: 100 * M, startMs: 5000};
const known = (ageMs, origin = 'srv') => ({origin, at: 100 * M - ageMs, lists: {}});
eq(p.refreshWait(base), 5000, 'start, nothing saved: after the start-up work');
eq(p.refreshWait({...base, known: known(2 * M)}), 8 * M, 'start, saved 2 minutes ago: when it is 10 minutes old');
eq(p.refreshWait({...base, known: known(2 * M, 'other')}), 5000, 'saved for another server: treated as nothing saved');
eq(p.refreshWait({...base, first: false, known: known(2 * M)}), 800, 'back from another app, older than a minute: at once');
eq(p.refreshWait({...base, first: false, known: known(30000)}), 10 * M - 30000, 'back within a minute: no extra fetch');
eq(p.refreshWait({...base, first: false, known: known(30000), changed: true}), 300, 'a shelf switched on or the server changed: at once');
eq(p.refreshWait({...base, first: false}), 800, 'later, nothing saved: at once');
eq([0, 1, 2, 7].map(p.retryWait), [120000, 600000, 1800000, 1800000], 'failures in a row wait 2, 10, then 30 minutes');
eq(p.retryWait(-1), 120000, 'a negative count reads as the first failure');
eq(p.failureStep(401, false), 'expired', 'sign-in no longer valid');
eq(p.failureStep(0, false), 'recover', 'no answer: the source may recover (look its server up again)');
eq(p.failureStep(0, true), 'retry', 'no answer after recovering: try again later');
eq(p.failureStep(500, false), 'retry', 'a server error: try again later');

// ---- the saved copy ----
const item = (key, extra = {}) => ({key, type: 'movie', title: 'T' + key, subtitle: '', thumb: '/t', progress: 0, ...extra});
const set = {origin: 'srv', at: 1000, lists: {continue: [item('1'), item('2')], recent: []}};
eq(p.isFreshSet(set, 'srv', 1000 + M), true, 'a minute old is fresh');
eq(p.isFreshSet(set, 'srv', 1000 + p.SHELF_FRESH_MS + 1), false, 'older than 10 minutes is not');
eq(p.isFreshSet(set, 'other', 2000), false, 'a copy for another server is not fresh');
eq(!!p.usableSet(set, 'srv', 1000 + p.SHELF_SHOWN_MS - 1), true, 'under a week old is shown');
eq(p.usableSet(set, 'srv', 1000 + p.SHELF_SHOWN_MS + 1), null, 'older is not');
eq(p.usableSet(set, 'srv', 500), null, 'a copy from the future is ignored');
const back = p.readSet(JSON.stringify({origin: 'srv', at: 5, lists: {
  continue: [item('1; rm -rf /'), item('9', {progress: 7}), item('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'), {key: 3}],
  'bad list!': [item('1')]
}}));
eq(back.lists.continue.map((i) => i.key), ['9', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'], 'keys with shell characters or of the wrong type are dropped; long hex ids (Jellyfin-like) are kept');
eq(back.lists.continue[0].progress, 1, 'progress is clamped to 0..1');
eq(Object.keys(back.lists), ['continue'], 'a list with an odd name is dropped');
eq([p.readSet('nope'), p.readSet(null), p.readSet('{"origin":1,"at":2}')], [null, null, null], 'garbage is no saved copy');
eq(p.readSet(JSON.stringify({origin: 's', at: 1, lists: {r: Array.from({length: 40}, (_, i) => item(String(i)))}})).lists.r.length, p.SHELF_MAX, 'at most SHELF_MAX items per list');
eq(p.shelfCacheKey('plxnative'), 'customlauncher-shelves-plxnative-v1', 'each source has its own saved copy');

// ---- posters that did not load ----
const SRC = 'http://h:1/photo/:/transcode?width=176&url=%2Ft';
eq(p.posterSrc(SRC, 200, 0), SRC, 'a poster that never failed keeps its address');
eq(p.posterSrc(SRC, 200, 200), '', 'failed in this fetch: no address, the title is drawn instead of a broken picture');
eq(p.posterSrc(SRC, 300, 200), SRC + '&hearthRetry=200', 'after a new fetch it is asked for again, with a marker so the failure is not reused');
eq(p.posterSrc(SRC, 400, 200), SRC + '&hearthRetry=200', 'the marker stays the same on later fetches: a poster that came back is not reloaded each time');
eq(p.posterSrc('http://h:1/p.jpg', 300, 200), 'http://h:1/p.jpg?hearthRetry=200', 'an address without a query gets ? instead of &');
eq(p.posterSrc('', 300, 200), '', 'no poster stays no poster');

// ---- opening an item in its app ----
const source = (appId) => ({id: 'x', appId, appName: 'Example', launch: (it) => ({example: {id: it.key}})});
const open = (src) => new Promise((resolve) => { let said = null; p.openItem(src, item('42'), (why) => { said = why; }); setTimeout(() => resolve(said), 30); });
luna.calls.length = 0;
eq(await open(source('com.example.app')), null, 'an installed app opens with no message');
eq(luna.calls[0], {uri: 'luna://com.webos.applicationManager/launch', p: {id: 'com.example.app', params: {example: {id: '42'}}}}, "the source's launch parameters go to the app");
eq(await open(source('com.missing.app')), 'missing', 'an app that is not installed: "missing"');
luna.refuse = true;
eq(await open(source('com.example.app')), 'failed', 'an installed app that refuses: "failed"');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall shared shelf tests passed');
