// W1 (2.1.6): a wallpaper change (decode + 1.4 s cross-fade of two full-screen layers) waits until nothing has been pressed
// or moved for a few seconds, so it never runs while the user navigates. Nothing runs at idle: the input listeners only note a
// time, and a check every 500 ms exists only while a change is waiting.

export const QUIET_MS = 3000;
const POLL_MS = 500;
/** a change that has waited this long runs anyway (someone keeps pressing keys or the pointer sits on a shaky surface) */
export const MAX_WAIT_MS = 60000;

export interface IdleClock {
	now: () => number;
	set: (fn: () => void, ms: number) => unknown;
	clear: (id: unknown) => void;
}

const REAL: IdleClock = {now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as number)};

export interface InputIdle {
	/** an input happened now */
	note(): void;
	/** runs `fn` once no input happened for `quietMs` (or after MAX_WAIT_MS); returns how to cancel; `fn` gets the ms it waited */
	whenQuiet(fn: (waitedMs: number) => void, quietMs?: number): () => void;
}

export function createInputIdle (clock: IdleClock = REAL): InputIdle {
	let last = clock.now();
	return {
		note() { last = clock.now(); },
		whenQuiet(fn, quietMs = QUIET_MS) {
			const start = clock.now();
			let id: unknown = null;
			let done = false;
			const check = () => {
				id = null;
				const now = clock.now();
				if (now - last >= quietMs || now - start >= MAX_WAIT_MS) { done = true; fn(now - start); return; }
				id = clock.set(check, POLL_MS);
			};
			id = clock.set(check, Math.max(POLL_MS, quietMs - (start - last)));
			return () => { if (!done && id !== null) clock.clear(id); id = null; done = true; };
		}
	};
}

let shared: InputIdle | null = null;

/** The page-wide instance; the listeners are added when it is first asked for (nothing at start-up). */
export function inputIdle (): InputIdle {
	if (shared) return shared;
	const idle = createInputIdle();
	shared = idle;
	if (typeof window !== 'undefined') {
		let x = -1;
		let y = -1;
		['keydown', 'mousedown', 'wheel'].forEach((type) => window.addEventListener(type, () => idle.note(), true));
		// the TV repeats a mousemove at the same spot: only a real movement counts
		window.addEventListener('mousemove', (e: MouseEvent) => { if (e.screenX !== x || e.screenY !== y) { x = e.screenX; y = e.screenY; idle.note(); } }, true);
	}
	return idle;
}
