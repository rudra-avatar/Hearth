// Browser simulation of the home screen (Playwright + Chromium, no TV): relaunch bursts, return from another app, held key, pointer edge scroll, hover.
// Run: build (`npx vite build`), serve `dist` (`cd dist && python3 -m http.server 8765 &`), then `node scripts/sim-browser.mjs http://localhost:8765 [S1..S10]`.
// S9 Settings open: relaunch, burst, short hidden flicker keep it, a real trip away (hidden 3 s+) closes it. S10 pointer edge scroll speed per *Row scroll speed* level.
// Not part of `npm test` (needs a server and Playwright; this path is the sandbox's global install). A browser is not a TV: timing and speed are not measured.
// S1 relaunch burst (highlight must stay), S2 same with the second row open, S3 return from another app (follows When Home is pressed), S4 one relaunch in front,
// S5 held Right, S6 pointer in the right 20% (S8 is the cleaner version), S7 hover across the middle, S8 right edge to the end, then left edge back.
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
const BASE = process.argv[2];            // http://localhost:8765 (new) or :8766 (old)
const WHICH = process.argv[3] || 'all';
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const say = (s) => { out.push(s); console.log(s); };

async function open (config, extraStore = {}) {
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}});
  await ctx.addInitScript(({config, extraStore}) => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', {get: () => window.__hidden, configurable: true});
    if (config) localStorage.setItem('customlauncher-config-v1', JSON.stringify(config));
    Object.keys(extraStore).forEach((k) => localStorage.setItem(k, extraStore[k]));
  }, {config, extraStore});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.tile');
  await sleep(1500);
  page.errs = errs; page.ctx = ctx;
  return page;
}
const st = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.row')];
  const fr = rows.findIndex((r) => r.classList.contains('row--focused'));
  const row = rows[fr < 0 ? 0 : fr];
  const tiles = [...row.querySelectorAll('.tile')];
  const f = tiles.findIndex((t) => t.classList.contains('tile--focused'));
  const lab = f >= 0 ? (tiles[f].querySelector('.tile__label') || {}).textContent : null;
  const tr = row.querySelector('.row__track');
  const rect = f >= 0 ? tiles[f].getBoundingClientRect() : null;
  return {rows: rows.length, row: fr, idx: f, label: lab, tx: Math.round(new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41), n: tiles.length, left: rect && Math.round(rect.left), right: rect && Math.round(rect.right)};
});
const relaunch = (page) => page.evaluate(() => document.dispatchEvent(new Event('webOSRelaunch')));
const key = async (page, k, n = 1, gap = 130) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); } };

const BASECFG = {defaultsV: 1, quietSec: 0};

// S1: relaunch burst while browsing one row
if (WHICH === 'all' || WHICH === 'S1') {
  const p = await open(BASECFG);
  await key(p, 'ArrowRight', 6);
  const a = await st(p);
  const trace = [`start idx=${a.idx} (${a.label})`];
  for (let i = 0; i < 6; i++) {
    await relaunch(p); await sleep(300);
    const r = await st(p);
    await key(p, 'ArrowRight', 1, 250);
    const m = await st(p);
    trace.push(`burst ${i + 1}: after relaunch idx=${r.idx}, after Right idx=${m.idx}`);
  }
  say('S1 relaunch burst, single row (6 relaunches, Right between)\n  ' + trace.join('\n  '));
  say('  page errors: ' + JSON.stringify(p.errs));
  await p.ctx.close();
}

// S2: two rows (favourites), second row open, relaunch burst
if (WHICH === 'all' || WHICH === 'S2') {
  const p = await open({...BASECFG, favourites: ['youtube.leanback.v4', 'netflix', 'amazon']});
  await key(p, 'ArrowDown', 1, 700);
  await key(p, 'ArrowRight', 4);
  const a = await st(p);
  const trace = [`start rows=${a.rows} row=${a.row} idx=${a.idx} (${a.label})`];
  for (let i = 0; i < 4; i++) {
    await relaunch(p); await sleep(700);
    const r = await st(p);
    trace.push(`relaunch ${i + 1}: rows=${r.rows} row=${r.row} idx=${r.idx} (${r.label})`);
  }
  say('S2 relaunch burst, favourites + second row open\n  ' + trace.join('\n  '));
  await p.ctx.close();
}

// S3: genuine return from another app (page hidden, then visible)
if (WHICH === 'all' || WHICH === 'S3') {
  for (const [name, cfg, store] of [
    ['homeFocus first', {...BASECFG, homeFocus: 'first'}, {'customlauncher-last-opened': 'netflix'}],
    ['homeFocus last + last opened Netflix', {...BASECFG, homeFocus: 'last'}, {'customlauncher-last-opened': 'netflix'}]
  ]) {
    const p = await open(cfg, store);
    await key(p, 'ArrowRight', 6);
    const a = await st(p);
    await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(1500);
    await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(900);
    const b = await st(p);
    say(`S3 return from another app (${name}): before idx=${a.idx} (${a.label}) -> after idx=${b.idx} (${b.label})`);
    await p.ctx.close();
  }
}

// S4: real Home press on the home screen (relaunch while in front), homeFocus last + Netflix last opened
if (WHICH === 'all' || WHICH === 'S4') {
  const p = await open({...BASECFG, homeFocus: 'last'}, {'customlauncher-last-opened': 'netflix'});
  await key(p, 'ArrowRight', 6);
  const a = await st(p);
  await relaunch(p); await sleep(500);
  const b = await st(p);
  say(`S4 one relaunch in front, homeFocus last: idx ${a.idx} (${a.label}) -> ${b.idx} (${b.label})`);
  await p.ctx.close();
}

// S5: held Right key
if (WHICH === 'all' || WHICH === 'S5') {
  const p = await open(BASECFG);
  const samples = []; let bad = 0; let lastTx = 1;
  for (let i = 0; i < 45; i++) {
    await p.keyboard.down('ArrowRight'); await sleep(60);
    if (i % 5 === 4) { const s = await st(p); samples.push(`${s.idx}@${s.tx}`); if (s.left < -2 || s.right > 1922) bad++; if (s.tx > lastTx + 1) bad++; lastTx = s.tx; }
  }
  await p.keyboard.up('ArrowRight'); await sleep(600);
  const e = await st(p);
  say(`S5 held Right 45 repeats: samples idx@translateX ${samples.join(' ')}; focused tile left the screen / track went backwards: ${bad} times; final idx=${e.idx}`);
  await p.ctx.close();
}

// S6: pointer in the outer 20% (free pixel scroll)
if (WHICH === 'all' || WHICH === 'S6') {
  const p = await open(BASECFG);
  const y = await p.evaluate(() => { const r = document.querySelector('.row__viewport').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  await p.mouse.move(700, y); await sleep(200); await p.mouse.move(900, y, {steps: 4}); await sleep(300);
  const base = await st(p);
  await p.mouse.move(1800, y, {steps: 10});
  const t0 = Date.now(); const rows = []; let prev = null; let moved = 0; let selChanged = 0; let endIdx = null;
  for (let i = 0; i < 70; i++) {
    await sleep(150);
    const s = await st(p);
    if (prev) { if (s.tx < prev.tx) moved++; }
    rows.push(`${Date.now() - t0}ms tx=${s.tx} idx=${s.idx}`);
    if (s.idx !== base.idx && endIdx === null) { endIdx = s.idx; selChanged = i; }
    prev = s;
    if (endIdx !== null) break;
  }
  say(`S6 pointer rests in the right 20%: start idx=${base.idx}; the track moved on ${moved} of ${rows.length} samples; first highlight change at sample ${selChanged}, idx=${endIdx} of ${base.n - 1} (last app = ${base.n - 1})`);
  say('  ' + [rows[0], rows[2], rows[5], rows[10], rows[rows.length - 1]].join(' | '));
  // scroll again, leave the edge zone mid-scroll
  await p.mouse.move(1000, y, {steps: 6}); await sleep(400);
  const mid = await st(p);
  const under = await p.evaluate(() => { const tiles = [...document.querySelectorAll('.row--focused .tile')]; return tiles.findIndex((t) => { const r = t.getBoundingClientRect(); return r.left <= 1000 && 1000 <= r.right; }); });
  say(`  pointer back to x=1000 and rest: highlighted idx=${mid.idx}; tile under the pointer idx=${under}`);
  await p.mouse.move(1850, y, {steps: 6}); await sleep(900);
  const during = await st(p);
  await p.mouse.move(1000, y, {steps: 6}); await sleep(400);
  const after = await st(p);
  const under2 = await p.evaluate(() => { const tiles = [...document.querySelectorAll('.row--focused .tile')]; return tiles.findIndex((t) => { const r = t.getBoundingClientRect(); return r.left <= 1000 && 1000 <= r.right; }); });
  say(`  second try: 0.9 s in the edge zone: highlight idx=${during.idx} (was ${mid.idx}, must not change while scrolling); leave to x=1000: highlight idx=${after.idx}, tile under pointer idx=${under2}`);
  await p.ctx.close();
}

// S7: hover across the middle, rest at tile centres
if (WHICH === 'all' || WHICH === 'S7') {
  const p = await open(BASECFG);
  const y = await p.evaluate(() => { const r = document.querySelector('.row__viewport').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  const tilesX = await p.evaluate(() => [...document.querySelectorAll('.row--focused .tile')].map((t) => { const r = t.getBoundingClientRect(); return Math.round(r.left + r.width / 2); }).filter((x) => x > 420 && x < 1500));
  let ok = 0, miss = [];
  await p.mouse.move(tilesX[0] - 40, y);
  for (const x of tilesX) {
    await p.mouse.move(x, y, {steps: 3}); await sleep(220);
    const s = await st(p);
    const under = await p.evaluate((x) => [...document.querySelectorAll('.row--focused .tile')].findIndex((t) => { const r = t.getBoundingClientRect(); return r.left <= x && x <= r.right; }), x);
    if (s.idx === under) ok++; else miss.push(`x=${x}: highlight ${s.idx}, under ${under}`);
  }
  say(`S7 hover across the middle: ${ok} of ${tilesX.length} tiles highlighted when the pointer rested on them${miss.length ? '; misses: ' + miss.join('; ') : ''}`);
  await p.ctx.close();
}

// S8: right edge to the end, then left edge back to the start
if (WHICH === 'all' || WHICH === 'S8') {
  const p = await open(BASECFG);
  const y = await p.evaluate(() => { const r = document.querySelector('.row__viewport').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  await p.mouse.move(700, y); await sleep(150); await p.mouse.move(760, y); await sleep(300);
  const s0 = await st(p);
  await p.mouse.move(1850, y, {steps: 8});
  let t = 0, mid = null, endS = null;
  for (let i = 0; i < 80; i++) { await sleep(150); t += 150; const s = await st(p); if (i === 4) mid = s; if (s.idx === s.n - 1) { endS = s; break; } }
  const tail = await st(p);
  say(`S8a right edge to the end: before idx=${s0.idx}; after 0.75 s highlight idx=${mid && mid.idx} (frozen, ${mid && mid.tx}px scrolled); ended after ~${t} ms with idx=${endS && endS.idx} of ${s0.n - 1} (last app), tx=${tail.tx}`);
  await sleep(500);
  await p.mouse.move(60, y, {steps: 8});
  let t2 = 0, endL = null, mid2 = null;
  for (let i = 0; i < 80; i++) { await sleep(150); t2 += 150; const s = await st(p); if (i === 4) mid2 = s; if (s.idx === 0) { endL = s; break; } }
  const tail2 = await st(p);
  say(`S8b left edge back to the start: after 0.75 s highlight idx=${mid2 && mid2.idx} (frozen at ${endS && endS.idx}); ended after ~${t2} ms with idx=${endL && endL.idx} (first app), tx=${tail2.tx}`);
  await p.ctx.close();
}
// S9: Settings open, then a relaunch event / a short "hidden" flicker / the TV's relaunch burst (Settings must stay unless the person asked to leave)
const inSettings = (page) => page.evaluate(() => !!document.querySelector('.screen--settings'));
const openSettings = async (page) => { await key(page, 'ArrowLeft', 1, 400); await key(page, 'Enter', 1, 1300); };
if (WHICH === 'all' || WHICH === 'S9') {
  const tests = [
    ['one relaunch event', async (p) => { await relaunch(p); await sleep(600); }],
    ['relaunch burst (4 in 1.2 s)', async (p) => { for (let i = 0; i < 4; i++) { await relaunch(p); await sleep(300); } await sleep(400); }],
    ['hidden flicker 150 ms (visibilitychange)', async (p) => {
      await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(150);
      await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(600); }],
    ['hidden for 1.3 s (seen by the 1 s check only)', async (p) => {
      await p.evaluate(() => { window.__hidden = true; }); await sleep(1300);
      await p.evaluate(() => { window.__hidden = false; }); await sleep(1300); }],
    ['REAL trip to another app: hidden 4 s, then back (Settings must close)', async (p) => {
      await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(4000);
      await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(700); }],
    ['REAL trip, page frozen (no timers run while hidden), hidden 4 s by the clock, back (must close)', async (p) => {
      await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); const real = window.setTimeout; window.__t0 = Date.now(); });
      await sleep(30);
      await p.evaluate(() => { const d = Date.now; Date.now = () => d() + 4000; window.__d = d; });   // the clock moves on, the timers did not run
      await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(700);
      await p.evaluate(() => { Date.now = window.__d; }); }]
  ];
  for (const [name, act] of tests) {
    const p = await open(BASECFG);
    await openSettings(p);
    const before = await inSettings(p);
    await key(p, 'ArrowDown', 1, 300); await key(p, 'ArrowRight', 2, 300);   // some state: a deeper tab
    const tab = await p.evaluate(() => (document.querySelector('.settings__tabs .tab--focused, .settings__tabs [class*="focused"]') || {}).textContent || null);
    await act(p);
    const after = await inSettings(p);
    say(`S9 Settings + ${name}: Settings open before=${before} (tab ${tab}); after=${after}${after ? '' : ' -> closed'}`);
    await p.ctx.close();
  }
}
// S10: pointer edge scroll speed follows *Row scroll speed* (Medium = the old speed; ratios from the held-key profiles: 0.59, 1, 1.44, 2.17)
if (WHICH === 'all' || WHICH === 'S10') {
  const got = {};
  for (const speed of ['slow', 'medium', 'brisk', 'fast']) {
    const p = await open({...BASECFG, scrollSpeed: speed});
    const y = await p.evaluate(() => { const r = document.querySelector('.row__viewport').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    await p.mouse.move(700, y); await sleep(150); await p.mouse.move(900, y); await sleep(250);
    const a = await st(p);
    await p.mouse.move(1800, y, {steps: 4});               // fixed spot in the outer 20 %
    const t0 = Date.now(); await sleep(500);
    const b = await st(p); const dt = Date.now() - t0;
    got[speed] = Math.round(Math.abs(b.tx - a.tx) / dt * 1000);
    await p.ctx.close();
  }
  const m = got.medium || 1;
  say('S10 pointer edge scroll, px per second at one spot in the right 20 %: ' + Object.keys(got).map((k) => `${k} ${got[k]} (x${(got[k] / m).toFixed(2)})`).join(', '));
}
await browser.close();
