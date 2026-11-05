// Probe tests 42-43 (2.0.3 R7): the hit parser and verdict, and the probe script run on a fake TV (temp keybinds file, no hook).
// Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-probehome-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probehomecmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

eq(h.groupHits([10, 10.05, 14, 14.5, 15, 15.5, 16.4]), [{hits: 2, span: 0.05}, {hits: 5, span: 2.4}], 'groups: hits within 1.2 s are one press');
eq(h.homeVerdict([{hits: 1, span: 0}, {hits: 1, span: 0}]), 'one hit per press only: the hook gives no timing', 'verdict: one hit per press');
eq(h.homeVerdict([{hits: 1, span: 0}, {hits: 6, span: 2.8}]).startsWith('repeats seen'), true, 'verdict: repeats');
eq(h.homeVerdict([{hits: 2, span: 0.1}, {hits: 2, span: 2.9}]).startsWith('down and up seen'), true, 'verdict: down and up');
eq(h.homeVerdict([]), 'no hits', 'verdict: none');
const p = h.parseHomeProbe('hits=3\nt=100.10\nt=104.00\nt=104.50\nlog=x\ninjected=1\nrestored=1\n');
eq([p.hits, p.times.length, p.groups.length, p.injected, p.restored], [3, 3, 2, true, true], 'parse: read output');
eq(h.homeProbeText(p).includes('2 hits over 0.50 s'), true, 'text: groups shown');
eq(h.homeProbeText(h.parseHomeProbe('hits=0\ninjected=0\nrestored=1\n')).startsWith('NOTHING'), true, 'text: no hits, hook not running');
eq(h.parseHomeProbe('').seen, false, 'parse: empty output means test 42 was not run');

// the script on a fake TV
const dir = mkdtempSync(join(tmpdir(), 'hp-'));
const keys = join(dir, 'keybinds.json'), hp = join(dir, 'probe');
execSync(`mkdir -p ${hp}`);
writeFileSync(join(dir, 'probe.sh'), h.HOME_PROBE_SH);
const env = `KEYS=${keys} HP_DIR=${hp} HP_NOAUTO=1`;
const sh = (a) => execSync(`${env} sh ${join(dir, 'probe.sh')} ${a}`).toString();
const orig = {'773': {action: 'launch', id: 'tld.my.customlauncher'}, '400': {action: 'ignore'}};
writeFileSync(keys, JSON.stringify(orig));
let o = sh('start');
eq(/started=1/.test(o) && /code=773/.test(o), true, 'script: start reports started and the code');
let k = JSON.parse(readFileSync(keys, 'utf8'));
eq([k['773'].action, k['400'].action], ['exec', 'ignore'], 'script: Home code swapped, other buttons untouched');
execSync(`sh ${hp}/hit.sh; sleep 0.2; sh ${hp}/hit.sh`);
o = sh('start');
eq(JSON.parse(readFileSync(keys, 'utf8'))['773'].action, 'exec', 'script: a second start keeps the first backup (no overwrite with the probe file)');
execSync(`sh ${hp}/hit.sh; sleep 0.2; sh ${hp}/hit.sh`);
o = sh('read');
const r = h.parseHomeProbe(o);
eq([r.hits, r.restored], [2, true], 'script: read counts the hits (start clears the file) and restores');
eq(JSON.parse(readFileSync(keys, 'utf8')), orig, 'script: keybinds back exactly as before');
eq(/restored=0/.test(sh('restore')), true, 'script: restore twice is harmless');
// no keybinds file at all
rmSync(keys); rmSync(hp, {recursive: true}); execSync(`mkdir -p ${hp}`);
sh('start');
sh('read');
eq(existsSync(keys) ? readFileSync(keys, 'utf8').trim() : 'gone', '{}', 'script: no file before -> empty object after');
rmSync(dir, {recursive: true});
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
