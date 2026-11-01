// The clean-up of the removed SAM method (P28r): the command and its parsers, replayed on a fake TV folder.   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-takeovercmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/takeovercmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

eq(h.parseRemoved('removed\nremoved\n'), true, 'removal confirmed');
eq(h.parseRemoved('still-mounted\n'), false, 'removal not confirmed while the mount is held');
eq(h.parseRemoved(''), false, 'no output is not a confirmation');
eq(h.cleanupMessage(true).length > 20 && h.cleanupMessage(false).length > 20, true, 'a message for both outcomes');
eq(/helper script/.test(h.cleanupMessage(true)), true, 'the message points to the helper script');

// the command on a fake TV: no script installed, nothing mounted -> folder and link are deleted
const root = mkdtempSync(join(tmpdir(), 'tk-'));
const dir = join(root, 'launcher-takeover'), link = join(root, '47-launcher-takeover');
mkdirSync(dir); writeFileSync(join(dir, 'shim.html'), 'x'); writeFileSync(link, 'x');
const cmd = h.REMOVE_COMMAND.split(h.TAKEOVER_DIR).join(dir).split(h.TAKEOVER_LINK).join(link);
const run = execSync(cmd, {shell: '/bin/sh'}).toString();
eq(h.parseRemoved(run), true, 'no script, nothing mounted: removed');
eq(existsSync(dir) || existsSync(link), false, 'and the folder and the start-up link are gone');
// with the installed script: it is run with `off`
mkdirSync(dir); writeFileSync(join(dir, 'takeover.sh'), 'echo "ran $1" > ' + join(root, 'ran') + '\necho removed\n'); writeFileSync(link, 'x');
const run2 = execSync(cmd, {shell: '/bin/sh'}).toString();
eq(/removed/.test(run2) && execSync('cat ' + join(root, 'ran')).toString().trim() === 'ran off', true, 'the installed script is run with off');
rmSync(root, {recursive: true, force: true});
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
