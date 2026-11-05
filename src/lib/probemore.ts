// Probe tests 32-36 (Tests tab only, 2.0.3 D): what the TV offers for (a) other ways to map remote buttons, (b) a
// self-update. Nothing is installed or changed; the only file written is a temporary one in /tmp, removed at the end.
// 32: key devices. 33: raw key events (down / repeat / up per key) for 22 s. 34: tools on the TV (python, wget, curl, sha256).
// 35: download the release .ipk from GitHub and compare its SHA-256 with repo/apps.json (no install).
// 36: the Homebrew route (root exec works, which install methods exist). Every answer is also logged to the report file.

import {exec} from './apps';
import {lunaCall} from './luna';
import {classifyFailure} from './failure';
import type {ProbeResult, ProbeTest} from './probe';

const clip = (text: string, n = 700): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);
const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');
const fail = (e: unknown): ProbeResult => ({ok: false, text: clip('FAILED: ' + msg(e))});
const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter(Boolean);

const DEVICES = [
	'for d in /dev/input/event*; do [ -e "$d" ] || continue; n=${d##*/}; echo "$n=$(cat /sys/class/input/$n/device/name 2>/dev/null)"; done',
	'echo "bits=$(getconf LONG_BIT 2>/dev/null) arch=$(uname -m)"'
].join('; ');

const TOOLS = [
	'for c in python3 python wget curl busybox sha256sum openssl unzip tar; do p=$(command -v $c 2>/dev/null); echo "$c=${p:-no}"; done',
	'(python3 -V) 2>&1 | head -c 60',
	'echo "arch=$(uname -m) bits=$(getconf LONG_BIT 2>/dev/null)"'
].join('; ');

const KEY_FILES = '/tmp/hearth-pk.';
const KEY_WINDOW_S = 22;
const KEYS_START = `rm -f ${KEY_FILES}*; for d in /dev/input/event*; do [ -e "$d" ] && (timeout ${KEY_WINDOW_S} cat "$d" > "${KEY_FILES}\${d##*/}" 2>/dev/null < /dev/null &); done; true`;
// per device "#eventN", then "<hex code> <value hex>" for every key event (type 1): value 00 up, 01 down, 02 repeat
const KEYS_READ = 'w=16; o=9; [ "$(getconf LONG_BIT 2>/dev/null)" = 64 ] && { w=24; o=17; }; ' +
	`for f in ${KEY_FILES}event*; do [ -s "$f" ] || continue; echo "#\${f##*.}"; ` +
	'od -An -tx1 -w$w -v "$f" | awk -v o=$o \'$o=="01" && $(o+1)=="00" {print $(o+3) $(o+2), $(o+4)}\'; done; ' +
	`rm -f ${KEY_FILES}*; ` +
	'echo "#hooklog"; tail -n 60 /tmp/lginput-hook-micomservice.log 2>/dev/null | grep -i -E "773|home" | tail -n 6 | cut -c1-90; true';

/** "event1: 773 down1 rep0 up1, 116 ..." from the output of KEYS_READ. */
export function summariseKeys (out: string): {text: string; keys: number; hook: string[]} {
	const per: Record<string, Record<number, number[]>> = {};
	const hook: string[] = [];
	let dev = '';
	lines(out).forEach((l) => {
		if (l.charAt(0) === '#') { dev = l.slice(1); return; }
		if (dev === 'hooklog') { hook.push(l); return; }
		const m = /^([0-9a-f]{4}) ([0-9a-f]{2})$/i.exec(l);
		if (!m || !dev) return;
		const code = parseInt(m[1], 16);
		const value = parseInt(m[2], 16);
		if (!code || value > 2) return;
		const d = per[dev] || (per[dev] = {});
		const c = d[code] || (d[code] = [0, 0, 0]);
		c[value]++;
	});
	let keys = 0;
	const parts = Object.keys(per).map((name) => {
		const codes = Object.keys(per[name]).map((k) => {
			const c = per[name][Number(k)];
			keys += c[1];
			return `${k} down${c[1]} rep${c[2]} up${c[0]}`;
		});
		return `${name}: ${codes.join(', ')}`;
	});
	return {text: parts.join(' | ') || 'no key events seen', keys, hook};
}

export const APPS_JSON = 'https://raw.githubusercontent.com/rudra-avatar/Hearth/main/repo/apps.json';
const IPK_URL = /^https:\/\/github\.com\/rudra-avatar\/Hearth\/releases\/download\/[A-Za-z0-9._\/-]+$/;
export const FETCH = (url: string, out: string): string => `(wget -q -O ${out} "${url}" 2>/tmp/hearth-probe.err || curl -s -L -o ${out} "${url}" 2>>/tmp/hearth-probe.err)`;

/** The newest release's address, size and SHA-256 from the Homebrew list, or why not. */
export function readRelease (json: string): {url: string; sha: string; size: number} | string {
	let data: any;
	try { data = JSON.parse(json); } catch (e) { return 'apps.json is not readable'; }
	const m = data && data.packages && data.packages[0] && data.packages[0].manifest;
	if (!m || typeof m.ipkUrl !== 'string') return 'apps.json has no ipkUrl';
	if (!IPK_URL.test(m.ipkUrl)) return 'ipkUrl is not a Hearth release address';
	const sha = m.ipkHash && typeof m.ipkHash.sha256 === 'string' ? m.ipkHash.sha256.toLowerCase() : '';
	if (!/^[0-9a-f]{64}$/.test(sha)) return 'apps.json has no SHA-256';
	return {url: m.ipkUrl, sha, size: Number(m.ipkSize) || 0};
}

function download (): Promise<ProbeResult> {
	const t0 = Date.now();
	return exec(`${FETCH(APPS_JSON, '/tmp/hearth-probe.json')}; head -c 6000 /tmp/hearth-probe.json; rm -f /tmp/hearth-probe.json; echo; echo "err=$(head -c 120 /tmp/hearth-probe.err 2>/dev/null)"; rm -f /tmp/hearth-probe.err`, 30000).then((out) => {
		const cut = out.lastIndexOf('\nerr=');
		const rel = readRelease(cut === -1 ? out : out.slice(0, cut));
		if (typeof rel === 'string') return {ok: false, text: clip(`FAILED: ${rel}. ${cut === -1 ? '' : out.slice(cut + 1).trim()}`)};
		const cmd = `rm -f /tmp/hearth-probe.ipk; s=$(date +%s); ${FETCH(rel.url, '/tmp/hearth-probe.ipk')}; e=$(date +%s); ` +
			'echo "secs=$((e-s))"; echo "size=$(wc -c < /tmp/hearth-probe.ipk 2>/dev/null)"; ' +
			'echo "sha=$( (sha256sum /tmp/hearth-probe.ipk || openssl dgst -sha256 /tmp/hearth-probe.ipk) 2>/dev/null | grep -o -E "[0-9a-f]{64}" | head -1)"; ' +
			'echo "err=$(head -c 120 /tmp/hearth-probe.err 2>/dev/null)"; rm -f /tmp/hearth-probe.ipk /tmp/hearth-probe.err';
		return exec(cmd, 110000).then((res) => {
			const get = (k: string): string => { const m = new RegExp('^' + k + '=(.*)$', 'm').exec(res); return m ? m[1].trim() : ''; };
			const size = Number(get('size')) || 0;
			const sha = get('sha');
			const same = sha === rel.sha;
			const note = `${size} bytes (expected ${rel.size}) in ${get('secs')} s, SHA-256 ${sha ? (same ? 'matches apps.json' : 'DIFFERS from apps.json') : 'not computed'}${get('err') ? ', error: ' + get('err') : ''}. List read in ${Math.round((Date.now() - t0) / 1000)} s total, nothing installed`;
			return {ok: same && size > 0, text: clip((same ? 'OK: ' : 'FAILED: ') + note)};
		});
	}, fail);
}

const BREW = [
	'echo "exec=ok"',
	'f=$(find /media/developer/apps/usr/palm/services /usr/palm/services -maxdepth 3 -path "*hbchannel*" -name "*.js" 2>/dev/null | head -3 | tr "\\n" " "); echo "svcfiles=${f:-none}"',
	'echo "install words: $(for x in $f; do grep -o -h -i -E "[a-z]*install[a-z]*" $x 2>/dev/null; done | sort -u | head -10 | tr "\\n" " ")"',
	'echo "appInstallService: $(luna-send -n 1 -f luna://com.webos.appInstallService/install \'{}\' 2>&1 | head -c 140 | tr "\\n" " ")"'
].join('; ');

function brew (): Promise<ProbeResult> {
	return exec(BREW, 15000).then((out) => {
		const page = lunaCall('luna://com.webos.appInstallService/install', {}, 5000).then(() => 'answered', (e) => `${classifyFailure(e)} (${msg(e).slice(0, 60)})`);
		return page.then((p) => ({ok: true, text: clip('OK: ' + lines(out).join(' | ') + ' | page call: ' + p)}));
	}, fail);
}

export const MORE_TESTS: ProbeTest[] = [
	{
		id: 'inputdev', label: '32. Key devices',
		description: 'Lists /dev/input/event* with each device\'s name, the TV\'s architecture and word size. Reads only. Needs a rooted TV.',
		run: () => exec(DEVICES, 8000).then((out) => { const l = lines(out); return l.length > 1 ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING FOUND: no key devices listed'}; }, fail)
	},
	{
		id: 'rawkeys', manual: true, label: '33. Raw key events (22 s)',
		description: 'Start it, then within 22 seconds: press Home once briefly, hold Home for 3 seconds, press OK, Back and a colour key. Shows down, repeat and up counts per key code and device, plus what Input Hook logged for Home. Reads only. Needs a rooted TV.',
		run: () => exec(KEYS_START, 8000).then(() => new Promise<void>((resolve) => window.setTimeout(resolve, (KEY_WINDOW_S + 1) * 1000))).then(() => exec(KEYS_READ, 15000)).then((out) => {
			const s = summariseKeys(out);
			return {ok: s.keys > 0, text: clip(`${s.keys > 0 ? 'OK' : 'FAILED'}: ${s.text}${s.hook.length ? ' | hook log: ' + s.hook.join(' / ') : ' | hook log: nothing for Home'}`)};
		}, fail)
	},
	{
		id: 'tools', label: '34. Tools on the TV',
		description: 'Checks for python, wget, curl, sha256sum, openssl, unzip and tar, and the Python version. Reads only. Needs a rooted TV.',
		run: () => exec(TOOLS, 8000).then((out) => { const l = lines(out); return l.length ? {ok: true, text: clip('OK: ' + l.join(' | '))} : {ok: false, text: 'NOTHING: no answer'}; }, fail)
	},
	{
		id: 'download', manual: true, label: '35. Download the release and check it',
		description: 'Reads the release list from GitHub, downloads the newest release .ipk (about 19 MB) to a temporary file, compares its SHA-256 with the list, then deletes it. Nothing is installed. Needs a rooted TV and internet; takes up to 2 minutes.',
		run: download
	},
	{
		id: 'brewroute', label: '36. Homebrew install route',
		description: 'Checks that root commands run and which install methods the Homebrew service and the TV offer (an empty test call, nothing is installed). Needs a rooted TV.',
		run: brew
	}
];
