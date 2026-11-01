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

// Hover-select guard for the home row. When the row glides, tiles slide under a pointer that is not moving
// and each one would "hover" and select itself, which scrolls the row further: a runaway. So a hover only
// selects when the pointer really moved lately, and not again until the glide has settled.
let lastX = -1;
let lastY = -1;
let movedAt = 0;
let selectedAt = 0;
let watching = false;
const HOVER_MOVE_MS = 120;
const HOVER_COOLDOWN_MS = 260;

function watchPointer (): void {
	if (watching || typeof window === 'undefined') return;
	watching = true;
	window.addEventListener('mousemove', (e: MouseEvent) => {
		if (e.screenX !== lastX || e.screenY !== lastY) { lastX = e.screenX; lastY = e.screenY; movedAt = Date.now(); }
	}, true);
}

/** Start listening (call once at start-up). */
export function startPointerGuard (): void { watchPointer(); }

/** May a hover on a home-row tile select it now? */
export function hoverMayselect (now: number = Date.now()): boolean {
	if (!watching) return true;
	if (now - movedAt > HOVER_MOVE_MS) return false;
	if (now - selectedAt < HOVER_COOLDOWN_MS) return false;
	selectedAt = now;
	return true;
}
