// Probe tests 38-41 (Tests tab only, 2.0.3 R3): how early can the TV's app manager (SAM) be told to read a replacement
// for LG Home? The SAM method starts when the Homebrew start-up scripts run; what limits it is when SAM, configd and
// the Luna bus answer. 38: readiness right now. 39: installs a small start-up recorder (changes nothing except a
// harmless trial of configd's blocked-app-list nudge). 40: reads its timeline after a TV restart. 41: removes it.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {writeFileCommands} from './homehookcmd';
import {NOW, PROBE_DIR, PROBE_LINK, RECORDER_SH, summariseTimeline, timelineText, TIMELINE} from './probesamcmd';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});
const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter(Boolean);

function install (): Promise<ProbeResult> {
	const steps = [
		`mkdir -p '${PROBE_DIR}'`,
		...writeFileCommands(`${PROBE_DIR}/probe.sh`, RECORDER_SH),
		`chmod +x '${PROBE_DIR}/probe.sh'`,
		`ln -sf '${PROBE_DIR}/probe.sh' '${PROBE_LINK}'`,
		`[ -L '${PROBE_LINK}' ] && echo linked`
	];
	const run = (i: number): Promise<string> => exec(steps[i], 15000).then((out) => (i === steps.length - 1 ? out : run(i + 1)));
	return run(0).then((out) => (/linked/.test(out)
		? {ok: true, text: 'OK: recorder installed. Switch the TV fully off and on again (power cycle or restart from the Homebrew menu), wait 2 minutes, then run test 40. Run 41 afterwards to remove it.'}
		: {ok: false, text: 'FAILED: the start-up link was not made'}), fail);
}

function read (): Promise<ProbeResult> {
	return exec(`tail -n 130 '${TIMELINE}' 2>/dev/null; true`, 10000).then((out) => {
		const t = summariseTimeline(out);
		if (t.startUp === null && t.rounds === 0) return {ok: false, text: 'NOTHING: no timeline yet (install with 39, then restart the TV, wait 2 minutes)'};
		return {ok: t.rounds > 0, text: clip((t.rounds > 0 ? 'OK: ' : 'FAILED: ') + timelineText(t))};
	}, fail);
}

function remove (): Promise<ProbeResult> {
	return exec(`rm -f '${PROBE_LINK}'; pid=$(cat /tmp/launcher-samprobe.pid 2>/dev/null); [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null; rm -f /tmp/launcher-samprobe.pid; rm -rf '${PROBE_DIR}'; echo removed`, 10000)
		.then((out) => (/removed/.test(out) ? {ok: true, text: 'OK: recorder, link and timeline removed'} : {ok: false, text: 'FAILED: ' + clip(out, 120)}), fail);
}

export const SAM_TESTS: ProbeTest[] = [
	{
		id: 'samnow', label: '38. SAM readiness now',
		description: 'Reads the uptime, what SAM holds for LG Home (stand-in or LG\'s own), whether configd\'s blocked-app list answers (the gentle re-read), whether SAM has blockSystemApp, systemd\'s state, the start-up scripts folder, and whether the recorder of test 39 is installed. Reads only. Needs a rooted TV.',
		run: () => exec(NOW, 20000).then((out) => { const l = lines(out); return l.length > 2 ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING: no answer'}; }, fail)
	},
	{
		id: 'samrec', manual: true, label: '39. SAM start-up recorder: install',
		description: 'Installs a small script that the Homebrew start-up scripts run at every TV start. For 100 seconds it writes, once a second, when SAM, configd and the app in front first answer, and tries configd\'s harmless nudge (the same one the SAM method uses) until it is accepted. Changes nothing else. Then switch the TV fully off and on, wait 2 minutes, run test 40. Remove it with test 41. Needs a rooted TV.',
		run: install
	},
	{
		id: 'samread', manual: true, label: '40. SAM start-up recorder: read',
		description: 'Reads the timeline written during the last TV start: the first second (since the TV started) at which the script ran, SAM answered, configd answered, the nudge was accepted, an app was in front, LG Home was in front and systemd said running. That decides how early the SAM method can start.',
		run: read
	},
	{
		id: 'samoff', manual: true, label: '41. SAM start-up recorder: remove',
		description: 'Deletes the recorder, its start-up link and its timeline.',
		run: remove
	}
];
