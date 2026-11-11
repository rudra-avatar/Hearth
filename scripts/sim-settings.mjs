// Browser simulation of Settings (Playwright + Chromium, no TV): walks every tab and every row (groups opened), reads label, description,
// help text and preview, flags clipped text, page errors and rows without help, optionally in another language, and saves screenshots.
// Run: build (`npx vite build`), serve `dist` (`cd dist && python3 -m http.server 8765 &`), then
//   node scripts/sim-settings.mjs http://localhost:8765 <outdir> [lang ...]      (lang: en de es fr pl pt-BR id ru ar th; default en)
// Not part of `npm test`. A browser is not a TV: timing is not measured, root-only rows show as disabled.
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
const BASE = process.argv[2];
const OUT = process.argv[3] || '/tmp/shots';
const LANGS = process.argv.slice(4).length ? process.argv.slice(4) : ['en'];
mkdirSync(OUT, {recursive: true});
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {};

async function open (lang) {
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}});
  await ctx.addInitScript(({lang}) => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', {get: () => window.__hidden, configurable: true});
    localStorage.setItem('customlauncher-config-v1', JSON.stringify({defaultsV: 1, quietSec: 0, showDebug: true, language: lang}));
  }, {lang});
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) page.errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) page.errs.push('http ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.tile');
  await sleep(lang === 'en' ? 1500 : 3000);
  page.ctx = ctx;
  return page;
}
const key = async (page, k, n = 1, gap = 120) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); } };
const snap = async (page, name) => { await page.screenshot({path: `${OUT}/${name}.png`}); };

// What the focused row shows now.
const read = (page) => page.evaluate(() => {
  const f = document.querySelector('.settings .option--focused');
  const txt = (el) => (el ? el.textContent.trim() : '');
  const clipped = (el) => !!el && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) && getComputedStyle(el).overflow !== 'visible';
  const helpBox = document.querySelector('.help__box');
  const hb = helpBox ? helpBox.getBoundingClientRect() : null;
  const prev = document.querySelector('.homeprev');
  const tab = document.querySelector('.settings__tabs .tab--focused, .settings__tabs [class*="focused"], .settings__tabs [class*="active"]');
  return {
    label: txt(f && f.querySelector('.option__label')),
    value: txt(f && f.querySelector('.option__value')),
    desc: txt(f && f.querySelector('.option__description')),
    group: !!(f && f.classList.contains('option--group')),
    open: !!(f && f.classList.contains('option--open')),
    disabled: !!(f && f.classList.contains('option--disabled')),
    helpTitle: txt(document.querySelector('.help__title')),
    helpBody: txt(document.querySelector('.help__body')),
    helpOff: !!(hb && (hb.bottom > 1080 || hb.right > 1920 || hb.left < 0 || hb.top < 0)),
    helpClip: clipped(document.querySelector('.help__body')) || clipped(helpBox),
    labelClip: !!f && (clipped(f.querySelector('.option__label')) || clipped(f.querySelector('.option__description'))),
    rowOff: !!f && (f.getBoundingClientRect().bottom > 1085 || f.getBoundingClientRect().top < -5),
    preview: !!(prev && prev.getBoundingClientRect().width > 50),
    tab: txt(tab)
  };
});

async function runLang (lang, R, prog) {
  const page = await open(lang);
  prog.page = page;
  // open Settings (Left from the first tile, OK)
  await key(page, 'ArrowLeft', 1, 400); await key(page, 'Enter', 1, 1500);
  const inS = await page.evaluate(() => !!document.querySelector('.screen--settings'));
  if (!inS) { R.errors.push('Settings did not open'); await page.ctx.close(); return; }
  const tabNames = [];
  const seenTabs = new Set();
  for (let t = 0; t < 14; t++) {
    const info = await read(page);
    const tabLabel = await page.evaluate(() => { const els = [...document.querySelectorAll('.settings__tabs:not(.settings__tabs--sub) > *')]; const i = els.findIndex((e) => /focused|active|selected/.test(e.className)); return i >= 0 ? `${i}:${els[i].textContent.trim()}` : ''; });
    if (seenTabs.has(tabLabel)) break;
    seenTabs.add(tabLabel);
    prog.at = `tab ${tabLabel}`; console.error(`[${lang}] ${prog.at} rows so far ${R.rows}`);
    tabNames.push(tabLabel);
    const safe = tabLabel.replace(/[^A-Za-z0-9]+/g, '_');
    if (lang === 'en' || t < 3) await snap(page, `${lang}_tab${String(t).padStart(2, '0')}_${safe}`);
    // into the rows
    await key(page, 'ArrowDown', 1, 250);
    const seen = new Set(); let shots = 0; let prevPreview = false;
    for (let step = 0; step < 90; step++) {
      const r = await read(page);
      const id = r.label + '|' + step;
      if (!r.label) break;
      if (seen.has(r.label) && !r.group) break;               // looped round
      seen.add(r.label);
      R.rows++;
      if (!r.helpBody && !r.helpTitle) R.noHelp.push(`${tabLabel} / ${r.label}`);
      if (r.labelClip) R.clipped.push(`${tabLabel} / ${r.label}`);
      if (r.helpClip || r.helpOff) R.helpClipped.push(`${tabLabel} / ${r.label}`);
      if (r.rowOff) R.off.push(`${tabLabel} / ${r.label}`);
      // screenshots: rows with a home preview (new since 2.1.x), up to 3 per tab, English only
      if (lang === 'en' && r.preview && shots < 3) { shots++; await snap(page, `${lang}_tab${String(t).padStart(2, '0')}_${safe}_row_${r.label.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}`); }
      if (r.group && !r.open) { await key(page, 'Enter', 1, 250); }
      await key(page, 'ArrowDown', 1, 160);
    }
    // back to the tab bar, next tab
    await key(page, 'ArrowUp', 40, 30);
    await key(page, 'ArrowRight', 1, 450);
  }
  R.tabs = tabNames;
  R.errors.push(...page.errs);
  await page.ctx.close();
}

// One language at a time with a watchdog: a stuck run is reported (and its browser context closed) instead of hanging the whole script.
const WATCHDOG_MS = Number(process.env.SIM_WATCHDOG_MS || 200000);
for (const lang of LANGS) {
  const R = report[lang] = {tabs: [], rows: 0, noHelp: [], clipped: [], helpClipped: [], off: [], errors: []};
  const prog = {at: 'start', page: null};
  let timer;
  const dog = new Promise((resolve) => { timer = setTimeout(() => { R.errors.push(`watchdog: no finish in ${WATCHDOG_MS / 1000} s, stuck at ${prog.at}`); resolve('dog'); }, WATCHDOG_MS); });
  const done = runLang(lang, R, prog).catch((e) => { R.errors.push('run error: ' + String(e).split('\n')[0]); });
  await Promise.race([done, dog]);
  clearTimeout(timer);
  if (prog.page) { if (prog.page.errs) R.errors.push(...prog.page.errs.filter((e) => !R.errors.includes(e))); try { await prog.page.ctx.close(); } catch (e) { /* closed */ } }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
for (const [lang, R] of Object.entries(report)) {
  console.log(`== ${lang}: tabs ${R.tabs.length} [${R.tabs.join(' | ')}], rows seen ${R.rows}`);
  console.log(`   rows without help: ${R.noHelp.length}${R.noHelp.length ? ' e.g. ' + R.noHelp.slice(0, 8).join('; ') : ''}`);
  console.log(`   clipped label/description: ${R.clipped.length}${R.clipped.length ? ' e.g. ' + R.clipped.slice(0, 8).join('; ') : ''}`);
  console.log(`   help panel clipped/outside screen: ${R.helpClipped.length}${R.helpClipped.length ? ' e.g. ' + R.helpClipped.slice(0, 8).join('; ') : ''}`);
  console.log(`   row outside screen: ${R.off.length}${R.off.length ? ' e.g. ' + R.off.slice(0, 5).join('; ') : ''}`);
  console.log(`   page errors: ${R.errors.length}${R.errors.length ? ' ' + R.errors.slice(0, 4).join(' || ') : ''}`);
}
await browser.close();
