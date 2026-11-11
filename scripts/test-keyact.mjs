// K1: the button action script (src/lib/keyactcmd.ts) run on a fake luna-send, and the bind command round trip.   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let fail = 0;
const eq = (a, b, name) => { const x = JSON.stringify(a); const y = JSON.stringify(b); if (x === y) console.log('ok   ' + name); else { fail++; console.log(`FAIL ${name}\n  got  ${x}\n  want ${y}`); } };

const out = new URL('../node_modules/.cache-keyact-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/keyactcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const k = await import(out);

eq(k.keyActionId(k.keyActionCommand('energy')), 'energy', 'a bind command reads back as its action');
eq(k.keyActionId('sh /tmp/other.sh energy'), null, 'a foreign command is no action');
eq(k.keyActionId(k.keyActionCommand('nonsense')), null, 'an unknown id is no action');
eq(k.KEY_ACTIONS.map((a) => a.id).filter((id, i, all) => all.indexOf(id) !== i), [], 'action ids are unique');

const dir = mkdtempSync(join(tmpdir(), 'keyact-'));
const state = join(dir, 'state'); mkdirSync(state);
const log = join(dir, 'luna.log');
writeFileSync(join(dir, 'luna-send'), [
  '#!/bin/sh',
  'uri=$5; json=$6',
  'echo "$uri $json" >> "$FAKE_LOG"',
  'case "$uri" in',
  '  *getSystemSettings) key=$(printf "%s" "$json" | sed \'s/.*"keys":\\["\\([^"]*\\)"\\].*/\\1/\'); v=$(cat "$FAKE_STATE/$key" 2>/dev/null)',
  '    case "$v" in [0-9]*) echo "{\\"settings\\":{\\"$key\\":$v},\\"returnValue\\":true}" ;; *) echo "{\\"settings\\":{\\"$key\\":\\"$v\\"},\\"returnValue\\":true}" ;; esac ;;',
  '  *) echo \'{"returnValue":true}\' ;;',
  'esac', ''
].join('\n'));
chmodSync(join(dir, 'luna-send'), 0o755);
writeFileSync(join(dir, 'keyact.sh'), k.KEYACT_SCRIPT_TEXT);
const env = {...process.env, HEARTH_LUNA: join(dir, 'luna-send'), HEARTH_LOG: join(dir, 'keyact.log'), FAKE_LOG: log, FAKE_STATE: state};
const run = (id) => execFileSync('sh', [join(dir, 'keyact.sh'), id], {env}).toString().trim();
const calls = () => readFileSync(log, 'utf8').split('\n').filter((l) => /setSystemSettings/.test(l)).map((l) => l.replace(/^\S+\s/, ''));
const reset = () => writeFileSync(log, '');

reset(); writeFileSync(join(state, 'energySaving'), 'min');
eq(run('energy'), 'keyact=done energy', 'energy: prints done');
eq(calls(), ['{"category":"picture","settings":{"energySaving":"med"}}'], 'energy: min goes to med');
reset(); writeFileSync(join(state, 'energySaving'), 'max'); run('energy');
eq(calls(), ['{"category":"picture","settings":{"energySaving":"off"}}'], 'energy: max wraps to off');
reset(); writeFileSync(join(state, 'energySaving'), 'weird'); run('energy');
eq(calls(), ['{"category":"picture","settings":{"energySaving":"off"}}'], 'energy: an unknown value starts at the first');
reset(); writeFileSync(join(state, 'backlight'), '95'); run('backlightup');
eq(calls(), ['{"category":"picture","settings":{"backlight":100}}'], 'backlight up stops at 100');
reset(); writeFileSync(join(state, 'backlight'), '5'); run('backlightdown');
eq(calls(), ['{"category":"picture","settings":{"backlight":0}}'], 'backlight down stops at 0');
reset(); writeFileSync(join(state, 'eyeComfortMode'), 'on'); run('eyecomfort');
eq(calls(), ['{"category":"picture","settings":{"eyeComfortMode":"off"}}'], 'eye comfort: on becomes off');
reset(); writeFileSync(join(state, 'dynamicToneMapping'), ''); run('tonemap');
eq(calls(), ['{"category":"picture","settings":{"dynamicToneMapping":"on"}}'], 'tone mapping: nothing read becomes on');
reset(); run('screenoff'); run('standby'); run('saver'); run('reboot');
eq(readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')[0].replace('luna://com.webos.service.tvpower/power/', '')), ['turnOffScreen', 'powerOff', 'turnOnScreenSaver', 'reboot'], 'power actions call the TV power service');
eq(run('nonsense'), 'keyact=fail unknown\nkeyact=done nonsense', 'an unknown action does nothing');
rmSync(dir, {recursive: true, force: true});
process.exit(fail ? 1 : 0);
