// Tests for the settings model (src/lib/storage.ts, src/lib/prefs.ts).   Run: npm test
import {build} from 'esbuild';

const out = new URL('../node_modules/.cache-settings-test.mjs', import.meta.url).pathname;
await build({
  entryPoints: [new URL('../src/lib/prefs.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub-apps', setup(b) {
    b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
  }}]
});
const storage = await build({entryPoints: [new URL('../src/lib/storage.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false, platform: 'node', logLevel: 'error'});
const storageOut = new URL('../node_modules/.cache-storage-test.mjs', import.meta.url).pathname;
(await import('fs')).writeFileSync(storageOut, storage.outputFiles[0].text);

// a tiny localStorage for loadConfig
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};

const winOut = new URL('../node_modules/.cache-optionwindow-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/optionwindow.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: winOut, platform: 'node', logLevel: 'error'});
const ow = await import(winOut);
const p = await import(out);
const s = await import(storageOut);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const KEY = 'customlauncher-config-v1';

// ---- defaults and loading ----
const d = s.loadConfig();
eq([d.theme, d.iconScale, d.sideMargin, d.bottomMargin, d.clockFormat, d.clock.size, d.clock.weight, d.clock.top, d.clock.left], ['black', 90, 20, 10, 'tv', 140, 400, 20, 50], 'defaults (P41f): OLED black, same-as-TV clock, icons 90%, margins 20 and 10, Regular, 20% from top, 50% from left (P113)');
store[KEY] = JSON.stringify({defaultsV: 1, theme: 'grey', iconScale: 999, sideMargin: 33, bottomMargin: -5, clock: {size: 12, top: 29, weight: 999, color: 'neon', showDate: false}, wallpaper: {mode: 'folder', path: '/x', intervalSec: 2}});
const g = s.loadConfig();
eq([g.theme, g.iconScale, g.sideMargin, g.bottomMargin], ['grey', 140, 30, 0], 'out-of-range numbers are clamped and snapped');
eq([g.clock.size, g.clock.top, g.clock.weight, g.clock.color, g.clock.showDate, g.clock.showPeriod], [80, 30, 400, 'white', false, true], 'clock values validated, missing ones default');
eq([g.wallpaper.mode, g.wallpaper.intervalSec], ['folder', 60], 'bad interval falls back');
store[KEY] = '{not json';
eq(s.loadConfig().theme, 'black', 'corrupt storage falls back to defaults');
store[KEY] = JSON.stringify({defaultsV: 1, wallpaper: {mode: 'folder', path: ''}});
eq(s.loadConfig().wallpaper.mode, 'gradient', 'folder mode without a path becomes default background');

store[KEY] = JSON.stringify({defaultsV: 1, tileOrder: ['com.webos.app.hdmi1', 'x', 7]});
eq(s.loadConfig().tileOrder, ['com.webos.app.hdmi1', 'x'], 'a saved tile order is loaded (bad entries dropped)');
store[KEY] = JSON.stringify({defaultsV: 1, tileOrder: 'nope'});
eq(s.loadConfig().tileOrder, null, 'a bad tile order becomes none');

// ---- apps: shown unless hidden ----
store[KEY] = JSON.stringify({defaultsV: 1, appIds: ['a', 'b']});
eq(s.loadConfig().hiddenIds, null, 'settings from an older version (a list of apps to show) are flagged to be converted');
store[KEY] = JSON.stringify({defaultsV: 1, });
eq(s.loadConfig().hiddenIds, [], 'new settings: nothing hidden');
store[KEY] = JSON.stringify({defaultsV: 1, appIds: null});
eq(s.loadConfig().hiddenIds, [], 'older settings that showed every app: nothing hidden');
store[KEY] = JSON.stringify({defaultsV: 1, appIds: ['a'], hiddenIds: ['x']});
eq(s.loadConfig().hiddenIds, ['x'], 'a saved hide-list is kept');
store[KEY] = JSON.stringify({defaultsV: 1, rows: 3, showLabels: false});
eq([s.loadConfig().rows, s.loadConfig().showLabels], [1, false], 'rows are 1 or 2 only; the app-names switch is read');
store[KEY] = JSON.stringify({defaultsV: 1, rows: 2});
eq([s.loadConfig().rows, s.loadConfig().showLabels], [2, true], 'two rows are kept; app names default to shown');
eq([s.DEFAULT_CONFIG.hiddenIds, s.DEFAULT_CONFIG.rows, s.DEFAULT_CONFIG.showLabels], [[], 1, true], 'defaults: nothing hidden, one row, names shown');
store[KEY] = '{not json';

// ---- stepping ----
eq(s.stepValue([1, 2, 3], 3, 1, true), 1, 'OK wraps round');
eq(s.stepValue([1, 2, 3], 3, 1, false), 3, 'arrow stops at the end');
eq(s.stepValue([1, 2, 3], 1, -1, false), 1, 'arrow stops at the start');
eq(s.stepValue([1, 2, 3], 99, 1, true), 2, 'unknown value starts from the first');

// ---- prefs ----
const c0 = s.DEFAULT_CONFIG;
eq(p.applyPref(c0, 'iconScale', 'right').iconScale, 100, 'right arrow: icon size 90 -> 100');
eq(p.applyPref(c0, 'iconScale', 'left').iconScale, 80, 'left arrow: icon size 90 -> 80');
eq(p.applyPref({...c0, iconScale: 140}, 'iconScale', 'right').iconScale, 140, 'right arrow stops at the maximum');
eq(p.applyPref({...c0, iconScale: 140}, 'iconScale', 'ok').iconScale, 50, 'OK wraps to the minimum (50%)');
eq(p.applyPref(c0, 'theme', 'ok').theme, 'grey', 'OK flips the theme');
eq(p.applyPref(c0, 'showDate', 'ok').clock.showDate, false, 'OK flips a switch');
eq(p.applyPref(c0, 'showDate', 'right') === c0, true, 'arrows leave a switch alone');
eq(p.applyPref(c0, 'clockSize', 'right').clock.size, 150, 'clock size steps by 10');
eq(p.applyPref(c0, 'clockTop', 'right').clock.top, 22, 'clock height steps by 2% (from the 20% default)');
eq(p.applyPref(c0, 'clockLeft', 'left').clock.left, 48, 'clock sideways: left arrow moves it left by 2% (from the 50% default)');
eq(p.applyPref({...c0, clock: {...c0.clock, left: 100}}, 'clockLeft', 'right').clock.left, 100, 'clock sideways stops at the right limit');
eq(p.applyPref({...c0, clock: {...c0.clock, left: 0}}, 'clockLeft', 'left').clock.left, 0, 'clock sideways stops at the left limit');
eq(p.applyPref(c0, 'clockWeight', 'ok').clock.weight, 500, 'thickness: Regular -> Medium (default is Regular)');
eq(p.applyPref(c0, 'wallpaper', 'ok') === c0, true, 'OK on the wallpaper row changes no value (the app opens the picker)');
eq(p.applyPref(c0, 'nonsense', 'ok') === c0, true, 'unknown option does nothing');
eq(s.loadConfig().clock.left, 50, 'missing clock position defaults to 50% from the left (P113)');
const messy = {...c0, theme: 'grey', iconScale: 70, sideMargin: 0, bottomMargin: 200, clockFormat: '24h', clock: {...c0.clock, size: 220, color: 'amber'}, appIds: ['a'], wallpaper: {...c0.wallpaper, mode: 'image', path: '/p.jpg'}};
const r = p.resetLook(messy);
eq([r.theme, r.iconScale, r.sideMargin, r.bottomMargin, r.clockFormat, r.clock.size, r.clock.color], ['black', 90, 20, 10, 'tv', 140, 'theme'], 'reset restores the look and clock (P77: widget colour Follow theme)');
eq([r.appIds, r.wallpaper.mode], [['a'], c0.wallpaper.mode], 'reset keeps apps and sets the wallpaper back to the default (P108)');

// ---- the lists shown in Settings ----
for (const tab of ['look', 'clock', 'wallpaper', 'system']) {
  const list = p.optionsFor(tab, c0);
  eq(list.length >= 1 && list.length <= 30, true, `${tab} tab has ${list.length} options (a long list scrolls)`);
}
const look = p.optionsFor('look', c0);
eq(look.map((o) => o.id).join(','), 'theme,iconScale,tileShape,iconStyle,iconGap,iconOpacity,rows,scrollSpeed,homeFocus,sideMargin,bottomMargin,inputStatus,showLgHome,showSystem,hideSettings,showLabels,labelColor,labelFont,labelSize,labelWeight,quietSec,quietDimSec,quietDimLevel,oledShift,recentsSize,resetLook', 'P35b: the Look tab lists its rows in group order');
eq(p.applyPref(c0, 'rows', 'ok').rows, 2, 'Rows of apps: 1 -> 2');
eq(p.applyPref(p.applyPref(c0, 'rows', 'ok'), 'rows', 'ok').rows, 1, 'and 2 -> 1');
eq(p.applyPref(c0, 'showLabels', 'ok').showLabels, false, 'Show app names switches off');
eq([p.applyPref(c0, 'iconStyle', 'ok').minimal, p.applyPref(c0, 'iconStyle', 'ok').iconStyle], [true, 'original'], 'P35c: Icon style Original -> Minimal sets the minimal flag');
eq([p.applyPref(p.applyPref(c0, 'iconStyle', 'ok'), 'iconStyle', 'ok').iconStyle, p.applyPref(p.applyPref(c0, 'iconStyle', 'ok'), 'iconStyle', 'ok').minimal], ['glyph', false], 'then Glyph clears it (2.0.3 Y1: Glyph follows Minimal)');
eq(p.optionsFor('look', {...c0, minimal: true}).find((o) => o.id === 'iconStyle').valueText, 'Minimal', 'a saved minimal setting reads as Minimal');
eq(p.resetLook({...c0, minimal: true}).minimal, false, 'reset clears minimal');
eq(p.resetLook({...c0, background: 'theme', wallpaper: {...c0.wallpaper, mode: 'image', path: '/x.jpg'}, theme: 'forest'}).background, 'photo-17', 'P108: reset puts the default photo (Photo: 1) back');
eq(p.resetLook({...c0, wallpaper: {...c0.wallpaper, mode: 'folder', path: '/x'}, theme: 'forest'}).wallpaper.mode, 'gradient', 'P108: reset ends an own picture or slideshow');
eq(p.resetLook({...c0, theme: 'forest'}).theme, 'black', 'P108: reset puts OLED black back');
store[KEY] = JSON.stringify({defaultsV: 1, iconStyle: 'mono'}); eq(s.loadConfig().iconStyle, 'mono', 'the dark mono icon style is read back');
for (const st of ['soft', 'accent', 'gradient', 'tinted', 'glyph']) { store[KEY] = JSON.stringify({defaultsV: 1, iconStyle: st}); eq(s.loadConfig().iconStyle, st, `P39c: ${st} mono is read back`); }
{ let cc = c0; const seen = []; for (let k = 0; k < 7; k++) { seen.push(p.optionsFor('look', cc).find((o) => o.id === 'iconStyle').valueText); cc = p.applyPref(cc, 'iconStyle', 'ok'); } eq(seen, ['Original', 'Minimal', 'Glyph', 'Dark mono', 'Soft mono', 'Gradient mono', 'Tinted tile'], 'P59b: in OLED black Icon style steps through seven values (no Accent mono; Glyph added in Y1)'); eq(p.applyPref(cc, 'iconStyle', 'ok').iconStyle, 'original', 'and wraps to Original'); }
{ const teal = {...c0, theme: 'teal'}; let cc = teal; const seen = []; for (let k = 0; k < 7; k++) { seen.push(p.optionsFor('look', cc).find((o) => o.id === 'iconStyle').valueText); cc = p.applyPref(cc, 'iconStyle', 'ok'); } eq(seen.indexOf('Accent mono') !== -1, true, 'P59b: other themes still offer Accent mono'); }
eq(p.optionsFor('look', {...c0, theme: 'black', iconStyle: 'accent'}).find((o) => o.id === 'iconStyle').valueText, 'Soft mono', 'P59b: a saved Accent mono reads as Soft mono in OLED black');
eq(s.effectiveIconStyle('accent', 'black') + s.effectiveIconStyle('accent', 'teal'), 'softaccent', 'P59b: effectiveIconStyle');
eq([c0, {...c0, iconStyle: 'mono'}, {...c0, iconStyle: 'gradient'}].map((c) => !!p.optionsFor('look', c).find((o) => o.id === 'iconLight')), [false, true, false], 'P59b: the Icon tile row shows for Dark, Soft and Accent mono only');
eq(p.applyPref({...c0, iconStyle: 'mono'}, 'iconLight', 'ok').iconLight, true, 'P59b: Icon tile Dark -> Light');
store[KEY] = JSON.stringify({defaultsV: 1, iconLight: true}); eq(s.loadConfig().iconLight, true, 'P59b: iconLight is read back');
store[KEY] = JSON.stringify({defaultsV: 1, iconStyle: 'nope'}); eq([s.loadConfig().iconStyle, s.DEFAULT_CONFIG.iconStyle], ['original', 'original'], 'an unknown icon style falls back to original');
store[KEY] = JSON.stringify({defaultsV: 1, minimal: true}); eq(s.loadConfig().minimal, true, 'the minimalist choice is read back');
store[KEY] = JSON.stringify({defaultsV: 1, appEdits: {'a.b': {label: 'X'}, 'c.d': {icon: 'nope'}}}); eq(s.loadConfig().appEdits, {'a.b': {label: 'X'}}, 'app edits are read back and cleaned');
eq(p.optionsFor('system', c0).map((o) => o.id).join(','), 'updates,language,homeKey,remap,tvApps,noRootGuide,tvInput,replaceHome,samHome,powerOnApp,lgLogo,noUpdate,homeApp,preload,keepReady,keepRelaunch,showDebug', 'the System tab (P61b2: the Home button row moved to the Remote group): the TV app list first (shown only when not rooted), the helper script, the Home button, the power-on app, the LG logo, the experimental Home app row (P58c) and last the Debug tab switch (the TV-input row, 2.0.2, is one On/Off toggle)');
eq(p.optionsFor('system', c0, {homeApp: null, homeHook: null, tvInput: true}).find((o) => o.id === 'tvInput').valueText, 'On', 'the TV-input row reads On when the TV lists Hearth (2.0.2)');
eq(p.optionsFor('system', c0, {homeApp: null, homeHook: null, tvInput: false}).find((o) => o.id === 'tvInput').valueText, 'Off', 'and Off when it is not listed');
eq(p.optionsFor('system', c0).some((o) => o.id === 'tvInput'), true, 'and is shown while the TV has not been asked')
eq(c0.tileOrder, null, 'a new config has no saved tile order');
eq(p.optionsFor('system', c0).find((o) => o.id === 'replaceHome').label, 'Replace LG Home (helper)', 'P35f: the helper row is one switch (the Home button row moved to Remote, P61b2)');
const row = (id) => p.optionsFor('system', c0).find((o) => o.id === id);
eq(row('replaceHome').description.length <= 90, true, 'P35d: the helper row has a short description');
const dis = (cfg, info, id) => p.optionsFor('system', cfg, info).find((o) => o.id === id).disabled;
eq(p.optionsFor('clock', c0).filter((o) => /Widget position/.test(o.label)).map((o) => o.label).join(' | '), 'Widget position (vertical) | Widget position (horizontal)', 'the clock position settings are named vertical and horizontal');
eq(JSON.stringify([p.applyPref({...c0, clock: {...c0.clock, top: 2}}, 'clockTop', 'left').clock.top, p.applyPref({...c0, clock: {...c0.clock, top: 0}}, 'clockTop', 'left').clock.top]), '[0,0]', 'the clock can go all the way to the top (0%) and stops there');
eq([p.applyPref({...c0, clock: {...c0.clock, left: 100}}, 'clockLeft', 'right').clock.left, p.applyPref({...c0, clock: {...c0.clock, left: 0}}, 'clockLeft', 'left').clock.left], [100, 0], 'the horizontal position runs from 0% to 100%');
// ---- the scrolling window ----
const H = [128, 128, 128, 128, 128, 100, 100];                 // seven rows, taller than 800 px together
eq(ow.windowEnd(H, 0), 6, 'at the top, six of the seven rows fit');
eq(ow.windowStart(H, 6, 0), 1, 'moving down to the last row scrolls the list so it is visible');
eq(ow.windowEnd(H, 1), 7, 'and then the last row is shown');
eq(ow.windowStart(H, 5, 1), 1, 'moving up inside the window does not scroll');
eq(ow.windowStart(H, 0, 1), 0, 'moving above the window scrolls up');
eq(ow.windowStart(H, 0, 0), 0, 'and the top is the top');
eq(ow.windowStart([100, 100], 1, 0), 0, 'a short list never scrolls');
eq(ow.windowEnd([2000, 100], 0), 1, 'a single very tall row is still shown');
eq([ow.optionHeight('short'), ow.optionHeight('x'.repeat(100)), ow.optionHeight('x'.repeat(200))].join(','), '111,139,167', 'row height grows with the description length');
eq(p.applyPref({...c0, wallpaper: {...c0.wallpaper, intervalSec: 900}}, 'interval', 'ok').wallpaper.intervalSec, 1800, 'the slideshow interval goes 15 minutes -> 30 minutes');
eq(p.applyPref({...c0, wallpaper: {...c0.wallpaper, intervalSec: 1800}}, 'interval', 'ok').wallpaper.intervalSec, 3600, 'and 30 minutes -> 1 hour');
eq(p.intervalText(1800), '30 minutes', 'the 30-minute interval reads "30 minutes"');
eq(p.intervalText(60), '1 minute', 'interval text');
eq(p.intervalText(3600), '1 hour', 'interval text hour');

// ---- the clock font ----
eq(d.clock.font, 'outfit', 'default clock font is Outfit (P41f; was Inter)');
store[KEY] = JSON.stringify({defaultsV: 1, clock: {font: 'oswald'}});
eq(s.loadConfig().clock.font, 'oswald', 'a saved clock font is loaded');
store[KEY] = JSON.stringify({defaultsV: 1, clock: {font: 'comic-sans'}});
eq(s.loadConfig().clock.font, 'outfit', 'an unknown clock font falls back to the default, Outfit');
store[KEY] = JSON.stringify({defaultsV: 1, clock: {size: 100}});
eq(s.loadConfig().clock.font, 'outfit', 'settings from an older version (no font) get the default, Outfit');
// P58c: the Home app row (PR #18) is never greyed out for the webOS version; it and the helper exclude each other
const homeAppRow = (info, c = c0) => p.optionsFor('system', c, {homeHook: null, ...info}).find((o) => o.id === 'homeApp');
eq(/experimental, webOS 4\.x/.test(homeAppRow({homeApp: ''}).label), true, 'the Home app row is labelled experimental, webOS 4.x');
eq(!!homeAppRow({homeApp: ''}).disabled, false, 'it is not greyed out on a TV without the setting (the toast says so)');
eq(!!homeAppRow({homeApp: 'com.webos.app.home'}).disabled, false, 'it is usable on webOS 7.x where the setting exists');
eq(homeAppRow({homeApp: 'com.webos.app.home'}).valueText, 'Off', 'Off while the setting names LG Home');
eq(homeAppRow({homeApp: 'tld.my.customlauncher'}).valueText, 'On', 'On while it names Hearth');
eq(!!homeAppRow({homeApp: 'com.webos.app.home', homeHook: {running: true, linked: true}}).disabled, true, 'greyed out while the helper is on');
eq(!!p.optionsFor('system', c0, {homeApp: 'tld.my.customlauncher', homeHook: {running: false, linked: false}}).find((o) => o.id === 'replaceHome').disabled, true, 'and the helper row is greyed out while the Home app setting names Hearth');
eq(!!homeAppRow({homeApp: 'tld.my.customlauncher', homeHook: {running: true, linked: true}}).disabled, false, 'a row that is on stays usable so it can be switched off');
eq(p.ROOT_OPTIONS.indexOf('homeApp') !== -1, true, 'the Home app row needs root');
eq(p.optionsFor('clock', c0).map((o) => o.id).filter((id) => !/^weather/.test(id)).join(','), 'widgetOn,clockFormat,showPeriod,showDate,clockSize,clockFont,clockWeight,clockTop,clockLeft,clockAlign,clockColor,clockShadow,clockScrim,clockOpacity,showStats', 'the Widget tab (P41f: Show widget first): Time rows, then Widget look with the font after the size, with the backdrop row, then TV load');
const fonts = [];
const ci = {...c0, clock: {...c0.clock, font: 'inter'}};   // the first font in the list (the default is Outfit since P41f)
let cf = ci;
for (let i = 0; i < 27; i++) { cf = p.applyPref(cf, 'clockFont', 'ok'); fonts.push(cf.clock.font); }
eq(fonts.slice(0, 5), ['tv', 'poppins', 'oswald', 'mono', 'serif'], 'OK steps through the fonts in order');
eq([fonts.length, fonts[26], new Set(fonts).size], [27, 'inter', 27], 'and wraps after twenty-seven fonts');
eq([p.applyPref(ci, 'clockFont', 'left').clock.font, p.applyPref(ci, 'clockFont', 'right').clock.font], ['inter', 'tv'], 'right goes to the next font; left stops at the first');
eq(p.optionsFor('clock', {...c0, clock: {...c0.clock, font: 'mono'}}).filter((o) => o.id === 'clockFont')[0].valueText, 'Roboto Mono (digital)', 'the font option reads its name');
eq(p.resetLook({...c0, clock: {...c0.clock, font: 'serif'}}).clock.font, 'outfit', 'Reset look and clock puts the font back (Outfit)');


// P15 defaults: weather on for Delhi, city shown, high/low hidden; reset restores them
eq([c0.weather.on, c0.weather.city && c0.weather.city.name, c0.weather.showCity, c0.weather.showRange, c0.showLabels, c0.iconOpacity, c0.clock.color, c0.clock.opacity, c0.clock.font, c0.clock.showDate], [false, 'Delhi', true, false, true, 100, 'theme', 100, 'outfit', true], 'P15/P41c defaults: weather off (Delhi when turned on) with city, no high/low, labels, widget Follow theme (P77)');
const mess2 = p.resetLook({...c0, iconOpacity: 40, weather: {...c0.weather, on: false, city: null, showRange: true}});
eq([mess2.weather.on, mess2.weather.city.name, mess2.weather.showRange, mess2.iconOpacity], [false, 'Delhi', false, 100], 'reset also restores the weather (off since P41c) and the icon opacity');
// widget colour, opacity, ranges, reset row
const wall = p.optionsFor('wallpaper', c0).map((o) => o.id).join(',');
eq(wall, 'wallpaper,wallpaperFit,wallpaperOpacity,fadeStrength', 'without a slideshow the Wallpaper tab has no shuffle or timer, and no separate built-in row');
const folderCfg = {...c0, wallpaper: {...c0.wallpaper, mode: 'folder', path: '/media/x/Pics'}};
eq(p.optionsFor('wallpaper', folderCfg).map((o) => o.id).join(','), 'wallpaper,wallpaperFit,interval,shuffle,wallpaperOpacity,fadeStrength', 'a folder slideshow shows the timer and shuffle');
// 2.0.2: picture size Fit/Fill for wallpapers
eq(p.optionsFor('wallpaper', {...c0, background: 'theme'}).map((o) => o.id).includes('wallpaperFit'), false, 'plain background: no picture size row');
const fitRow = (c) => p.optionsFor('wallpaper', c).find((o) => o.id === 'wallpaperFit');
eq([fitRow(c0).valueText, p.applyPref(c0, 'wallpaperFit', 'ok').wallpaper.fit, p.applyPref({...c0, wallpaper: {...c0.wallpaper, fit: 'fit'}}, 'wallpaperFit', 'ok').wallpaper.fit], ['Fill the screen (cropped)', 'fit', 'fill'], 'picture size toggles Fill <-> Fit, Fill is the default');
store[KEY] = JSON.stringify({defaultsV: 1, wallpaper: {mode: 'gradient', path: '', fit: 'fit'}});
eq(s.loadConfig().wallpaper.fit, 'fit', 'a saved Fit is kept');
store[KEY] = JSON.stringify({defaultsV: 1, wallpaper: {mode: 'gradient', path: ''}});
eq(s.loadConfig().wallpaper.fit, 'fill', 'a saved wallpaper from 2.0.1 (no fit) reads as Fill');
eq(p.optionsFor('wallpaper', {...c0, wallpaper: {...c0.wallpaper, mode: 'image', path: '/media/x/a.jpg'}}).map((o) => o.id).includes('shuffle'), false, 'a single picture has no shuffle');
const w0 = p.optionsFor('wallpaper', c0)[0];
eq([w0.valueText, w0.stepper], ['Built-in: Photo: 1', true], 'the first row shows the built-in background (photo 17 = Photo: 1, P113) and has arrows');
eq(p.applyPref(c0, 'wallpaper', 'right').background, 'photo-02', 'the right arrow steps to the next built-in background (the photos come first)');
eq(p.applyPref({...c0, background: 'theme'}, 'wallpaper', 'left').background, 'theme', 'and stops at the first');
const toBuiltIn = p.applyPref({...folderCfg, background: 'ocean'}, 'wallpaper', 'right');
eq([toBuiltIn.wallpaper.mode, toBuiltIn.wallpaper.path, toBuiltIn.background, toBuiltIn.wallpaper.intervalSec === folderCfg.wallpaper.intervalSec], ['gradient', '', 'ocean', true], 'an arrow on a picture or slideshow goes back to the built-in background, keeping the timer');
eq(p.optionsFor('wallpaper', folderCfg)[0].valueText, 'Slideshow: Pics', 'the first row names the slideshow folder');
eq(p.optionsFor('look', c0).map((o) => o.id).pop(), 'resetLook', 'Reset look and clock is the last row of the Look tab');
eq(p.applyPref({...c0}, 'clockOpacity', 'right').clock.opacity, 100, 'opacity stops at 100% on the right and the default is solid');
eq(p.applyPref({...c0, clock: {...c0.clock, opacity: 20}}, 'clockOpacity', 'left').clock.opacity, 10, 'opacity goes down to 10%');
eq(p.applyPref({...c0, clock: {...c0.clock, opacity: 10}}, 'clockOpacity', 'left').clock.opacity, 10, 'and no lower');
eq(p.applyPref({...c0, sideMargin: 290}, 'sideMargin', 'right').sideMargin, 300, 'side margin goes up to 300 px');
const colour = p.applyPref(c0, 'clockColor', 'ok').clock.color;
eq(colour, 'white', 'OK steps from Follow theme (the fresh default) to White');
eq(c0.clock.color, 'theme', 'P77: the fresh widget colour is Follow theme');
eq(p.optionsFor('clock', c0).find((o) => o.id === 'clockColor').valueText, 'Follow theme', 'and it shows that name');
for (const [saved, want] of [['ember', 'amber'], ['ocean', 'blue'], ['dusk', 'warm'], ['white', 'white'], ['theme', 'theme'], ['nonsense', 'white']]) { store[KEY] = JSON.stringify({defaultsV: 1, clock: {color: saved}}); eq(s.loadConfig().clock.color, want, `P77: saved widget colour ${saved} reads as ${want}`); }
eq(p.optionsFor('look', c0).some((o) => o.id === 'iconColor'), false, 'P77: Icon colour is hidden for Original icons');
for (const st of ['mono', 'soft', 'gradient']) eq(p.optionsFor('look', {...c0, iconStyle: st}).some((o) => o.id === 'iconColor'), true, `P77: Icon colour shows for ${st} mono`);
eq(p.optionsFor('look', {...c0, iconStyle: 'tinted'}).some((o) => o.id === 'iconColor'), false, 'P77: Icon colour is hidden for Tinted tile');
eq(p.applyPref({...c0, iconStyle: 'mono'}, 'iconColor', 'ok').iconColor, 'white', 'P77: Icon colour steps from Follow theme to White');
{ const ids = (cc) => { const o = []; let x = cc; for (let k = 0; k < 9; k++) { o.push(x.iconColor); x = p.applyPref(x, 'iconColor', 'ok'); } return o; };
const dark = ids({...c0, iconStyle: 'mono', iconLight: false}), light = ids({...c0, iconStyle: 'mono', iconLight: true});
eq([dark.indexOf('charcoal') === -1, dark.indexOf('black') === -1, dark.indexOf('grey') !== -1], [true, true, true], 'P77: the Dark tile does not offer Dark grey or Black');
eq([light.indexOf('charcoal') !== -1, light.indexOf('black') !== -1], [true, true], 'P77: the Light tile offers all colours');
eq(p.optionsFor('look', {...c0, iconStyle: 'mono', iconColor: 'black', iconLight: false}).find((o) => o.id === 'iconColor').valueText, 'Follow theme', 'P77: a saved dark colour on the Dark tile reads as Follow theme'); }
store[KEY] = JSON.stringify({defaultsV: 1, iconColor: 'amber'}); eq(s.loadConfig().iconColor, 'amber', 'P77: a saved icon colour is read back');
store[KEY] = JSON.stringify({defaultsV: 1, iconColor: 'ember'}); eq(s.loadConfig().iconColor, 'theme', 'P77: an unknown icon colour reads as Follow theme');
delete store[KEY];
eq(p.resetLook({...c0, clock: {...c0.clock, color: 'black', opacity: 30}}).clock.opacity, 100, 'reset puts the opacity back');
eq(p.resetLook({...c0, clock: {...c0.clock, color: 'black', opacity: 30}}).clock.color, 'theme', 'and the colour (Follow theme)');
// "When the TV turns on, open..." (P55b, PR #25 by Obednal97; row in System -> TV start)
{
	const po = (info, c = c0) => p.optionsFor('system', c, {homeHook: null, ...info}).find((o) => o.id === 'powerOnApp').valueText;
	const st = (chosen, loaded, extra = {}) => ({supported: true, chosen, network: false, loaded, loadedNetwork: false, foreign: false, networkKeys: false, ...extra});
	eq(po({}), 'TV default', 'power-on row: TV default until the TV has been asked');
	eq(po({powerOn: st('youtube.leanback.v4', 'youtube.leanback.v4'), powerOnNames: {chosen: 'YouTube'}}), 'YouTube', 'an app chosen and loaded: its name');
	eq(po({powerOn: st('youtube.leanback.v4', ''), powerOnNames: {chosen: 'YouTube'}}), 'YouTube (after a restart)', 'chosen but not loaded yet: after a restart');
	eq(po({powerOn: st('', '', {supported: false})}), 'Not on this TV', 'a TV whose software lacks it');
	eq(po({powerOn: st('', '', {foreign: true})}), 'Set by another tool', 'someone else\'s start-up file is said so');
	eq(p.ROOT_OPTIONS.indexOf('powerOnApp') !== -1, true, 'the power-on row needs root');
}

// P83: while root has failed, System keeps only the SSAP row and the Debug switch, with no group header
{
  const both = new URL('../node_modules/.cache-settings-p83.mjs', import.meta.url).pathname;
  await build({stdin: {contents: "export * from './src/lib/prefs'; export {noteExec, resetRootState} from './src/lib/failure';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts'},
    bundle: true, format: 'esm', outfile: both, platform: 'node', logLevel: 'error',
    plugins: [{name: 'stub-apps', setup(b) {
      b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
      b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
    }}]});
  const q = await import(both);
  const ids = (info) => q.optionsFor('system', c0, info, '').map((o) => o.id).join(',');
  q.resetRootState();
  eq(ids().includes('keepReady') || ids().includes('group:system:Memory'), true, 'P83: root unknown: the root groups show');
  q.noteExec(new Error('Service does not exist'));
  eq(ids(), 'updates,language,tvApps,noRootGuide,showDebug', 'P83/T0/P92: root failed: the update check, language, the SSAP row, the no-root guide and the Debug switch, no group headers');
  q.noteExec();
  eq(ids().includes('group:system:Memory'), true, 'P83: root works again: the groups return');
  q.resetRootState();
}

// P106: the look from before the one-time reset is kept, restored once (own wallpaper too), then deleted
{
  const BK = 'hearth-prefs-backup-v1';
  delete store[BK];
  store[KEY] = JSON.stringify({appIds: ['a.b'], clock: {font: 'inter', size: 100}, wallpaper: {mode: 'image', path: '/media/developer/wallpapers/mine.jpg'}, theme: 'forest', iconScale: 120, favourites: ['app:x']});
  const fresh = s.loadConfig();      // saved without defaultsV: the reset runs
  eq([fresh.theme, fresh.wallpaper.path === '', fresh.appIds, fresh.favourites], ['black', true, ['a.b'], ['app:x']], 'P106: the reset still happens, apps and favourites stay');
  eq([BK in store, s.hasPrefsBackup()], [true, true], 'P106: a backup was written before the reset');
  const back = s.withBackedUpLook({...fresh, favourites: ['app:y']});
  eq([back.theme, back.iconScale, back.clock.size, back.wallpaper.path, back.favourites], ['forest', 120, 100, '/media/developer/wallpapers/mine.jpg', ['app:y']], 'P106: restore brings the old look and own wallpaper back, keeps current favourites');
  s.dropPrefsBackup();
  eq([BK in store, s.hasPrefsBackup(), s.withBackedUpLook(fresh)], [false, false, null], 'P106: using it deletes the backup');
  delete store[KEY];
  s.loadConfig();
  eq(BK in store, false, 'P106: a fresh install has no backup');
}
process.exit(fail ? 1 : 0);

// ---- P35b: groups ----
const grouped = p.optionsFor('look', c0, undefined, p.FIRST_GROUP);
eq(grouped.filter((o) => o.header).map((o) => o.label).join(','), 'Theme,Icons,Home row,Names,Quiet mode,Recent apps', 'P35b/P79: Look has six group headers (Theme first)');
eq(grouped.filter((o) => o.header && o.open).map((o) => o.label).join(','), 'Theme', 'FIRST_GROUP still opens the first group (the app starts with every group closed, P35i)');
eq(p.optionsFor('look', c0, undefined, 'Labels').filter((o) => o.grouped).map((o) => o.id).join(','), 'showLabels,labelColor,labelFont,labelSize,labelWeight', 'opening a group shows only its rows');
eq(p.optionsFor('look', c0, undefined, '').filter((o) => o.grouped).length, 0, 'all groups can be closed');

// ---- P35c: merged rows (saved values unchanged) ----
const sh = (strength, on = true) => ({...c0, clock: {...c0.clock, shadow: on, shadowStrength: strength}});
eq([sh(50, false), sh(30), sh(50), sh(90)].map((c) => p.optionsFor('clock', c).find((o) => o.id === 'clockShadow').valueText), ['Off', 'Light', 'Medium', 'Strong'], 'Widget shadow reads the saved on/off and strength');
eq([p.applyPref(sh(50, false), 'clockShadow', 'ok').clock.shadow, p.applyPref(sh(50, false), 'clockShadow', 'ok').clock.shadowStrength], [true, 30], 'Widget shadow Off -> Light');
eq(p.optionsFor('clock', sh(100)).find((o) => o.id === 'clockShadow').valueText, 'Max', 'Widget shadow 100 reads as Max');
eq(p.applyPref(sh(80), 'clockShadow', 'ok').clock.shadowStrength, 100, 'Widget shadow Strong -> Max');
// 2.0.3 (R1): widget backdrop gradient, Off or 10-60 % in steps of 5; saved values without it read Off
const sc = (v) => ({...c0, clock: {...c0.clock, scrim: v}});
eq([0, 5, 50, 100].map((v) => p.optionsFor('clock', sc(v)).find((o) => o.id === 'clockScrim').valueText), ['Off', '5%', '50%', '100%'], 'Widget backdrop text');
eq([0, 5, 95, 100].map((v) => p.applyPref(sc(v), 'clockScrim', 'ok').clock.scrim), [5, 10, 100, 0], 'Widget backdrop steps 0 -> 5 -> 10 ... 100 -> 0 (OK wraps)');
eq(p.optionsFor('wallpaper', c0).find((o) => o.id === 'fadeStrength').valueText, 'Medium', 'the default bottom fade (30% over 50%) is Medium');
eq([p.applyPref(c0, 'fadeStrength', 'ok').fadeStrength, p.applyPref(c0, 'fadeStrength', 'ok').fadeHeight], [55, 70], 'Bottom fade Medium -> Strong');
eq(p.optionsFor('look', c0).find((o) => o.id === 'recentsSize').valueText, 'Medium', 'the default Recent apps panel (60 x 30) is Medium');
eq([p.applyPref(c0, 'recentsSize', 'ok').recentsW, p.applyPref(c0, 'recentsSize', 'ok').recentsH], [80, 45], 'Panel size Medium -> Large');
const sv = {...c0, screensaver: true};
eq(p.optionsFor('saver', sv).find((o) => o.id === 'screensaverDim').valueText, 'Bright (as is)', 'screen saver: Bright by default');
eq([p.applyPref(sv, 'screensaverDim', 'ok').screensaverDim, p.applyPref(sv, 'screensaverDim', 'ok').screensaverDimLevel], [true, 10], 'Bright -> Dim 10% (2.0.2: steps of 10)');
eq(p.optionsFor('saver', {...sv, screensaverDim: true, screensaverDimLevel: 60}).find((o) => o.id === 'screensaverDim').valueText, 'Dim 60%', 'a saved dim of 60% (2.0.1 step) still reads Dim 60%');
eq(p.optionsFor('saver', {...sv, screensaverDim: true, screensaverDimLevel: 40}).find((o) => o.id === 'screensaverDim').valueText, 'Dim 40%', 'a saved dim of 40% reads as Dim 40%');

// ---- widget alignment and favourites margins (P35e) ----
eq([s.DEFAULT_CONFIG.clock.align, p.applyPref(c0, 'clockAlign', 'ok').clock.align, p.applyPref(c0, 'clockAlign', 'left').clock.align], ['center', 'right', 'left'], 'Widget alignment: centre by default, OK or right goes to Right, left arrow to Left');
eq(p.optionsFor('look', c0).some((o) => /^fav/.test(o.id)), false, 'P35e: no favourites margin rows without favourites');
const fv = {...c0, favourites: ['a']};
eq(p.optionsFor('look', fv).filter((o) => /^fav/.test(o.id)).map((o) => o.id).join(','), 'favSideMargin,favBottomMargin', 'with favourites the two margin rows show');
eq(p.optionsFor('look', fv, undefined, 'Favourites').filter((o) => o.header).map((o) => o.label).includes('Favourites'), true, 'and they form the Favourites group');
eq([s.DEFAULT_CONFIG.favSideMargin, s.DEFAULT_CONFIG.favBottomMargin, p.applyPref({...fv, favBottomMargin: 390}, 'favBottomMargin', 'right').favBottomMargin], [20, 10, 400], 'favourites margins default to the home row\'s and the bottom margin reaches 400 px');
eq([p.optionsFor('look', c0).filter((o) => o.id === 'rows')[0].disabled, !!p.optionsFor('look', fv).filter((o) => o.id === 'rows')[0].disabled], [undefined, true], 'P33b: Rows of apps is greyed out only while favourites are set');

// P46c: Welcome font row, bundled font set
store[KEY] = JSON.stringify({clock: {font: 'papyrus'}, labelFont: 'nope'});
eq([s.loadConfig().clock.font, s.loadConfig().labelFont], ['inter', 'default'], 'unknown saved fonts fall back');
