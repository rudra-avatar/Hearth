// Tests for the PlxNative shelves' settings: how they are saved and read back (src/lib/storage.ts) and the PlxNative tab's rows
// (src/lib/prefs.ts).   Run: npm test
import {build} from 'esbuild';
import {fileURLToPath, pathToFileURL} from 'node:url';
const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const out = path('../node_modules/.cache-plexsettings-test.mjs');
await build({
  stdin: {contents: "export * as s from './lib/storage.ts'; export * as p from './lib/prefs.ts'; export * as e from './i18n/en.ts';", resolveDir: path('../src/'), loader: 'ts'},
  bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub-apps', setup (b) {
    b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
  }}]
});
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
const {s, p, e} = await import(pathToFileURL(out).href);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const KEY = 'customlauncher-config-v1';
const saved = (plex) => { store[KEY] = JSON.stringify({...s.DEFAULT_CONFIG, defaultsV: s.DEFAULTS_VERSION, plex}); return s.loadConfig(); };

// ---- saving and reading back ----
eq(s.DEFAULT_CONFIG.plex, {continueOn: false, recentOn: false, action: 'play'}, 'a fresh install: both shelves off, OK plays');
eq(saved(undefined).plex, {continueOn: false, recentOn: false, action: 'play'}, 'settings saved before the shelves existed read as off');
eq(saved({continueOn: true, recentOn: false, action: 'open'}).plex, {continueOn: true, recentOn: false, action: 'open'}, 'saved choices are read back');
eq(saved({continueOn: 'yes', recentOn: 1, action: 'stream'}).plex, {continueOn: false, recentOn: false, action: 'play'}, 'odd saved values fall back to the defaults');
eq(saved('nonsense').plex, {continueOn: false, recentOn: false, action: 'play'}, 'a saved value that is not an object reads as the defaults');
const mine = {...s.DEFAULT_CONFIG, plex: {continueOn: true, recentOn: true, action: 'open'}};
eq(s.withDefaultLook(mine).plex, mine.plex, 'the look reset (new defaults version) leaves the shelves as they are');
eq(p.resetLook(mine).plex, mine.plex, 'Reset the look in Settings leaves them too');

// ---- the PlxNative group of the Widgets tab ----
const all = (c, info, open) => p.optionsFor('clock', c, info, open);
const ids = (c, info) => all(c, info).map((o) => o.id).filter((id) => id.indexOf('plex') === 0);
const off = s.DEFAULT_CONFIG;
const on = {...off, plex: {...off.plex, recentOn: true}};
const signedOut = {homeHook: null, plex: {signedIn: false, account: '', server: ''}};
const signedIn = {homeHook: null, plex: {signedIn: true, account: 'Dee', server: 'Home'}};
eq(ids(off, signedOut), ['plexContinue', 'plexRecent'], 'both shelves off, signed out: only the two switches');
eq(ids(off, signedIn), ['plexContinue', 'plexRecent', 'plexAccount'], 'both shelves off but signed in: the account row stays, so Sign out is never hidden');
eq(ids(on, signedOut), ['plexContinue', 'plexRecent', 'plexAccount', 'plexAction'], 'a shelf on, signed out: the account row, no server row yet');
eq(ids(on, signedIn), ['plexContinue', 'plexRecent', 'plexAccount', 'plexServer', 'plexAction'], 'signed in: the server row too');
const clockOff = {...on, clock: {...on.clock, show: false}};
eq([ids(clockOff, signedIn).length, all(clockOff, signedIn).some((o) => o.id === 'clockSize')], [5, false], 'the clock widget off hides its rows but not the PlxNative group');
const grouped = all(on, signedIn, 'PlxNative');
eq(grouped.filter((o) => o.header).map((o) => [o.id, o.label, !!o.open]).slice(-1)[0], ['group:clock:PlxNative', 'PlxNative', true], 'the rows sit in their own PlxNative group, last in the tab');
eq(grouped.filter((o) => o.grouped).map((o) => o.id), ['plexContinue', 'plexRecent', 'plexAccount', 'plexServer', 'plexAction'], 'opening the group shows its rows');
eq([e.en['app.widget'], e.en['pref.widgetOn.label']], ['Widgets', 'Show the clock widget'], 'the tab is Widgets; its first switch says it is the clock');
const value = (c, info, id) => (all(c, info).filter((o) => o.id === id)[0] || {}).valueText;
eq(value(on, signedOut, 'plexAccount'), 'Sign in', 'signed out, the account row offers Sign in');
eq(value(on, signedIn, 'plexAccount'), 'Dee', 'signed in, it shows the account');
eq(value(on, {...signedIn, plex: {signedIn: true, account: '', server: ''}}, 'plexAccount'), 'Signed in', 'signed in without a known name');
eq(value(on, signedIn, 'plexServer'), 'Home', 'the server row shows the chosen server');
eq(p.applyPref(off, 'plexContinue', 'ok').plex.continueOn, true, 'OK switches a shelf on');
eq(p.applyPref(off, 'plexContinue', 'left').plex.continueOn, false, 'the arrows leave a switch alone');
eq(p.applyPref(on, 'plexAction', 'ok').plex.action, 'open', 'OK steps Play to Open details');
eq(p.applyPref(p.applyPref(on, 'plexAction', 'ok'), 'plexAction', 'ok').plex.action, 'play', 'and back');
eq(['plexContinue', 'plexRecent', 'plexAccount', 'plexServer', 'plexAction'].filter((id) => !e.en['pref.' + id + '.label'] || !e.en['pref.' + id + '.desc']), [], 'every row has its label and description');
eq(e.en['group.PlxNative'], 'PlxNative', 'the group is named PlxNative, so nobody expects the official Plex app');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall plex settings tests passed');
