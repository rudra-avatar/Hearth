// T3: language upkeep for translators and for the release.
//   node scripts/lang-check.mjs             lists texts new / changed / removed since the last release, then checks every pack in docs/languages/packs/
//   node scripts/lang-check.mjs --snapshot  stores the current English table as the baseline (docs/languages/release-en.json); run once in P49, after the release ipk is made
// Output is plain text: give the "new or changed" list to translators. Reads src/i18n/en.ts only; changes nothing without --snapshot.
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {readEnglish} from './gen-language-base.mjs';

const dir = new URL('../docs/languages/', import.meta.url);
const BASE = new URL('release-en.json', dir);
const PACKS = new URL('packs/', dir);
const en = readEnglish();
const keys = Object.keys(en);

if (process.argv.includes('--snapshot')) {
  writeFileSync(BASE, JSON.stringify(en, null, 2) + '\n');
  console.log('baseline written: ' + keys.length + ' texts (docs/languages/release-en.json)');
  process.exit(0);
}

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
const added = [], changed = [], removed = [];
if (!base) {
  console.log('No baseline (docs/languages/release-en.json): every text counts as new (' + keys.length + ').');
  added.push(...keys);
} else {
  for (const k of keys) { if (!(k in base)) added.push(k); else if (base[k] !== en[k]) changed.push(k); }
  for (const k of Object.keys(base)) if (!(k in en)) removed.push(k);
  console.log(`Since the last release: ${added.length} new, ${changed.length} changed, ${removed.length} removed (of ${keys.length}).`);
}
const show = (title, list, old) => {
  if (!list.length) return;
  console.log('\n' + title);
  for (const k of list) console.log(`  ${k}: ${JSON.stringify(en[k])}` + (old ? `   (was ${JSON.stringify(base[k])})` : ''));
};
if (base) { show('NEW (translate these):', added); show('CHANGED (re-check these):', changed, true); }
if (removed.length) console.log('\nREMOVED (delete from packs):\n  ' + removed.join('\n  '));

const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const EMPTY_OK = ['homekey.pluralSuffix'];   // may be empty (no plural ending); same list in gen-bundled-languages.mjs and src/lib/langpack.ts
if (existsSync(PACKS)) {
  const files = readdirSync(PACKS).filter((f) => f.endsWith('.json')).sort();
  if (files.length) console.log('\nPacks (docs/languages/packs):');
  for (const f of files) {
    let p;
    try { p = JSON.parse(readFileSync(new URL(f, PACKS), 'utf8').replace(/^﻿/, '')); } catch (e) { console.log(`  ${f}: NOT VALID JSON`); continue; }
    const s = p && p.strings && typeof p.strings === 'object' ? p.strings : {};
    const bad = [];
    if (p.format !== 1) bad.push('format is not 1');
    const have = Object.keys(s).filter((k) => k in en);
    const unknown = Object.keys(s).length - have.length;
    for (const k of have) if (typeof s[k] !== 'string' || (!s[k] && EMPTY_OK.indexOf(k) < 0) || ph(s[k]) !== ph(en[k])) bad.push('bad text/placeholders: ' + k);
    const missing = keys.filter((k) => !(k in s));
    const stale = changed.filter((k) => k in s);
    console.log(`  ${f} (${p.language}): ${have.length}/${keys.length} texts, ${missing.length} missing (English shown), ${stale.length} possibly outdated, ${unknown} unknown keys` + (bad.length ? `, PROBLEMS: ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? ` and ${bad.length - 5} more` : ''}` : ''));
  }
}
