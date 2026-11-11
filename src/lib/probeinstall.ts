// Probe test (Tests tab only, 2.0.3 R2-b1): reads what the updater's install script left in /tmp/hearth-install.log.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {HEARTH_VERSION} from '../config/version';
import {INSTALL_ID, INSTALL_LOG, installText, installWorked, parseInstallLog} from './probeinstallcmd';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});
const READ = `tail -n 40 ${INSTALL_LOG} 2>/dev/null`;

function read (): Promise<ProbeResult> {
	return exec(`${READ}; echo "#files"; ls -l ${INSTALL_LOG} 2>/dev/null; echo "#appinfo"; grep -h -o '"version": *"[^"]*"' /media/developer/apps/usr/palm/applications/${INSTALL_ID}/appinfo.json /usr/palm/applications/${INSTALL_ID}/appinfo.json 2>/dev/null | head -2`, 10000).then((out) => {
		const cut = out.indexOf('\n#files');
		const l = parseInstallLog(cut === -1 ? out : out.slice(0, cut));
		const info = out.indexOf('#appinfo');
		const installed = info === -1 ? '' : out.slice(info + 8).trim().replace(/\n/g, ' ');
		return {ok: installWorked(l), text: clip(`${installWorked(l) ? 'OK' : 'NO RESULT'}: ${installText(l)}. Running ${HEARTH_VERSION}; installed files say ${installed || 'unknown'}`)};
	}, fail);
}

export const INSTALL_TESTS: ProbeTest[] = [
	{
		id: 'installlog', label: '37. Read the install log',
		description: 'Reads /tmp/hearth-install.log from the updater and the installed version. Use it when an update stalled or Hearth restarted during it. Reads only. Needs a rooted TV.',
		run: read
	}
];
