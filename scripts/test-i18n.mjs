// Tests for the string table (src/i18n, T1): t/td lookups, placeholders, language merge with English fallback,
// and that every Settings row in src/lib/prefs.ts has its label and description in en.ts.   Run: npm test
import {build} from 'esbuild';
const bundle = async (entry, name) => {
  const out = new URL(`../node_modules/.cache-${name}-test.mjs`, import.meta.url).pathname;
  await build({stdin: {contents: entry, resolveDir: new URL('../src/', import.meta.url).pathname, loader: 'ts'}, bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
    plugins: [{name: 'stub-apps', setup(b) {
      b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
      b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
    }}]});
  return import(out);
};
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }};
let fails = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', msg, JSON.stringify(a), '!==', JSON.stringify(b)); } else console.log('ok  ', msg); };

// one bundle: the Settings rows must share the string table that setStrings changes
const all = await bundle("export * as i from './i18n/index.ts'; export * as e from './i18n/en.ts'; export * as p from './lib/prefs.ts';", 'i18n');
const {i, e, p} = all;

eq(i.t('pref.theme.label'), 'Current theme', 't: English text by key');
eq(i.t('disabled.needsRoot', {why: 'x'}), 'Needs a rooted TV: x', 't: placeholder filled');
eq(i.t('disabled.needsRoot'), 'Needs a rooted TV: {why}', 't: unfilled placeholder stays visible');
eq(i.td('no.such.key'), 'no.such.key', 'td: unknown key reads as the key');
i.setStrings({'pref.theme.label': 'Thema'});
eq([i.t('pref.theme.label'), i.t('pref.quietSec.label')], ['Thema', 'Quiet mode'], 'a language overrides its keys, the rest falls back to English');
eq(p.findPref('theme').label, 'Thema', 'Settings rows read the language at read time');
i.setStrings(null);
eq(p.findPref('theme').label, 'Current theme', 'back to English');
eq(p.PREFS.filter((x) => !(('pref.' + x.id + '.label') in e.en) || !(('pref.' + x.id + '.desc') in e.en)).map((x) => x.id), [], 'every Settings row has label and description in en.ts');
eq(p.PREFS.map((x) => x.group).filter((g, i, a) => g && a.indexOf(g) === i && !(('group.' + g) in e.en)), [], 'every Settings group name has a header text in en.ts');
eq(Object.keys(e.en).filter((k) => (e.en[k].match(/\{(\w+)\}/g) || []).length === 0 && /\{|\}/.test(e.en[k])), [], 'no stray braces in texts');
eq(Object.keys(e.en).filter((k) => !/^[a-zA-Z0-9. -]+$/.test(k)), [], 'keys use letters, digits, dots, spaces and hyphens only (group and background ids)');
import {readdirSync, readFileSync} from 'node:fs';
const files = []; (function walk (d) { readdirSync(d, {withFileTypes: true}).forEach((x) => { const f = d + '/' + x.name; if (x.isDirectory()) walk(f); else if (/\.tsx?$/.test(x.name) && !/i18n\/en\.ts$/.test(f)) files.push(f); }); })(new URL('../src', import.meta.url).pathname);
const missing = [];
files.forEach((f) => { const src = readFileSync(f, 'utf8'); for (const m of src.matchAll(/\btt\('([^']+)'/g)) if (!(m[1] in e.en)) missing.push(f.split('/src/')[1] + ': ' + m[1]); });
eq(missing, [], 'every tt(key) used in the source exists in en.ts');
console.log(fails ? `${fails} FAILED` : 'all ok');
if (fails) process.exit(1);
