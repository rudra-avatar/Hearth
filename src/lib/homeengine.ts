// Hearth's own key engine for "Home button opens Hearth" (test): the script (src/homehook/homehook.sh) and the bundled
// injector and library (public/homehook, from the Input Hook project) start the hook that remaps remote buttons, so no
// other app is needed. This file writes the script to the TV and runs it. See the script's header for what it does.

import engineSh from '../homehook/homehook.sh?raw';
import {exec, shellQuote} from './apps';
import {failureText} from './failure';
import {writeFileCommands} from './homehookcmd';
import {isWebOS} from './luna';
import {log} from './log';
import {t as tt} from '../i18n';

export const ENGINE_DIR = '/media/developer/launcher-homekey';
const ENGINE = `${ENGINE_DIR}/homehook.sh`;

export type EngineResult = 'already' | 'started' | 'nofiles' | 'notarget' | 'failed';

export interface EngineOutcome {
	ok: boolean;
	result: EngineResult | 'unreachable';
	text: string;
}

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');

export function parseEngineResult (output: string): EngineResult {
	const m = /result=(already|started|nofiles|notarget|failed)/.exec(output);
	return m ? (m[1] as EngineResult) : 'failed';
}

export function engineText (result: EngineResult): string {
	switch (result) {
		case 'already': return tt('homeengine.theKeyEngineWas');
		case 'started': return tt('homeengine.hearthStartedItsKey');
		case 'nofiles': return tt('homeengine.theKeyEngineS');
		case 'notarget': return tt('homeengine.theTvSInput');
		default: return tt('homeengine.theKeyEngineDid');
	}
}

const STAMP = `${ENGINE_DIR}/.written`;
const LINK = '/var/lib/webosbrew/init.d/49-launcher-homekey';

/** A short fingerprint of the script text; the TV keeps it next to the script so a start can tell the copy is current (P52). */
export function scriptStamp (text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
	return `${text.length}-${h.toString(16)}`;
}

/** Writes the script to the TV (replacing an older copy) and notes its fingerprint. */
function installScript (): Promise<void> {
	const text = lf(engineSh);
	const pieces = writeFileCommands(ENGINE, text).concat([`printf '%s' '${scriptStamp(text)}' > ${shellQuote(STAMP)}`]);
	const run = (i: number): Promise<void> => (i >= pieces.length ? Promise.resolve() : exec(`${i === 0 ? `mkdir -p ${shellQuote(ENGINE_DIR)} && ` : ''}${pieces[i]}`, 8000).then(() => run(i + 1)));
	return run(0);
}

/** One short command: is the script on the TV current and the start-up link in place? Then nothing needs writing at start. */
function engineCurrent (): Promise<boolean> {
	const want = scriptStamp(lf(engineSh));
	return exec(`[ -f ${shellQuote(ENGINE)} ] && [ -e ${shellQuote(LINK)} ] && [ "$(cat ${shellQuote(STAMP)} 2>/dev/null)" = '${want}' ] && echo current; true`, 5000)
		.then((out) => out.indexOf('current') !== -1, () => false);
}

/** Starts the key engine unless it is already running in this boot. */
export function startEngine (): Promise<EngineOutcome> {
	if (!isWebOS()) return Promise.resolve({ok: false, result: 'unreachable', text: tt('homeengine.thisOnlyWorksOnA')});
	return installScript()
		.then(() => exec(`sh ${shellQuote(ENGINE)} start`, 25000))
		.then((out): EngineOutcome => {
			const result = parseEngineResult(out);
			return {ok: result === 'already' || result === 'started', result, text: engineText(result)};
		})
		.catch((e): EngineOutcome => ({ok: false, result: 'unreachable', text: failureText(e, tt('homeengine.startTheKeyEngine'))}));
}

/** Starts the engine's start-up job (it polls for the TV's input services and injects the hook) without rewriting the script.
 *  Does nothing when the script is not installed; the job takes a lock, so it never runs twice. Never throws.
 *  Resolves true when the TV answered, false when the call failed (the Homebrew service may not be up yet: try again). */
export function kickEngine (): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(true);
	const began = Date.now();
	log('engine kick sent');
	return exec(`[ -f ${shellQuote(ENGINE)} ] && sh ${shellQuote(ENGINE)} boot; true`, 5000).then(() => { log(`engine kick answered after ${Date.now() - began} ms`); return true; }, () => { log(`engine kick failed after ${Date.now() - began} ms`); return false; });
}

/** Adds or removes the link that starts the engine at every start of the TV. Never throws. */
export function setEngineAtBoot (on: boolean, skipIfCurrent: boolean = false): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(false);
	const check = on && skipIfCurrent ? engineCurrent() : Promise.resolve(false);
	return check.then((current): Promise<boolean> => {
		if (current) return Promise.resolve(true);
		return installScript()
			.then(() => exec(`sh ${shellQuote(ENGINE)} ${on ? 'enable' : 'disable'}`, 8000))
			.then((out) => /result=(enabled|disabled)/.test(out));
	}).catch(() => false);
}
