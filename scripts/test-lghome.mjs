// Tests for opening LG Home (src/lib/lghomecmd.ts): the script is RUN on a fake TV (fake luna-send, fake /proc list, fake key device files).   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-lghome-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/lghomecmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const dir = mkdtempSync(join(tmpdir(), 'hearth-lghome-'));
const bin = join(dir, 'bin'); const dev = join(dir, 'dev'); mkdirSync(bin); mkdirSync(dev);
const script = join(dir, 'lghome.sh');
writeFileSync(script, c.LGHOME_SCRIPT_TEXT);
// fake luna-send: answers from the file `lunaanswer`
writeFileSync(join(bin, 'luna-send'), `#!/bin/sh\ncat "${dir}/lunaanswer"\n`); chmodSync(join(bin, 'luna-send'), 0o755);
const procFor = (words, bits) => {
	// the KEY line: words from the highest down; bit 773 is word (773/bits) from the right, bit (773%bits)
	const n = Math.floor(773 / bits), bit = 773 % bits;
	const hex = bits / 4;
	const list = []; for (let i = 0; i <= n + 1; i++) list.push('0'.repeat(hex));
	const w = (1n << BigInt(bit)).toString(16).padStart(hex, '0');
	list[list.length - 1 - n] = w;
	return words ? list.join(' ') : '0 0 0';
};
const proc = (bits) => [
	'I: Bus=0019 Vendor=0001 Product=0001 Version=0100', 'N: Name="LGE RCU"', 'H: Handlers=kbd event1', `B: KEY=${procFor(true, bits)}`, '',
	'I: Bus=0019 Vendor=0001 Product=0002 Version=0100', 'N: Name="some other device"', 'H: Handlers=kbd event2', `B: KEY=${procFor(false, bits)}`, '',
	'I: Bus=0006 Vendor=0001 Product=0003 Version=0100', 'N: Name="lginput uinput"', 'H: Handlers=kbd event3', `B: KEY=${procFor(true, bits)}`, ''
].join('\n');
// James18232's 3.4.3 TV (issue #36): event0 can send 773 but does nothing, the remote is event3 "LGE M-RCU - Builtin [0]"
const procJames = () => [
	'I: Bus=0019 Vendor=0000 Product=0001 Version=0000', 'N: Name="Other input"', 'H: Handlers=kbd event0', `B: KEY=${procFor(true, 32)}`, '',
	'I: Bus=0003 Vendor=0000 Product=0000 Version=0004', 'N: Name="LGE M-RCU - Builtin [0]"', 'H: Handlers=kbd mouse0 event3', `B: KEY=${procFor(true, 32)}`, ''
].join('\n');
const run = (args, env) => {
	try { return {out: execFileSync('sh', [script, ...args], {env: {...process.env, PATH: `${process.env.PATH}:${bin}`, HEARTH_LOG: join(dir, 'log'), HEARTH_PROC: join(dir, 'proc'), HEARTH_DEVDIR: dev, HEARTH_DEVFILE: join(dir, 'lghome.dev'), HEARTH_MSG: join(dir, 'messages'), HEARTH_SLEEP: join(bin, 'fakesleep'), ...env}}).toString(), code: 0}; } catch (e) { return {out: String(e.stdout || ''), code: e.status}; }
};
// fake sleep: the TV "shows Home" (logs NL_HOME_SHOWN) when the device named in FAKE_OK has received bytes
writeFileSync(join(bin, 'fakesleep'), '#!/bin/sh\nif [ -n "$FAKE_OK" ] && [ -s "$HEARTH_DEVDIR/$FAKE_OK" ]; then echo NL_HOME_SHOWN >> "$HEARTH_MSG"; fi\n'); chmodSync(join(bin, 'fakesleep'), 0o755);
const reset = (trusted) => { for (const n of ['event0', 'event1', 'event2', 'event3']) writeFileSync(join(dev, n), ''); writeFileSync(join(dir, 'messages'), trusted ? 'NL_HOME_SHOWN earlier\n' : ''); rmSync(join(dir, 'lghome.dev'), {force: true}); };
const bytes = (n) => readFileSync(join(dev, n));
const sizes = () => ['event0', 'event1', 'event2', 'event3'].map((n) => bytes(n).length);

// 1) LG Home exists (webOS 4+): launched, no key sent
writeFileSync(join(dir, 'lunaanswer'), '{"returnValue": true}\n'); reset(true); writeFileSync(join(dir, 'proc'), proc(32));
let r = run([], {HEARTH_BITS: '32'});
eq([r.code, /lghome=ok launch/.test(r.out), sizes()], [0, true, [0, 0, 0, 0]], 'webOS 4+: launched, no key written');

// 2) webOS 3, the TV never logged NL_HOME_SHOWN (effect cannot be seen): one key, to the remote-named device (event1), not to event3
writeFileSync(join(dir, 'lunaanswer'), '{"returnValue": false, "errorText": "Application does not exist"}\n'); reset(false);
r = run([], {HEARTH_BITS: '32'});
eq([r.code, /lghome=ok key event1 \(tried event1\)/.test(r.out)], [0, true], 'webOS 3, effect not visible: key written to the remote-named device only');
eq(sizes(), [0, 64, 0, 0], '32-bit: four 16-byte events in event1 only');
const b = bytes('event1');
eq([b[8], b[9], b[10], b[11], b[12]], [1, 0, 5, 3, 1], 'press: type 1, code 0x0305 (773), value 1');
eq([b[24], b[25], b[26], b[27], b[28], b[29]], [0, 0, 0, 0, 0, 0], 'sync event after the press');
eq([b[40], b[41], b[42], b[43], b[44]], [1, 0, 5, 3, 0], 'release: value 0');

// 2b) the TV logs NL_HOME_SHOWN and the remote-named device works: one key only
reset(true); r = run([], {HEARTH_BITS: '32', FAKE_OK: 'event1'});
eq([r.code, /lghome=ok key event1/.test(r.out), sizes()], [0, true, [0, 64, 0, 0]], 'effect seen on the first device: the next one gets nothing');

// 2c) fallback: the first device does nothing, the second one works (an older TV where the other rule was right)
reset(true); r = run([], {HEARTH_BITS: '32', FAKE_OK: 'event3'});
eq([r.code, /lghome=ok key event3 \(tried event1 event3\)/.test(r.out), sizes()], [0, true, [0, 64, 0, 64]], 'no effect on the first device: the next candidate is tried');

// 2d) nothing reacts: both candidates tried, an honest "unconfirmed" line, still exit 0
reset(true); r = run([], {HEARTH_BITS: '32', FAKE_OK: 'none'});
eq([r.code, /lghome=ok key event1 \(unconfirmed, tried event1 event3\)/.test(r.out), c.lgHomeOk(r.out)], [0, true, true], 'no device shows a response: reported as unconfirmed with the list');

// 2e) James18232's TV: event0 (other) and event3 (M-RCU); the M-RCU device goes first
writeFileSync(join(dir, 'proc'), procJames()); reset(true); r = run([], {HEARTH_BITS: '32', FAKE_OK: 'event3'});
eq([r.code, /lghome=ok key event3 \(tried event3\)/.test(r.out), sizes()], [0, true, [0, 0, 0, 64]], 'M-RCU device first: event0 gets nothing');

// 2f) the hand-written device file replaces the list and skips the response check
writeFileSync(join(dir, 'proc'), proc(32)); reset(true); writeFileSync(join(dir, 'lghome.dev'), 'event2\n');
r = run([], {HEARTH_BITS: '32', FAKE_OK: 'none'});
eq([r.code, /lghome=ok key event2 \(tried event2\)/.test(r.out), sizes()], [0, true, [0, 0, 64, 0]], 'lghome.dev: only that device, one key');

// 3) 64-bit: 24-byte events
reset(false); writeFileSync(join(dir, 'proc'), proc(64));
r = run([], {HEARTH_BITS: '64'});
eq([r.code, sizes()], [0, [0, 96, 0, 0]], '64-bit: four 24-byte events');
eq([bytes('event1')[16], bytes('event1')[18], bytes('event1')[19]], [1, 5, 3], '64-bit: the press starts after 16 bytes of time');

// 4) `inject` skips the launch even when it would work
writeFileSync(join(dir, 'lunaanswer'), '{"returnValue": true}\n'); reset(false); writeFileSync(join(dir, 'proc'), proc(32));
r = run(['inject'], {HEARTH_BITS: '32'});
eq([/lghome=ok key event1/.test(r.out), sizes()], [true, [0, 64, 0, 0]], 'inject: only the key is sent');

// 5) every listed device is missing in /dev/input: fails with a reason, nothing written
writeFileSync(join(dir, 'proc'), proc(32).replace('H: Handlers=kbd event3', 'H: Handlers=kbd event9').replace('H: Handlers=kbd event1', 'H: Handlers=kbd event8')); reset(false); writeFileSync(join(dir, 'lunaanswer'), '{"returnValue": false}\n');
r = run([], {HEARTH_BITS: '32'});
eq([r.code, /lghome=fail/.test(r.out), sizes()], [1, true, [0, 0, 0, 0]], 'listed devices that do not exist in /dev/input: fails with a reason');
eq(c.lgHomeWhy(r.out).length > 0, true, 'the failure reason is readable');

// 6) no device can send it: fail, nothing written
writeFileSync(join(dir, 'proc'), proc(32).replace(/B: KEY=.*\n/g, 'B: KEY=0 0 0\n')); reset(false);
r = run([], {HEARTH_BITS: '32'});
eq([r.code, /lghome=fail no key device/.test(r.out), sizes()], [1, true, [0, 0, 0, 0]], 'no key device with 773: fails, writes nothing');

// 7) the hand-written device file wins (lghome.dev is read from LGHOME_DEVICE_FILE: tested through the text only)
eq(c.LGHOME_SCRIPT_TEXT.indexOf(c.LGHOME_DEVICE_FILE) !== -1, true, 'the script reads the manual device file');
eq([c.lgHomeOk('lghome=ok key event3'), c.lgHomeOk('lghome=fail x'), c.isLgHomeCommand(c.LGHOME_COMMAND), c.isLgHomeCommand('sh /x')], [true, false, true, false], 'parsers');
eq(c.ensureScriptCommand(['echo a']).indexOf(c.LGHOME_MARK) !== -1, true, 'ensure command checks the version mark');
rmSync(dir, {recursive: true, force: true});
process.exit(fail ? 1 : 0);
