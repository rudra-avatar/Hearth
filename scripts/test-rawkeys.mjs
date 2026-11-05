// Z (src/lib/rawkeyscmd.ts): key device filter, capped and tail-limited reads, the combined poll and its split.   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const out = dir + '.cache-rawkeys-test.mjs';
await build({entryPoints: [new URL('../src/lib/rawkeyscmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const sh = (cmd, env) => execFileSync('sh', ['-c', cmd], {encoding: 'utf8', env: {...process.env, ...env}, timeout: 20000});

// split and parse
eq(c.splitPoll('#f\n0305\n' + c.POLL_SPLIT + '\nline' + c.HITS_SPLIT + '\n773\n'), {raw: '#f\n0305\n', hook: '\nline', hits: '\n773\n', complete: true}, 'a combined poll splits at both markers');
eq(c.splitPoll('x' + c.POLL_SPLIT + 'y').complete, false, 'a poll without the hits marker is incomplete');
eq(c.parseGuardHits('\n773\n774\n773\nx\n'), [{code: 774, count: 1}, {code: 773, count: 2}], 'Z5: guard hits are counted, newest last');
eq(c.splitPoll('half').complete, false, 'no marker = incomplete');
eq(c.parseRawKeys('#x\n0305\n0305\n0066\n').map((k) => [k.code, k.count]), [[773, 2], [102, 1]], 'raw codes counted, newest last');
eq(c.pollCommand('echo hookline').includes('echo hookline'), true, 'the hook read is part of the one call');
eq(c.pollCommand('').endsWith('true'), true, 'an empty hook read still ends with a command');
eq(c.RAW_READ_BYTES % 48, 0, 'the read size is a multiple of 48 (16 and 24 byte layouts)');
eq(c.RAW_START_COMMAND.includes('head -c'), false, 'Z4: readers write straight to the file (no head stage)');

// the key device filter (BusyBox awk has no gawk extras; the program uses only plain awk)
const tmp = mkdtempSync(join(tmpdir(), 'rawkeys-'));
const proc = [
	'I: Bus=0019 Vendor=0000 Product=0001 Version=0000', 'N: Name="LGE RCU"', 'H: Handlers=kbd event1', 'B: PROP=0', 'B: EV=100013', 'B: KEY=ffff', '',
	'I: Bus=0019 Vendor=0000 Product=0002 Version=0000', 'N: Name="accelerometer"', 'H: Handlers=event2', 'B: PROP=0', 'B: EV=9', 'B: ABS=7', '',
	'I: Bus=0003 Vendor=0000 Product=0003 Version=0000', 'N: Name="Magic"', 'H: Handlers=kbd mouse0 event3', 'B: PROP=0', 'B: EV=12001f', 'B: KEY=ffff', ''
].join('\n');
writeFileSync(join(tmp, 'devices'), proc);
const filter = c.RAW_KEY_DEVICES.replace('/proc/bus/input/devices', join(tmp, 'devices'));
eq(sh(filter).trim().split('\n'), ['event1', 'event3'], 'only devices with the key bit are listed (EV=9 is skipped)');
eq(sh(c.RAW_KEY_DEVICES.replace('/proc/bus/input/devices', join(tmp, 'missing')) + '; true').trim(), '', 'an unreadable device list prints nothing (fallback: all devices)');

// the read: 16-byte events in a fake file; a key press = type 1, value 1
const W = sh('getconf LONG_BIT 2>/dev/null; true').trim() === '64' ? 24 : 16;           // the command picks the event width by the machine's word size
const ev = (type, code, value) => { const b = Buffer.alloc(W); const o = W - 8; b.writeUInt16LE(type, o); b.writeUInt16LE(code, o + 2); b.writeInt32LE(value, o + 4); return b; };
const evs = Buffer.concat([ev(1, 773, 1), ev(1, 773, 0), ev(2, 1, 5), ev(1, 102, 1)]);
const file = '/tmp/hearth-keys.event9';
writeFileSync(file, evs);
const read = sh(c.RAW_READ_COMMAND);
eq(c.parseRawKeys(read).map((k) => [k.code, k.count]), [[773, 1], [102, 1]], 'presses are read from the file, releases and pointer events are not');
// a big file: only the newest bytes are read, the newest press is still found
const noise = Buffer.concat(Array.from({length: 40000}, () => ev(2, 0, 1)));
writeFileSync(file, Buffer.concat([ev(1, 999, 1), noise, ev(1, 103, 1)]));
eq(c.parseRawKeys(sh(c.RAW_READ_COMMAND)).map((k) => k.code), [103], 'a long file: only the newest part is read, the newest press is found');
rmSync(file, {force: true});

// Z2: the end marker must really be printed (`true echo X` printed nothing and every poll looked failed)
const polled = execFileSync('sh', ['-c', c.pollCommand('echo hookline')], {encoding: 'utf8'});
eq(c.splitPoll(polled).complete, true, 'a real poll prints the end marker');
eq(c.splitPoll(polled).hook.trim(), 'hookline', 'the hook read follows the marker');

// the start command is valid shell and starts nothing without devices (syntax check only)
execFileSync('sh', ['-n', '-c', c.RAW_START_COMMAND]);
execFileSync('sh', ['-n', '-c', c.RAW_READ_COMMAND]);
console.log('ok   start and read commands are valid shell');
rmSync(tmp, {recursive: true, force: true});
if (fail) { console.log(fail + ' failed'); process.exit(1); }
