// p33d: screenshots of the features new since 2.0.0 for README / guide / Reddit, from the browser simulation (Playwright + Chromium, no TV).
// Only bundled wallpapers (public/wallpapers) and apps with a bundled icon (config/catalog.ts: entries with `icon`); catalogue apps that would show only a
// letter, and the duplicate Apple TV / Plex entries, are hidden through `hiddenIds`. Nothing is faked: screens that need TV data (Map additional keys, Check
// for updates, Undo confirm, weather) are not shot because a browser shows only their empty or error state.
// Run: `npx vite build`, serve dist (`cd dist && python3 -m http.server 8765 &`), then
//   node scripts/sim-shots.mjs http://localhost:8765 <outdir> [shot ...]      (default: all). Output: <outdir>/<name>.jpg, 1920x1080.
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
const BASE = process.argv[2];
const OUT = process.argv[3] || '/tmp/shots-new';
const ALL = ['home', 'settings-essentials', 'essentials-edit', 'help-icon-size', 'help-saver', 'help-scroll-speed', 'settings-thai', 'cities-thailand', 'wallpaper-help'];
const WANT = process.argv.slice(4).length ? process.argv.slice(4) : ALL;
mkdirSync(OUT, {recursive: true});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// catalogue apps without a bundled icon (they would show a letter) and the two duplicate entries
const cat = readFileSync(new URL('../src/config/catalog.ts', import.meta.url), 'utf8');
const NO_ICON = [...cat.matchAll(/\{id: '([^']+)', title: '[^']+'(?:, color: '[^']+')?\}/g)].map((m) => m[1]).concat(['com.apple.tv', 'plex']);
const PHOTO = 'photo-01';
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});

async function open (config) {
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}});
  await ctx.addInitScript(({config}) => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', {get: () => window.__hidden, configurable: true});
    localStorage.setItem('customlauncher-config-v1', JSON.stringify(Object.assign({defaultsV: 1, quietSec: 0, showDebug: false, language: 'en'}, config || {})));
  }, {config});
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e)));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.tile', {timeout: 20000});
  await sleep(2500);
  page.ctx = ctx;
  return page;
}
const key = async (page, k, n = 1, gap = 150) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); } };
// the footer line `Hearth 2.1.6 · Root: checking…` only reads like that in a browser (no TV to ask): hidden in the shots, nothing else is changed
const snap = async (page, name) => { await page.addStyleTag({content: '.settings__about{visibility:hidden}'}); return page.screenshot({path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88}); };
const settingsOpen = (page) => page.evaluate(() => !!document.querySelector('.screen--settings'));
async function openSettings (page) { await key(page, 'ArrowLeft', 1, 400); await key(page, 'Enter', 1, 1500); if (!(await settingsOpen(page))) throw new Error('Settings did not open'); }
const focusedRow = (page) => page.evaluate(() => { const f = document.querySelector('.settings .option--focused'); const t = (el) => (el ? el.textContent.trim() : ''); return f ? {label: t(f.querySelector('.option__label')), group: f.classList.contains('option--group'), open: f.classList.contains('option--open')} : null; });
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
const base = {background: PHOTO, hiddenIds: NO_ICON};
const tab = (n) => key(page_, 'ArrowRight', n, 450);
let page_ = null;
const T = {};
T['home'] = async (p) => { await sleep(500); await snap(p, 'home'); };
T['settings-essentials'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 1, 600); await key(p, 'ArrowDown', 1, 500); await snap(p, 'settings-essentials'); };
T['essentials-edit'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 1, 600); const r = await findRow(p, /^Edit Essentials/); if (!r) throw new Error('no Edit Essentials row'); await key(p, 'Enter', 1, 900); await snap(p, 'essentials-edit'); };
T['help-icon-size'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 2, 600); const r = await findRow(p, /^Icon size/); if (!r) throw new Error('no Icon size row'); await sleep(600); await snap(p, 'help-icon-size'); };
T['help-saver'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 5, 600); const r = await findRow(p, /^Screensaver: picture size/); if (!r) throw new Error('no saver size row'); await sleep(600); await snap(p, 'help-saver'); };
T['help-scroll-speed'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 2, 600); const r = await findRow(p, /scroll speed/i); if (!r) throw new Error('no scroll speed row'); await sleep(600); await snap(p, 'help-scroll-speed'); };
T['settings-thai'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 2, 600); await key(p, 'ArrowDown', 2, 400); await snap(p, 'settings-thai'); };
T['cities-thailand'] = async (p) => {
  await openSettings(p); await key(p, 'ArrowRight', 3, 600);
  const r = await findRow(p, /^Weather: city$/); if (!r) throw new Error('no city row');
  await key(p, 'Enter', 1, 900);
  for (let i = 0; i < 40; i++) {
    const t = await p.evaluate(() => { const f = document.querySelector('.picker__row--focused'); return f ? f.textContent.trim() : ''; });
    if (/^Thailand/.test(t)) break;
    await key(p, 'ArrowDown', 1, 120);
  }
  await sleep(500); await snap(p, 'cities-thailand');
};
T['wallpaper-help'] = async (p) => { await openSettings(p); await key(p, 'ArrowRight', 4, 600); await key(p, 'ArrowDown', 1, 500); await sleep(600); await snap(p, 'wallpaper-help'); };
const CONFIG = {'settings-thai': {language: 'th'}};
const log = [];
for (const name of WANT) {
  let p = null;
  try {
    p = await open(Object.assign({}, base, CONFIG[name] || {}));
    page_ = p;
    await Promise.race([T[name](p), sleep(60000).then(() => { throw new Error('watchdog'); })]);
    log.push(`ok   ${name}${p.errs.length ? ' (page errors: ' + p.errs.join(' | ') + ')' : ''}`);
  } catch (e) { log.push(`FAIL ${name}: ${e.message}`); }
  if (p) await p.ctx.close();
}
await browser.close();
console.log(log.join('\n'));
console.log(`hidden for no icon: ${NO_ICON.length} ids`);
writeFileSync(`${OUT}/report.txt`, log.join('\n') + '\n');
