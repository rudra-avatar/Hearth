// SAM stand-in method (2.0.3 R3): the pure command module and the install steps, replayed on a fake TV folder.   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, readFileSync, existsSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-samhomecmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/samhomecmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

eq(h.parseSamResult('x\napplied\n'), 'applied', 'result: applied');
eq(h.parseSamResult('applied\nneeds-restart\n'), 'needs-restart', 'result: the last word wins');
eq(h.parseSamResult('busy\n[exit 0]'), 'busy', 'result: busy');
eq(h.parseSamResult('garbage'), 'failed', 'result: anything else is a failure');
eq(h.parseSamStatus('enabled\nmounted\nweb\nlinked\nwatching\nrestart-used\n'), {enabled: true, mounted: true, web: true, linked: true, watching: true, restartUsed: true}, 'status: all words');
eq(h.parseSamStatus(''), {enabled: false, mounted: false, web: false, linked: false, watching: false, restartUsed: false}, 'status: nothing installed');
eq(h.samIsOn(null), false, 'on: unknown is not on');
eq(h.samIsOn(h.parseSamStatus('linked\n')), true, 'on: the link alone counts');
eq(h.samIsOn(h.parseSamStatus('mounted\n')), false, 'on: a mount alone is not the setting');

// the install steps on a fake folder
const root = mkdtempSync(join(tmpdir(), 'sam-'));
const dir = join(root, 'launcher-takeover');
const fix = (c) => c.split(h.SAM_DIR).join(dir);
const files = {takeoverSh: '#!/bin/sh\necho "x" # ' + 'a'.repeat(9000) + '\n', shimHtml: '<html>\xe9</html>'.replace('\xe9', 'e')};
const steps = h.samInstallSteps(files);
steps.forEach((s) => execSync(fix(s.command), {shell: '/bin/sh'}));
eq(readFileSync(join(dir, 'takeover.sh'), 'utf8'), files.takeoverSh, 'install: script written whole across chunks');
eq(readFileSync(join(dir, 'shim.html'), 'utf8'), files.shimHtml, 'install: shim written');
eq(readFileSync(join(dir, 'version'), 'utf8').trim(), h.SAM_VERSION, 'install: version written');
eq(existsSync(join(dir, 'allow-restart')), true, 'install: restart permission written (the pop-up is the consent)');
eq(existsSync(join(dir, 'takeover.sh.new')), false, 'install: no temporary files left');
rmSync(join(dir, 'allow-restart'));
h.samRewriteSteps(files).forEach((s) => execSync(fix(s.command), {shell: '/bin/sh'}));
eq(existsSync(join(dir, 'allow-restart')), false, 'rewrite: does not grant the restart permission');
eq(h.SAM_ON_COMMAND.includes('takeover.sh'), true, 'on command runs the script');
rmSync(root, {recursive: true, force: true});
console.log(fail ? 'FAILED' : 'samhomecmd: all passed');
process.exit(fail ? 1 : 0);
