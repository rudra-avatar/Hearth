// Opening LG's own Home screen when the plain launch is not enough (webOS 3: Home is an overlay, not an app), and the script
// behind the "LG Home" button job. Needs a rooted TV (shell through the Homebrew Channel). Strings: lghomecmd.ts.

import {exec} from './apps';
import {writeFileCommands} from './homehookcmd';
import {ensureScriptCommand, LGHOME_SCRIPT, LGHOME_SCRIPT_TEXT, lgHomeOk, lgHomeWhy} from './lghomecmd';
import {isWebOS} from './luna';
import {log} from './log';

/** Puts the script on the TV (only when the version on it is older or missing); true when it is there. */
export function ensureLgHomeScript (): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(false);
	const command = ensureScriptCommand(writeFileCommands(LGHOME_SCRIPT, LGHOME_SCRIPT_TEXT)) + ` && [ -s '${LGHOME_SCRIPT}' ] && echo script=ok`;
	return exec(command, 10000).then((out) => /script=ok/.test(out), () => false);
}

/** Sends LG's Home key to the TV (the script's `inject` form). Resolves '' when it worked, otherwise the reason. */
export function sendHomeKey (): Promise<string> {
	return ensureLgHomeScript().then((ready) => {
		if (!ready) return 'the helper script could not be written';
		return exec(`sh '${LGHOME_SCRIPT}' inject`, 10000).then((out) => {
			log(`lghome: ${out.trim().split('\n').pop() || 'no answer'}`);
			return lgHomeOk(out) ? '' : lgHomeWhy(out) || 'no answer';
		}, () => 'the shell did not answer');
	});
}
