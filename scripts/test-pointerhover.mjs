// Tests for the hover gate in src/lib/pointer.ts (2.1.6 M2).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-pointerhover-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/pointer.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
let now = 100000; let tid = 0; const q = new Map(); const handlers = {};
Date.now = () => now;
globalThis.window = {
	addEventListener: (t, f) => { handlers[t] = f; },
	setTimeout: (fn, ms) => { q.set(++tid, {at: now + ms, fn}); return tid; },
	clearTimeout: (i) => { q.delete(i); }
};
let under = null;
globalThis.document = {elementFromPoint: () => under};
const tick = (ms) => {
	const to = now + ms;
	for (;;) {
		let best = null;
		for (const [i, v] of q) if (v.at <= to && (!best || v.at < best[1].at)) best = [i, v];
		if (!best) break;
		q.delete(best[0]); now = best[1].at; best[1].fn();
	}
	now = to;
};
const g = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const ev = (x, y) => ({screenX: x, screenY: y});
const move = (x, y) => handlers.mousemove({screenX: x, screenY: y, clientX: x, clientY: y});

eq(g.hoverGate(ev(1, 1)), 'yes', 'not listening yet: a hover always selects');
g.startPointerGuard();

// 1. first enter after start (position unknown): real, selects
eq(g.hoverGate(ev(100, 100)), 'yes', 'the first enter, position unknown: real, selects');
move(100, 100);
// 2. a tile slides under the still pointer during the glide
now += 50;
eq(g.hoverGate(ev(100, 100)), 'no', 'during the pause a repeat at the same spot is dropped for good (no chain)');
// 3. the pointer really moves during the pause: the hover is kept for later
now += 60; move(150, 100);
eq(g.hoverGate(ev(150, 100)), 'later', 'a real move during the pause: later');
// 4. rest: a hover at the same spot long after the last move
now += 5000;
eq(g.hoverGate(ev(150, 100)), 'no', 'a still pointer: a tile sliding in is dropped');
// 5. enter event before the move event of the same input, after a rest
now += 10; 
eq(g.hoverGate(ev(400, 300)), 'yes', 'first crossing after a rest counts as a real move (enter comes before move)');
move(400, 300);
// 6. move event first, enter after (the other order), fresh
now += 400;
move(500, 300); now += 2;
eq(g.hoverGate(ev(500, 300)), 'yes', 'enter after its move event: fresh move, selects');
// 7. arrow key: the pointer does not fight the keys
now += 400; handlers.keydown({});
now += 20;
eq(g.hoverGate(ev(505, 302)), 'no', 'right after an arrow key a tremor near the old spot selects nothing');
now += 20;
eq(g.hoverGate(ev(600, 300)), 'yes', 'a deliberate move after a key (24 px or more) selects');
move(600, 300);
now += 800; now += 300;
eq(g.hoverGate(ev(603, 301)), 'yes', 'after 700 ms the key no longer matters');
move(603, 301);
// 8. retry of a waiting hover
now += 400;
const el = {contains: (n) => n === inner}; const inner = {}; const other = {};
let hits = 0;
move(700, 300); now += 3;
eq(g.hoverGate(ev(700, 300)), 'yes', 'select starts the pause');
now += 100; move(760, 300);
eq(g.hoverGate(ev(760, 300)), 'later', 'a move in the pause');
under = inner; g.hoverLater(el, () => { hits++; });
tick(100); eq(hits, 0, 'not yet: the pause is still on');
tick(100); eq(hits, 1, 'when the pause ends the waiting hover selects once (pointer still on the tile)');
tick(1000); eq(hits, 1, 'and only once');
// 9. pointer left the tile meanwhile
now += 400; move(800, 300); now += 3;
eq(g.hoverGate(ev(800, 300)), 'yes', 'select');
now += 80; move(860, 300);
under = other; g.hoverLater(el, () => { hits++; });
tick(400); eq(hits, 1, 'the pointer is no longer on that tile: nothing');
// 10. a key came in between
now += 400; move(900, 300); now += 3;
eq(g.hoverGate(ev(900, 300)), 'yes', 'select');
now += 80; move(960, 300);
under = inner; g.hoverLater(el, () => { hits++; });
now += 30; handlers.keydown({});
tick(400); eq(hits, 1, 'a key press while waiting cancels the retry');
// 11. cancel
now += 400; move(1000, 300); now += 3; g.hoverGate(ev(1000, 300));
now += 80; move(1060, 300); under = inner; g.hoverLater(el, () => { hits++; });
g.hoverCancel(); tick(500); eq(hits, 1, 'hoverCancel forgets the waiting hover');
// 12. selection by another path starts the pause
now += 600; g.hoverSelected(); now += 50; move(1100, 300);
eq(g.hoverGate(ev(1100, 300)), 'later', 'after a wake select the pause holds a moving pointer for later');

// 13. p20: edge scroll direction (outer 20% on each side of the row box) and the key check
const box = {left: 100, width: 1000};
eq([g.edgeDirection(100, box), g.edgeDirection(299, box), g.edgeDirection(300, box), g.edgeDirection(500, box), g.edgeDirection(900, box), g.edgeDirection(901, box), g.edgeDirection(1100, box)], [-1, -1, 0, 0, 0, 1, 1], 'edge direction: outer 20% each side');
eq([g.edgeDirection(50, box), g.edgeDirection(1101, box), g.edgeDirection(-1, box), g.edgeDirection(500, {left: 0, width: 0})], [0, 0, 0, 0], 'edge direction: outside the box or unknown: none');
const t0 = now; handlers.keydown({});
eq([g.keyPressedSince(t0 - 1), g.keyPressedSince(t0 + 1)], [true, false], 'key press after the start of an edge scroll is seen');
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
