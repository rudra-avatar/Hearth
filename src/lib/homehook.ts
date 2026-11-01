// "Open this launcher instead of LG Home": a small background watcher opens the launcher whenever the
// TV brings LG Home to the front. The launcher writes the scripts itself, so there is nothing to copy
// by hand. Nothing is replaced. See homehookcmd.ts for the commands and src/homehook for the scripts.

import applySh from '../homehook/apply.sh?raw';
import diagnoseSh from '../homehook/diagnose.sh?raw';
import stockSh from '../homehook/stock.sh?raw';
import watchSh from '../homehook/watch.sh?raw';
import {exec} from './apps';
import {classifyFailure, failureReason} from './failure';
import {isWebOS} from './luna';
import {t as tt} from '../i18n';
import {
	ALIVE_FILE, APPLY_COMMAND, HOOK_VERSION, installSteps, lastLine, parseExit, parseHookResult,
	parseHookStatus, REMOVE_COMMAND, STATUS_COMMAND, STOCK_COMMAND, VERSION_COMMAND, withStatus,
	type HookResult, type HookStatus
} from './homehookcmd';

export type {HookResult, HookStatus};

// The TV's shell reads a carriage return as part of the word ("then\r"), so scripts from a Windows checkout would fail
// with "syntax error". Always send them with plain line ends (idea from pull request #6, ganondorft).
const lf = (text: string): string => text.replace(/\r\n?/g, '\n');
const FILES = {watchSh: lf(watchSh), applySh: lf(applySh), stockSh: lf(stockSh), diagnoseSh: lf(diagnoseSh)};

export function getHookStatus (): Promise<HookStatus | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(STATUS_COMMAND, 6000).then(parseHookStatus).catch(() => null);
}

export interface HookOutcome {
	result: HookResult;
	/** for a failure: which step, and what the TV said */
	detail: string;
}

/** Writes the scripts, adds the boot link, and starts the watcher, one small step at a time.
 *  If it can't be done everything it added is removed again, and the outcome says why. */
export function installHomeHook (): Promise<HookOutcome> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('homehook.notRunningOnATv')});
	const steps = installSteps(FILES);
	const run = (i: number): Promise<HookOutcome> => {
		const step = steps[i];
		return exec(withStatus(step.command), 15000).then(
			(output): HookOutcome | Promise<HookOutcome> => {
				if (i === steps.length - 1) return {result: parseHookResult(output), detail: lastLine(output)};
				const code = parseExit(output);
				if (code !== 0) return {result: 'failed', detail: `${step.name}: ${lastLine(output) || 'exit ' + code}`};
				return run(i + 1);
			},
			(error: Error): HookOutcome => ({result: 'failed', detail: `${step.name}: ${failureReason(classifyFailure(error), error && error.message ? error.message : '')}`})
		);
	};
	return run(0).then((outcome) => outcome.result === 'applied' ? outcome : removeHomeHook().then(() => outcome));
}

export interface Reapplied extends HookOutcome {
	/** it can't work on this TV (or was removed): turn the setting off */
	fatal: boolean;
	/** the Homebrew service did not answer (it is often not up yet just after the TV starts): try again later, change nothing */
	unreachable?: boolean;
}

/** Makes sure the watcher is running (after a reboot, or when the launcher opens). If the copy on the TV
 *  is from an older version of the launcher, it is rewritten first, so updating the launcher updates it. */
export function reapplyHomeHook (): Promise<Reapplied> {
	if (!isWebOS()) return Promise.resolve({result: 'failed', detail: tt('homehook.notRunningOnATv'), fatal: false});
	return exec(VERSION_COMMAND, 6000).then((out) => out.trim(), () => null).then((installed): Reapplied | Promise<Reapplied> => {
		if (installed === null) return {result: 'failed', detail: tt('homehook.theHomebrewServiceDidNot'), fatal: false, unreachable: true};
		if (installed !== HOOK_VERSION) {
			return installHomeHook().then((outcome): Reapplied => ({...outcome, fatal: outcome.result !== 'applied'}));
		}
		return applyHomeHook().then((result): Reapplied => ({result, detail: '', fatal: result === 'launcher-missing' || result === 'files-missing'}));
	});
}

/** Starts the watcher if it isn't running. */
export function applyHomeHook (): Promise<HookResult> {
	if (!isWebOS()) return Promise.resolve('failed');
	return exec(APPLY_COMMAND, 10000).then(parseHookResult).catch((): HookResult => 'failed');
}

/** Tells the watcher that LG's own Home is wanted, so it can be opened. */
export function stockHome (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	return exec(STOCK_COMMAND, 10000).then(() => undefined).catch(() => undefined);
}

/** Stops the watcher and deletes everything the setting added. */
export function removeHomeHook (): Promise<void> {
	if (!isWebOS()) return Promise.resolve();
	return exec(REMOVE_COMMAND, 10000).then(() => undefined).catch(() => undefined);
}

const LOG_FILE = '/tmp/launcher-homehook.log';

function cleanForLog (text: string): string {
	return text.replace(/[^A-Za-z0-9 :._,-]/g, '_');
}

/** Adds a line to the helper's log, e.g. how long the launcher took to show its first screen. */
export function logLine (text: string): void {
	if (!isWebOS()) return;
	exec(`echo "${logText(text)}" >> ${LOG_FILE}`, 4000).catch(() => undefined);
}

/** The page's own clock, HH:MM:SS: the time the event happened (a log line is written later, when exec answers). */
function eventStamp (): string {
	const d = new Date();
	const two = (n: number) => (n < 10 ? '0' : '') + n;
	return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** One log line: event time, text, then the time and uptime when the TV wrote it (a gap shows a late write). */
function logText (text: string): string {
	return `${eventStamp()} ${cleanForLog(text)} (written $(date '+%H:%M:%S') up=$(cut -d. -f1 /proc/uptime)s)`;
}

/** How this page was started (PalmSystem.launchParams), short and safe for the log; 'none' when empty. */
export function launchParams (): string {
	try {
		const ps = (window as unknown as {PalmSystem?: {launchParams?: string}}).PalmSystem;
		const raw = ps && ps.launchParams ? String(ps.launchParams) : '';
		return raw && raw !== '{}' ? cleanForLog(raw).slice(0, 80) : 'none';
	} catch (e) { return 'none'; }
}

/** Tells the helper this launcher is on screen (it checks for this after opening the launcher). */
export function markAlive (): void {
	if (!isWebOS()) return;
	exec(`touch '${ALIVE_FILE}'`, 4000).catch(() => undefined);
}

/** markAlive, with an optional line for the log, in ONE call to the TV (each call starts a shell, and the TV is
 *  busiest just as the launcher comes up). With `repeat`, the TV itself touches the file again 1 and 2 seconds
 *  later. The helper starts its check when the TV reports the launcher in front, and that report can arrive just
 *  after the launcher became visible; the later touches make sure the check finds one newer than its start. */
export function markAliveSoon (note?: string, repeat: boolean = true): void {
	if (!isWebOS()) return;
	const parts = [`touch '${ALIVE_FILE}'`];
	if (note) parts.push(`echo "${logText(note)}" >> ${LOG_FILE}`);
	if (repeat) parts.push(`( nohup sh -c "sleep 1; touch '${ALIVE_FILE}'; sleep 1; touch '${ALIVE_FILE}'" >/dev/null 2>&1 </dev/null & )`);
	exec(parts.join('; '), 4000).catch(() => undefined);
}

export function hookMessage (result: HookResult, detail = ''): string {
	switch (result) {
		case 'applied': return tt('homehook.onLgHomeNow');
		case 'launcher-missing': return tt('homehook.theLauncherMustBe');
		case 'files-missing': return tt('homehook.theHelperFilesAre');
		default: return tt('homehook.couldnTSetThat', {detail: detail ? ': ' + detail : ''});
	}
}
