// p24: the pointer edge-scroll factor follows the row scroll speed (Medium = 1, the old speed).   Run: node scripts/test-scrollspeed.mjs
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-scrollspeed-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/scrollspeed.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub', setup(b) { b.onResolve({filter: /\.\.\/i18n$/}, (a) => ({path: a.path, namespace: 'stub'})); b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const td = (k) => k;'}))}}]});
const {edgeSpeedFactor, repeatInterval, SCROLL_SPEED_IDS} = await import(out);
let fail = 0;
const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
ok(edgeSpeedFactor('medium') === 1, 'Medium keeps the old pointer speed (factor 1)');
const f = SCROLL_SPEED_IDS.map(edgeSpeedFactor);
ok(f.every((v, i) => i === 0 || v > f[i - 1]), `factors rise from Slow to Max (${f.join(', ')})`);
ok(f[0] < 1 && f[3] > 1, 'Slow below, Max above Medium');
ok(edgeSpeedFactor('nope') === 1, 'an unknown value falls back to Medium');
ok(Math.abs(edgeSpeedFactor('fast') - repeatInterval('medium', 99) / repeatInterval('fast', 99)) < 0.01, 'the factor follows the held-key profile');
process.exit(fail ? 1 : 0);
