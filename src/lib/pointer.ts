// Magic Remote pointer control.
//
// The pointer is drawn by the TV's compositor, not the page, so CSS `cursor: none` has
// no effect. webOS gives web apps `webOSSystem.setCursorHidden()` for this: it hides the
// pointer the same way pressing an arrow key does, and the system shows it again when
// the user shakes or moves the remote. So hiding on launch/foreground doesn't stop the
// user switching back to pointer mode.

interface WebOSSystemCursor {
	setCursorHidden? (hidden: boolean): void;
}

declare global {
	interface Window {
		webOSSystem?: WebOSSystemCursor;
		PalmSystem?: WebOSSystemCursor;
	}
}

/** Hide the pointer now. No-op off webOS or on firmware without the API. */
export function hidePointer (): void {
	const sys = window.webOSSystem || window.PalmSystem;
	if (!sys || typeof sys.setCursorHidden !== 'function') return;
	try { sys.setCursorHidden(true); }
	catch { /* best effort */ }
}

/** Hide the pointer on launch and every time the app comes back to the foreground
 *  (including relaunches while already running, e.g. from a remapped HOME button).
 *  Returns an unsubscribe function. */
export function hidePointerOnForeground (): () => void {
	const onVisible = () => { if (!document.hidden) hidePointer(); };
	hidePointer();
	document.addEventListener('visibilitychange', onVisible);
	document.addEventListener('webOSRelaunch', onVisible);
	return () => {
		document.removeEventListener('visibilitychange', onVisible);
		document.removeEventListener('webOSRelaunch', onVisible);
	};
}

// Hover-select guard for the home row. When the row glides, tiles slide under a pointer that is not moving and each one would
// "hover" and select itself, which scrolls the row further: a runaway. So a hover only selects when the pointer really moved, and not
// again until the glide has settled. 2.1.6 M2: "really moved" no longer depends on the order of the events (the enter event may come
// before the move event of the same input), a hover that arrives during the pause is not lost but looked at again once, arrow keys and
// a pointer that only trembles do not fight each other, and the tile under the pointer can be asked for (wake from quiet mode).
let lastX = -1;
let lastY = -1;
let movedAt = 0;
let selectedAt = 0;
let keyAt = 0;
let keyX = -1;
let keyY = -1;
let watching = false;
let pending: {el: Element | null; fn: () => void} | null = null;
let pendingTimer = 0;
let cx = -1;
let cy = -1;
export const HOVER_MOVE_MS = 120;
export const HOVER_COOLDOWN_MS = 260;
/** 2.1.6 p16: a hover select that does not scroll the row (the pointer is not in the outer edge zone) leaves tiles where they are, so the pause after it is short (old: 260 ms for every select) */
export const HOVER_SHORT_MS = 80;
/** 2.1.6 p16: the row scrolls by pointer only when the pointer is in the outer part of the row on either side (fraction of the row's width) */
export const EDGE_SCROLL_FRAC = 0.2;
/** 2.1.6 p20: while the pointer stays in that outer part the row keeps scrolling by one tile every EDGE_SCROLL_STEP_MS (the same length as the linear glide of a held arrow key, so the steps run into one smooth scroll). p16 had 0.15 and one scroll per pointer move (blocks). */
export const EDGE_SCROLL_STEP_MS = 200;
/** p22: the row now scrolls freely (pixels, no tile selects) while the pointer is in the outer part: speed in row widths per second, EDGE_SPEED_MIN at the inner border, EDGE_SPEED_MAX at the very edge. The highlight goes to the tile under the pointer when the scroll ends. */
export const EDGE_SPEED_MIN = 0.3;
export const EDGE_SPEED_MAX = 1.3;
/** p22: after the pointer stops moving (not scrolling) the tile under it is highlighted once, so no highlight is missed */
export const SETTLE_MS = 70;
/** after an arrow key: a hover needs the pointer this far (screen px) from where it was at the key press, within KEY_QUIET_MS */
export const KEY_QUIET_MS = 700;
export const KEY_NEAR_PX = 24;
/** a move after the last select must be at least this much later than the select itself (the move event of the same input follows the enter event at once) */
const LATER_MS = 10;

export type HoverVerdict = 'yes' | 'later' | 'no';

function watchPointer (): void {
	if (watching || typeof window === 'undefined') return;
	watching = true;
	window.addEventListener('mousemove', (e: MouseEvent) => {
		if (e.screenX !== lastX || e.screenY !== lastY) { lastX = e.screenX; lastY = e.screenY; movedAt = Date.now(); }
		cx = e.clientX; cy = e.clientY;
	}, true);
	window.addEventListener('keydown', () => { keyAt = Date.now(); keyX = lastX; keyY = lastY; }, true);
}

/** Start listening (call once at start-up). */
export function startPointerGuard (): void { watchPointer(); }

function keyNear (x: number, y: number, now: number): boolean {
	return now - keyAt < KEY_QUIET_MS && Math.abs(x - keyX) < KEY_NEAR_PX && Math.abs(y - keyY) < KEY_NEAR_PX;
}

/** May a hover on a home-row tile select it now? `yes`: select (the pause starts). `later`: the pointer is moving but the pause
 *  is on: ask again with `hoverLater`. `no`: a tile slid under a still pointer, or a key was just pressed: do nothing.
 *  `e` is the enter event; its coordinates tell a real move (they differ from the last move seen) from a repeat at the same spot. */
export function hoverGate (e?: {screenX: number; screenY: number} | null, now: number = Date.now()): HoverVerdict {
	if (!watching) return 'yes';
	const sx = e ? e.screenX : lastX;
	const sy = e ? e.screenY : lastY;
	const differs = !!e && (lastX === -1 || sx !== lastX || sy !== lastY);
	if (now - movedAt > HOVER_MOVE_MS && !differs) return 'no';
	if (keyNear(sx, sy, now)) return 'no';
	if (now - selectedAt < HOVER_COOLDOWN_MS) return differs || movedAt - selectedAt >= LATER_MS ? 'later' : 'no';
	selectedAt = now;
	return 'yes';
}

/** Boolean form kept for the old callers. */
export function hoverMayselect (now: number = Date.now()): boolean { return hoverGate(null, now) === 'yes'; }

/** The last select did not scroll the row: shorten the pause after it to HOVER_SHORT_MS. */
export function hoverShortPause (now: number = Date.now()): void { selectedAt = now - (HOVER_COOLDOWN_MS - HOVER_SHORT_MS); }

/** The pointer's last known x (client pixels), or -1. */
export function pointerClientX (): number { return cx; }
/** p20: the pointer's last known y (client pixels), or -1. */
export function pointerClientY (): number { return cy; }
/** p20: true when an arrow key was pressed after time `t` (edge scrolling stops then). */
export function keyPressedSince (t: number): boolean { return keyAt > t; }
/** p20: which way a pointer at client x scrolls a row with box `r` (-1 left, 1 right, 0 none). */
export function edgeDirection (x: number, r: {left: number; width: number}): number {
	if (x < 0 || !r.width) return 0;
	const f = (x - r.left) / r.width;
	return f < 0 ? 0 : f < EDGE_SCROLL_FRAC ? -1 : f > 1 ? 0 : f > 1 - EDGE_SCROLL_FRAC ? 1 : 0;
}

/** p22: how far into the outer part a pointer at client x is, 0 (inner border) to 1 (the very edge of the row); 0 outside it. Edge scroll speed grows with it. */
export function edgeDepth (x: number, r: {left: number; width: number}): number {
	if (x < 0 || !r.width) return 0;
	const f = (x - r.left) / r.width;
	const d = f < EDGE_SCROLL_FRAC ? (EDGE_SCROLL_FRAC - f) / EDGE_SCROLL_FRAC : f > 1 - EDGE_SCROLL_FRAC ? (f - (1 - EDGE_SCROLL_FRAC)) / EDGE_SCROLL_FRAC : 0;
	return d < 0 ? 0 : d > 1 ? 1 : d;
}
/** p22: true when the pointer's screen position is not the last one seen by `track` (a real move); `track` keeps the last position */
export function pointerReallyMoved (e: {screenX: number; screenY: number}, track: {x: number; y: number}): boolean {
	const moved = e.screenX !== track.x || e.screenY !== track.y;
	track.x = e.screenX; track.y = e.screenY;
	return moved;
}
/** p22: an arrow key was pressed very recently and the pointer is still where it was (no pointer select then). */
export function pointerKeyQuiet (e: {screenX: number; screenY: number}, now: number = Date.now()): boolean { return keyNear(e.screenX, e.screenY, now); }

/** A select was made by another path (wake from quiet mode): starts the pause like a hover select does. */
export function hoverSelected (now: number = Date.now()): void { selectedAt = now; }

/** The element under the pointer's last known place (client pixels), or null. */
export function elementUnderPointer (): Element | null {
	if (cx < 0 || typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
	return document.elementFromPoint(cx, cy);
}

/** Remember a hover that came during the pause: when the pause ends, `fn` runs once if the pointer is still over `el` and no key came
 *  in between. The latest call wins; a hover for another tile in the meantime replaces it. */
export function hoverLater (el: Element | null, fn: () => void): void {
	pending = {el, fn};
	if (pendingTimer) window.clearTimeout(pendingTimer);
	pendingTimer = window.setTimeout(runPending, Math.max(20, HOVER_COOLDOWN_MS - (Date.now() - selectedAt)) + 10);
}

function runPending (): void {
	pendingTimer = 0;
	const p = pending;
	pending = null;
	if (!p || !p.el) return;
	const now = Date.now();
	const under = elementUnderPointer();
	if (!under || !p.el.contains(under) || keyNear(lastX, lastY, now) || now - selectedAt < HOVER_COOLDOWN_MS) return;
	selectedAt = now;
	p.fn();
}

/** Forget a waiting hover (the home row went away). */
export function hoverCancel (): void {
	pending = null;
	if (pendingTimer) { window.clearTimeout(pendingTimer); pendingTimer = 0; }
}
