// Tests for src/lib/themeapply.ts and the theme fonts in src/lib/clockfont.ts (P80).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-themeapply-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/themeapply.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const outFont = new URL('../node_modules/.cache-themeapply-font.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/clockfont.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: outFont, platform: 'node', logLevel: 'error'});
const t = await import(out);
const f = await import(outFont);   // note: a second bundle, so it has its own font lists; the apply bundle has its own too
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const base = {theme: 'black', iconStyle: 'original', iconLight: false, iconColor: 'theme', labelFont: 'default', clock: {color: 'theme', font: 'inter', size: 5}};
const same = (c) => JSON.stringify(c);

// a theme without parts changes nothing (same object)
eq(t.applyThemeParts(base, {name: 'T'}) === base, true, 'no parts: the same settings object');
eq(t.applyThemeParts(base, {name: 'T', colors: {}}) === base, true, 'empty colours part: nothing changes');

// colours: three independent choices
let r = t.applyThemeParts(base, {name: 'T', colors: {theme: 'teal', widget: 'amber', icon: 'blue'}});
eq([r.theme, r.clock.color, r.iconColor, r.clock.size], ['teal', 'amber', 'blue', 5], 'colours: theme, widget and icon colour set; other clock fields kept');
r = t.applyThemeParts(base, {name: 'T', colors: {widget: 'white'}});
eq([r.theme, r.clock.color, r.iconColor], ['black', 'white', 'theme'], 'only the widget colour: theme and icon colour unchanged');
r = t.applyThemeParts({...base, theme: 'teal', iconColor: 'amber'}, {name: 'T', colors: {widget: 'theme', icon: 'theme'}});
eq([r.theme, r.iconColor, r.clock.color], ['teal', 'theme', 'theme'], 'Follow theme (theme) is applied as a choice');

// icon style and tile
r = t.applyThemeParts(base, {name: 'T', iconStyle: {style: 'mono', tile: 'light'}});
eq([r.iconStyle, r.iconLight], ['mono', true], 'icon style and light tile');
r = t.applyThemeParts({...base, iconStyle: 'soft', iconLight: true}, {name: 'T', iconStyle: {tile: 'dark'}});
eq([r.iconStyle, r.iconLight], ['soft', false], 'tile only: the style stays');

// fonts: built-in ids
r = t.applyThemeParts(base, {name: 'T', fonts: {widget: 'oswald', names: 'poppins'}});
eq([r.clock.font, r.labelFont], ['oswald', 'poppins'], 'built-in fonts for widget and names');
r = t.applyThemeParts({...base, labelFont: 'poppins'}, {name: 'T', fonts: {names: 'default'}});
eq(r.labelFont, 'default', 'names font back to Default');

// fonts of a theme: the id is known after setThemeFonts (same module instance as the apply bundle -> use its own lists)
eq(typeof f.setThemeFonts, 'function', 'clockfont exports setThemeFonts');
f.setThemeFonts([{id: 'my-font', label: 'My font'}, {id: 'inter', label: 'clash'}, {id: 'default', label: 'clash'}]);
eq([f.CLOCK_FONT_IDS.indexOf('my-font') !== -1, f.CLOCK_FONT_IDS.filter((x) => x === 'inter').length, f.CLOCK_FONT_IDS.indexOf('default')], [true, 1, -1], 'theme font added; a built-in id or "default" is not added twice');
eq([f.LABEL_FONT_IDS[0], f.LABEL_FONT_IDS.indexOf('my-font') !== -1], ['default', true], 'Name font list: Default first, theme font included');
eq([f.isThemeFont('my-font'), f.isThemeFont('oswald'), f.isThemeFont('nothing')], [true, false, false], 'isThemeFont');
eq(f.fontFamily('my-font').indexOf('"Hearth Theme my-font"') === 0, true, 'family name of a theme font');
eq(f.fontLabel('my-font'), 'My font', 'label of a theme font');
f.setThemeFonts([]);
eq([f.CLOCK_FONT_IDS.indexOf('my-font'), f.LABEL_FONT_IDS.indexOf('my-font'), f.CLOCK_FONT_IDS.length, f.LABEL_FONT_IDS.length], [-1, -1, f.BUILTIN_FONT_IDS.length, f.BUILTIN_FONT_IDS.length + 1], 'no theme fonts: exactly the built-in lists again');

// a saved font of an earlier theme that the new theme lacks reads as the default
r = t.applyThemeParts({...base, labelFont: 'gone-font', clock: {...base.clock, font: 'gone-font'}}, {name: 'T'});
eq([r.clock.font, r.labelFont], ['inter', 'default'], 'a missing theme font falls back to Inter / Default');

// P81: app list, mismatch, remove
const cfg = {...base, themeSel: '', appIds: null, tileOrder: ['x'], appEdits: {}};
r = t.applyThemeApps(cfg, {name: 'T', apps: [{id: 'b', name: 'Bee'}, {id: 'a'}]});
eq([r.appIds, r.tileOrder, r.appEdits], [['b', 'a'], null, {b: {label: 'Bee'}}], 'apps: order first, names as edited names, tile order reset');
r = t.applyThemeApps({...cfg, appIds: ['c', 'a']}, {name: 'T', apps: [{id: 'a'}]});
eq(r.appIds, ['a', 'c'], 'apps: the theme order goes first, other saved ids follow');
eq(t.applyThemeApps(cfg, {name: 'T'}) === cfg, true, 'no apps part: nothing changes');
r = t.applyWholeTheme(cfg, {name: 'My Theme!', colors: {theme: 'teal'}});
eq([r.theme, r.themeSel], ['teal', 'my-theme'], 'applyWholeTheme: parts and the selection slug');
const m = t.themeMismatch({name: 'T', apps: [{id: 'a'}, {id: 'z'}], icons: [{app: 'a', file: 'x.png'}, {app: 'q', file: 'y.png'}]}, ['a', 'b']);
eq(m, {missingApps: ['b'], extraApps: ['z'], missingIcons: ['b'], extraIcons: ['q']}, 'mismatch lists missing and extra apps and icons');
eq(t.themeMismatch({name: 'T', apps: [{id: 'a'}]}, []), {missingApps: [], extraApps: [], missingIcons: [], extraIcons: []}, 'no comparison while this TV list is empty');
eq(t.mismatchText(m, (id) => id.toUpperCase()).indexOf('1 apps of the theme are not on this TV (z)') === 0, true, 'mismatch text');
r = t.removeThemeParts({...cfg, theme: 'teal', themeSel: 'x', iconStyle: 'mono', iconLight: true, iconColor: 'amber', appIds: ['b'], appEdits: {b: {label: 'Bee'}, c: {label: 'Mine'}}, labelFont: 'oswald', clock: {...base.clock, color: 'amber', font: 'oswald'}},
	{name: 'T', colors: {theme: 'teal', widget: 'amber', icon: 'amber'}, iconStyle: {style: 'mono', tile: 'light'}, fonts: {widget: 'oswald', names: 'oswald'}, apps: [{id: 'b', name: 'Bee'}]});
eq([r.theme, r.themeSel, r.iconStyle, r.iconLight, r.iconColor, r.labelFont, r.clock.color, r.clock.font, r.appIds, r.appEdits], ['black', '', 'original', false, 'theme', 'default', 'theme', 'outfit', null, {c: {label: 'Mine'}}], 'remove: the theme parts go to the defaults, the user\'s own edits stay');
r = t.removeThemeParts({...cfg, theme: 'teal'}, {name: 'T', icons: [{app: 'a', file: 'x.png'}]});
eq(r.theme, 'teal', 'remove: a part the theme did not hold is left alone');

// the input is never changed
const frozen = same(base);
t.applyThemeParts(base, {name: 'T', colors: {theme: 'teal'}, fonts: {widget: 'oswald'}, iconStyle: {style: 'mono'}});
eq(same(base), frozen, 'the old settings object is not changed');

// P96: wallpaper part
const wbase = {...base, wallpaper: {mode: 'gradient', path: '', intervalSec: 60, shuffle: true, recursive: false}};
const ST = '/media/developer/launcher-theme/current/';
r = t.applyThemeParts(wbase, {name: 'T', wallpaper: {file: 'w.jpg'}});
eq([r.wallpaper.mode, r.wallpaper.path], ['image', ST + 'w.jpg'], 'wallpaper: one picture from the kept folder');
r = t.applyThemeParts({...wbase, wallpaper: {...wbase.wallpaper, intervalSec: 120, shuffle: false}}, {name: 'T', wallpaper: {folder: 'wp'}});
eq([r.wallpaper.mode, r.wallpaper.path, r.wallpaper.intervalSec, r.wallpaper.shuffle], ['folder', ST + 'wp', 120, false], 'wallpaper: folder keeps the user interval and shuffle when the theme gives none');
r = t.applyThemeParts(wbase, {name: 'T', wallpaper: {folder: 'wp', intervalSec: 15, shuffle: true}});
eq([r.wallpaper.intervalSec, r.wallpaper.shuffle], [15, true], 'wallpaper: folder takes the theme interval and shuffle');
r = t.applyThemeParts(wbase, {name: 'T'});
eq(r === wbase, true, 'wallpaper: no part, no change');
r = t.applyThemeParts(wbase, {name: 'T', wallpaper: {file: 'w.jpg'}}, ST + 'w.jpg');
eq(r.wallpaper.path, ST + './w.jpg'.replace('./w', './w'), 'wallpaper: the same path as the one in use gets "./" so the page redraws');
const own = t.applyThemeParts(wbase, {name: 'T', wallpaper: {file: 'w.jpg'}});
const gone = t.removeThemeParts(own, {name: 'T', wallpaper: {file: 'w.jpg'}});
eq([gone.wallpaper.mode, gone.wallpaper.path], ['gradient', ''], 'Remove theme: its own wallpaper goes back to the default');
const mine = {...own, wallpaper: {...own.wallpaper, path: '/media/developer/wallpapers/x.jpg'}};
eq(t.removeThemeParts(mine, {name: 'T', wallpaper: {file: 'w.jpg'}}).wallpaper.path, '/media/developer/wallpapers/x.jpg', 'Remove theme: a wallpaper the user chose afterwards stays');

// P100 widget ink
let wi = t.applyThemeParts(base, {name: 'T', colors: {widgetInk: '#FFE9C7'}});
eq([wi.clock.color, wi.clock.ink], ['theme', '#FFE9C7'], 'widgetInk: colour reads Follow theme, ink kept');
eq(t.applyThemeParts(wi, {name: 'T', colors: {widgetInk: '#FFE9C7'}}), wi, 'widgetInk: same ink changes nothing (same object)');
eq(t.applyThemeParts(wi, {name: 'T', colors: {widget: 'amber'}}).clock.ink, undefined, 'a plain widget colour drops an earlier ink');
eq(t.removeThemeParts(wi, {name: 'T', colors: {widgetInk: '#FFE9C7'}}).clock.ink, undefined, 'Remove theme: ink gone');
eq(t.removeThemeParts(wi, {name: 'T', colors: {widgetInk: '#FFE9C7'}}).clock.color, 'theme', 'Remove theme: widget colour back to the default');

console.log(fail ? `${fail} FAILED` : 'all ok');
if (fail) process.exit(1);
