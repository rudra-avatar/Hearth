// Tests for src/lib/inputidle.ts (W1: a wallpaper change waits for a quiet moment).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-inputidle-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/inputidle.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const g = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const mk = () => {
	let now = 0; let id = 0; const q = new Map();
	return {
		clock: {now: () => now, set: (fn, ms) => { q.set(++id, {at: now + ms, fn}); return id; }, clear: (i) => { q.delete(i); }},
		tick(ms) { const to = now + ms; for (;;) { let best = null; for (const [i, v] of q) if (v.at <= to && (!best || v.at < best[1].at)) best = [i, v]; if (!best) break; q.delete(best[0]); now = best[1].at; best[1].fn(); } now = to; },
		pending: () => q.size
	};
};

let c = mk(); let idle = g.createInputIdle(c.clock); let ran = [];
idle.whenQuiet((w) => ran.push(w));
c.tick(2900);
eq(ran, [], 'nothing runs before 3 s of quiet');
c.tick(200);
eq(ran.length, 1, 'runs once after 3 s of quiet');
eq(c.pending(), 0, 'no timer left after it ran');

c = mk(); idle = g.createInputIdle(c.clock); ran = [];
idle.whenQuiet((w) => ran.push(w));
c.tick(2000); idle.note(); c.tick(2500);
eq(ran, [], 'an input restarts the wait');
c.tick(1000);
eq(ran.length, 1, 'runs 3 s after the last input');

c = mk(); idle = g.createInputIdle(c.clock); ran = [];
const cancel = idle.whenQuiet((w) => ran.push(w));
c.tick(1000); cancel(); c.tick(10000);
eq([ran, c.pending()], [[], 0], 'cancel stops it and leaves no timer');

c = mk(); idle = g.createInputIdle(c.clock); ran = [];
idle.whenQuiet((w) => ran.push(w));
for (let i = 0; i < 130; i++) { c.tick(500); idle.note(); }
eq(ran.length, 1, 'with constant input it runs anyway after the maximum wait');
eq(ran[0] >= 60000 && ran[0] < 61000, true, 'the maximum wait is 60 s');

c = mk(); idle = g.createInputIdle(c.clock); ran = [];
c.tick(10000);
idle.whenQuiet((w) => ran.push(w));
c.tick(600);
eq(ran.length, 1, 'long idle before the call: it runs after the first poll');
process.exit(fail ? 1 : 0);
