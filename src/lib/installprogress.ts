// 2.1.4: progress of the update install. Pure functions (no TV calls), so a node test can run them.
// The install script (probeinstallcmd.ts) writes /tmp/hearth-install.log and downloads into the first install place:
// while it downloads, the size of that file against the size listed in updates.json gives the percentage; after that
// the log lines say which step it is on. The bar is steps, not a promise: the install service gives no percentage.

import {INSTALL_LOG, INSTALL_PLACES, parseInstallLog} from './probeinstallcmd';

export type InstallStep = 'start' | 'download' | 'check' | 'install' | 'finish';

export interface InstallProgress {
	step: InstallStep;
	/** whole bar, 0-100 */
	percent: number;
	/** download only: 0-100 */
	download: number;
}

/** One root command: the end of the log, then a line with the size of the download so far. */
export const PROGRESS_READ = `tail -n 40 ${INSTALL_LOG} 2>/dev/null; echo "@@size $(wc -c < ${INSTALL_PLACES[0]} 2>/dev/null | tr -d ' ')"`;

/** The bar splits like this: 0-3 start, 3-70 download, 70-75 check, 75-95 install, 95-100 finish. */
const DL_FROM = 3;
const DL_TO = 70;

export function downloadedBytes (out: string): number {
	const m = /@@size (\d+)/.exec(String(out));
	return m ? parseInt(m[1], 10) : 0;
}

/** Where the install is, from the text PROGRESS_READ printed and the size the list says the file has. */
export function installProgress (out: string, total: number): InstallProgress {
	const text = String(out);
	const l = parseInstallLog(text);
	if (!l.started) return {step: 'start', percent: 0, download: 0};
	if (l.ended) return {step: 'finish', percent: 100, download: 100};
	if (l.version) return {step: 'finish', percent: 97, download: 100};
	if (l.tries.length) {
		const answers = Math.min(l.luna.length, 10);
		return {step: 'install', percent: 75 + answers * 2, download: 100};
	}
	if (/ sha ok$/m.test(text)) return {step: 'install', percent: 75, download: 100};
	if (/ download size=/.test(text)) return {step: 'check', percent: DL_TO, download: 100};
	const got = downloadedBytes(text);
	const download = total > 0 ? Math.max(0, Math.min(99, Math.floor((got * 100) / total))) : 0;
	return {step: got > 0 ? 'download' : 'start', percent: Math.round(DL_FROM + ((DL_TO - DL_FROM) * download) / 100), download};
}
