// Start-up order (P52): the Home button work (helper watcher, key engine; lib/earlystart.ts, and the helper check at 5 s in
// app.tsx) comes first. Everything else waits until the page has been up for a while, so the TV's CPU and the Homebrew shell
// are free while the Home key is being set up. Delays count from the page start (performance.now), so a task armed late
// (after a wake, or when a setting changes) is not held back again: it just uses its normal `floor` delay.

export const TIER2_MS = 20000;   // app list, weather: the saved copies are on screen already
export const TIER3_MS = 30000;   // preload, folders, boot links, screen saver, clean-up: nothing here is visible

export function pageAge (): number {
	return typeof performance !== 'undefined' && performance.now ? Math.round(performance.now()) : 1e9;
}

/** Milliseconds to wait before running a task that should not start before `target` ms after the page start, but never less than `floor`. */
export function startDelay (target: number, floor: number = 0): number {
	return Math.max(floor, target - pageAge());
}
