// Probe tests 56-57 (Tests tab only, 2.0.3 R2-b1): install the newest GitHub release through root exec, then read what
// happened. 56 REPLACES the running Hearth with the release (the release is older than this build; Hearth may close or
// restart; settings should stay). The work runs in a detached script, so the answer can be read afterwards (57).

import {exec} from './apps';
import {classifyFailure} from './failure';
import {HEARTH_VERSION} from '../config/version';
import {APPS_JSON, FETCH} from './probemore';
import {INSTALL_ID, INSTALL_LOG, installLaunch, installTarget, installText, installWorked, parseInstallLog} from './probeinstallcmd';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});
const wait = (ms: number): Promise<void> => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const READ = `tail -n 40 ${INSTALL_LOG} 2>/dev/null`;

function poll (until: number): Promise<string> {
	return exec(READ, 8000).then((out) => {
		const l = parseInstallLog(out);
		if (l.ended || Date.now() >= until) return out;
		return wait(5000).then(() => poll(until));
	});
}

function install (): Promise<ProbeResult> {
	return exec(`${FETCH(APPS_JSON, '/tmp/hearth-probe.json')}; head -c 6000 /tmp/hearth-probe.json; rm -f /tmp/hearth-probe.json /tmp/hearth-probe.err`, 30000).then((json) => {
		const target = installTarget(json);
		if (typeof target === 'string') return {ok: false, text: `FAILED: ${target}`};
		return exec(installLaunch(target), 15000).then(() => poll(Date.now() + 110000)).then((out) => {
			const l = parseInstallLog(out);
			return {ok: installWorked(l), text: clip(`${installWorked(l) ? 'OK' : l.ended || l.stopped ? 'FAILED' : 'UNKNOWN'}: ${installText(l)}. Was running ${HEARTH_VERSION}`)};
		});
	}, fail);
}

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
		id: 'installrel', manual: true, label: '56. Install the GitHub release (replaces this build)',
		description: 'Downloads the newest release .ipk from GitHub (into /media/developer, then /tmp if the service does not find it), checks its SHA-256, installs it over Hearth (appInstallService dev/install) through root commands and deletes the file (detached, 20 MB, up to 2 minutes). The release is OLDER than this build, so Hearth may close or restart and this build is gone afterwards. Make a settings backup first. Needs a rooted TV and internet.',
		run: install
	},
	{
		id: 'installlog', label: '57. Read the install log',
		description: 'Reads /tmp/hearth-install.log from test 56 and the installed version. Use it when Hearth was closed or restarted during 56. Reads only. Needs a rooted TV.',
		run: read
	}
];
