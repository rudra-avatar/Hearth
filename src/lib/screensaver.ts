// "Custom Screen Saver" (experimental): the script and the QML are written to the TV by the launcher itself.
// See screensavercmd.ts for the commands and src/screensaver for the files.

import screensaverSh from '../screensaver/screensaver.sh?raw';
import qml from '../screensaver/main.qml?raw';
import {exec} from './apps';
import {classifyFailure, failureReason} from './failure';
import {isWebOS} from './luna';
import {careNumber, fillNumber, saverRecursive, saverSource} from './saverconfig';
import type {UserConfig} from './storage';
import {
	applyCommand, installSteps, lastLine, parseExit, parseSaverResult, parseShown, REMOVE_COMMAND, SAVER_VERSION, SHOW_COMMAND, VERSION_COMMAND, withStatus,
	type SaverResult, type SaverSettings
} from './screensavercmd';
import {t as tt} from '../i18n';

export {saverMessage} from './screensavercmd';
export type {SaverResult};

const lf = (text: string): string => text.replace(/\r\n?/g, '\n');
const FILES = {screensaverSh: lf(screensaverSh), qml: lf(qml)};

/** What the screen saver is told: the folder or picture (see saverconfig.ts), and its own speed, shuffle and dim settings. */
export function saverSettings (c: UserConfig): SaverSettings {
	return {source: saverSource(c), interval: c.screensaverInterval, shuffle: c.screensaverShuffle, dim: c.screensaverDim, care: careNumber(c.screensaverCare), fill: fillNumber(c.screensaverFit), powerOff: c.screensaverPowerOff, recursive: saverRecursive(c), dimLevel: c.screensaverDimLevel};
}

export interface SaverOutcome {
	result: SaverResult;
	detail: string;
}

export function installSaver (c: UserConfig): Promise<SaverOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('screensaver.notRunningOnATv')});
	const steps = installSteps(FILES, saverSettings(c));
	const run = (i: number): Promise<SaverOutcome> => {
		const step = steps[i];
		return exec(withStatus(step.command), 30000).then(
			(output): SaverOutcome | Promise<SaverOutcome> => {
				if (i === steps.length - 1) return {result: parseSaverResult(output), detail: lastLine(output)};
				const code = parseExit(output);
				if (code !== 0) return {result: 'failed', detail: `${step.name}: ${lastLine(output) || 'exit ' + code}`};
				return run(i + 1);
			},
			(error: Error): SaverOutcome => ({result: 'failed', detail: `${step.name}: ${failureReason(classifyFailure(error), error && error.message ? error.message : '')}`})
		);
	};
	return run(0).then((outcome) => (outcome.result === 'applied' ? outcome : removeSaver().then(() => outcome)));
}

export interface SaverReapplied extends SaverOutcome {
	/** it can't work on this TV: turn the setting off */
	fatal: boolean;
	/** the Homebrew service did not answer: try again later */
	unreachable?: boolean;
}

/** After a restart or a change of the wallpaper settings: makes sure the screen saver is in place with the current settings
 *  (an older copy of the files on the TV is rewritten first). */
export function reapplySaver (c: UserConfig): Promise<SaverReapplied> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('screensaver.notRunningOnATv'), fatal: false});
	const done = (o: SaverOutcome): SaverReapplied => ({...o, fatal: o.result !== 'applied' && o.result !== 'failed'});
	return exec(VERSION_COMMAND, 6000).then((out) => out.trim(), () => null).then((installed): SaverReapplied | Promise<SaverReapplied> => {
		if (installed === null) return {result: 'failed', detail: tt('screensaver.theHomebrewServiceDidNot'), fatal: false, unreachable: true};
		if (installed !== SAVER_VERSION) return installSaver(c).then(done);
		return exec(applyCommand(saverSettings(c)), 30000).then((output) => done({result: parseSaverResult(output), detail: lastLine(output)}), () => ({result: 'failed' as SaverResult, detail: '', fatal: false, unreachable: true}));
	});
}

/** Starts the TV's screen saver now, to try it. */
export function showSaver (): Promise<boolean> {
	if (!isWebOS()) return Promise.resolve(false);
	return exec(SHOW_COMMAND, 8000).then(parseShown).catch(() => false);
}

/** Switches it off: the TV's own screen saver is back, and everything it added is deleted. */
export function removeSaver (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	return exec(REMOVE_COMMAND, 30000).then(() => undefined).catch(() => undefined);
}
