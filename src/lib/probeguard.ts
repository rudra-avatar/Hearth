// Tests 45-48 (L2 probe): see probeguardcmd.ts. 45 reads only; 46 shows a pop-up; 47 opens another input; 48 removes the Hearth input.
import {exec} from './apps';
import {classifyFailure} from './failure';
import {alertVerdict, ALERT_COMMAND, deleteCommand, FACTS_COMMAND, launchCommand, LAUNCH_IDS, outLines} from './probeguardcmd';
import {removeInputCommand} from './tvinput';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});

export const GUARD_TESTS: ProbeTest[] = [
	{
		id: 'guardfacts', label: '45. Boot guard: what answers',
		description: 'Reads the uptime, the webOS build, whether the Hearth input is listed, and what the TV\'s input and power methods answer. Reads only. Needs a rooted TV. Send the full line.',
		run: () => exec(FACTS_COMMAND, 25000).then((out) => { const l = outLines(out); return l.length > 2 ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING: no answer'}; }, fail)
	},
	{
		id: 'guardalert', manual: true, label: '46. Boot guard: pop-up on the TV',
		description: 'Asks the TV to show a system pop-up with an OK button and a small toast. Changes nothing. Tell me what appears (pop-up, toast, nothing). Needs a rooted TV.',
		run: () => exec(ALERT_COMMAND, 20000).then((out) => { const v = alertVerdict(out); return {ok: v.ok, text: clip((v.ok ? 'OK: ' : 'FAILED: ') + v.text)}; }, fail)
	},
	{
		id: 'guardswitch', manual: true, label: '47. Boot guard: switch to another input',
		description: 'Starts the HDMI 1 input app, then the live TV app (3 seconds apart) and reads which app is in front. The screen changes; press Home to come back. Tell me what you saw. Needs a rooted TV.',
		run: () => exec(LAUNCH_IDS.map(launchCommand).join('; '), 30000).then((out) => { const l = outLines(out); return l.length > 3 ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING: no answer'}; }, fail)
	},
	{
		id: 'guarddelete', manual: true, label: '48. Boot guard: delete the Hearth input',
		description: 'Run it while the TV is on the Hearth input (add the input in Settings, switch to it, open Hearth from it). Reads the TV\'s last input, deletes the Hearth input, reads again. This REMOVES the Hearth input (add it again in Settings). Send the full line.',
		run: () => exec(deleteCommand(removeInputCommand()), 30000).then((out) => { const l = outLines(out); return l.length > 3 ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING: no answer'}; }, fail)
	}
];
