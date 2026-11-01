// Probe tests 26-27 (Tests tab only), for the planned "bind the Home button to Hearth" option (needs the Input Hook app).
// 26: does a web page receive the remote's keys, and does the Home button reach it? It lists every key seen
//     (key code, name) during 20 seconds and whether the page was hidden or shown meanwhile.
// 27: (rooted TVs) is Input Hook installed, where are its files, and what does its log say? Only reads.

import {exec} from './apps';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 230): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');

const WINDOW_MS = 20000;

/** A short word for what a key press is, as far as the page can tell. */
function describe (e: KeyboardEvent): string {
	const name = e.key && e.key !== 'Unidentified' ? e.key : e.code || '';
	return `${e.keyCode}${name ? ' ' + name : ''}`;
}

function captureKeys (): Promise<ProbeResult> {
	return new Promise<ProbeResult>((resolve) => {
		const seen: string[] = [];
		const events: string[] = [];
		const t0 = Date.now();
		const stamp = () => `${Math.round((Date.now() - t0) / 1000)}s`;
		const onKey = (e: KeyboardEvent) => {
			const d = describe(e);
			if (seen.indexOf(d) === -1) seen.push(d);
		};
		const onVis = () => events.push(`${document.hidden ? 'hidden' : 'shown'} at ${stamp()}`);
		window.addEventListener('keydown', onKey, true);
		document.addEventListener('visibilitychange', onVis);
		window.setTimeout(() => {
			window.removeEventListener('keydown', onKey, true);
			document.removeEventListener('visibilitychange', onVis);
			const keys = seen.length ? seen.join(', ') : 'none';
			resolve({
				ok: seen.length > 0,
				text: clip(`Keys seen (code name): ${keys}. Page ${events.length ? events.join(', ') : 'stayed visible'}.`)
			});
		}, WINDOW_MS);
	});
}

const SCRIPT = [
	'for d in /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service /var/lib/webosbrew /home/root/.config/lginputhook /home/root/.config/lg-input-hook /media/developer/apps/usr/palm/applications/*input*hook*; do [ -e "$d" ] && echo "have: $d"; done',
	'find /var/lib /home/root /media/developer -maxdepth 5 -iname "keybinds*" 2>/dev/null | head -4 | sed "s/^/file: /"',
	'ls /tmp/lginput* 2>/dev/null | head -3 | sed "s/^/log: /"',
	'tail -n 4 /tmp/lginput-hook-micomservice.log 2>/dev/null | cut -c1-80 | sed "s/^/last: /"'
].join('; ');

export const KEY_TESTS: ProbeTest[] = [
	{
		id: 'homekey', manual: true, label: '26. Remote keys and the Home button',
		description: 'Starts a 20 second window: press Home, then other keys (Back, a colour key, Menu), and come back to Hearth. Lists every key code the page received and whether the page was hidden.',
		run: captureKeys
	},
	{
		id: 'inputhook', label: '27. Input Hook files and log',
		description: 'Looks for the Input Hook app\'s files (keybinds) and the last lines of its log. Reads only. Needs a rooted TV.',
		run: () => exec(SCRIPT, 8000).then((out) => {
			const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
			return lines.length ? {ok: true, text: clip('OK: ' + lines.join(' | '))} : {ok: false, text: 'NOTHING FOUND: no Input Hook files or log in the usual places'};
		}, (e) => ({ok: false, text: clip('FAILED: ' + msg(e))}))
	}
];
