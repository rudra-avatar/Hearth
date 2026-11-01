// P68: tells the next page start what the previous page was doing when it ended, so the helper log can show whether
// Hearth is being closed by the TV while hidden (a reload after "hidden N s") or something else restarts it.
// One tiny localStorage write per hide/show change; nothing at idle.
const KEY = 'hearth-life-v1';

interface Life {t: number; h: boolean}

function read (): Life | null {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) || 'null');
		return v && typeof v.t === 'number' ? {t: v.t, h: !!v.h} : null;
	} catch { return null; }
}

const before = read();

/** Remember the state (call when it changes, and once at start). */
export function noteLife (hidden: boolean): void {
	try { localStorage.setItem(KEY, JSON.stringify({t: Date.now(), h: hidden})); } catch { /* ignore */ }
}

/** Short text about the previous page, for the first-screen line. */
export function previousLife (now: number = Date.now()): string {
	if (!before) return 'previous page: none';
	const s = Math.round((now - before.t) / 1000);
	return `previous page: last ${before.h ? 'hidden' : 'visible'} ${s}s ago`;
}

try { noteLife(document.hidden); } catch { /* ignore */ }
