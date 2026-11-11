// K2 (2.1.6): what is left of "Reassign remote buttons": taking the filter out of a TV that still has it (the one-time clean-up in
// remapgone.ts). The old install, keep, check and "Press a button" code was removed; the key hook ("Map additional keys") replaces it.

import {exec} from './apps';
import {isWebOS} from './luna';
import {parseRemapResult, REMOVE_COMMAND, type RemapResult} from './remapcmd';

export type {RemapResult};

/** Takes the filter out and deletes its files and boot link: every button does what the TV does again. */
export function removeRemap (): Promise<RemapResult> {
	if (!isWebOS()) return Promise.resolve('removed');
	return exec(REMOVE_COMMAND, 10000).then(parseRemapResult).catch((): RemapResult => 'failed');
}
