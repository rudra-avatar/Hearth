// Opening LG's own Home screen when the plain launch is not enough (webOS 3: Home is an overlay, not an app), and the script
// behind the "LG Home" button job. Needs a rooted TV (shell through the Homebrew Channel). Strings: lghomecmd.ts.

import {exec} from './apps';
import {writeFileCommands} from './homehookcmd';
import {ensureScriptCommand, LGHOME_HAS_DEVICE_COMMAND, LGHOME_LEARN_COMMAND, LGHOME_LEARN_S, LGHOME_SCRIPT, LGHOME_SCRIPT_TEXT, isLgHomeLearnRequest, lgHomeLearned, lgHomeOk, lgHomeWhy} from './lghomecmd';
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

/** webOS 3 (no LG Home app): opens LG Home with the Home key. Without a stored key device (`lghome.dev`) it first listens once for a real Home
 *  press and stores the device that sent it (`onListen` tells the person to press it); that press already opens LG Home, so no key is sent then.
 *  When nothing is heard, or a device is stored, ONE key goes to one device. Resolves 'learned', 'sent' or the failure reason. */
export function openLgHomeByKey (onListen: () => void): Promise<string> {
	return ensureLgHomeScript().then((ready): Promise<string> => {
		if (!ready) return Promise.resolve('the helper script could not be written');
		const send = () => sendHomeKey().then((why) => why || 'sent');
		return exec(LGHOME_HAS_DEVICE_COMMAND, 5000).then((has) => {
			if (/dev=yes/.test(has)) return send();
			onListen();
			return exec(LGHOME_LEARN_COMMAND, (LGHOME_LEARN_S + 10) * 1000).then((out) => {
				const dev = lgHomeLearned(out);
				log(`lghome: learn ${out.trim().split('\n').pop() || 'no answer'}`);
				return dev ? 'learned' : send();
			}, () => send());
		}, () => send());
	});
}

/** Phase 3a: did the button job open Hearth to learn the Home key? At page start the page's own launch parameters say so; a relaunch brings
 *  its parameters in the event (`detail`) and only those count (the page's launchParams stay from the first start). */
export function lgHomeLearnRequested (detail?: unknown, atStart = false): boolean {
	if (!atStart) return isLgHomeLearnRequest(detail);
	try {
		const ps = (window as unknown as {PalmSystem?: {launchParams?: string}}).PalmSystem;
		return !!ps && !!ps.launchParams && isLgHomeLearnRequest(String(ps.launchParams));
	} catch {
		return false;
	}
}
