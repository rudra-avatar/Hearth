// Tests for the mapper probes (src/lib/probemappercmd.ts, tests 40-48): the recorder script, the keybinds backup and
// put-back, the automatic put-back, the hit parser, the settings check and the tools list, on a fake TV (fake luna-send).
// Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-probemapper-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probemappercmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

const dir = mkdtempSync(join(tmpdir(), 'hearth-mp-'));
const bin = join(dir, 'bin');
mkdirSync(bin);
// fake luna-send: answers by the method asked for; setSystemSettings echoes the same-value check
writeFileSync(join(bin, 'luna-send'), [
	'#!/bin/sh',
	'for a in "$@"; do case "$a" in luna://*) uri=$a;; esac; done',
	'last=$(for a in "$@"; do :; done; echo "$a")',
	'case "$uri" in',
	'*getForegroundAppInfo) echo \'{"appId":"netflix","returnValue":true}\';;',
	'*getSystemSettings) case "$last" in *energySaving*) echo \'{"settings":{"energySaving":"min"},"returnValue":true}\';; *backlight*) echo \'{"settings":{"backlight":"80"},"returnValue":true}\';; *eyeComfortMode*) echo \'{"settings":{"eyeComfortMode":"off"},"returnValue":true}\';; *) echo \'{"returnValue":false,"errorText":"no such key"}\';; esac;;',
	'*setSystemSettings) echo \'{"returnValue":true}\';;',
	'*turnOffScreen) echo \'{"returnValue":true}\';;',
	'*turnOnScreen) echo \'{"returnValue":false,"errorText":"unknown method"}\';;',
	'esac',
	''
].join('\n'));
chmodSync(join(bin, 'luna-send'), 0o755);
const env = Object.assign({}, process.env, {PATH: `${bin}:${process.env.PATH}`});
const sh = (cmd, opts = {}) => execSync(cmd, Object.assign({env, shell: '/bin/sh', encoding: 'utf8'}, opts));
const clean = () => sh(`rm -f ${h.MP_HITS} ${h.MP_ORIG} ${h.MP_NONE} ${h.MP_REC} /tmp/hearth-mapprobe-*.sh`);
clean();

// the recorder: code from its file name, one hit line, then the app in front after 3 s
writeFileSync(h.MP_REC, h.REC_TEXT);
sh(h.copyRecorders([1037, 398]));
eq([existsSync('/tmp/hearth-mapprobe-1037.sh'), existsSync('/tmp/hearth-mapprobe-398.sh')], [true, true], 'copy: one recorder per button');
sh('sh /tmp/hearth-mapprobe-1037.sh');
sh('sh /tmp/hearth-mapprobe-1037.sh; sh /tmp/hearth-mapprobe-398.sh');
const early = readFileSync(h.MP_HITS, 'utf8');
eq(early.split('\n').filter((l) => / hit$/.test(l)).length, 3, 'recorder: three hits written at once');
sh('sleep 4.5');
const rows = h.parseHits(readFileSync(h.MP_HITS, 'utf8'));
eq(rows.map((r) => [r.code, r.hits, r.front]), [[1037, 2, ['netflix', 'netflix']], [398, 1, ['netflix']]], 'recorder + parser: hits and app in front per button');
eq(h.hitsText(rows, (c) => String(c)), '1037: caught 2x, in front after: netflix; 398: caught 1x, in front after: netflix', 'hitsText: one phrase per button');
eq(h.parseHits('garbage\n10:00:00 12 hit\n10:00:01 12 front unknown\n'), [{code: 12, hits: 1, front: ['unknown']}], 'parser: ignores other lines');

// backup and put-back (in place), the second arm never overwrites the first backup, a missing file comes back empty
const cfg = join(dir, 'keybinds.json');
writeFileSync(cfg, '{"773":{"action":"launch","id":"x"}}');
sh(h.backupCommand(cfg));
writeFileSync(cfg, '{"773":{"action":"launch","id":"x"},"1037":{"action":"exec","command":"sh /tmp/hearth-mapprobe-1037.sh"}}');
sh(h.backupCommand(cfg));
eq(readFileSync(h.MP_ORIG, 'utf8'), '{"773":{"action":"launch","id":"x"}}', 'backup: the first copy is kept on a second arm');
let r = sh(h.restoreCommand(cfg));
eq([h.parseRestored(r), readFileSync(cfg, 'utf8'), existsSync(h.MP_ORIG), existsSync('/tmp/hearth-mapprobe-1037.sh')], ['file', '{"773":{"action":"launch","id":"x"}}', false, false], 'restore: file back, backup and recorders gone');
r = sh(h.restoreCommand(cfg));
eq([h.parseRestored(r), readFileSync(cfg, 'utf8')], ['nothing', '{"773":{"action":"launch","id":"x"}}'], 'restore twice: nothing is touched');
rmSync(cfg);
sh(h.backupCommand(cfg));
writeFileSync(cfg, '{"1":{"action":"ignore"}}');
r = sh(h.restoreCommand(cfg));
eq([h.parseRestored(r), readFileSync(cfg, 'utf8').trim()], ['empty', '{}'], 'restore: no file before = empty again');
writeFileSync(cfg, '');
sh(h.backupCommand(cfg));
writeFileSync(cfg, '{"1":{"action":"ignore"}}');
sh(h.restoreCommand(cfg));
eq(readFileSync(cfg, 'utf8').trim(), '{}', 'restore: empty file before = empty again');

// the automatic put-back (1 s instead of 170 s), started the way the TV starts it (detached)
writeFileSync(cfg, '{"5":{"action":"ignore"}}');
sh(h.backupCommand(cfg));
writeFileSync(cfg, '{"5":{"action":"ignore"},"1037":{"action":"exec","command":"x"}}');
sh(h.autoRestoreCommand(cfg, 1));
sh('sleep 3');
eq([readFileSync(cfg, 'utf8'), existsSync(h.MP_ORIG)], ['{"5":{"action":"ignore"}}', false], 'auto put-back: the file is back after the delay');

// the code list
eq(h.uniqueCodes([1, 2, 1, 3, 2], 2), [1, 2], 'uniqueCodes: no duplicates, capped');

// picture settings: read, same value written back; a key the TV does not know is reported, not written
const lines = sh(h.settingsCheckScript()).trim().split('\n').map((l) => l.trim());
eq(lines.length, 4, 'settings: one line per key');
eq(lines[0], 'energySaving: read "min", same value written -> "returnValue":true', 'settings: string value written back with its quotes');
eq(lines[1], 'backlight: read "80", same value written -> "returnValue":true', 'settings: backlight');
eq(/^dynamicToneMapping: read failed/.test(lines[2]), true, 'settings: unknown key reported as a read failure');
eq(lines[3], 'eyeComfortMode: read "off", same value written -> "returnValue":true', 'settings: eye comfort');

// tools and screen
const tools = h.parseTools('curl=/usr/bin/curl\nwget=no\nnc=no\ndev=/dev/cec0\n');
eq([tools.have, tools.missing, tools.devices], [['curl'], ['wget', 'nc'], ['/dev/cec0']], 'tools: parsed');
const screen = sh(h.SCREEN_COMMAND.replace('sleep 6', 'sleep 0')).trim();
eq(screen, 'off: {"returnValue":true} | on: {"returnValue":false,"errorText":"unknown method"}', 'screen: both answers shown');
eq(/^[\x00-\x7f]*$/.test(h.REC_TEXT), true, 'recorder text is ASCII (it goes through btoa)');

clean();
rmSync(dir, {recursive: true, force: true});
if (fail) { console.log(`${fail} FAILED`); process.exit(1); }
console.log('all ok');
