// Tests for src/lib/pointerguard.ts (quiet mode pointer wake guard, 2.1.6 M1: only a waking press is used up).   Run: npm test
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
		tick(ms) {
			const to = now + ms;
			for (;;) {
				let best = null;
				for (const [i, v] of q) if (v.at <= to && (!best || v.at < best[1].at)) best = [i, v];
				if (!best) break;
				q.delete(best[0]); now = best[1].at; best[1].fn();
			}
			now = to;
		}
	};
};
const H = ['mousemove', 'mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'];

let c = mk(); let p = g.createPointerGuard(c.timers);
eq(H.map((k) => p.blocks(k)), H.map(() => false), 'asleep guard blocks nothing');
eq(p.blocks('wheel'), false, 'wheel is never blocked');

p.wake('mousemove');
eq(H.map((k) => p.blocks(k)), H.map(() => false), 'a waking move holds nothing back (hover and clicks work at once)');

p = g.createPointerGuard(c.timers); p.wake('mousedown');
eq(['mousemove', 'mouseover', 'mouseenter'].map((k) => p.blocks(k)), [false, false, false], 'a press wake never blocks hover or moves');
eq(p.blocks('mousedown'), true, 'the waking press itself is used up');
eq(p.blocks('mouseup'), true, 'its release is used up');
eq(p.blocks('click'), true, 'its click is used up');
eq(p.blocks('click'), false, 'the next click goes through');
eq(p.blocks('mousedown'), false, 'and the next press');

p = g.createPointerGuard(c.timers); p.wake('mousedown'); p.blocks('mousedown'); p.blocks('mouseup');
c.tick(399);
eq(p.blocks('click'), true, 'a click 399 ms after the release is still the waking one');
p = g.createPointerGuard(c.timers); p.wake('mousedown'); p.blocks('mousedown'); p.blocks('mouseup');
c.tick(401);
eq(p.blocks('click'), false, 'a release that made no click (dragged off) frees the next click after 400 ms');

p = g.createPointerGuard(c.timers); p.wake('mousedown');
c.tick(10001);
eq(p.blocks('mouseup'), false, 'the press flag cannot stick: 10 s at the latest');

p = g.createPointerGuard(c.timers); p.wake('mousedown'); p.stop();
eq(p.blocks('click'), false, 'stop ends the press flag');
p = g.createPointerGuard(c.timers); p.wake('wheel');
eq(p.blocks('click'), false, 'a wheel wake blocks nothing');

p = g.createPointerGuard(c.timers);
eq([p.sameSpot(10, 10), p.sameSpot(10, 10), p.sameSpot(11, 10), p.sameSpot(11, 10)], [false, true, false, true], 'same-spot moves are synthetic');
p = g.createPointerGuard(c.timers);
eq([p.farEnough(10, 10), p.farEnough(11, 11), p.farEnough(12, 12), p.farEnough(13, 10), p.farEnough(14, 11)], [true, false, false, true, false], 'tremor under 3 px from the last counted point is ignored');
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
