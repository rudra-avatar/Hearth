// Why a call to the TV failed, in words a person can act on, and whether this TV can run shell commands at all.
// Nothing here makes a call of its own: `exec` (apps.ts) reports each result, so knowing costs nothing extra.

import {t} from './i18n';

export type Failure = 'not-webos' | 'no-service' | 'denied' | 'timeout' | 'failed';

/** Can this TV run commands through the Homebrew Channel? 'unknown' until a call has been answered or refused. */
export type RootState = 'unknown' | 'yes' | 'no';

export function classifyFailure (error: unknown): Failure {
	const text = String(error && (error as Error).message ? (error as Error).message : error || '');
	if (/not running on webos/i.test(text)) return 'not-webos';
	if (/timed out/i.test(text)) return 'timeout';
	if (/does not exist|not exist|unknown service|not registered|no such service|service .*not (found|running|available)/i.test(text)) return 'no-service';
	if (/denied|permission|not allowed|not authori[sz]ed|forbidden/i.test(text)) return 'denied';
	return 'failed';
}

/** One short sentence for each kind of failure. `detail` is what the TV itself said, if anything. */
export function failureReason (kind: Failure, detail = ''): string {
	switch (kind) {
		case 'not-webos': return t('failure.notWebos');
		case 'no-service': return t('failure.noService');
		case 'denied': return t('failure.denied');
		case 'timeout': return t('failure.timeout');
		default: return detail ? t('failure.failed', {detail}) : t('failure.default');
	}
}

/** "Couldn't <doing>. <reason>" */
export function failureText (error: unknown, doing: string): string {
	const kind = classifyFailure(error);
	const detail = String(error && (error as Error).message ? (error as Error).message : '').slice(0, 80);
	return t('app.couldNotDo', {doing}) + '. ' + failureReason(kind, detail);
}

let state: RootState = 'unknown';
let lastKind: Failure | null = null;
let lastDetail = '';

/** Called by `exec` after every call. An answer (even an error from the command itself) proves the service is
 *  there; "no such service" or "denied" means this TV can't run commands. A timeout proves nothing either way. */
export function noteExec (error?: unknown): void {
	if (error === undefined) { state = 'yes'; lastKind = null; lastDetail = ''; return; }
	const kind = classifyFailure(error);
	lastKind = kind;
	lastDetail = String(error && (error as Error).message ? (error as Error).message : '').slice(0, 80);
	if (kind === 'no-service' || kind === 'denied') state = 'no';
	else if (kind === 'failed') state = 'yes';
}

export function rootState (): RootState { return state; }

/** The kind of the most recent failed call (null when the last call worked). */
export function lastFailure (): Failure | null { return lastKind; }

/** What the TV said the last time a call failed ("" when it worked). */
export function lastFailureDetail (): string { return lastDetail; }

/** " (reason)" for the end of a message, or "" when nothing is known. */
export function whySuffix (): string {
	return lastKind && lastKind !== 'failed' ? `. ${failureReason(lastKind)}` : '';
}

/** For tests. */
export function resetRootState (): void { state = 'unknown'; lastKind = null; lastDetail = ''; }
