// Quiet mode, pointer wake guard (idea of PR #46): a Magic Remote movement or press that wakes the hidden apps only wakes them.
// Until the pointer has rested SETTLE_MS (at most MAX_MS after the wake) it hovers and clicks nothing; a waking press also uses up
// its own release and click. A mousemove at the same screen position as the last one is synthetic (the TV repeats it): it neither wakes nor keeps awake.

export const SETTLE_MS = 400;
export const MAX_MS = 1500;

/** events that are swallowed while the guard is waking */
const BLOCKED = ['mousemove', 'mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'];

export interface Timers {
	set: (fn: () => void, ms: number) => unknown;
	clear: (id: unknown) => void;
}

const REAL: Timers = {set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as number)};

export interface PointerGuard {
	/** true when this mousemove is at the same screen position as the previous one (synthetic); otherwise remembers the position */
	sameSpot(x: number, y: number): boolean;
	/** the pointer woke the apps (kind = the event type) */
	wake(kind: string): void;
	/** a real pointer movement while awake: the pointer has not rested yet */
	move(): void;
	/** true when the event must not reach the tiles */
	blocks(kind: string): boolean;
	/** stop all timers */
	stop(): void;
}

export function createPointerGuard(timers: Timers = REAL): PointerGuard {
	let waking = false;
	let pressWake = false;       // the wake was a press: its mouseup and click are used up after the guard ends
	let settle: unknown = null;
	let max: unknown = null;
	let lastX = -1;
	let lastY = -1;
	let seen = false;
	const end = () => {
		waking = false;
		if (settle !== null) timers.clear(settle);
		if (max !== null) timers.clear(max);
		settle = null; max = null;
	};
	return {
		sameSpot(x, y) {
			const same = seen && x === lastX && y === lastY;
			seen = true; lastX = x; lastY = y;
			return same;
		},
		wake(kind) {
			end();
			waking = true;
			pressWake = kind === 'mousedown' || kind === 'click';
			settle = timers.set(end, SETTLE_MS);
			max = timers.set(end, MAX_MS);
		},
		move() {
			if (!waking) return;
			if (settle !== null) timers.clear(settle);
			settle = timers.set(end, SETTLE_MS);
		},
		blocks(kind) {
			if (BLOCKED.indexOf(kind) === -1) return false;
			if (waking) return true;
			if (pressWake && (kind === 'mouseup' || kind === 'click')) {
				if (kind === 'click') pressWake = false;
				return true;
			}
			return false;
		},
		stop() { end(); pressWake = false; }
	};
}
