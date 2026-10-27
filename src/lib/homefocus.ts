// Settings → Look → "When Home is pressed": where the highlight lands when Hearth comes back to the front.
// 'first' is the first tile (as always); 'last' is the app or input last opened from Hearth.
// The tile opened last is noted when it is opened (one small localStorage entry of its own, so it is still
// known when the TV starts Hearth afresh) and read when Hearth is shown again: no timers, no TV calls.

export type HomeFocus = 'first' | 'last';
export const HOME_FOCUS_IDS: readonly HomeFocus[] = ['first', 'last'];

export const LAST_OPENED_KEY = 'customlauncher-last-opened';

/** The tile key opened last (an app id or an input's app id), or null when none is known. */
export function readLastOpened (): string | null {
	try {
		const value = localStorage.getItem(LAST_OPENED_KEY);
		return typeof value === 'string' && value && value.length <= 200 ? value : null;
	} catch { return null; }
}

export function writeLastOpened (key: string): void {
	try { localStorage.setItem(LAST_OPENED_KEY, key); }
	catch { /* no storage (blocked or full): the highlight then simply starts at the first app after a fresh start */ }
}

export function homeFocusText (v: HomeFocus): string {
	return v === 'last' ? 'The last app opened' : 'The first app';
}
