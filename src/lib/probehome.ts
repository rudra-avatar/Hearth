// Probe tests 42-43 (Tests tab only, 2.0.3 R7): can the Home button's key hook tell a short press from a long one?
// Pure parts: probehomecmd.ts. Nothing runs at start-up; the keybinds file is put back after 100 s or by test 43.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {READ_COMMAND, homeProbeText, parseHomeProbe, startSteps} from './probehomecmd';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});

function start (): Promise<ProbeResult> {
	const steps = startSteps();
	const run = (i: number): Promise<string> => exec(steps[i], 15000).then((out) => (i === steps.length - 1 ? out : run(i + 1)));
	return run(0).then((out) => {
		const p = parseHomeProbe(out);
		if (p.nopython) return {ok: false, text: 'FAILED: python3 is not on this TV, the test cannot run'};
		if (!p.started) return {ok: false, text: 'FAILED: could not start: ' + clip(out.trim(), 120)};
		return {ok: true, text: `OK: Home button code ${p.code} now only records. Within 100 s: press Home once briefly, wait 3 s, then hold Home for 3 s and let go. Then run test 43.${p.injected === false ? ' Warning: the key hook is not running, nothing will be recorded (turn on "Home button opens Hearth" first).' : ''}`};
	}, fail);
}

function read (): Promise<ProbeResult> {
	return exec(READ_COMMAND, 10000).then((out) => {
		const p = parseHomeProbe(out);
		if (!p.seen) return {ok: false, text: 'NOTHING: run test 42 first'};
		return {ok: p.hits > 0, text: clip(homeProbeText(p))};
	}, fail);
}

export const HOME_TESTS: ProbeTest[] = [
	{
		id: 'homestart', manual: true, label: '42. Home button timing: start',
		description: 'Temporarily makes the Home button write the TV\'s uptime to a file each time the key hook sees it (Hearth\'s Home setting is saved first and put back after 100 s or by test 43). Then press Home briefly once, wait 3 s, hold Home 3 s. Needs a rooted TV with the key hook running and python3.',
		run: start
	},
	{
		id: 'homeread', manual: true, label: '43. Home button timing: read',
		description: 'Shows how often and when the hook ran the command (one hit per press, repeats while held, or down and up), and puts the Home setting back.',
		run: read
	}
];
