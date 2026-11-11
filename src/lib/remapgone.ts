// K2 (2.1.6): "Reassign remote buttons" (the TV's key filter, PR #19) was removed; "Map additional keys" (the key hook) does everything.
// A TV that still had the filter: once, a while after the start, the old map is backed up (its own key, never deleted), the filter and
// its boot link are taken out through the Homebrew shell, and the person is told to map the buttons again. The saved `remap` and
// `remapKept` values are left in the settings (no saved value is removed or renamed); nothing reads them but this clean-up.

import {log} from './log';
import {removeRemap} from './remap';
import type {UserConfig} from './storage';

const BACKUP_KEY = 'hearth-remap-backup-v1';
const DONE_KEY = 'hearth-remap-retired';

/** How many buttons the old map holds. */
export function oldButtonCount (c: UserConfig): number {
	return c.remap && c.remap.keys ? Object.keys(c.remap.keys).length : 0;
}

/** Nothing to do: the filter was never used, or the clean-up has finished on this TV. */
export function keyFilterRetired (c: UserConfig): boolean {
	try {
		if (localStorage.getItem(DONE_KEY) === '1') return true;
	} catch { /* read again next time */ }
	return !(c.remap && c.remap.on) && !c.remapKept && oldButtonCount(c) === 0;
}

function markDone (): void {
	try { localStorage.setItem(DONE_KEY, '1'); } catch { /* tried again at the next start */ }
}

/** Backs the old map up (only the first time), takes the filter out, and resolves `{count}` (the buttons that were mapped) when it was
 *  removed, or null when it could not be (tried again at the next start). Writes a note to the debug log. */
export function retireKeyFilter (c: UserConfig): Promise<{count: number} | null> {
	const count = oldButtonCount(c);
	try {
		if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, JSON.stringify({remap: c.remap, remapKept: c.remapKept}));
	} catch { /* the map also stays in the saved settings */ }
	return removeRemap().then((result) => {
		log(`remap: key filter retired (${count} buttons): ${result}`);
		if (result !== 'removed') return null;
		markDone();
		return {count};
	}, () => null);
}
