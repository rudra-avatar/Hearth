// Tests for src/lib/pointerguard.ts (quiet mode pointer wake guard).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-pointerguard-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/pointerguard.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const g = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
// fake clock
const mk = () => {
	let now = 0; let id = 0; const q = new Map();
	return {
		timers: {set: (fn, ms) => { q.set(++id, {at: now + ms, fn}); return id; }, clear: (i) => { q.delete(i); }},
		tick(ms) { const to = now + ms; for (;;) { let best = null; for (const [i, v] of q) if (v.at <= to && (!best || v.at < best[1].at)) best = [i, v]; if (!best) break; q.delete(best[0]); now = best[1].at; best[1].fn(); } now = to; }
	};
};
const H = ['mousemove', 'mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'];

let c = mk(); let p = g.createPointerGuard(c.timers);
eq(H.map((k) => p.blocks(k)), H.map(() => false), 'asleep guard blocks nothing');
eq(p.blocks('wheel'), false, 'wheel is never blocked');

p.wake('mousemove');
eq(H.map((k) => p.blocks(k)), H.map(() => true), 'after a waking move all pointer events are blocked');
c.tick(399);
eq(p.blocks('click'), true, 'still blocked at 399 ms');
c.tick(2);
eq(p.blocks('click'), false, 'free after 400 ms of rest');
eq(p.blocks('mouseup'), false, 'a move wake leaves no release to use up');

p = g.createPointerGuard(c.timers); p.wake('mousemove');
for (let i = 0; i < 4; i++) { c.tick(300); p.move(); }
eq(p.blocks('mouseover'), true, 'a pointer kept moving stays blocked');
c.tick(1500 - 4 * 300 + 1);
eq(p.blocks('mouseover'), false, 'but at most 1.5 s after the wake');

p = g.createPointerGuard(c.timers); p.wake('mousedown');
c.tick(500);
eq(p.blocks('mouseover'), false, 'a press wake: hover free after rest');
eq(p.blocks('mouseup'), true, 'its release is used up');
eq(p.blocks('click'), true, 'its click is used up');
eq(p.blocks('click'), false, 'the next click goes through');

p = g.createPointerGuard(c.timers);
eq([p.sameSpot(10, 10), p.sameSpot(10, 10), p.sameSpot(11, 10), p.sameSpot(11, 10)], [false, true, false, true], 'same-spot moves are synthetic');
p.wake('wheel'); eq(p.blocks('mousemove'), true, 'a wheel wake guards the moves after it');
p.stop(); eq(p.blocks('mousemove'), false, 'stop ends the guard');
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
