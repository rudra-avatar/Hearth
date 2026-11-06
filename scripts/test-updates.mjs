// Tests for the update list (src/lib/updatecore.ts, repo/updates.json).   Run: npm test
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const out = new URL('../node_modules/.cache-updates-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/updatecore.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

eq(c.compareVersions('2.0.10', '2.0.9') > 0, true, '2.0.10 is newer than 2.0.9 (numbers, not text)');
eq(c.compareVersions('2.1.0', '2.0.99') > 0, true, 'minor beats patch');
eq(c.compareVersions('2.0.3', '2.0.3'), 0, 'equal versions');
eq(c.compareVersions('2.0.3', 'x'), 0, 'not a version: 0');
eq(c.compareVersions('2.0.3-beta', '2.0.2'), 0, 'a suffix is not a version');

const good = readFileSync(new URL('../repo/updates.json', import.meta.url), 'utf8');
const list = c.parseUpdates(good);
eq(list && list.map((e) => e.version), ['2.1.5', '2.1.4', '2.1.3', '2.1.2', '2.1.1', '2.1.0', '2.0.2', '2.0.1', '2.0.0'], 'repo/updates.json reads: nine versions');
eq(list && list.map((e) => e.ipkUrl !== '' && e.sha256.length === 64 && e.size > 0), [true, true, true, true, true, true, false, false, false], '2.1.0 and later carry install facts (each can be chosen); older ones do not');
eq(list && list.filter((e) => e.ipkUrl).every((e) => e.ipkUrl.indexOf('/v' + e.version + '/') > 0 && e.ipkUrl.indexOf('_' + e.version + '_all.ipk') > 0), true, 'every address names its own version');
eq(list && list.every((e) => e.summary.length > 0 && e.summary.every((l) => l.length <= 160)), true, 'every entry has a short summary');

eq(c.parseUpdates('not json'), null, 'not JSON: null');
eq(c.parseUpdates('{"format":2,"versions":[]}'), null, 'wrong format: null');
eq(c.parseUpdates('{"format":1}'), null, 'no versions array: null');
eq(c.parseUpdates('{"format":1,"versions":[]}'), [], 'an empty list is a list');
eq(c.parseUpdates('\uFEFF{"format":1,"versions":[]}'), [], 'a byte-order mark is ignored');

const sha = 'a'.repeat(64);
const url = 'https://github.com/rudra-avatar/Hearth/releases/download/v9.9.9/x.ipk';
const mixed = c.parseUpdates(JSON.stringify({format: 1, versions: [
  {version: '9.9.9', summary: ['ok'], ipkUrl: url, sha256: sha, size: 100},
  {version: '9.9.9', summary: ['duplicate']},
  {version: 'bad', summary: ['skipped']},
  {version: '9.9.8', summary: ['other host'], ipkUrl: 'https://evil.example/x.ipk', sha256: sha, size: 100},
  {version: '9.9.7', summary: ['upper sha'], ipkUrl: url, sha256: 'A'.repeat(64), size: 100},
  {version: '9.9.6', summary: ['huge'], ipkUrl: url, sha256: sha, size: 999999999},
  {version: '9.9.5', summary: ['x'.repeat(500), 5, '', 'a\u0007b', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10']}
]}));
eq(mixed.map((e) => e.version), ['9.9.9', '9.9.8', '9.9.7', '9.9.6', '9.9.5'], 'bad and duplicate versions are skipped');
eq([mixed[0].ipkUrl, mixed[0].size], [url, 100], 'valid install facts are kept');
eq(mixed.slice(1, 4).map((e) => [e.ipkUrl, e.sha256, e.size]), [['', '', 0], ['', '', 0], ['', '', 0]], 'foreign host, upper-case hash, huge size: all three install facts dropped');
eq([mixed[4].summary.length, mixed[4].summary[0].length, mixed[4].summary[1]], [8, 160, 'a b'], 'summary: at most 8 lines, 160 characters, control characters become spaces, non-text lines dropped');

const shuffled = [{version: '2.0.1'}, {version: '2.0.3'}, {version: '2.0.2'}].map((e) => ({...e, date: '', summary: [], ipkUrl: '', sha256: '', size: 0}));
eq(c.newerThan('2.0.1', shuffled).map((e) => e.version), ['2.0.3', '2.0.2'], 'newer versions only, newest first');
eq(c.newerThan('2.0.3', shuffled), [], 'nothing newer: empty list');
eq(c.newerThan('2.0.0', list).map((e) => e.version), ['2.1.5', '2.1.4', '2.1.3', '2.1.2', '2.1.1', '2.1.0', '2.0.2', '2.0.1'], 'from 2.0.0 the list shows 2.1.5, 2.1.4, 2.1.3, 2.1.2, 2.1.1, 2.1.0, 2.0.2 and 2.0.1');

// the address passes the shell-fetch safety pattern of weathernet.ts (used on rooted TVs)
const SAFE_URL = /^https:\/\/[A-Za-z0-9._\/?=&,%-]+$/;
eq(SAFE_URL.test(c.UPDATES_URL + '?v=29000000'), true, 'update list address is shell-safe');
process.exit(fail ? 1 : 0);
