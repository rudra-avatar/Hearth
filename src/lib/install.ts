// R2-b: install the newest update. Runs the detached root script of `probeinstallcmd.ts` (download, SHA-256 check,
// appInstallService dev/install, files removed) and reads its log. Only on a press in the update screen, rooted TVs only.

import {exec} from './apps';
import {log} from './log';
import {INSTALL_LOG, installLaunch, installText, installWorked, parseInstallLog} from './probeinstallcmd';
import type {UpdateEntry} from './updatecore';

export interface InstallOutcome {ok: boolean}

const READ = `tail -n 40 ${INSTALL_LOG} 2>/dev/null`;
const wait = (ms: number): Promise<void> => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function poll (until: number): Promise<string> {
	return exec(READ, 8000).then((out) => (parseInstallLog(out).ended || Date.now() >= until ? out : wait(5000).then(() => poll(until))));
}

/** True when the entry carries everything an install needs. */
export function canInstall (e: UpdateEntry | undefined): boolean {
	return !!e && !!e.ipkUrl && !!e.sha256 && e.size > 0;
}

export function installUpdate (e: UpdateEntry): Promise<InstallOutcome> {
	let launch: string;
	try { launch = installLaunch({url: e.ipkUrl, sha: e.sha256, version: e.version}); } catch (err) { log('update: install not started (bad entry)'); return Promise.resolve({ok: false}); }
	log(`update: install ${e.version} started`);
	return exec(launch, 15000).then(() => poll(Date.now() + 270000)).then((out) => {
		const l = parseInstallLog(out);
		const ok = installWorked(l);
		log(`update: install ${ok ? 'ok' : 'failed'}: ${installText(l)}`.slice(0, 900));
		return {ok};
	}, (err: Error) => { log(`update: install failed (${String(err && err.message ? err.message : err).slice(0, 80)})`); return {ok: false}; });
}
