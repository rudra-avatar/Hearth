// P61i: when the Input Hook app is installed and already holds button settings that are not Hearth's, Hearth's two Remote
// control rows are greyed out: Hearth leaves someone else's settings alone. Read once when Settings opens (never at start-up).

import {isHearthBind, type Keybinds} from './homekeycore';
import {readExtra} from './extrakeyscore';
import {readBinds, readStatus} from './homekey';

/** Entries in the keybinds file that neither the Home button nor Hearth's extra buttons wrote. */
export function foreignCodes (binds: Keybinds, extras: Record<string, unknown>): string[] {
	return Object.keys(binds).filter((k) => !isHearthBind(binds[k]) && !extras[k]);
}

/** Input Hook is installed, the file has entries that are not Hearth's, and Hearth has none of its own (if it has, the
 *  user already said yes earlier and must still be able to remove them). */
export function inputHookInUse (app: boolean, binds: Keybinds, extras: Record<string, unknown>): boolean {
	if (!app) return false;
	const others = foreignCodes(binds, extras).length;
	const ours = Object.keys(binds).length - others;
	return others > 0 && ours === 0;
}

/** False when anything cannot be read (the rows then stay usable; the screen's own check still asks first). */
export function readInputHookInUse (): Promise<boolean> {
	return Promise.all([readStatus(), readBinds()]).then(([s, r]) => (r.ok ? inputHookInUse(s.app, r.binds, readExtra()) : false), () => false);
}
