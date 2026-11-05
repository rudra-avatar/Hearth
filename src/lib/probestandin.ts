// Probe tests 49-52 (Tests tab only, 2.0.3 V probe): the root stand-in way of replacing a NATIVE LG Home. Pure parts and the
// scripts: probestandincmd.ts. 49 reads only. 50 mounts the stand-in over LG Home's program (RAM only; auto-undo after 20 minutes,
// a restart also puts LG's Home back). 51 reads what the stand-in logged. 52 puts LG's Home back.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {writeFileCommands} from './homehookcmd';
import {
	clip, DIR, FACTS_COMMAND, factsText, factsVerdict, launchRequest, logText, MOUNT_COMMAND, overlayAppinfo, PRE_COMMAND, READ_COMMAND,
	STAGE_COMMAND, STANDIN_SH, STOCK_APPINFO_COMMAND, summariseLog, UNDO_COMMAND, UNDO_SH, AUTO_UNDO_SECONDS
} from './probestandincmd';
import type {ProbeResult, ProbeTest} from './probe';

const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});

const REFUSALS: Record<string, string> = {
	nohome: 'LG Home has no manifest on this TV',
	noexe: 'LG Home\'s program file was not found',
	nohearth: 'Hearth\'s own folder was not found under /media/developer/apps',
	already: 'a stand-in is already mounted: run test 52 first',
	samhome: 'the SAM method (*Home app: SAM stand-in*) is on: switch it off first, then run this again'
};

function facts (): Promise<ProbeResult> {
	return exec(FACTS_COMMAND, 30000).then((out) => {
		const v = factsVerdict(out);
		return {ok: v.ok, text: clip(`${v.text} || ${factsText(out)}`)};
	}, fail);
}

function setUp (): Promise<ProbeResult> {
	let exe = '';
	return exec(PRE_COMMAND, 10000)
		.then((out) => {
			const word = out.trim().split('\n').pop() || '';
			const m = /^ok exe=(\S+)/.exec(word);
			if (!m) throw new Error(REFUSALS[word.trim()] || 'not ready: ' + clip(word, 80));
			exe = m[1];
			return exec(STOCK_APPINFO_COMMAND, 10000);
		})
		.then((stock) => {
			const desc = overlayAppinfo(stock);
			if (!desc) throw new Error('LG Home\'s manifest could not be read or is not LG Home\'s');
			const steps = [
				STAGE_COMMAND,
				...writeFileCommands(`${DIR}/overlay/appinfo.json`, JSON.stringify(desc)),
				...writeFileCommands(`${DIR}/wam-launch.json`, launchRequest(desc, false)),
				...writeFileCommands(`${DIR}/wam-launch.json.str`, launchRequest(desc, true)),
				...writeFileCommands(`${DIR}/standin.sh`, STANDIN_SH),
				...writeFileCommands(`${DIR}/undo.sh`, UNDO_SH),
				MOUNT_COMMAND
			];
			const run = (i: number): Promise<string> => exec(steps[i], i === 0 ? 60000 : 15000).then((out) => (i === steps.length - 1 ? out : run(i + 1)));
			return run(0);
		})
		.then((out) => (/mounted exe=/.test(out)
			? {ok: true, text: `OK: the stand-in is mounted over ${exe}. LG's Home is stopped once. Now PRESS HOME on the remote (leave every other Home setting as it is, and do not press a mapped key). Watch the screen: does LG Home show first? Press Home a few times, also from an app. Then run test 51. Test 52 (or a TV restart, or ${AUTO_UNDO_SECONDS / 60} minutes) puts LG's Home back.`}
			: {ok: false, text: 'FAILED: the mount did not work: ' + clip(out.trim(), 160)}), (e) => fail(e));
}

function read (): Promise<ProbeResult> {
	return exec(READ_COMMAND, 10000).then((out) => {
		const s = summariseLog(out);
		if (!s.started && !s.starts && !s.relaunches) return {ok: false, text: 'NOTHING: the stand-in has not run yet (run test 50, then press Home)'};
		const lastLines = out.split('\n').filter((l) => /standin|undo|test:/.test(l)).slice(-5).map((l) => l.replace(/^(\d+\.\d+) standin\[\d+\]: /, '$1 ').slice(0, 110));
		return {ok: s.shown > 0, text: clip((s.shown > 0 ? 'OK: ' : 'FAILED: ') + logText(s) + ' || ' + lastLines.join(' / '))};
	}, fail);
}

function undo (): Promise<ProbeResult> {
	return exec(UNDO_COMMAND, 20000).then((out) => (/restored/.test(out)
		? {ok: true, text: 'OK: the stand-in is removed and LG\'s Home is back (press Home to see it). The log is kept in ' + DIR + '/last.log'}
		: /nothing/.test(out) ? {ok: true, text: 'OK: nothing was set up'} : {ok: false, text: 'FAILED: ' + clip(out.trim(), 160)}), fail);
}

export const STANDIN_TESTS: ProbeTest[] = [
	{
		id: 'standinfacts', label: '49. Stand-in: what this TV has',
		description: 'Reads whether LG Home is a native program here, where it is, what SAM and webapp-mgr answer, which tools exist and whether another Home replacement is mounted. Reads only. Needs a rooted TV. Send the full line.',
		run: facts
	},
	{
		id: 'standinon', manual: true, label: '50. Stand-in: set up and mount',
		description: 'Copies Hearth\'s files into a staging folder, mounts a small script over LG Home\'s program (RAM only, no start-up link), stops LG\'s Home once, and arms an automatic undo after 20 minutes. Then press Home. Needs a rooted TV and the SAM method switched off.',
		run: setUp
	},
	{
		id: 'standinread', manual: true, label: '51. Stand-in: read the log',
		description: 'Shows what the stand-in did: how often SAM started it, how many Home presses arrived as events, how long webapp-mgr took to open Hearth, whether it could register with SAM and what was in front two seconds later.',
		run: read
	},
	{
		id: 'standinoff', manual: true, label: '52. Stand-in: undo',
		description: 'Stops the stand-in, unmounts it and closes Hearth\'s copy so LG\'s Home is back. Safe to run twice.',
		run: undo
	}
];
