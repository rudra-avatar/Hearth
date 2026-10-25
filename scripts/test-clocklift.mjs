// Tests for moving the stacked Glass cards clear of the app row (liftToClear in src/lib/clock.ts).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-clocklift-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/clock.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(c.liftToClear(300, 800, 840, 28, 36), 0, 'fits above the app row: not moved');
eq(c.liftToClear(300, 812, 840, 28, 36), 0, 'exactly the gap above: not moved');
eq(c.liftToClear(300, 1070, 840, 28, 36), 258, 'overlapping: moved up just enough to leave the gap');
eq(c.liftToClear(100, 1070, 840, 28, 36), 64, 'never moved above the top margin, even if it still overlaps');
eq(c.liftToClear(30, 1070, 840, 28, 36), 0, 'already above the top margin: not moved at all');

// fitCards(corner, top, height, compactHeight, limit, gap, minTop); the app row starts at 840
eq(c.fitCards(false, 300, 400, 330, 840, 28, 36), {lift: 0, compact: false, scale: 1}, 'centred, fits: left alone');
eq(c.fitCards(false, 300, 600, 480, 840, 28, 36), {lift: 88, compact: false, scale: 1}, 'centred, too low: moved up, cards keep the same size');
eq(c.fitCards(false, 300, 900, 650, 840, 28, 36), {lift: 138, compact: true, scale: 1}, 'centred, too tall for two equal cards: the weather card keeps its own height');
eq(c.fitCards(true, 56, 500, 400, 840, 28, 36), {lift: 0, compact: false, scale: 1}, 'corner, fits: full size, as set');
eq(c.fitCards(true, 56, 900, 700, 840, 28, 36), {lift: 0, compact: true, scale: 1}, 'corner, too tall: the weather card keeps its own height first');
eq(c.fitCards(true, 56, 1100, 900, 840, 28, 36), {lift: 0, compact: true, scale: 0.84}, 'corner, still too tall: shrunk just enough to fit');
eq(c.fitCards(true, 56, 1100, 900, 840, 28, 36).lift, 0, 'corner cards are never moved');

// OLED care
const step = 3 * 60 * 1000;
eq(c.shiftAt(0), {x: 0, y: 0}, 'starts where it was placed');
eq(c.shiftAt(step), {x: 8, y: 0}, 'then a step every 3 minutes');
eq(Array.from({length: 9}, (_, i) => c.shiftAt(i * step)).every((p) => Math.abs(p.x) <= 8 && Math.abs(p.y) <= 8), true, 'never more than 8 px away');
eq(new Set(Array.from({length: 9}, (_, i) => JSON.stringify(c.shiftAt(i * step)))).size, 9, 'nine different spots');
eq(c.shiftAt(9 * step), c.shiftAt(0), 'and round again');
process.exit(fail ? 1 : 0);
