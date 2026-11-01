// Tests for src/lib/recency.ts (Order by last opened).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-recency-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/recency.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const o = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const k = (x) => x;
eq(o.noteRecent(['a', 'b'], 'c'), ['c', 'a', 'b'], 'a new tile goes to the front');
eq(o.noteRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b'], 'an opened tile moves to the front once');
eq(o.noteRecent(Array.from({length: 80}, (_, i) => 'k' + i), 'n').length, 80, 'the list is capped');
eq(o.orderByRecent(['a', 'b', 'c', 'd'], k, ['c', 'a'], []), ['c', 'a', 'b', 'd'], 'opened first (newest first), never opened keep their order');
eq(o.orderByRecent(['a', 'b', 'c'], k, [], []), ['a', 'b', 'c'], 'nothing opened yet: the manual order');
eq(o.orderByRecent(['a', 'b', 'c', 'd'], k, ['d', 'gone', 'b'], []), ['d', 'b', 'a', 'c'], 'a key no longer on the row is ignored');
eq(o.orderByRecent(['a', 'b', 'c', 'd'], k, ['d', 'c', 'b'], ['b']), ['d', 'b', 'c', 'a'], 'a favourite keeps its place (b stays second); the others follow the recent list');
eq(o.orderByRecent(['a', 'b', 'c'], k, ['c', 'b', 'a'], ['a', 'b', 'c']), ['a', 'b', 'c'], 'all favourites: unchanged');
eq(o.orderByRecent(['a', 'a2'], k, ['a2', 'a2', 'a'], []), ['a2', 'a'], 'a repeated key counts once');
process.exit(fail ? 1 : 0);
