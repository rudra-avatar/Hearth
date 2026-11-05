// Standby fade: after a set time on the home screen with no remote input, the app rows and every widget fade away and
// the clock dims; the wallpaper stays as it is. Any key or pointer input brings them back, and that
// first input is used up (it does not move the highlight, open anything or go Back).
// Pure logic (no UI): Home.tsx feeds it the window's input events and draws the state it reports (CSS in global.css).

/** Minutes without input before the fade (0 = Off). */
export const STANDBY_MINUTES: readonly number[] = [0, 1, 2, 5, 10];

/** The default for fresh installs and for saved settings without the field. */
export const STANDBY_DEFAULT = 0;

/** How long the fade out and the way back take (keep in sync with global.css). */
export const STANDBY_FADE_MS = 4000;
export const STANDBY_WAKE_MS = 250;

/** After a pointer wake, pointer events stay used up until the pointer has rested this long, or at most POINTER_GUARD_MAX_MS. */
export const POINTER_SETTLE_MS = 400;
export const POINTER_GUARD_MAX_MS = 1500;

/** A saved value: one of the choices, else the default. */
export function standbyMinutes (value: unknown): number {
	return typeof value === 'number' && STANDBY_MINUTES.indexOf(value) !== -1 ? value : STANDBY_DEFAULT;
}

/** 'awake': everything shown; 'faded': fading out or faded; 'waking': coming back (the short transition). */
export type StandbyState = 'awake' | 'faded' | 'waking';

/** The parts of a DOM event the logic needs. */
export interface StandbyInput {
	type: string;
	keyCode?: number;
	repeat?: boolean;
	/** pointer position (screenX / screenY) */
	x?: number;
	y?: number;
}

export interface StandbyOptions {
	onState: (state: StandbyState) => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (id: number) => void;
	now?: () => number;
}

export interface Standby {
	/** minutes without input before the fade (0 = Off) */
	setMinutes: (minutes: number) => void;
	/** paused: Hearth hidden, another screen or menu in front, or the home row being re-ordered. Pausing shows everything;
	 *  resuming starts the full wait again. */
	setPaused: (paused: boolean) => void;
	/** Home was pressed (Hearth brought to the front): everything shown, the wait starts again */
	reset: () => void;
	/** a window event: true when it must be used up (stopped before Hearth's own handlers see it) */
	input: (event: StandbyInput) => boolean;
	state: () => StandbyState;
	dispose: () => void;
}

const POINTER_PRESS = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'mousewheel', 'pointerdown', 'pointerup'];
const POINTER_FOLLOW = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove'];

export function createStandby (options: StandbyOptions): Standby {
	const setTimer = options.setTimer || ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
	const clearTimer = options.clearTimer || ((id: number) => window.clearTimeout(id));
	const now = options.now || (() => Date.now());
	let minutes = 0;
	let paused = true;
	let state: StandbyState = 'awake';
	let idleTimer = 0;
	let wakeTimer = 0;
	let heldKey = -1;               // the key that woke it: its repeats and its key-up are used up too
	let guard: {start: number; last: number; press: boolean} | null = null;      // after a pointer wake
	let lastX = NaN;
	let lastY = NaN;

	const set = (next: StandbyState) => {
		if (next === state) return;
		state = next;
		options.onState(next);
	};
	const stop = (id: number) => { if (id) clearTimer(id); return 0; };
	const arm = () => {
		idleTimer = stop(idleTimer);
		if (!minutes || paused) return;
		idleTimer = setTimer(() => { idleTimer = 0; set('faded'); }, minutes * 60000);
	};
	const show = () => {
		wakeTimer = stop(wakeTimer);
		heldKey = -1;
		guard = null;
		set('awake');
	};
	const wake = () => {
		set('waking');
		wakeTimer = stop(wakeTimer);
		wakeTimer = setTimer(() => { wakeTimer = 0; if (state === 'waking') set('awake'); }, STANDBY_WAKE_MS + 50);
		arm();
	};
	const guarding = (t: number): boolean => {
		if (!guard) return false;
		if (guard.press) return true;                     // woken by a press: its release and click are used up too
		if (t - guard.last < POINTER_SETTLE_MS && t - guard.start < POINTER_GUARD_MAX_MS) return true;
		guard = null;
		return false;
	};

	return {
		setMinutes (m: number) {
			minutes = m > 0 ? m : 0;
			if (!minutes) show();
			arm();
		},
		setPaused (p: boolean) {
			paused = p;
			show();
			arm();
		},
		reset () {
			show();
			arm();
		},
		input (e: StandbyInput): boolean {
			if (!minutes || paused) return false;
			const t = now();
			if (e.type === 'keydown') {
				guard = null;
				if (state === 'faded') { heldKey = typeof e.keyCode === 'number' ? e.keyCode : -1; wake(); return true; }
				if (heldKey !== -1 && e.keyCode === heldKey && e.repeat) { arm(); return true; }
				heldKey = -1;
				arm();
				return false;
			}
			if (e.type === 'keyup') {
				if (heldKey !== -1 && e.keyCode === heldKey) { heldKey = -1; return true; }
				return false;
			}
			if (e.type === 'mousemove') {
				const moved = e.x !== lastX || e.y !== lastY;
				lastX = e.x as number;
				lastY = e.y as number;
				if (!moved) return guarding(t);              // the browser's own synthetic moves neither wake nor keep it awake
				if (state === 'faded') { guard = {start: t, last: t, press: false}; wake(); return true; }
				if (guarding(t)) { guard!.last = t; arm(); return true; }
				arm();
				return false;
			}
			if (POINTER_PRESS.indexOf(e.type) !== -1) {
				const press = e.type === 'mousedown' || e.type === 'pointerdown';
				if (state === 'faded') { guard = {start: t, last: t, press}; wake(); return true; }
				if (guard && guard.press && press) guard = null;                 // a new press after the waking one acts normally
				else if (guarding(t)) {
					if (e.type === 'click' && guard!.press) guard = {start: t, last: t, press: false};       // the waking press ends with its click
					arm();
					return true;
				}
				arm();
				return false;
			}
			if (POINTER_FOLLOW.indexOf(e.type) !== -1) return guarding(t);
			return false;
		},
		state: () => state,
		dispose () {
			idleTimer = stop(idleTimer);
			wakeTimer = stop(wakeTimer);
		}
	};
}

/** The window events Home.tsx passes to `input` (listened to in the capture phase). */
export const STANDBY_EVENTS: readonly string[] = ['keydown', 'keyup', 'mousemove'].concat(POINTER_PRESS, POINTER_FOLLOW);
