// Tests for src/lib/noupdatecmd.ts (Block LG update pop-up, 2.1.5).   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'node:child_process';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const src = new URL('../src/lib/', import.meta.url).pathname;
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, bundle: true, format: 'esm', platform: 'node', logLevel: 'error', stdin: {contents: `export * from './noupdatecmd';`, resolveDir: src, loader: 'ts'}, outfile: dir + '.cache-noupdate-test.mjs'});
const n = await import(dir + '.cache-noupdate-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(n.parseStatus('linked=yes covered=yes present=yes\n'), {linked: true, covered: true, present: true}, 'status read');
eq(n.parseStatus('linked=no covered=no present=no'), {linked: false, covered: false, present: false}, 'status read (nothing)');
eq(n.parseStatus('garbage'), null, 'not an answer: null');
eq(n.noUpdateIsOn(null), false, 'unknown reads as off');
eq(n.noUpdateIsOn({linked: true, covered: false, present: true}), true, 'linked reads as on');
eq(n.NOUPDATE_SCRIPT.indexOf('#!/bin/sh') === 0 && /mount --bind \/dev\/null \/usr\/sbin\/update/.test(n.NOUPDATE_SCRIPT) && /pkill -x update/.test(n.NOUPDATE_SCRIPT), true, 'script covers the updater and stops a running one');
eq(n.NOUPDATE_LINK.split('/').pop().indexOf('.'), -1, 'the link name has no dot (init.d skips names with a dot)');
eq(n.installSteps().length >= 5 && n.installSteps()[n.installSteps().length - 1].command.indexOf('result=ok') > 0, true, 'install ends by printing result=ok');
// the read-only status command is run for real (Z2): it must print all three flags
const out = execSync(n.STATUS_COMMAND, {shell: '/bin/sh'}).toString();
eq(n.parseStatus(out) !== null, true, 'status command output is parsed: ' + out.trim());
eq(execSync('sh -n', {input: n.NOUPDATE_SCRIPT, shell: '/bin/sh'}).toString(), '', 'script is valid shell');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
