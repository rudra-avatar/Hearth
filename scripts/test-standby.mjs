// Tests for the standby fade (src/lib/standby.ts) and its Settings row (src/lib/prefs.ts, src/lib/storage.ts).   Run: npm test
import {build} from 'esbuild';

const out = new URL('../node_modules/.cache-standby-test.mjs', import.meta.url).pathname;
await build({
  stdin: {contents: "export * as sb from './lib/standby.ts'; export * as p from './lib/prefs.ts'; export * as s from './lib/storage.ts';", resolveDir: new URL('../src/', import.meta.url).pathname, loader: 'ts'},
  bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub-apps', setup(b) {
    b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
  }}]
});
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
const {sb, p, s} = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// a fake clock: timers run when `advance` passes them
function harness (minutes = 2) {
  let t = 0; let id = 0; const timers = new Map(); const states = [];
  const ctl = sb.createStandby({
    onState: (st) => states.push(st),
    setTimer: (fn, ms) => { timers.set(++id, {fn, at: t + ms}); return id; },
    clearTimer: (i) => { timers.delete(i); },
    now: () => t
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      let next = null;
      for (const [i, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [i, x];
      if (!next) break;
      timers.delete(next[0]); t = next[1].at; next[1].fn();
    }
    t = end;
  };
  ctl.setMinutes(minutes);
  ctl.setPaused(false);
  const key = (keyCode, repeat = false) => ctl.input({type: 'keydown', keyCode, repeat});
  const up = (keyCode) => ctl.input({type: 'keyup', keyCode});
  const ptr = (type, x, y) => ctl.input({type, x, y});
  return {ctl, advance, states, key, up, ptr, pending: () => timers.size};
}
const MIN = 60000;
const OK = 13, LEFT = 37, RIGHT = 39, BACK = 461, RED = 403;

// ---- the idle timer ----
let h = harness(2);
h.advance(2 * MIN - 1);
eq(h.ctl.state(), 'awake', 'timer: nothing happens before the set time');
h.advance(1);
eq([h.ctl.state(), h.states], ['faded', ['faded']], 'timer: fades after 2 minutes without input');
h = harness(2);
h.advance(90000); eq(h.key(RIGHT), false, 'timer: a key while awake is not used up');
h.advance(90000); eq(h.ctl.state(), 'awake', 'timer: a key starts the wait again (3 min in, 1.5 min since the key)');
h.advance(30000); eq(h.ctl.state(), 'faded', 'timer: fades 2 minutes after the last key');
h = harness(1);
h.advance(50000); h.ptr('mousemove', 10, 10);
h.advance(50000); eq(h.ctl.state(), 'awake', 'timer: a real pointer move also starts the wait again');
h.ptr('mousemove', 10, 10); h.advance(10000);
eq(h.ctl.state(), 'faded', 'timer: a synthetic move (same position) does not keep it awake');
for (const m of [5, 10]) { h = harness(m); h.advance(m * MIN - 1000); const before = h.ctl.state(); h.advance(1000); eq([before, h.ctl.state()], ['awake', 'faded'], `timer: ${m} minutes`); }

// ---- Off ----
h = harness(0);
h.advance(60 * MIN);
eq([h.ctl.state(), h.states, h.pending()], ['awake', [], 0], 'off: never fades and holds no timer');
eq([h.key(OK), h.ptr('mousedown', 1, 1)], [false, false], 'off: no input is used up');
h = harness(2); h.advance(2 * MIN);
h.ctl.setMinutes(0);
eq([h.ctl.state(), h.pending(), h.key(OK)], ['awake', 0, false], 'off while faded: everything shows at once and keys work normally');
h.ctl.setMinutes(5); h.advance(5 * MIN);
eq(h.ctl.state(), 'faded', 'switched on again: counts from the change');

// ---- pause and resume ----
h = harness(2);
h.advance(100000);
h.ctl.setPaused(true);                 // e.g. Settings opened, another app in front, Hearth hidden, move mode
h.advance(30 * MIN);
eq([h.ctl.state(), h.pending()], ['awake', 0], 'paused: no fade and no timer while another screen or app is in front');
eq(h.key(OK), false, 'paused: keys are not used up (the screen in front gets them)');
h.ctl.setPaused(false);
h.advance(2 * MIN - 1); eq(h.ctl.state(), 'awake', 'resumed: the full wait starts again (time before the pause does not count)');
h.advance(1); eq(h.ctl.state(), 'faded', 'resumed: fades 2 minutes after the return');
h.ctl.setPaused(true);
eq(h.ctl.state(), 'awake', 'pausing while faded shows everything again');
h.ctl.setPaused(false); h.advance(2 * MIN);
h.ctl.reset();
eq(h.ctl.state(), 'awake', 'Home pressed (wake) while faded shows everything again');
h.advance(2 * MIN - 1); eq(h.ctl.state(), 'awake', 'Home pressed: the wait starts again');

// ---- the first key is used up ----
for (const [name, code] of [['OK', OK], ['Right', RIGHT], ['Back', BACK], ['a colour button', RED]]) {
  h = harness(2); h.advance(2 * MIN);
  eq([h.key(code), h.ctl.state()], [true, 'waking'], `wake: ${name} wakes it and is used up`);
  eq(h.key(code, true), true, `wake: ${name} held: its repeats are used up too`);
  eq(h.up(code), true, `wake: ${name}: its key-up is used up (OK acts on key-up)`);
  eq(h.key(code), false, `wake: the next ${name} press works normally`);
}
h = harness(2); h.advance(2 * MIN);
h.key(OK);
h.advance(sb.STANDBY_WAKE_MS + 50);
eq(h.ctl.state(), 'awake', 'wake: the fade back takes about 0.25 s');
eq(h.states, ['faded', 'waking', 'awake'], 'wake: states faded, waking, awake');
h = harness(2); h.advance(2 * MIN);
h.key(OK);
eq([h.up(LEFT), h.key(LEFT)], [false, false], 'wake: another key after the waking one acts normally');
eq(h.up(OK), false, 'wake: the waking key\'s late key-up is no longer used up after another key');
h = harness(2); h.advance(2 * MIN);
h.key(OK); h.advance(1000);
h.advance(2 * MIN - 1000);
eq(h.ctl.state(), 'faded', 'wake: the waking key starts the 2 minute wait again');
h = harness(2); h.advance(2 * MIN + 1000);           // a key during the 4 s fade-out also only wakes
eq(h.key(RIGHT), true, 'wake: a key while it is still fading out is used up too');

// ---- the pointer ----
h = harness(2);
h.ptr('mousemove', 100, 100); h.advance(2 * MIN);
eq([h.ptr('mousemove', 100, 100), h.ctl.state()], [false, 'faded'], 'pointer: a synthetic move at the same place does not wake');
eq([h.ptr('mouseover'), h.ptr('mouseenter')], [false, false], 'pointer: hover events alone neither wake nor are used up while faded');
eq([h.ptr('mousemove', 120, 100), h.ctl.state()], [true, 'waking'], 'pointer: a real move wakes and is used up');
eq([h.ptr('mouseover'), h.ptr('mouseenter'), h.ptr('mousemove', 140, 100)], [true, true, true], 'pointer: the waking movement hovers nothing');
h.advance(300);
eq([h.ptr('mousemove', 160, 110), h.ptr('mouseenter'), h.ptr('click')], [true, true, true], 'pointer: while it keeps moving it neither hovers nor clicks');
h.advance(sb.POINTER_SETTLE_MS);
eq([h.ptr('mouseenter'), h.ptr('mousemove', 170, 110), h.ptr('click')], [false, false, false], 'pointer: after it rests, it works normally');
h = harness(2); h.advance(2 * MIN);
h.ptr('mousemove', 1, 1);
for (let i = 2; i < 20; i++) { h.advance(100); h.ptr('mousemove', i, i); }
eq(h.ptr('mouseenter'), false, `pointer: a pointer kept moving works again after ${sb.POINTER_GUARD_MAX_MS} ms`);
h = harness(2); h.advance(2 * MIN);
eq(h.ptr('mousedown', 5, 5), true, 'pointer: a press (Magic Remote OK) wakes and is used up');
h.advance(2000);
eq([h.ptr('mouseup', 5, 5), h.ptr('click', 5, 5)], [true, true], 'pointer: its release and click are used up, even after a long hold');
h.advance(sb.POINTER_SETTLE_MS);
eq([h.ptr('mousedown', 5, 5), h.ptr('mouseup', 5, 5), h.ptr('click', 5, 5)], [false, false, false], 'pointer: the next click works');
h = harness(2); h.advance(2 * MIN);
eq([h.ptr('wheel', 5, 5), h.ctl.state()], [true, 'waking'], 'pointer: the wheel wakes and is used up');
h = harness(2); h.advance(2 * MIN);
h.ptr('mousemove', 9, 9);
eq(h.key(OK), false, 'pointer wake then a key: the key acts normally');
h = harness(0); h.advance(10 * MIN);
eq(h.ptr('mousemove', 3, 4), false, 'pointer: nothing is used up while off');

// ---- the setting ----
eq(sb.STANDBY_MINUTES, [0, 1, 2, 5, 10], 'setting: Off, 1, 2, 5, 10 minutes');
eq(sb.STANDBY_MINUTES.indexOf(sb.STANDBY_DEFAULT) !== -1, true, 'setting: the default is one of the choices');
eq([sb.standbyMinutes(5), sb.standbyMinutes(0), sb.standbyMinutes(3), sb.standbyMinutes('2'), sb.standbyMinutes(undefined)], [5, 0, sb.STANDBY_DEFAULT, sb.STANDBY_DEFAULT, sb.STANDBY_DEFAULT], 'setting: saved values are checked');
const KEY = 'customlauncher-config-v1';
eq(s.loadConfig().standbyMin, sb.STANDBY_DEFAULT, 'setting: a fresh install gets the default');
store[KEY] = JSON.stringify({defaultsV: 1, theme: 'grey'});
eq(s.loadConfig().standbyMin, sb.STANDBY_DEFAULT, 'setting: saved settings without the field (updaters) get the default');
store[KEY] = JSON.stringify({defaultsV: 1, standbyMin: 0});
eq(s.loadConfig().standbyMin, 0, 'setting: a saved Off stays Off');
store[KEY] = JSON.stringify({defaultsV: 1, standbyMin: 10});
eq(s.loadConfig().standbyMin, 10, 'setting: a saved 10 minutes is kept');
store[KEY] = JSON.stringify({defaultsV: 1, standbyMin: 7});
eq(s.loadConfig().standbyMin, sb.STANDBY_DEFAULT, 'setting: an unknown value falls back to the default');

const row = p.findPref('standbyMin');
eq([row.tab, row.kind, row.group, row.label], ['look', 'choice', 'Quiet mode', 'Standby fade'], 'row: Look tab, Quiet mode group, a choice called Standby fade');
eq(row.description.length > 0, true, 'row: has a description');
const c = {...s.DEFAULT_CONFIG, standbyMin: 2};
eq([0, 1, 2, 5, 10].map((v) => row.text({...c, standbyMin: v})), ['Off', '1 minute', '2 minutes', '5 minutes', '10 minutes'], 'row: texts');
eq([row.change(c, 'ok').standbyMin, row.change(c, 'right').standbyMin, row.change(c, 'left').standbyMin], [5, 5, 1], 'row: OK and Right step up, Left steps down');
eq([row.change({...c, standbyMin: 10}, 'ok').standbyMin, row.change({...c, standbyMin: 10}, 'right').standbyMin, row.change({...c, standbyMin: 0}, 'left').standbyMin], [0, 10, 0], 'row: OK wraps round to Off, the arrows stop at the ends');
eq(p.resetLook({...c, standbyMin: 10}).standbyMin, sb.STANDBY_DEFAULT, 'row: Reset look puts it back to the default');
const look = p.optionsFor('look', c).map((o) => o.id);
eq(look.slice(look.indexOf('quietDimLevel'), look.indexOf('oledShift') + 1), ['quietDimLevel', 'standbyMin', 'oledShift'], 'row: after the quiet-mode rows, before OLED shift');
eq(p.ROOT_OPTIONS.indexOf('standbyMin'), -1, 'row: works without root');
eq(p.optionsFor('look', c, undefined, 'Quiet mode').filter((o) => o.grouped).map((o) => o.id).indexOf('standbyMin') !== -1, true, 'row: shown when the Quiet mode group is opened');
eq(p.optionsFor('look', {...c, quietSec: 0}).map((o) => o.id).indexOf('standbyMin') !== -1, true, 'row: shown with quiet mode off (it does not depend on it)');
eq(p.applyPref(c, 'standbyMin', 'ok').standbyMin, 5, 'row: applyPref changes it');

console.log(fail ? `${fail} FAILED` : 'all ok');
if (fail) process.exit(1);
