// Tests for the remote buttons set through LG Input Hook (src/lib/inputhook.ts, nextKeyApp in prefs.ts).   Run: npm test
import {build} from 'esbuild';
const stub = {name: 'stub', setup (b) {
	b.onResolve({filter: /^\.\/apps$|^\.\/luna$/}, (a) => ({path: a.path, namespace: 'stub'}));
	b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const isWebOS = () => false; export const shellQuote = (v) => v;', loader: 'js'}));
}};
const out = new URL('../node_modules/.cache-inputhook-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/inputhook.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error', plugins: [stub]});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const ME = 'tld.my.customlauncher';
const none = {red: null, green: null, yellow: null, blue: null};

// reading
eq(h.readState('{"773":{"action":"launch","id":"tld.my.customlauncher"}}', ME), {installed: true, home: true, keys: none}, 'a Home binding made by hand is seen as on');
eq(h.readState('{"399":{"action":"launch","id":"netflix"},"400":{"action":"replace","keycode":1}}', ME).keys, {red: null, green: 'netflix', yellow: null, blue: null}, 'colour buttons: only launch bindings count');
eq(h.readState('not json', ME), {installed: true, home: false, keys: none}, 'a broken file reads as nothing set');
eq(h.readState('{"773":{"action":"launch","id":"x; rm -rf /"}}', ME).home, false, 'an odd app id is ignored');

// writing
const mine = {'1031': {action: 'exec', command: 'echo hi'}, '400': {action: 'ignore'}};
const merged = h.mergeKeybinds(mine, {home: true, keys: {red: 'netflix', green: null, yellow: 'youtube.leanback.v4', blue: null}}, ME);
eq(merged['773'], {action: 'launch', id: ME}, 'Home on: launches Hearth');
eq(merged['398'], {action: 'launch', id: 'netflix'}, 'red: launches the chosen app');
eq(merged['1031'], {action: 'exec', command: 'echo hi'}, 'other buttons are left as they are');
eq(merged['400'], {action: 'ignore'}, "a managed button with the user's own Disable is not taken over");
const off = h.mergeKeybinds(merged, {home: false, keys: none}, ME);
eq(['773', '398', '399', '401'].map((k) => k in off), [false, false, false, false], 'switching off removes only the launch bindings');
eq(off['1031'], {action: 'exec', command: 'echo hi'}, '... and still keeps the others');
eq(h.mergeKeybinds({}, {home: false, keys: {red: 'bad id!', green: null, yellow: null, blue: null}}, ME), {}, 'an odd app id is never written');
eq(h.parseKeybinds('[1,2]'), {}, 'a list is not a settings file');

// stepping through the apps on a colour row
const stepBuild = new URL('../node_modules/.cache-inputhook-prefs-test.mjs', import.meta.url).pathname;
const prefsStub = {name: 'stub2', setup (b) {
	b.onResolve({filter: /^\.\/apps$|^\.\/luna$|^\.\/failure$|^\.\/wallpaper$|^\.\/system$/}, (a) => ({path: a.path, namespace: 'stub2'}));
	b.onLoad({filter: /.*/, namespace: 'stub2'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const isWebOS = () => false; export const shellQuote = (v) => v; export const lastFailure = () => null; export const baseName = (p) => p;', loader: 'js'}));
}};
await build({entryPoints: [new URL('../src/lib/prefs.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: stepBuild, platform: 'node', logLevel: 'error', plugins: [prefsStub]});
const p = await import(stepBuild);
const ids = ['netflix', 'youtube', 'plex'];
eq(p.nextKeyApp(null, ids, 'right'), 'netflix', 'from nothing, → picks the first app');
eq(p.nextKeyApp('plex', ids, 'right'), 'plex', '→ stops at the last app');
eq(p.nextKeyApp('plex', ids, 'ok'), null, 'OK wraps round to nothing');
eq(p.nextKeyApp('netflix', ids, 'left'), null, '← from the first app is nothing');
eq(p.nextKeyApp('uninstalled.app', ids, 'right'), 'netflix', 'an app that is gone counts as nothing');
process.exit(fail ? 1 : 0);
