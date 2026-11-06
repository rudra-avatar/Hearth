// Tests for the update install progress (src/lib/installprogress.ts, 2.1.4).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-installprogress-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/installprogress.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const p = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const T = 20000000;
const L = (...lines) => lines.map((l) => `10:00:00 up=900 ${l}`).join('\n');
const start = L('start target=2.1.3');
eq(p.installProgress('', T).step, 'start', 'no log: start, 0 %');
eq(p.installProgress('@@size 0', T).percent, 0, 'no log, no size: 0');
eq(p.installProgress(start + '\n@@size 0', T), {step: 'start', percent: 3, download: 0}, 'started, nothing downloaded yet: 3 %');
eq(p.installProgress(start + '\n@@size 10000000', T), {step: 'download', percent: 37, download: 50}, 'half downloaded: 50 % of the download, 37 % of the bar');
eq(p.installProgress(start + '\n@@size 99999999', T).download, 99, 'download shows 99 at most until the script says it is finished');
eq(p.installProgress(start + '\n@@size 5', 0).download, 0, 'unknown total: 0, no division by zero');
eq(p.installProgress(start + '\n' + L('download size=20000000') + '\n@@size 20000000', T), {step: 'check', percent: 70, download: 100}, 'download line: checking the file');
eq(p.installProgress(start + '\n' + L('download size=20000000', 'sha ok') + '\n@@size 20000000', T), {step: 'install', percent: 75, download: 100}, 'sha ok: install step');
eq(p.installProgress(start + '\n' + L('download size=1', 'sha ok', 'try path=/media/developer/hearth-install.ipk', 'luna: {"returnValue":true}', 'luna: {"returnValue":true}') + '\n@@size 1', T).percent, 79, 'two answers from the install service: 79 %');
eq(p.installProgress(start + '\n' + L('sha ok', 'try path=/x', ...Array(30).fill('luna: {"returnValue":true}')) + '\n@@size 1', T).percent, 95, 'many answers: the install step stops at 95 %');
eq(p.installProgress(start + '\n' + L('sha ok', 'try path=/x', 'installed appinfo "version": "2.1.3"') + '\n@@size 0', T), {step: 'finish', percent: 97, download: 100}, 'version read back: finishing');
eq(p.installProgress(start + '\n' + L('sha ok', 'installed appinfo "version": "2.1.3"', 'end') + '\n@@size 0', T).percent, 100, 'end: 100 %');
eq(p.downloadedBytes('x\n@@size 123\n'), 123, 'size line read');
eq(p.downloadedBytes('nothing'), 0, 'no size line: 0');
eq(p.PROGRESS_READ.indexOf('/media/developer/hearth-install.ipk') > 0 && p.PROGRESS_READ.indexOf('/tmp/hearth-install.log') > 0, true, 'the read command names the log and the first install place');
process.exit(fail ? 1 : 0);
