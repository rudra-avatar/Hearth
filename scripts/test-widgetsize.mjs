// Tests for the widget text sizes and the size label in src/lib/clock.ts (2.1.6 p2).   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const src = new URL('../src/lib/', import.meta.url).pathname;
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, bundle: true, format: 'esm', platform: 'node', logLevel: 'error', stdin: {contents: `export * from './clock';`, resolveDir: src, loader: 'ts'}, outfile: dir + '.cache-widgetsize-test.mjs'});
const c = await import(dir + '.cache-widgetsize-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq([80, 100, 140, 190, 240].map(c.dateFontPx), [20, 20, 28, 42, 58], 'date size: floor 20, share 20% up to 140 px, then growing to 24%');
eq([80, 100, 140, 190, 240].map(c.weatherFontPx), [20, 20, 24, 35, 48], 'weather size: floor 20, share 17% up to 140 px, then growing to 20%');
eq([40, 80, 140, 220, 240].map(c.sizeLabel), [0, 40, 100, 180, 200], 'label = saved px minus 40');
eq(c.dateFontPx(140) === Math.round(140 * 0.2) && c.weatherFontPx(140) === Math.round(140 * 0.17), true, 'no change at 140 px (the old default) except the lower floors');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
