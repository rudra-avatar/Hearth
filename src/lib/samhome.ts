// "Replace LG Home with SAM" (2.0.3 R3; experimental, rooted only). Writes the stand-in and its script to the TV, switches
// the method on or off, and keeps it in place. Commands: samhomecmd.ts. Scripts: src/takeover.

import shimHtml from '../takeover/shim.html?raw';
import takeoverSh from '../takeover/takeover.sh?raw';
import {exec} from './apps';
import {classifyFailure, failureReason} from './failure';
import {isWebOS} from './luna';
import {t as tt} from '../i18n';
import {removeTakeover} from './takeover';
import {
	lastLine, parseExit, parseSamResult, parseSamStatus, SAM_APPLY_COMMAND, SAM_ON_COMMAND, SAM_STATUS_COMMAND, SAM_STOCK_COMMAND,
	SAM_VERSION, SAM_VERSION_COMMAND, samInstallSteps, samRewriteSteps, withStatus,
	type SamResult, type SamStatus
} from './samhomecmd';

export type {SamResult, SamStatus};

// plain line ends only: the TV's shell reads a carriage return as part of the word (same rule as the helper)
const lf = (text: string): string => text.replace(/\r\n?/g, '\n');
const FILES = {takeoverSh: lf(takeoverSh), shimHtml: lf(shimHtml)};

export function getSamStatus (): Promise<SamStatus | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(SAM_STATUS_COMMAND, 12000).then(parseSamStatus).catch(() => null);
}

export interface SamOutcome {
	result: SamResult;
	/** for a failure: which step, and what the TV said */
	detail: string;
}

function runSteps (steps: {name: string; command: string}[]): Promise<SamOutcome | null> {
	const run = (i: number): Promise<SamOutcome | null> => {
		if (i >= steps.length) return Promise.resolve(null);
		const step = steps[i];
		return exec(withStatus(step.command), 15000).then(
			(output): SamOutcome | null | Promise<SamOutcome | null> => {
				const code = parseExit(output);
				return code !== 0 ? {result: 'failed', detail: `${step.name}: ${lastLine(output) || 'exit ' + code}`} : run(i + 1);
			},
			(error: Error): SamOutcome => ({result: 'failed', detail: `${step.name}: ${failureReason(classifyFailure(error), error && error.message ? error.message : '')}`})
		);
	};
	return run(0);
}

/** Writes the files, then switches the method on (this can take up to a minute and may restart SAM). When it does
 *  not end `applied`, everything it added is removed again. */
export function installSamHome (): Promise<SamOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('homehook.notRunningOnATv')});
	return runSteps(samInstallSteps(FILES)).then((failed): Promise<SamOutcome> => {
		if (failed) return removeTakeover().then(() => failed);
		return exec(SAM_ON_COMMAND, 120000).then(
			(output): SamOutcome => ({result: parseSamResult(output), detail: lastLine(output)}),
			(error: Error): SamOutcome => ({result: 'failed', detail: `${failureReason(classifyFailure(error), error && error.message ? error.message : '')}`})
		).then((outcome) => (outcome.result === 'applied' || outcome.result === 'busy' ? outcome : removeTakeover().then(() => outcome)));
	});
}

export interface SamReapplied extends SamOutcome {
	/** it cannot work on this TV (or Hearth is no longer there): turn the setting off */
	fatal: boolean;
	/** the Homebrew service did not answer yet (just after the TV starts): try again later, change nothing */
	unreachable?: boolean;
}

/** After a TV start or when Hearth opens: rewrites the two files if they are from an older Hearth (nothing is
 *  switched), then lets the script check that the stand-in is in place. Cheap when it is. */
export function reapplySamHome (): Promise<SamReapplied> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('homehook.notRunningOnATv'), fatal: false});
	return exec(SAM_VERSION_COMMAND, 6000).then((out) => out.trim(), () => null).then((installed): SamReapplied | Promise<SamReapplied> => {
		if (installed === null) return {result: 'failed', detail: tt('homehook.theHomebrewServiceDidNot'), fatal: false, unreachable: true};
		const apply = (): Promise<SamReapplied> => exec(SAM_APPLY_COMMAND, 60000).then(
			(output): SamReapplied => { const result = parseSamResult(output); return {result, detail: '', fatal: result === 'launcher-missing' || result === 'files-missing'}; },
			(): SamReapplied => ({result: 'failed', detail: '', fatal: false})
		);
		if (installed === SAM_VERSION) return apply();
		return runSteps(samRewriteSteps(FILES)).then((failed) => (failed ? {...failed, fatal: false} : apply()));
	});
}

/** Switches the method off: LG Home gets its place back (after the next restart of the TV where SAM had to be restarted). */
export function removeSamHome (): Promise<boolean> {
	return removeTakeover();
}

/** The LG Home tile: LG's own Home is wanted; the script puts it back and takes the place again once it is left. */
export function stockSam (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	return exec(SAM_STOCK_COMMAND, 30000).then(() => undefined).catch(() => undefined);
}

export function samMessage (result: SamResult, detail = ''): string {
	switch (result) {
		case 'applied': return tt('samhome.hearthIsInLg');
		case 'launcher-missing': return tt('homehook.theLauncherMustBe');
		case 'files-missing': return tt('homehook.theHelperFilesAre');
		case 'needs-restart': return tt('samhome.thisTvNeedsSam');
		case 'busy': return tt('samhome.stillWorkingOnIt');
		default: return tt('samhome.couldnTSetThat', {detail: detail ? ': ' + detail : ''});
	}
}
