// Browser simulation of the screens behind Settings rows (Playwright + Chromium, no TV), English only (p33c):
//   essentials (Edit Essentials), themes, languages, cities, updates, undo (opened, never confirmed), mostused, quiet (hide + dim + wake), saver (rows and probe).
// Run: build (`npx vite build`), serve `dist` (`cd dist && setsid nohup python3 -m http.server 8765 &`), then
//   node scripts/sim-screens.mjs http://localhost:8765 <outdir> [scenario ...]      (default: all; one process per few scenarios may run in parallel)
// Every scenario has its own browser context and a watchdog (SIM_WATCHDOG_MS, default 90000): a stuck one is reported, the others go on.
// Root-only rows stay enabled in a browser; their actions fail with "Not running on webOS" or do nothing (no Homebrew service): the script reports what it saw, nothing is faked. Undo is opened and never confirmed. Not part of `npm test`.
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
const BASE = process.argv[2];
const OUT = process.argv[3] || '/tmp/shots-screens';
const ALL = ['extrakeys', 'thaicity', 'favourites', 'essentials', 'themes', 'languages', 'cities', 'updates', 'undo', 'mostused', 'quiet', 'saver'];
const WANT = process.argv.slice(4).length ? process.argv.slice(4) : ALL;
const WATCHDOG_MS = Number(process.env.SIM_WATCHDOG_MS || 90000);
mkdirSync(OUT, {recursive: true});
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open (config) {
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}});
  await ctx.addInitScript(({config}) => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', {get: () => window.__hidden, configurable: true});
    localStorage.setItem('customlauncher-config-v1', JSON.stringify(Object.assign({defaultsV: 1, quietSec: 0, showDebug: true, language: 'en'}, config || {})));
  }, {config});
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e)));
  // outside requests (weather, GitHub) cannot work in the sandbox: only errors of the page's own code and our own files count
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|net::ERR|Failed to load resource/.test(m.text())) page.errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.errs.push('http ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.tile', {timeout: 20000});
  await sleep(1500);
  page.ctx = ctx;
  return page;
}
const key = async (page, k, n = 1, gap = 150) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); } };
const snap = (page, name) => page.screenshot({path: `${OUT}/${name}.png`});
const settingsOpen = (page) => page.evaluate(() => !!document.querySelector('.screen--settings'));
async function openSettings (page) {
  await key(page, 'ArrowLeft', 1, 400); await key(page, 'Enter', 1, 1500);
  if (!(await settingsOpen(page))) throw new Error('Settings did not open');
}
const focusedRow = (page) => page.evaluate(() => {
  const f = document.querySelector('.settings .option--focused');
  const t = (el) => (el ? el.textContent.trim() : '');
  return f ? {label: t(f.querySelector('.option__label')), value: t(f.querySelector('.option__value')), group: f.classList.contains('option--group'), open: f.classList.contains('option--open'), disabled: f.classList.contains('option--disabled'), desc: t(f.querySelector('.option__description'))} : null;
});
const tabIndex = (page, n) => key(page, 'ArrowRight', n, 450);
// Down through the rows of the current tab (opening groups on the way) until a label matches; the page stays there.
async function findRow (page, re, max = 90) {
  await key(page, 'ArrowDown', 1, 250);
  for (let i = 0; i < max; i++) {
    const r = await focusedRow(page);
    if (!r) return null;
    if (re.test(r.label)) return r;
    if (r.group && !r.open) await key(page, 'Enter', 1, 250);
    await key(page, 'ArrowDown', 1, 150);
  }
  return null;
}
const pickerRows = (page) => page.evaluate(() => [...document.querySelectorAll('.picker__row')].map((r) => ({
  label: (r.querySelector('.picker__label') || r).textContent.trim(), focused: r.classList.contains('picker__row--focused'), tick: !!r.querySelector('svg') && /tick|check/i.test(r.innerHTML)
})));
// The screen on top: a picker/dialog screen if one is mounted, else Settings, else Home (`.screen` of Home stays mounted behind, so it is looked up last).
const screenInfo = (page) => page.evaluate(() => {
  const pick = (sel) => { const l = document.querySelectorAll(sel); return l.length ? l[l.length - 1] : null; };
  const s = pick('.screen--picker') || pick('.screen--recents') || pick('.screen--settings') || pick('.screen');
  const rect = s ? s.getBoundingClientRect() : null;
  const t = (sel) => { const e = s && s.querySelector(sel); return e ? e.textContent.trim() : ''; };
  return {cls: s ? s.className : '', title: t('.settings__title, h1'), hint: t('.settings__hint').slice(0, 140), picker: !!pick('.screen--picker'), off: !!rect && (rect.right > 1925 || rect.bottom > 1085)};
});

const results = {};
const S = {};

S.essentials = async (page, log) => {
  await openSettings(page); await tabIndex(page, 1);
  const before = await page.evaluate(() => document.querySelectorAll('.settings .option').length);
  const row = await findRow(page, /^Edit Essentials/);
  if (!row) return log('FAIL row "Edit Essentials" not found');
  await key(page, 'Enter', 1, 700);
  const si = await screenInfo(page); const rows = await pickerRows(page);
  log(`edit screen: ${si.cls}, title "${si.title}", ${rows.length} rows visible, off-screen ${si.off}`);
  await snap(page, 'essentials_edit_1');
  const first = rows.findIndex((r) => r.focused);
  await key(page, 'Enter', 1, 400);                       // toggle the focused row
  await key(page, 'ArrowDown', 3, 200); await key(page, 'Enter', 1, 400);
  await key(page, 'ArrowRight', 1, 300); await key(page, 'ArrowLeft', 1, 300);
  await snap(page, 'essentials_edit_2');
  await key(page, 'Escape', 1, 900);
  const back = await settingsOpen(page);
  await sleep(300);
  const after = await page.evaluate(() => document.querySelectorAll('.settings .option').length);
  log(`closed with Back: Settings open ${back}; option rows before ${before}, after ${after} (first focused edit row index ${first})`);
  await snap(page, 'essentials_after');
  // reset to the default list: the last row of the edit screen
  await key(page, 'ArrowUp', 1, 300);
  const row2 = await findRow(page, /^Edit Essentials/, 60);
  await key(page, 'Enter', 1, 700);
  await key(page, 'ArrowUp', 1, 300);                     // from the first row Up = ?
  const r3 = await pickerRows(page); log(`edit screen again: ${r3.length} rows, focused "${(r3.find((r) => r.focused) || {}).label}"`);
  await key(page, 'Escape', 1, 700);
  log(`second edit screen reached: ${!!row2}`);
};

S.themes = async (page, log) => {
  await openSettings(page); await tabIndex(page, 2);
  const row = await findRow(page, /^Current theme/);
  if (!row) return log('FAIL row "Current theme" not found');
  log(`row: value "${row.value}", disabled ${row.disabled}`);
  await snap(page, 'themes_row');
  await key(page, 'ArrowRight', 4, 350); const a = await focusedRow(page); await snap(page, 'themes_browsed');
  await key(page, 'ArrowLeft', 4, 350); const b = await focusedRow(page);
  log(`after Right x4: "${a && a.value}", after Left x4: "${b && b.value}"`);
  await key(page, 'Enter', 1, 800); const si = await screenInfo(page);
  log(`Enter: screen "${si.cls}" title "${si.title}" (OK loads a theme file; needs the Homebrew service, so a disabled row or a message is expected here)`);
  await snap(page, 'themes_enter');
  await key(page, 'Escape', 1, 500);
};

S.languages = async (page, log) => {
  await openSettings(page); await tabIndex(page, 6);
  const row = await findRow(page, /^Hearth language/);
  if (!row) return log('FAIL row "Hearth language" not found');
  log(`row: value "${row.value}", disabled ${row.disabled}`);
  const seen = [row.value];
  for (let i = 0; i < 12; i++) { await key(page, 'ArrowRight', 1, 700); const r = await focusedRow(page); seen.push(r ? r.value : '?'); }
  await snap(page, 'languages_after_right');
  log(`Right x12 shows: ${seen.join(' | ')}`);
  await key(page, 'ArrowLeft', 12, 500);
  const back = await focusedRow(page); log(`Left x12 back to: "${back && back.label}" / "${back && back.value}"`);
  const rem = await findRow(page, /Remove|remove/, 6); log(`remove-language row: ${rem ? `"${rem.label}" disabled ${rem.disabled}` : 'not shown (no own language file)'}`);
};

S.cities = async (page, log) => {
  await openSettings(page); await tabIndex(page, 3);
  const row = await findRow(page, /^Weather: city$/);
  if (!row) return log('FAIL row "Weather: city" not found');
  log(`row value "${row.value}"`);
  await key(page, 'Enter', 1, 900);
  const si = await screenInfo(page); const rows = await pickerRows(page);
  log(`picker: ${si.cls}, title "${si.title}", ${rows.length} rows, first "${rows[0] && rows[0].label}", off-screen ${si.off}`);
  await snap(page, 'cities_1');
  await key(page, 'ArrowDown', 4, 200); await snap(page, 'cities_2');
  await key(page, 'ArrowRight', 1, 300); await key(page, 'ArrowLeft', 1, 300);
  const sel = (await pickerRows(page)).find((r) => r.focused);
  await key(page, 'Enter', 1, 900);
  const si2 = await screenInfo(page); const r2rows = await pickerRows(page);
  log(`chose "${sel && sel.label}"; picker still open ${si2.picker}, title "${si2.title}", ${r2rows.length} rows, first "${r2rows[0] && r2rows[0].label}"`);
  await snap(page, 'cities_3');
  if (si2.picker) { await key(page, 'ArrowDown', 1, 250); const c = (await pickerRows(page)).find((r) => r.focused); await key(page, 'Enter', 1, 1000); log(`chose city "${c && c.label}"; picker still open ${(await screenInfo(page)).picker}`); await snap(page, 'cities_4'); }
  if ((await screenInfo(page)).picker) { await key(page, 'Escape', 1, 700); log('closed the picker with Back'); }
  const r2 = await focusedRow(page); log(`back in Settings, row now "${r2 && r2.label}" = "${r2 && r2.value}"`);
};

S.updates = async (page, log) => {
  await openSettings(page); await tabIndex(page, 6);
  const row = await findRow(page, /^Check for updates/);
  if (!row) return log('FAIL row "Check for updates" not found');
  await key(page, 'Enter', 1, 800);
  const si = await screenInfo(page);
  log(`screen "${si.cls}" title "${si.title}", hint "${si.hint}"`);
  await snap(page, 'updates_1');
  await sleep(4000);
  const txt = await page.evaluate(() => (document.querySelector('.screen--picker') || document.body).textContent.replace(/\s+/g, ' ').trim().slice(0, 260));
  log(`after 4 s: ${txt}`);
  await snap(page, 'updates_2');
  await key(page, 'Escape', 1, 700);
  log(`closed with Back: Settings open ${await settingsOpen(page)}`);
};

S.undo = async (page, log) => {
  await openSettings(page); await tabIndex(page, 6);
  const row = await findRow(page, /^Uninstall Hearth/);
  if (!row) return log('FAIL row "Uninstall Hearth..." not found');
  log(`row disabled: ${row.disabled}`);
  await snap(page, 'undo_row');
  await key(page, 'Enter', 1, 900);
  const si = await screenInfo(page);
  const dlg = await page.evaluate(() => { const d = document.querySelector('.dialog, .modal, .popup, [class*="dialog"], [class*="modal"]'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : ''; });
  log(`Enter: screen "${si.cls}"; dialog text: ${dlg || '(none)'}`);
  await snap(page, 'undo_enter');
  await key(page, 'Escape', 1, 600);                 // never confirmed
  log(`left with Back (not confirmed); Settings open ${await settingsOpen(page)}`);
};

S.mostused = async (page, log) => {
  await openSettings(page);
  const btn = () => page.evaluate(() => { const b = [...document.querySelectorAll('.settings__button')].find((x) => /Most used/.test(x.textContent)); return b ? b.textContent.trim() : null; });
  const first = await btn();
  log(`button on Apps & Sources: ${first}`);
  if (!first) return log('NOT SHOWN: no apps with a launch history in the browser, or the button needs another sub-tab');
  await snap(page, 'mostused_before');
  await page.click('.settings__button:has-text("Most used")'); await sleep(900);
  const on = await btn(); await snap(page, 'mostused_on');
  await page.click('.settings__button:has-text("Most used")'); await sleep(900);
  const off = await btn();
  log(`click: "${on}", click again: "${off}"`);
};

S.quiet = async (page, log) => {
  const st = () => page.evaluate(() => ({quiet: document.body.classList.contains('hearth-quiet'), dim: document.body.classList.contains('hearth-dim'), rowsQuiet: !!document.querySelector('.rows--quiet')}));
  const a = await st(); log(`at start: ${JSON.stringify(a)}`);
  await sleep(11500); const b = await st(); log(`after 11.5 s without a key (quiet 10 s): ${JSON.stringify(b)}`); await snap(page, 'quiet_hidden');
  await sleep(10000); const c = await st(); log(`after 21.5 s (dim set 10 s after hiding): ${JSON.stringify(c)}`); await snap(page, 'quiet_dim');
  await key(page, 'ArrowRight', 1, 400); const d = await st(); log(`after one key (wake, used up): ${JSON.stringify(d)}`);
  const f = await page.evaluate(() => { const t = document.querySelector('.tile--focused'); return t ? t.textContent.trim() : null; });
  log(`focused tile after the waking key: ${f}`); await snap(page, 'quiet_woken');
};

S.saver = async (page, log) => {
  await openSettings(page); await tabIndex(page, 5);
  const row = await findRow(page, /show it now/i);
  if (!row) return log('FAIL row "show it now" not found');
  log(`row "${row.label}" disabled ${row.disabled}, desc "${row.desc}"`);
  await snap(page, 'saver_row');
  await key(page, 'Enter', 1, 900);
  const o = await page.evaluate(() => ({overlay: !!document.querySelector('[class*="saver"], [class*="probe"]'), settings: !!document.querySelector('.screen--settings')}));
  log(`Enter: ${JSON.stringify(o)} (the QML saver itself runs only on the TV)`);
  await key(page, 'ArrowUp', 40, 20); await tabIndex(page, 3);
  const probe = await findRow(page, /Saver probe: light video, Fill \+ care/, 70);
  if (!probe) return log('Tests tab: probe row not found');
  log(`probe row "${probe.label}", disabled ${probe.disabled}`);
  await snap(page, 'saver_probe_row');
  await key(page, 'Enter', 1, 1500);
  const msg = await page.evaluate(() => { const f = document.querySelector('.settings .option--focused'); return f ? f.textContent.replace(/\s+/g, ' ').trim().slice(0, 240) : ''; });
  log(`after Enter: ${msg}`); await snap(page, 'saver_probe_after');
};

S.extrakeys = async (page, log) => {
  await openSettings(page); await tabIndex(page, 6);
  const row = await findRow(page, /^Map additional keys/);
  if (!row) return log('FAIL row "Map additional keys" not found');
  log(`row "${row.label}" value "${row.value}" disabled ${row.disabled}`);
  await key(page, 'Enter', 1, 900);
  const warn = await page.evaluate(() => { const d = document.querySelector('[class*="dialog"], [class*="notice"], [class*="modal"], [class*="popup"]'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : ''; });
  log(`first Enter: ${warn ? 'warning shown: ' + warn : 'no warning'}`); await snap(page, 'extrakeys_warning');
  if (warn) await key(page, 'Enter', 1, 1500);
  const si = await screenInfo(page); const rows = await pickerRows(page);
  const txt = await page.evaluate(() => { const l = document.querySelectorAll('.screen--picker'); const s = l[l.length - 1]; return s ? s.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : ''; });
  log(`screen "${si.cls}" title "${si.title}", ${rows.length} rows, off-screen ${si.off}; text: ${txt}`);
  await snap(page, 'extrakeys_1');
  await key(page, 'ArrowDown', 2, 250); await key(page, 'Escape', 1, 800);
  log(`closed with Back: Settings open ${await settingsOpen(page)} (Homebrew data is missing in a browser: only the empty or error state can show here)`);
};

S.thaicity = async (page, log) => {
  await openSettings(page); await tabIndex(page, 3);
  const row = await findRow(page, /^Weather: city$/);
  if (!row) return log('FAIL row "Weather: city" not found');
  await key(page, 'Enter', 1, 900);
  let found = null;
  for (let i = 0; i < 80 && !found; i++) { const f = (await pickerRows(page)).find((r) => r.focused); if (f && /^Thailand/.test(f.label)) found = f.label; else await key(page, 'ArrowDown', 1, 90); }
  if (!found) return log('FAIL "Thailand" not in the country list');
  await snap(page, 'thaicity_country');
  await key(page, 'Enter', 1, 900);
  const rows = await pickerRows(page);
  log(`Thailand opened: ${rows.map((r) => r.label).join(' | ')}`);
  await key(page, 'ArrowDown', 1, 250); const c = (await pickerRows(page)).find((r) => r.focused); await key(page, 'Enter', 1, 1000);
  const r2 = await focusedRow(page); log(`chose "${c && c.label}"; Settings row now "${r2 && r2.label}" = "${r2 && r2.value}"`);
  await snap(page, 'thaicity_done');
};

S.favourites = async (page, log) => {
  await openSettings(page);
  const btn = () => page.evaluate(() => [...document.querySelectorAll('.settings__button')].map((b) => b.textContent.trim()));
  log(`buttons on Apps & Sources: ${(await btn()).join(' | ')}`);
  const fav = page.locator('.settings__button', {hasText: /avourite/}).first();
  if (!(await fav.count())) return log('FAIL no favourites button');
  await fav.click(); await sleep(600);
  await key(page, 'ArrowDown', 1, 400); await key(page, 'Enter', 1, 400); await key(page, 'ArrowRight', 1, 300); await key(page, 'Enter', 1, 400);
  log(`picked with keys; marked items: ${await page.evaluate(() => document.querySelectorAll('.settings [class*="fav"], .settings [class*="picked"], .settings [class*="marked"]').length)}`);
  await snap(page, 'favourites_pick');
  await page.click('.settings__button--active', {timeout: 5000}); await sleep(600);       // while picking, the button reads Done
  await key(page, 'Escape', 1, 1200);
  const st = () => page.evaluate(() => { const rows = [...document.querySelectorAll('.row')]; return {rows: rows.length, focusedRow: rows.findIndex((r) => r.classList.contains('row--focused')), tilesPerRow: rows.map((r) => r.querySelectorAll('.tile').length)}; });
  log(`Home after picking two favourites: ${JSON.stringify(await st())}`); await snap(page, 'favourites_home');
  await key(page, 'ArrowDown', 1, 900); log(`after Down: ${JSON.stringify(await st())}`); await snap(page, 'favourites_down');
  await key(page, 'ArrowUp', 1, 900); log(`after Up: ${JSON.stringify(await st())}`); await snap(page, 'favourites_up');
};

const CONFIG = {quiet: {quietSec: 10, quietDimSec: 10}};
for (const name of WANT) {
  const lines = []; const log = (s) => { lines.push(s); console.log(`[${name}] ${s}`); };
  const R = results[name] = {lines, errors: [], status: 'ok'};
  let page = null; let timer;
  const dog = new Promise((resolve) => { timer = setTimeout(() => { R.status = `watchdog after ${WATCHDOG_MS / 1000} s`; resolve('dog'); }, WATCHDOG_MS); });
  const run = (async () => { page = await open(CONFIG[name]); await S[name](page, log); })().catch((e) => { R.status = 'error: ' + String(e).split('\n')[0]; });
  await Promise.race([run, dog]);
  clearTimeout(timer);
  if (page) { R.errors = page.errs.slice(0, 6); try { await page.ctx.close(); } catch (e) { /* closed */ } }
  console.log(`== ${name}: ${R.status}; page errors ${R.errors.length}${R.errors.length ? ' ' + R.errors.join(' || ') : ''}`);
}
writeFileSync(`${OUT}/report-${WANT.join('-')}.json`, JSON.stringify(results, null, 1));
await browser.close();
