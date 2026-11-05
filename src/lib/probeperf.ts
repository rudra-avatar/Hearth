// Tests 28-31 (Tests tab): how fast and smooth Hearth is on this TV. Nothing is changed; each only measures.
// 28: start-up marks and memory. 29: frame timer on the idle Tests tab. 30: frame timer plus key-to-picture delay
// while you move through the Tests list. 31: the same on the Home screen (you close Settings, then move along the row).
// A frame is the time between two screen refreshes: 17 ms is smooth at 60 fps, over 34 ms is a visible stutter.

import {markList} from './perfmarks';
import type {ProbeResult, ProbeTest} from './probe';
import {probeContext} from './probecontext';

const clip = (text: string, n = 230): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const KEYS = [37, 38, 39, 40];
const now = (): number => (performance.now ? performance.now() : Date.now());

interface Stats {
	frames: number;
	avg: number;
	worst: number;
	slow: number;       // frames over 20 ms
	stutter: number;    // frames over 34 ms
	keys: number;
	keyAvg: number;
	keyWorst: number;
	gaps: number[];
}

/** Measures frames and key-to-picture delay for totalMs, ignoring the first skipMs. */
function measure (totalMs: number, skipMs: number): Promise<Stats> {
	return new Promise<Stats>((resolve) => {
		const gaps: number[] = [];
		const delays: number[] = [];
		const t0 = now();
		let last = 0;
		let pending = -1;
		const onKey = (e: KeyboardEvent) => { if (KEYS.indexOf(e.keyCode) !== -1 && pending < 0 && now() - t0 >= skipMs) pending = now(); };
		window.addEventListener('keydown', onKey, true);
		const tick = (t: number) => {
			const n = now();
			if (last && n - t0 >= skipMs) {
				const gap = t - last;
				if (gap < 1000) gaps.push(gap);       // a gap over a second means the page was hidden, not slow
			}
			last = t;
			if (pending >= 0) {
				const started = pending;
				pending = -1;
				window.setTimeout(() => delays.push(now() - started), 0);       // runs after this frame's work: about when the picture is drawn
			}
			if (n - t0 < totalMs) { window.requestAnimationFrame(tick); return; }
			window.removeEventListener('keydown', onKey, true);
			window.setTimeout(() => {
				const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
				resolve({
					frames: gaps.length,
					avg: gaps.length ? sum(gaps) / gaps.length : 0,
					worst: gaps.length ? Math.max(...gaps) : 0,
					slow: gaps.filter((g) => g > 20).length,
					stutter: gaps.filter((g) => g > 34).length,
					keys: delays.length,
					keyAvg: delays.length ? sum(delays) / delays.length : 0,
					keyWorst: delays.length ? Math.max(...delays) : 0,
					gaps
				});
			}, 50);
		};
		window.requestAnimationFrame(tick);
	});
}

const ms = (n: number): string => `${Math.round(n * 10) / 10}`;
const pct = (n: number, of: number): string => (of ? `${Math.round((n * 1000) / of) / 10}%` : '-');

function frameText (s: Stats, withKeys: boolean): ProbeResult {
	if (s.frames < 5) return {ok: false, text: 'FAILED: too few frames seen (the page was hidden?)'};
	const fps = s.avg ? Math.round(1000 / s.avg) : 0;
	let text = `${s.frames} frames, avg ${ms(s.avg)} ms (${fps} fps), worst ${ms(s.worst)} ms, over 20 ms ${pct(s.slow, s.frames)}, over 34 ms ${pct(s.stutter, s.frames)}`;
	if (withKeys) text += s.keys ? `. ${s.keys} keys, delay avg ${ms(s.keyAvg)} ms, worst ${ms(s.keyWorst)} ms` : '. No arrow keys pressed (use ← → ↑ ↓ during the run)';
	return {ok: true, text: clip(text)};
}

/** R11: how many frames came at 60 fps (up to 18.5 ms), at about 30 fps and slower; median and slowest 5 %. */
function fpsText (s: Stats): ProbeResult {
	if (s.frames < 5) return {ok: false, text: 'FAILED: too few frames seen (the page was hidden?)'};
	const g = s.gaps.slice().sort((a, b) => a - b);
	const share = (from: number, to: number) => pct(g.filter((x) => x > from && x <= to).length, g.length);
	const median = g[Math.floor(g.length / 2)];
	const p95 = g[Math.min(g.length - 1, Math.floor(g.length * 0.95))];
	const text = `${s.frames} frames: ${share(0, 18.5)} at 60 fps, ${share(18.5, 35)} at 30-54 fps, ${share(35, 1e9)} slower; median ${ms(median)} ms, slowest 5% from ${ms(p95)} ms, worst ${ms(s.worst)} ms. ${s.keys ? s.keys + ' keys, delay avg ' + ms(s.keyAvg) + ' ms' : 'No arrow keys pressed'}. Screen ${window.screen.width}x${window.screen.height}, pixel ratio ${window.devicePixelRatio}`;
	return {ok: true, text: clip(text + ' | ' + probeContext(), 760)};
}

function startup (): Promise<ProbeResult> {
	const marks = markList().map((m) => `${m[0]} ${m[1]} ms`).join(', ');
	const mem = performance as unknown as {memory?: {usedJSHeapSize?: number}};
	const heap = mem.memory && mem.memory.usedJSHeapSize ? `, JS memory ${Math.round(mem.memory.usedJSHeapSize / 1048576)} MB` : '';
	return Promise.resolve({
		ok: marks.length > 0,
		text: clip(`Since the page began loading: ${marks || 'no marks'}${heap}`)
	});
}

export const PERF_TESTS: ProbeTest[] = [
	{
		id: 'startup', label: '28. Start-up times and memory',
		description: 'Shows when the script started, the first picture was drawn and the app list arrived (ms since the page began loading), plus memory. Best read right after Hearth was started.',
		run: startup
	},
	{
		id: 'frames-idle', manual: true, label: '29. Frame timer, nothing pressed (6 s)',
		description: 'Counts screen refreshes for 6 seconds without touching anything. Shows whether the clock, slideshow or fades make the picture stutter.',
		run: () => measure(6000, 500).then((s) => frameText(s, false))
	},
	{
		id: 'frames-keys', manual: true, label: '30. Frame timer and key delay, Settings (15 s)',
		description: 'For 15 seconds press the arrow keys steadily to move up and down this list. Measures frame times and how long a key takes to show on screen.',
		run: () => measure(15000, 0).then((s) => frameText(s, true))
	},
	{
		id: 'frames-home', manual: true, label: '31. Frame timer and key delay, Home (25 s)',
		description: 'Start it, then press Back to leave Settings. After 5 seconds move along the home row with the arrow keys until 25 seconds pass. Then open Settings > Tests for the answer.',
		run: () => measure(25000, 5000).then((s) => frameText(s, true))
	},
	{
		id: 'fps60', manual: true, label: '37. 60 FPS check, Home (25 s)',
		description: 'Same steps as test 31. Shows the share of frames at 60 fps, at about 30 fps and slower, the median frame time and the slowest 5 %. Measures only.',
		run: () => measure(25000, 5000).then(fpsText)
	}
];
