// Phase 10h: Debug RAM warning and single storage line, dimmer Settings backdrop on light themes.   Run: npm test
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url)) + '/';
const src = path.resolve(dir, '../src') + '/';
const out = path.resolve(dir, '../node_modules/.cache-p10h-test.mjs');
await build({stdin: {contents: `export {debugPages} from './lib/debuginfo'; export {DEFAULT_CONFIG} from './lib/storage';`, resolveDir: src, loader: 'ts'},
	bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent'});
const a = await import(out);
let fail = 0;
const eq = (got, want, name) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`)); if (!ok) fail++; };
const disks = [{mount: '/', totalMB: 1200, freeMB: 0}, {mount: '/var', totalMB: 722, freeMB: 255}, {mount: '/mnt/lg/appstore', totalMB: 2000, freeMB: 720}];
const page2 = (stats) => a.debugPages({about: '', rootDetail: '', appList: null, weather: 'off', config: a.DEFAULT_CONFIG, events: [], userAgent: 'Chrome/87.0', stats})[1].lines.join('\n');
const ok = page2({disks});
eq([ok.indexOf('Storage /mnt/lg/appstore') !== -1, ok.indexOf('Storage /var') === -1, ok.indexOf('Storage /:') === -1], [true, true, true], 'only the app storage line is listed');
eq(page2({disks: disks.slice(0, 2)}).split('Storage').length - 1, 2, 'a TV without that mount still lists what it has');
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
