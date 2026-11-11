// Quiet mode, pointer wake guard (idea of PR #46, reduced 2.1.6 M1): a Magic Remote movement wakes the hidden apps and nothing more is
// held back: the pointer hovers at once. Only a waking PRESS is used up (its mousedown, mouseup and click), so OK on a hidden tile only wakes.
// A mousemove at the same screen position as the last one is synthetic (the TV repeats it): it neither wakes nor keeps awake; so is a
// move of less than MOVE_PX from the last counted point (hand tremor). The press flag cannot stick: it ends with the click, 400 ms after
// a release that made no click (the press was dragged off the tile), and after 10 s at the latest.

export const MOVE_PX = 3;
export const UP_GRACE_MS = 400;
export const PRESS_MAX_MS = 10000;

const PRESS = ['mousedown', 'mouseup', 'click'];

export interface Timers {
	set: (fn: () => void, ms: number) => unknown;
	clear: (id: unknown) => void;
}

const REAL: Timers = {set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as number)};

export interface PointerGuard {
	/** true when this mousemove is at the same screen position as the previous one (synthetic); otherwise remembers the position */
	sameSpot(x: number, y: number): boolean;
	/** true when the pointer is MOVE_PX or more away from the last counted point (the first call counts); counts the point then */
	farEnough(x: number, y: number): boolean;
	/** the pointer woke the apps (kind = the event type) */
	wake(kind: string): void;
	/** true when the event must not reach the tiles */
	blocks(kind: string): boolean;
	/** stop all timers */
	stop(): void;
}

export function createPointerGuard(timers: Timers = REAL): PointerGuard {
	let pressWake = false;       // the wake was a press: its mousedown, mouseup and click are used up
	let cap: unknown = null;
	let grace: unknown = null;
	let lastX = -1;
	let lastY = -1;
	let seen = false;
	let anchorX = 0;
	let anchorY = 0;
	let anchored = false;
	const clearTimers = () => {
		if (cap !== null) timers.clear(cap);
		if (grace !== null) timers.clear(grace);
		cap = null; grace = null;
	};
	const endPress = () => { pressWake = false; clearTimers(); };
	return {
		sameSpot(x, y) {
			const same = seen && x === lastX && y === lastY;
			seen = true; lastX = x; lastY = y;
			return same;
		},
		farEnough(x, y) {
			if (anchored && Math.abs(x - anchorX) < MOVE_PX && Math.abs(y - anchorY) < MOVE_PX) return false;
			anchored = true; anchorX = x; anchorY = y;
			return true;
		},
		wake(kind) {
			endPress();
			pressWake = kind === 'mousedown' || kind === 'click';
			if (pressWake) cap = timers.set(endPress, PRESS_MAX_MS);
		},
		blocks(kind) {
			if (!pressWake || PRESS.indexOf(kind) === -1) return false;
			if (kind === 'click') { endPress(); return true; }
			if (kind === 'mouseup') {
				if (grace !== null) timers.clear(grace);
				grace = timers.set(endPress, UP_GRACE_MS);
			}
			return true;
		},
		stop() { endPress(); }
	};
}
