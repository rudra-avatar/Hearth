// K1: puts keyact.sh on the TV (only when missing or older) before a button points to it. The strings are in keyactcmd.ts.

import {exec} from './apps';
import {writeFileCommands} from './homehookcmd';
import {ensureKeyActCommand, KEYACT_SCRIPT, KEYACT_SCRIPT_TEXT} from './keyactcmd';
import {isWebOS} from './luna';

/** True when the script is on the TV. */
export function ensureKeyActScript (): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(false);
	const command = ensureKeyActCommand(writeFileCommands(KEYACT_SCRIPT, KEYACT_SCRIPT_TEXT)) + ` && [ -s '${KEYACT_SCRIPT}' ] && echo script=ok`;
	return exec(command, 10000).then((out) => /script=ok/.test(out), () => false);
}
