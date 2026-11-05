// Probe tests 53-55 (Tests tab only, 2.0.3 V probe): what Hearth's own helper service can do WITHOUT root, for a no-root Home
// key helper. The service (services/tld.my.customlauncher.ssap, method `evdev`) only reads /dev/input and, in test 55, asks the
// TV to open Hearth; it writes nothing, grabs no device and ends itself after a listen. Works with or without root.

import {classifyFailure} from './failure';
import {lunaCall} from './luna';
import {SSAP_SERVICE} from './ssapsvc';
import {devicesText, eventsText, parseEvdev, readableCount, sawHome, sawKeys} from './probenorootcmd';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip(`FAILED (${classifyFailure(e)}): ${msg(e)}`)});

function ask (watchMs: number, launch: boolean): Promise<ReturnType<typeof parseEvdev>> {
	return lunaCall<Record<string, unknown>>(SSAP_SERVICE + '/evdev', {watchMs, launch}, watchMs + 20000).then(parseEvdev);
}

export const NOROOT_TESTS: ProbeTest[] = [
	{
		id: 'nrdevices', label: '53. No root: key devices the helper can read',
		description: 'Asks Hearth\'s helper service which user it runs as (0 = root) and which key devices in /dev/input it may open (read only). Works without root. Send the full line.',
		run: () => ask(0, false).then((r) => ({ok: readableCount(r) > 0, text: clip((readableCount(r) > 0 ? 'OK: ' : 'FAILED: ') + devicesText(r))}), fail)
	},
	{
		id: 'nrkeys', manual: true, label: '54. No root: Home key seen by the helper (25 s)',
		description: 'The helper listens to the remote for 25 seconds and counts key events. After pressing OK on this row, press Home once, then Back, then an arrow. It only reads and counts. Works without root. Send the full line.',
		run: () => ask(25000, false).then((r) => ({ok: sawKeys(r), text: clip((sawHome(r) ? 'OK: ' : sawKeys(r) ? 'PARTLY: ' : 'FAILED: ') + eventsText(r))}), fail)
	},
	{
		id: 'nrlaunch', manual: true, label: '55. No root: open Hearth on Home (30 s)',
		description: 'The helper listens for 30 seconds; at the first Home press it asks the TV to open Hearth (a public request) and times it. LG Home opens as usual at the same time, so say whether it flashed before Hearth. Press Home once after OK. Works without root.',
		run: () => ask(30000, true).then((r) => ({ok: !!(r.launch && r.launch.ok), text: clip((r.launch && r.launch.ok ? 'OK: ' : 'FAILED: ') + eventsText(r))}), fail)
	}
];
