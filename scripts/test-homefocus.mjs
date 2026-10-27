// Tests for Settings → Look → "When Home is pressed" (src/lib/homefocus.ts, positionOf in src/lib/rows.ts,
// the row in src/lib/prefs.ts and the saved setting in src/lib/storage.ts).   Run: npm test
import {build} from 'esbuild';
const bundle = async (entry, name) => {
  const out = new URL(`../node_modules/.cache-${name}-test.mjs`, import.meta.url).pathname;
  await build({entryPoints: [new URL(`../src/lib/${entry}`, import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
    plugins: [{name: 'stub-apps', setup(b) {
      b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
      b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
    }}]});
  return import(out);
};

// a tiny localStorage, which can also be made to fail like a blocked or full one
const store = {};
let broken = false;
globalThis.localStorage = {
  getItem: (k) => { if (broken) throw new Error('blocked'); return k in store ? store[k] : null; },
  setItem: (k, v) => { if (broken) throw new Error('full'); store[k] = String(v); }
};

const h = await bundle('homefocus.ts', 'homefocus');
const r = await bundle('rows.ts', 'rows-focus');
const p = await bundle('prefs.ts', 'prefs-focus');
const s = await bundle('storage.ts', 'storage-focus');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const CONFIG = 'customlauncher-config-v1';

// ---- the setting ----
const c0 = s.loadConfig();
eq(c0.homeFocus, 'first', 'default: the first app (as before)');
const row = p.optionsFor('look', c0).find((o) => o.id === 'homeFocus');
eq([row && row.label, row && row.valueText, row && row.stepper], ['When Home is pressed', 'The first app', true], 'Look tab has the row, showing "The first app"');
const c1 = p.applyPref(c0, 'homeFocus', 'ok');
eq([c1.homeFocus, p.optionsFor('look', c1).find((o) => o.id === 'homeFocus').valueText], ['last', 'The last app opened'], 'OK -> the last app opened');
eq(p.applyPref(c1, 'homeFocus', 'ok').homeFocus, 'first', 'OK again wraps back to the first app');
eq([p.applyPref(c0, 'homeFocus', 'left').homeFocus, p.applyPref(c1, 'homeFocus', 'right').homeFocus], ['first', 'last'], '← → stop at the ends');
store[CONFIG] = JSON.stringify({homeFocus: 'last'});
eq(s.loadConfig().homeFocus, 'last', 'the choice is kept after a restart');
store[CONFIG] = JSON.stringify({homeFocus: 'middle'});
eq(s.loadConfig().homeFocus, 'first', 'an unknown value falls back to the first app');
eq(p.resetLook({...c0, homeFocus: 'last'}).homeFocus, 'last', 'Reset look and clock leaves it alone (like quiet mode)');

// ---- the tile opened last ----
eq(h.readLastOpened(), null, 'nothing opened yet: none known');
h.writeLastOpened('netflix');
eq([h.readLastOpened(), store[h.LAST_OPENED_KEY]], ['netflix', 'netflix'], 'the tile opened is kept in its own entry');
eq(store[CONFIG].indexOf('netflix'), -1, 'not in the settings themselves (they are not rewritten on every launch)');
h.writeLastOpened('com.webos.app.hdmi2');
eq(h.readLastOpened(), 'com.webos.app.hdmi2', 'an input counts too, and the newest wins');
store[h.LAST_OPENED_KEY] = '';
eq(h.readLastOpened(), null, 'an empty entry means none');
store[h.LAST_OPENED_KEY] = 'x'.repeat(500);
eq(h.readLastOpened(), null, 'a nonsense entry is ignored');
broken = true;
let threw = false;
try { h.writeLastOpened('youtube.leanback.v4'); eq(h.readLastOpened(), null, 'blocked storage: none known'); } catch { threw = true; }
eq(threw, false, 'blocked or full storage never throws');
broken = false;

// ---- where the highlight lands ----
const init = r.initialPosition();
eq(r.positionOf([5], 3, init), {row: 0, cols: [3]}, 'one row: on the tile');
eq(r.positionOf([3, 2], 4, init), {row: 1, cols: [0, 1]}, 'two rows: the tile in the second row, the top row back at its start');
eq(r.positionOf([3, 2], 2, init), {row: 0, cols: [2, 0]}, 'two rows: the last tile of the top row');
eq(r.positionOf([3, 2], -1, init), null, 'a tile no longer on the row (uninstalled, hidden): none, so Home uses the first tile');
eq(r.positionOf([3, 2], 5, init), null, 'past the end: none');
eq(r.positionOf([0], 0, init), null, 'no tiles at all: none');
eq(r.positionOf([3, 2], 1, {row: 1, cols: [2, 1]}), {row: 0, cols: [1, 1]}, 'a moved tile: the other row keeps its column');

process.exit(fail ? 1 : 0);
