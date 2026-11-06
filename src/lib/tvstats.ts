// TV load line in the widget: CPU, memory (RAM), storage and network, read from /proc through the
// Homebrew Channel's root shell (rooted TVs only). One small command per sample; the CPU and network
// figures are rates, so they come from the difference between two samples.

import {exec} from './apps';
import {isWebOS} from './luna';
import {t as tt} from '../i18n';

/** How often the line is refreshed while Hearth is in front. */
export const STATS_INTERVAL_MS = 3000;

/** Where the "storage" figure comes from: the TV's user storage (apps, Hearth's files, downloads). */
const STORAGE_MOUNT = '/media';

/** One sample. Sections are split by "@@" so a missing tool never shifts the others. */
export const TV_STATS_COMMAND =
	"echo @@cpu; head -n 1 /proc/stat; " +
	"echo @@mem; grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; " +
	`echo @@df; df -k ${STORAGE_MOUNT} 2>/dev/null | tail -n 1; ` +
	"echo @@net; tail -n +3 /proc/net/dev";

export interface StatsSample {
	at: number;
	/** /proc/stat totals (jiffies): busy and all */
	cpuBusy: number;
	cpuAll: number;
	memTotalKB: number;
	memAvailKB: number;
	diskTotalKB: number;
	diskFreeKB: number;
	/** bytes since start, all interfaces except lo */
	rxBytes: number;
	txBytes: number;
}

export interface StatsView {
	cpu: string;
	ram: string;
	disk: string;
	net: string;
}

function section (out: string, name: string): string {
	const start = out.indexOf('@@' + name);
	if (start < 0) return '';
	const rest = out.slice(start + name.length + 2);
	const end = rest.indexOf('@@');
	return end < 0 ? rest : rest.slice(0, end);
}

/** The output of TV_STATS_COMMAND as numbers (-1 where a figure is missing). */
export function parseSample (out: string, at: number): StatsSample {
	const s: StatsSample = {at, cpuBusy: -1, cpuAll: -1, memTotalKB: -1, memAvailKB: -1, diskTotalKB: -1, diskFreeKB: -1, rxBytes: -1, txBytes: -1};

	const cpu = section(out, 'cpu').trim().split(/\s+/);
	if (cpu[0] === 'cpu' && cpu.length >= 5) {
		const v = cpu.slice(1).map(Number);
		const all = v.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
		const idle = (v[3] || 0) + (v[4] || 0);            // idle + iowait
		s.cpuAll = all;
		s.cpuBusy = all - idle;
	}

	const mem = section(out, 'mem');
	const total = /MemTotal:\s+(\d+)/.exec(mem);
	const avail = /MemAvailable:\s+(\d+)/.exec(mem);
	if (total) s.memTotalKB = Number(total[1]);
	if (avail) s.memAvailKB = Number(avail[1]);

	const df = section(out, 'df').trim().split(/\s+/);
	if (df.length >= 4 && /^\d+$/.test(df[1]) && /^\d+$/.test(df[3])) {
		s.diskTotalKB = Number(df[1]);
		s.diskFreeKB = Number(df[3]);
	}

	let rx = 0, tx = 0, any = false;
	for (const line of section(out, 'net').split('\n')) {
		const colon = line.indexOf(':');
		if (colon < 0) continue;
		const name = line.slice(0, colon).trim();
		if (!name || name === 'lo') continue;
		const f = line.slice(colon + 1).trim().split(/\s+/).map(Number);
		if (f.length < 9 || !isFinite(f[0]) || !isFinite(f[8])) continue;
		rx += f[0]; tx += f[8]; any = true;
	}
	if (any) { s.rxBytes = rx; s.txBytes = tx; }
	return s;
}

function gb (kb: number): string {
	const v = kb / 1048576;
	return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

/** Bits per second as a short rate: "840 Kbit/s" or "12.4 Mbit/s" (translated units). */
function rate (bytesPerSec: number): string {
	const bits = Math.max(0, bytesPerSec) * 8;
	if (bits >= 1e6) {
		const m = bits / 1e6;
		return tt('stats.mbit', {v: m >= 100 ? m.toFixed(0) : m.toFixed(1)});
	}
	return tt('stats.kbit', {v: Math.round(bits / 1e3)});
}

/** The text of the line from the newest sample and the one before it (null before there is anything to show). */
export function statsView (prev: StatsSample | null, cur: StatsSample | null): StatsView | null {
	if (!cur) return null;
	const dash = '–';

	let cpu = dash;
	if (prev && prev.cpuAll >= 0 && cur.cpuAll > prev.cpuAll) {
		const pct = Math.round(100 * (cur.cpuBusy - prev.cpuBusy) / (cur.cpuAll - prev.cpuAll));
		cpu = `${Math.max(0, Math.min(100, pct))}%`;
	}

	let ram = dash;
	if (cur.memTotalKB > 0 && cur.memAvailKB >= 0) {
		const used = cur.memTotalKB - cur.memAvailKB;
		ram = tt('stats.ofGb', {used: gb(used), total: gb(cur.memTotalKB)});
	}

	let disk = dash;
	if (cur.diskTotalKB > 0 && cur.diskFreeKB >= 0) disk = tt('stats.freeGb', {free: gb(cur.diskFreeKB)});

	let net = dash;
	if (prev && prev.rxBytes >= 0 && cur.rxBytes >= 0 && cur.at > prev.at) {
		const sec = (cur.at - prev.at) / 1000;
		const down = cur.rxBytes >= prev.rxBytes ? (cur.rxBytes - prev.rxBytes) / sec : 0;   // a counter reset reads as 0, not negative
		const up = cur.txBytes >= prev.txBytes ? (cur.txBytes - prev.txBytes) / sec : 0;
		net = `↓ ${rate(down)}  ↑ ${rate(up)}`;
	}

	return {cpu, ram, disk, net};
}

export function readSample (): Promise<StatsSample | null> {
	if (!isWebOS()) return Promise.resolve(null);
	return exec(TV_STATS_COMMAND, 4000).then((out) => parseSample(out, Date.now())).catch(() => null);
}
