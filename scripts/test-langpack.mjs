// Tests for language files (T2b): validation against the English table, the shell read, keeping/applying/removing a pack,
// and that docs/languages/en.json is the current English table.   Run: npm test
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {baseFileText} from './gen-language-base.mjs';
import {readBundled, indexText} from './gen-bundled-languages.mjs';

const out = new URL('../node_modules/.cache-langpack-test.mjs', import.meta.url).pathname;
await build({
  stdin: {contents: "export * from './lib/langpack'; export * from './i18n/pack'; export * from './i18n'; export {en} from './i18n/en';", resolveDir: new URL('../src', import.meta.url).pathname, loader: 'ts'},
  bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub-apps', setup(b) {
    b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => "\'" + v + "\'";', loader: 'js'}));
  }}]
});
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
const m = await import(out);
let fails = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', msg, JSON.stringify(a), '!==', JSON.stringify(b)); } else console.log('ok  ', msg); };
const pack = (o) => JSON.stringify({format: 1, language: 'Testsprache', code: 'de', strings: {'pref.theme.label': 'Thema'}, ...o});

const good = m.validatePack(pack({}));
eq([good.ok, good.name, good.code, good.strings['pref.theme.label'], good.ignored, good.missing === Object.keys(m.en).length - 1], [true, 'Testsprache', 'de', 'Thema', 0, true], 'a valid pack is accepted');
eq(m.validatePack('{nope').ok, false, 'not JSON is refused');
eq(m.validatePack('[]').ok, false, 'an array is refused');
eq(m.validatePack(pack({format: 2})).ok, false, 'format other than 1 is refused');
eq(m.validatePack(pack({language: ''})).ok, false, 'an empty language name is refused');
eq(m.validatePack(pack({language: 'x'.repeat(31)})).ok, false, 'a language name over 30 characters is refused');
eq(m.validatePack(pack({code: 'not a code'})).ok, false, 'a wrong language code is refused');
eq(m.validatePack(pack({strings: []})).ok, false, 'strings must be an object');
eq(m.validatePack('\uFEFF' + pack({})).ok, true, 'a leading BOM is accepted');
const unknown = m.validatePack(pack({strings: {'pref.theme.label': 'Thema', 'no.such.key': 'x'}}));
eq([unknown.ok, unknown.ignored, Object.keys(unknown.strings).length], [true, 1, 1], 'unknown keys are left out and counted');
eq(m.validatePack('{"format":1,"language":"X","strings":{"__proto__":"y","pref.theme.label":"T"}}').ignored, 1, 'a __proto__ key is left out');
eq(m.validatePack(pack({strings: {'no.such.key': 'x'}})).ok, false, 'a pack with no matching key is refused');
eq(m.validatePack(pack({strings: {'pref.theme.label': ''}})).ok, false, 'an empty text is refused');
eq(m.validatePack(pack({strings: {'pref.theme.label': 'a\u0001b'}})).ok, false, 'a control character is refused');
const withHolder = Object.keys(m.en).filter((k) => /\{\w+\}/.test(m.en[k]))[0];
eq(m.validatePack(pack({strings: {[withHolder]: 'no placeholder'}})).ok, false, 'a text without the English {placeholders} is refused');
eq(m.validatePack(pack({strings: {[withHolder]: m.en[withHolder] + ' !'}})).ok, true, 'a text that keeps the {placeholders} is accepted');
eq(m.validatePack(pack({strings: {[withHolder]: m.en[withHolder] + ' {extra}'}})).ok, false, 'an extra {placeholder} is refused');
const many = {}; Object.keys(m.en).slice(0, 12).forEach((k) => { many[k] = ''; });
const manyErr = m.validatePack(pack({strings: many}));
eq([manyErr.ok, manyErr.errors.length], [false, 6], 'at most 5 errors are listed, then a count');

eq(m.parseRead('@@NOFILE\n').noFile, true, 'read: no file');
eq(m.parseRead('@@SIZE 12\n{"a":1}').text, '{"a":1}', 'read: text after the size line');
eq(m.parseRead('@@SIZE 12\r\n{"a":1}').size, 12, 'read: size with CRLF');
eq(/^Q='\/media\/developer\/languages\/a b\.json';/.test(m.readCommand('/media/developer/languages/a b.json')), true, 'read: the path is quoted');

// keeping and applying
eq(m.hasPack(), false, 'no pack kept at first');
m.keepPack(good);
eq([m.hasPack(), m.packName()], [true, 'Testsprache'], 'a kept pack has its name');
eq(m.t('pref.theme.label'), 'Current theme', 'kept but not in use: English');
m.applyLanguage('pack');
eq([m.t('pref.theme.label'), m.t('pref.quietSec.label')], ['Thema', 'Quiet mode'], 'in use: its texts, English for the rest');
eq(store[m.ACTIVE_KEY], 'pack', 'the choice is kept for the next start');
m.applyLanguage('en');
eq([m.t('pref.theme.label'), store[m.ACTIVE_KEY]], ['Current theme', 'en'], 'back to English');
m.applyLanguage('pack');
m.removePack();
eq([m.hasPack(), m.t('pref.theme.label')], [false, 'Current theme'], 'removing the pack goes back to English');
m.applyLanguage('pack');
eq(m.t('pref.theme.label'), 'Current theme', 'the pack setting with no pack kept reads English');
// start-up
m.keepPack(good); store[m.ACTIVE_KEY] = 'pack';
m.applyKeptAtStart();
eq(m.t('pref.theme.label'), 'Thema', 'start-up applies the pack that was in use');

eq(readFileSync(new URL('../docs/languages/en.json', import.meta.url), 'utf8') === baseFileText(), true, 'docs/languages/en.json is the current English table (run node scripts/gen-language-base.mjs)');
{ const b = readBundled(); eq(b.errors, [], 'every pack in docs/languages/packs is valid');
  eq(readFileSync(new URL('../src/config/bundledlanguages.ts', import.meta.url), 'utf8') === indexText(b.list), true, 'src/config/bundledlanguages.ts lists the packs (run node scripts/gen-bundled-languages.mjs)'); }
store['hearth-langbundled-v1'] = JSON.stringify({code: 'xx', v: '0', strings: {'pref.theme.label': 'Bundled'}});
m.applyLanguage('xx'); eq([m.t('pref.theme.label'), store['hearth-langactive-v1']], ['Bundled', 'xx'], 'a stored bundled language is applied (older version copy too)');
eq(m.bundledReady('xx'), false, 'a bundled copy of another version is stale (refreshed by the app)');
m.applyLanguage('en'); eq(m.t('pref.theme.label') !== 'Bundled', true, 'English comes back');
const base = m.validatePack(baseFileText());
eq([base.ok, base.missing, base.ignored], [true, 0, 0], 'the English base file is itself a valid pack');
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
