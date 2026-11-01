// One-time clean-up of the removed SAM method (see takeovercmd.ts). Only runs for a TV whose saved settings say the
// old method was on.

import {exec} from './apps';
import {isWebOS} from './luna';
import {parseRemoved, REMOVE_COMMAND} from './takeovercmd';

export {cleanupMessage} from './takeovercmd';

/** Resolves true when LG Home's folder is free again and the old files are gone. */
export function removeTakeover (): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(true);
	return exec(REMOVE_COMMAND, 90000).then(parseRemoved).catch(() => false);
}
