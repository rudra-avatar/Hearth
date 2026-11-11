// Tests for src/lib/noupdatecmd.ts (one-time clean-up of the removed update-block row and pop-up probes, 2.1.6).   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const src = new URL('../src/lib/', import.meta.url).pathname;
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, bundle: true, format: 'esm', platform: 'node', logLevel: 'error', stdin: {contents: `export * from './noupdatecmd';`, resolveDir: src, loader: 'ts'}, outfile: dir + '.cache-noupdate-test.mjs'});
const n = await import(dir + '.cache-noupdate-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(n.cleanupFinished('cleanup=none\n'), true, 'nothing there: finished');
eq(n.cleanupFinished('cleanup=done'), true, 'removed: finished');
eq(n.cleanupFinished('cleanup=failed'), false, 'failed: tried again at the next start');
eq(n.cleanupFinished('garbage'), false, 'not an answer: tried again');
eq(n.cleanupFinished({stdout: 'cleanup=done'}), true, 'object answer');
eq(n.LEFTOVERS.map((l) => l[0].split('/').pop()).every((x) => x.indexOf('.') === -1), true, 'link names have no dot');
eq(execSync('sh -n', {input: n.CLEANUP_COMMAND, shell: '/bin/sh'}).toString(), '', 'command is valid shell');
// run for real on a temp tree: the paths are swapped for a temp folder, the updater mount check cannot match there
const tmp = mkdtempSync(join(tmpdir(), 'hearth-clean-'));
const swap = (c) => c.split('/var/lib/webosbrew/init.d').join(tmp + '/init.d').split('/media/developer').join(tmp + '/media');
mkdirSync(tmp + '/init.d', {recursive: true}); mkdirSync(tmp + '/media/launcher-noupdate', {recursive: true}); mkdirSync(tmp + '/media/launcher-popupprobe', {recursive: true});
writeFileSync(tmp + '/media/launcher-noupdate/noupdate.sh', 'x'); writeFileSync(tmp + '/media/launcher-popupprobe/popup.log', 'x');
symlinkSync(tmp + '/media/launcher-noupdate/noupdate.sh', tmp + '/init.d/52-launcher-noupdate'); symlinkSync(tmp + '/media/launcher-popupprobe/popup.log', tmp + '/init.d/53-launcher-popupprobe');
writeFileSync(tmp + '/init.d/90-someone-else', 'keep');
eq(execSync(swap(n.CLEANUP_COMMAND), {shell: '/bin/sh'}).toString().trim(), 'cleanup=done', 'leftovers found and removed');
eq(readdirSync(tmp + '/init.d').join(','), '90-someone-else', 'other start-up links stay');
eq(existsSync(tmp + '/media/launcher-noupdate') || existsSync(tmp + '/media/launcher-popupprobe'), false, 'folders are gone');
eq(execSync(swap(n.CLEANUP_COMMAND), {shell: '/bin/sh'}).toString().trim(), 'cleanup=none', 'second run finds nothing');
rmSync(tmp, {recursive: true, force: true});
if (fail) { console.log(fail + ' failed'); process.exit(1); }
