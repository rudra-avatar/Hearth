// Tests for the TV load line (src/lib/tvstats.ts): reading one sample and turning two samples into the shown text.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, entryPoints: [new URL('../src/lib/tvstats.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-tvstats-test.mjs', platform: 'node', logLevel: 'error'});
const s = await import(dir + '.cache-tvstats-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// what TV_STATS_COMMAND printed on an LG OLED65C4 (webOS 10.3.1)
const out = (cpu, rx, tx) => [
	'@@cpu', cpu,
	'@@mem', 'MemTotal:        2030388 kB', 'MemAvailable:     651640 kB',
	'@@df', '/dev/mmcblk0p59        6218996   1809432   4393180  29% /mnt/lg/appstore',
	'@@net',
	` wlan0: ${rx}    5766    0   30    0     0          0         0   ${tx}    4656    1    0    0     0       0          0`,
	'  eth0:       0       0    0    0    0     0          0         0        0       0    0    0    0     0       0          0',
	'    lo:  204994    1796    0    0    0     0          0         0   204994    1796    0    0    0     0       0          0',
	''
].join('\n');

const a = s.parseSample(out('cpu  26330 168 12952 258767 349 0 316 0 0 0', 2480640, 937271), 1000);
eq([a.cpuAll, a.cpuBusy], [298882, 298882 - 258767 - 349], 'CPU totals: all jiffies, busy = all minus idle and iowait');
eq([a.memTotalKB, a.memAvailKB], [2030388, 651640], 'memory from MemTotal and MemAvailable');
eq([a.diskTotalKB, a.diskFreeKB], [6218996, 4393180], 'storage from the df line (total and available)');
eq([a.rxBytes, a.txBytes], [2480640, 937271], 'network bytes summed over every interface except lo');

eq(s.statsView(null, null), null, 'nothing to show before the first sample');
const first = s.statsView(null, a);
eq([first.cpu, first.net], ['–', '–'], 'one sample: CPU and network (rates) wait for the second');
eq(first.ram, '1.3 / 1.9 GB', 'RAM: used (total minus available) of total, in GB');
eq(first.disk, '4.2 GB free', 'storage: free space in GB');

// 3 s later: 300 of 1200 jiffies busy, 1.5 MB down, 30 kB up
const b = s.parseSample(out('cpu  26530 168 13052 259667 349 0 316 0 0 0', 2480640 + 1500000, 937271 + 30000), 4000);
const v = s.statsView(a, b);
eq(v.cpu, '25%', 'CPU: busy share of the jiffies between the samples');
eq(v.net, '↓ 4.0 Mbit/s  ↑ 80 Kbit/s', 'network: bits per second down and up');

const reset = s.parseSample(out('cpu  26530 168 13052 259667 349 0 316 0 0 0', 100, 100), 7000);
eq(s.statsView(b, reset).net, '↓ 0 Kbit/s  ↑ 0 Kbit/s', 'a counter that went backwards (interface restarted) reads as 0, not negative');

const empty = s.parseSample('@@cpu\n@@mem\n@@df\n@@net\n', 1000);
eq([empty.cpuAll, empty.memTotalKB, empty.diskTotalKB, empty.rxBytes], [-1, -1, -1, -1], 'a sample with nothing in it: every figure missing');
eq(s.statsView(empty, empty), {cpu: '–', ram: '–', disk: '–', net: '–'}, 'missing figures show as a dash');

eq(/^[ -~]+$/.test(s.TV_STATS_COMMAND) && s.TV_STATS_COMMAND.indexOf('@@cpu') === 5, true, 'the command is plain ASCII and starts with the CPU section');
process.exit(fail ? 1 : 0);
