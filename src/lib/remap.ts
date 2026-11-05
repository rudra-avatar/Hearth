// "Reassign remote buttons": runs the commands from remapcmd.ts through the Homebrew Channel. Hearth writes the
// key filter and its script to the TV itself, so there is nothing to copy by hand. See src/remap/README.md for
// how it works and how to undo it over SSH.

import keyfilterJs from '../remap/keyfilter.js?raw';
import applySh from '../remap/apply.sh?raw';
import {exec} from './apps';
import {classifyFailure, failureReason} from './failure';
import {isWebOS} from './luna';
import {lastLine, parseExit, withStatus} from './homehookcmd';
import {t as tt} from '../i18n';
import {
	canonicalButton, captureCommand, CHECK_COMMAND, REMAP_UNKEEP_COMMAND, STATE_COMMAND, parseRemapResult, remapInstallSteps, REMAP_KEEP_COMMAND, REMAP_VERSION, REMOVE_COMMAND, saveMapCommand,
	VERSION_COMMAND, type RemapConfig, type RemapResult
} from './remapcmd';

export type {RemapResult};

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');     // plain line ends even from a Windows checkout
const FILES = {keyfilterJs: lf(keyfilterJs), applySh: lf(applySh)};

export interface RemapOutcome {
	result: RemapResult;
	/** for a failure: which step, and what the TV said */
	detail: string;
}

/** Writes the files and the boot link and puts the filter in place, one small step at a time. If it can't be done,
 *  everything it added is removed again, and the outcome says why. */
export function installRemap (remap: RemapConfig): Promise<RemapOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'applied', detail: ''});
	const steps = remapInstallSteps(FILES, remap);
	const run = (i: number): Promise<RemapOutcome> => {
		const step = steps[i];
		return exec(withStatus(step.command), 15000).then(
			(output): RemapOutcome | Promise<RemapOutcome> => {
				if (i === steps.length - 1) return {result: parseRemapResult(output), detail: lastLine(output)};
				const code = parseExit(output);
				if (code !== 0) return {result: 'failed', detail: `${step.name}: ${lastLine(output) || 'exit ' + code}`};
				return run(i + 1);
			},
			(error: Error): RemapOutcome => ({result: 'failed', detail: `${step.name}: ${failureReason(classifyFailure(error), error && error.message ? error.message : '')}`})
		);
	};
	return run(0).then((outcome) => (outcome.result === 'applied' ? outcome : removeRemap().then(() => outcome)));
}

/** A changed map: saved on the TV and handed to the filter at once. */
export function saveRemap (remap: RemapConfig): Promise<RemapResult> {
	if (!isWebOS()) return Promise.resolve('applied');
	return exec(saveMapCommand(remap), 10000).then(parseRemapResult).catch((): RemapResult => 'failed');
}

/** Takes the filter out and deletes its files and boot link: every button does what the TV does again. */
export function removeRemap (): Promise<RemapResult> {
	if (!isWebOS()) return Promise.resolve('removed');
	return exec(REMOVE_COMMAND, 10000).then(parseRemapResult).catch((): RemapResult => 'failed');
}

/** Keeps the buttons after a restart of the TV (adds the boot link). Only after the user has seen the remote works. */
export function keepRemap (): Promise<RemapResult> {
	if (!isWebOS()) return Promise.resolve('applied');
	return exec(REMAP_KEEP_COMMAND, 8000).then(parseRemapResult).catch((): RemapResult => 'failed');
}

/** P61e: stops keeping the buttons after a restart (takes the boot link away; the filter stays until the TV restarts). */
export function unkeepRemap (): Promise<RemapResult> {
	if (!isWebOS()) return Promise.resolve('applied');
	return exec(REMAP_UNKEEP_COMMAND, 8000).then(parseRemapResult).catch((): RemapResult => 'failed');
}

/** P61e: is the filter in the TV's chain right now? Read only. 'unknown' = the TV did not answer (try again later). */
export function remapState (): Promise<'in' | 'out' | 'unknown'> {
	if (!isWebOS()) return Promise.resolve('in');
	return exec(STATE_COMMAND, 8000).then((out) => { const r = parseRemapResult(out); return r === 'applied' ? 'in' : r === 'removed' ? 'out' : 'unknown'; }).catch((): 'unknown' => 'unknown');
}

/** "Press a button": tells the filter (in memory only) that Hearth is waiting for one press, or not any more. */
export function setCapture (capture: boolean): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(true);
	return exec(captureCommand(capture), 6000).then((out) => parseRemapResult(out) === 'applied').catch(() => false);
}

export interface RemapCheck extends RemapOutcome {
	/** it can't work on this TV (or was removed): turn the setting off */
	fatal: boolean;
	/** the Homebrew service did not answer (often not up yet just after the TV starts): try again later, change nothing */
	unreachable?: boolean;
}

/** Makes sure the filter is in place (after a restart, or if the TV's config service forgot it). If the copy on the
 *  TV is from an older version of Hearth, it is written again first. One cheap read when all is well. */
export function checkRemap (remap: RemapConfig): Promise<RemapCheck> {
	if (!isWebOS()) return Promise.resolve({result: 'applied', detail: '', fatal: false});
	return exec(VERSION_COMMAND, 6000).then((out) => out.trim(), () => null).then((installed): RemapCheck | Promise<RemapCheck> => {
		if (installed === null) return {result: 'failed', detail: tt('remap.theHomebrewServiceDidNot'), fatal: false, unreachable: true};
		if (installed !== REMAP_VERSION) return installRemap(remap).then((o): RemapCheck => ({...o, fatal: o.result !== 'applied'}));
		return exec(CHECK_COMMAND, 10000).then(parseRemapResult, (): RemapResult => 'failed')
			.then((result): RemapCheck => ({result, detail: '', fatal: result === 'launcher-missing' || result === 'files-missing' || result === 'unsupported'}));
	});
}

export function remapMessage (result: RemapResult, detail = ''): string {
	switch (result) {
		case 'applied': return tt('remap.onTheReassignedButtons');
		case 'removed': return tt('remap.offEveryButtonDoes');
		case 'launcher-missing': return tt('remap.hearthMustBeInstalled');
		case 'files-missing': return tt('remap.theHelperFilesAre');
		case 'unsupported': return tt('remap.thisTvHasNoKeyFilterList');
		default: return tt('remap.couldnTSetThat', {detail: detail ? ': ' + detail : ''});
	}
}

/** The button the key filter reported, if this launch (or relaunch) of Hearth came from "Press a button". */
export function capturedButton (detail?: unknown): string | null {
	try {
		const w = window as unknown as {webOSSystem?: {launchParams?: string}; PalmSystem?: {launchParams?: string}};
		const sys = w.webOSSystem || w.PalmSystem;
		// P61b: the relaunch event carries the new parameters itself (an object or a string); the page's launchParams may be stale
		let raw: unknown = detail;
		if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
		if (!raw || typeof raw !== 'object' || !(raw as {hearthRemapKey?: unknown}).hearthRemapKey) raw = sys && sys.launchParams;
		if (!raw) return null;
		const params = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {hearthRemapKey?: unknown};
		const name = params && params.hearthRemapKey;
		return typeof name === 'string' && /^(Key_webOS_[A-Za-z0-9]{1,30}|#[0-9]{1,10})$/.test(name) ? canonicalButton(name) : null;
	} catch {
		return null;
	}
}
