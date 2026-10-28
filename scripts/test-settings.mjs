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
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }};

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
eq([d.theme, d.iconScale, d.sideMargin, d.bottomMargin, d.clockFormat, d.clock.size, d.clock.weight, d.clock.top, d.clock.left], ['black', 90, 20, 10, 'tv', 140, 200, 28, 50], 'defaults: OLED black, same-as-TV clock, icons 90%, margins 20 and 10');
store[KEY] = JSON.stringify({theme: 'grey', iconScale: 999, sideMargin: 33, bottomMargin: -5, clock: {size: 12, top: 29, weight: 999, color: 'neon', showDate: false}, wallpaper: {mode: 'folder', path: '/x', intervalSec: 2}});
const g = s.loadConfig();
eq([g.theme, g.iconScale, g.sideMargin, g.bottomMargin], ['grey', 140, 30, 0], 'out-of-range numbers are clamped and snapped');
eq([g.clock.size, g.clock.top, g.clock.weight, g.clock.color, g.clock.showDate, g.clock.showPeriod], [80, 30, 200, 'white', false, true], 'clock values validated, missing ones default');
eq([g.wallpaper.mode, g.wallpaper.intervalSec], ['folder', 60], 'bad interval falls back');
store[KEY] = '{not json';
eq(s.loadConfig().theme, 'black', 'corrupt storage falls back to defaults');
store[KEY] = JSON.stringify({wallpaper: {mode: 'folder', path: ''}});
eq(s.loadConfig().wallpaper.mode, 'gradient', 'folder mode without a path becomes default background');

store[KEY] = JSON.stringify({tileOrder: ['com.webos.app.hdmi1', 'x', 7]});
eq(s.loadConfig().tileOrder, ['com.webos.app.hdmi1', 'x'], 'a saved tile order is loaded (bad entries dropped)');
store[KEY] = JSON.stringify({tileOrder: 'nope'});
eq(s.loadConfig().tileOrder, null, 'a bad tile order becomes none');

// ---- apps: shown unless hidden ----
store[KEY] = JSON.stringify({appIds: ['a', 'b']});
eq(s.loadConfig().hiddenIds, null, 'settings from an older version (a list of apps to show) are flagged to be converted');
store[KEY] = JSON.stringify({});
eq(s.loadConfig().hiddenIds, [], 'new settings: nothing hidden');
store[KEY] = JSON.stringify({appIds: null});
eq(s.loadConfig().hiddenIds, [], 'older settings that showed every app: nothing hidden');
store[KEY] = JSON.stringify({appIds: ['a'], hiddenIds: ['x']});
eq(s.loadConfig().hiddenIds, ['x'], 'a saved hide-list is kept');
store[KEY] = JSON.stringify({rows: 3, showLabels: false});
eq([s.loadConfig().rows, s.loadConfig().showLabels], [1, false], 'rows are 1 or 2 only; the app-names switch is read');
store[KEY] = JSON.stringify({rows: 2});
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
eq(p.applyPref(c0, 'clockTop', 'right').clock.top, 30, 'clock height steps by 2%');
eq(p.applyPref(c0, 'clockLeft', 'left').clock.left, 48, 'clock sideways: left arrow moves it left by 2%');
eq(p.applyPref({...c0, clock: {...c0.clock, left: 100}}, 'clockLeft', 'right').clock.left, 100, 'clock sideways stops at the right limit');
eq(p.applyPref({...c0, clock: {...c0.clock, left: 0}}, 'clockLeft', 'left').clock.left, 0, 'clock sideways stops at the left limit');
eq(p.applyPref(c0, 'clockWeight', 'ok').clock.weight, 300, 'thickness: thin -> light');
eq(p.applyPref(c0, 'wallpaper', 'ok') === c0, true, 'OK on the wallpaper row changes no value (the app opens the picker)');
eq(p.applyPref(c0, 'nonsense', 'ok') === c0, true, 'unknown option does nothing');
eq(s.loadConfig().clock.left, 50, 'missing clock position defaults to the centre');
const messy = {...c0, theme: 'grey', iconScale: 70, sideMargin: 0, bottomMargin: 200, clockFormat: '24h', clock: {...c0.clock, size: 220, color: 'amber'}, appIds: ['a'], wallpaper: {...c0.wallpaper, mode: 'image', path: '/p.jpg'}};
const r = p.resetLook(messy);
eq([r.theme, r.iconScale, r.sideMargin, r.bottomMargin, r.clockFormat, r.clock.size, r.clock.color], ['black', 90, 20, 10, 'tv', 140, 'white'], 'reset restores the look and clock');
eq([r.appIds, r.wallpaper.mode], [['a'], 'image'], 'reset keeps apps and wallpaper');

// ---- the lists shown in Settings ----
for (const tab of ['look', 'clock', 'wallpaper', 'options']) {
  const list = p.optionsFor(tab, c0);
  eq(list.length >= 1 && list.length <= 20, true, `${tab} tab has ${list.length} options (a long list scrolls)`);
}
const look = p.optionsFor('look', c0);
eq(look.map((o) => o.valueText), ['OLED black', 'Off', undefined, '90%', '100%', 'Rounded square', '1 row', undefined, "The theme's own", undefined, undefined, '20 px', '10 px', '60%', '30%', undefined, 'Reset'], 'Look tab shows current values (the app-names switch has no text, it is a switch)');
eq(p.applyPref(c0, 'rows', 'ok').rows, 2, 'Rows of apps: 1 -> 2');
eq(p.applyPref(p.applyPref(c0, 'rows', 'ok'), 'rows', 'ok').rows, 1, 'and 2 -> 1');
eq(p.applyPref(c0, 'showLabels', 'ok').showLabels, false, 'Show app names switches off');
eq([s.DEFAULT_CONFIG.minimal, p.applyPref(c0, 'minimal', 'ok').minimal, p.resetLook({...c0, minimal: true}).minimal], [false, true, false], 'Minimalist icons: off by default, switch on, cleared by reset');
store[KEY] = JSON.stringify({minimal: true}); eq(s.loadConfig().minimal, true, 'the minimalist choice is read back');
store[KEY] = JSON.stringify({appEdits: {'a.b': {label: 'X'}, 'c.d': {icon: 'nope'}}}); eq(s.loadConfig().appEdits, {'a.b': {label: 'X'}}, 'app edits are read back and cleaned');
eq(p.optionsFor('options', c0).map((o) => o.id).join(','), 'tvInput,takeover,replaceHome,powerOnApp,lgLogo,tvApps,showDebug', 'the Options tab: TV input, the SAM method, the helper script, the power-on app, the LG logo, the TV app list (hidden when rooted) and last the Debug tab switch');
// "When the TV turns on, open…"
const po = (info, c = c0) => p.optionsFor('options', c, {homeHook: null, ...info}).find((o) => o.id === 'powerOnApp').valueText;
const st = (chosen, loaded, extra = {}) => ({supported: true, chosen, network: false, loaded, loadedNetwork: false, foreign: false, ...extra});
eq(po({}), 'Unknown', 'power-on row: Unknown until the TV has been asked');
eq(po({}, {...c0, powerOnApp: 'youtube.leanback.v4'}), 'youtube.leanback.v4', 'and the saved choice until then');
eq(po({powerOn: st('', '')}), 'TV default', 'nothing chosen: the TV default');
eq(po({powerOn: st('youtube.leanback.v4', 'youtube.leanback.v4'), powerOnNames: {chosen: 'YouTube'}}), 'YouTube', 'an app chosen and loaded: its name');
eq(po({powerOn: st('youtube.leanback.v4', ''), powerOnNames: {chosen: 'YouTube'}}), 'YouTube (after a restart)', 'chosen but not loaded yet: after a restart');
eq(po({powerOn: st('', 'youtube.leanback.v4')}), 'TV default (after a restart)', 'switched off but still loaded: after a restart');
eq(po({powerOn: st('youtube.leanback.v4', 'youtube.leanback.v4', {network: true, loadedNetwork: true}), powerOnNames: {chosen: 'YouTube'}}), 'YouTube + network', 'network wake-ups too: said so');
eq(po({powerOn: st('', '', {supported: false})}), 'Not on this TV', 'a TV whose software lacks it: Not on this TV');
eq(po({powerOn: st('', '', {foreign: true})}), 'Set by another tool', 'someone else\'s start-up file: said so');
const poDis = (info) => p.optionsFor('options', c0, info).find((o) => o.id === 'powerOnApp').disabled;
eq(!!poDis({homeHook: null, powerOn: st('', '', {supported: false})}), true, 'and greyed out where the TV lacks it');
eq(!!poDis({homeHook: null, powerOn: st('', '')}), false, 'usable where it has it');
eq(p.ROOT_OPTIONS.indexOf('powerOnApp') !== -1, true, 'the power-on row needs root');
eq(p.optionsFor('options', c0, {homeApp: null, homeHook: null, tvInput: true}).find((o) => o.id === 'tvInput').valueText, 'Added', 'the TV-input row says Added when the launcher is in the input list');
eq(p.optionsFor('options', c0, {homeApp: null, homeHook: null, tvInput: false}).find((o) => o.id === 'tvInput').valueText, 'Not added', 'and Not added when it is not');
eq(p.optionsFor('options', c0).find((o) => o.id === 'tvInput').valueText, 'Unknown', 'and Unknown until the TV has been asked');
eq(c0.tileOrder, null, 'a new config has no saved tile order');
eq(p.optionsFor('options', c0).find((o) => o.id === 'replaceHome').label, 'Replace LG Home with a helper script', 'the helper has its new name');
eq(p.optionsFor('options', c0).find((o) => o.id === 'takeover').label, 'Replace LG Home with a script and SAM', 'the SAM method has its new name');
const row = (id) => p.optionsFor('options', c0).find((o) => o.id === id);
eq(/at boot/.test(row('replaceHome').description) && /flash/.test(row('replaceHome').description) && /Input Hook/.test(row('replaceHome').description), true, 'the helper says it starts at boot, warns of the flash and points to the Input Hook app');
eq(/test|experimental/i.test(row('takeover').label + row('takeover').description), false, 'the SAM method is no longer labelled a test or experimental');
eq(row('takeover').description.length < 330, true, 'and its description is short');
const dis = (cfg, info, id) => p.optionsFor('options', cfg, info).find((o) => o.id === id).disabled;
eq([dis(c0, undefined, 'takeover'), dis(c0, undefined, 'replaceHome')].map(Boolean).join(), 'false,false', 'with neither on, nothing is greyed out');
eq(dis({...c0, replaceHome: true}, undefined, 'takeover') ? 'greyed' : 'open', 'greyed', 'the helper on (setting): the SAM method is greyed out');
eq(dis(c0, {homeApp: null, homeHook: {running: true, linked: false}}, 'takeover') ? 'greyed' : 'open', 'greyed', 'the helper running on the TV: the SAM method is greyed out');
eq(dis(c0, {homeApp: null, homeHook: {running: false, linked: true}}, 'takeover') ? 'greyed' : 'open', 'greyed', 'only the helper\'s boot link left: the SAM method is greyed out too');
const tk = {...c0, takeoverHome: true};
eq(dis(tk, undefined, 'replaceHome') ? 'greyed' : 'open', 'greyed', 'the SAM method on: the helper is greyed out');
eq(dis(tk, undefined, 'takeover') ? 'greyed' : 'open', 'open', 'the SAM method on: its own row stays usable (to switch it off)');
eq(dis(c0, {homeApp: null, homeHook: null, takeover: {enabled: true, mounted: true, web: true, linked: true}}, 'replaceHome') ? 'greyed' : 'open', 'greyed', 'the SAM method on according to the TV: the helper is greyed out');
eq(['On', 'On (not in place yet)', 'Off'].join(), [{enabled: true, mounted: true, web: true, linked: true}, {enabled: true, mounted: false, web: false, linked: false}, {enabled: false, mounted: false, web: false, linked: false}].map((s) => p.optionsFor('options', c0, {homeApp: null, homeHook: null, takeover: s}).find((o) => o.id === 'takeover').valueText).join(), 'the SAM row shows On / On (not in place yet) / Off');
eq(p.optionsFor('clock', c0).filter((o) => /Clock position/.test(o.label)).map((o) => o.label).join(' | '), 'Clock position (vertical) | Clock position (horizontal)', 'the clock position settings are named vertical and horizontal');
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
eq(d.clock.font, 'inter', 'default clock font is Inter');
store[KEY] = JSON.stringify({clock: {font: 'oswald'}});
eq(s.loadConfig().clock.font, 'oswald', 'a saved clock font is loaded');
store[KEY] = JSON.stringify({clock: {font: 'comic-sans'}});
eq(s.loadConfig().clock.font, 'inter', 'an unknown clock font falls back to Inter');
store[KEY] = JSON.stringify({clock: {size: 100}});
eq(s.loadConfig().clock.font, 'inter', 'settings from an older version (no font) get Inter');
eq(p.optionsFor('clock', c0).map((o) => o.id).join(','), 'clockFormat,clockSize,clockFont,clockWeight,clockTop,clockLeft,showDate,showPeriod', 'the Clock tab has the font option after the size');
const fonts = [];
let cf = c0;
for (let i = 0; i < 16; i++) { cf = p.applyPref(cf, 'clockFont', 'ok'); fonts.push(cf.clock.font); }
eq(fonts.slice(0, 5), ['tv', 'poppins', 'oswald', 'mono', 'serif'], 'OK steps through the fonts in order');
eq([fonts.length, fonts[15], new Set(fonts).size], [16, 'inter', 16], 'and wraps after sixteen fonts');
eq([p.applyPref(c0, 'clockFont', 'left').clock.font, p.applyPref(c0, 'clockFont', 'right').clock.font], ['inter', 'tv'], 'right goes to the next font; left stops at the first');
eq(p.optionsFor('clock', {...c0, clock: {...c0.clock, font: 'mono'}}).filter((o) => o.id === 'clockFont')[0].valueText, 'Roboto Mono (digital)', 'the font option reads its name');
eq(p.resetLook({...c0, clock: {...c0.clock, font: 'serif'}}).clock.font, 'inter', 'Reset look and clock puts the font back');


// P15 defaults: weather on for Delhi, city shown, high/low hidden; reset restores them
eq([c0.weather.on, c0.weather.city && c0.weather.city.name, c0.weather.showCity, c0.weather.showRange, c0.showLabels, c0.iconOpacity, c0.clock.color, c0.clock.opacity, c0.clock.font, c0.clock.showDate], [true, 'Delhi', true, false, true, 100, 'white', 100, 'inter', true], 'P15 defaults: Delhi weather with city, no high/low, labels, white widget');
const mess2 = p.resetLook({...c0, iconOpacity: 40, weather: {...c0.weather, on: false, city: null, showRange: true}});
eq([mess2.weather.on, mess2.weather.city.name, mess2.weather.showRange, mess2.iconOpacity], [true, 'Delhi', false, 100], 'reset also restores the weather and the icon opacity');
// widget colour, opacity, ranges, reset row
const wall = p.optionsFor('wallpaper', c0).map((o) => o.id).join(',');
eq(wall, 'wallpaper,clockColor,clockShadow,clockShadowStrength,clockOpacity,wallpaperOpacity,fadeStrength,fadeHeight,iconOpacity', 'without a slideshow the Wallpaper tab has no shuffle or timer, and no separate built-in row');
const folderCfg = {...c0, wallpaper: {...c0.wallpaper, mode: 'folder', path: '/media/x/Pics'}};
eq(p.optionsFor('wallpaper', folderCfg).map((o) => o.id).join(','), 'wallpaper,interval,shuffle,clockColor,clockShadow,clockShadowStrength,clockOpacity,wallpaperOpacity,fadeStrength,fadeHeight,iconOpacity', 'a folder slideshow shows the timer and shuffle');
eq(p.optionsFor('wallpaper', {...c0, wallpaper: {...c0.wallpaper, mode: 'image', path: '/media/x/a.jpg'}}).map((o) => o.id).includes('shuffle'), false, 'a single picture has no shuffle');
const w0 = p.optionsFor('wallpaper', c0)[0];
eq([w0.valueText, w0.stepper], ['Built-in: ' + 'The theme\'s own', true], 'the first row shows the built-in background and has arrows');
eq(p.applyPref(c0, 'wallpaper', 'right').background, 'nature-show', 'the right arrow steps to the next built-in background (the nature photos come first)');
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
eq(colour, 'warm', 'OK steps to the next colour');
eq(p.optionsFor('wallpaper', {...c0, clock: {...c0.clock, color: 'ocean'}}).find((o) => o.id === 'clockColor').valueText.indexOf('Gradient') === 0, true, 'a gradient shows its name');
eq(p.resetLook({...c0, clock: {...c0.clock, color: 'black', opacity: 30}}).clock.opacity, 100, 'reset puts the opacity back');
eq(p.resetLook({...c0, clock: {...c0.clock, color: 'black', opacity: 30}}).clock.color, 'white', 'and the colour');
process.exit(fail ? 1 : 0);
