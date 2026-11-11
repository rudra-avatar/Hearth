// Tests for the quiet-mode power-off (QP): command text, choices, saved value handling.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/quietoff.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-quietoff-test.mjs', platform: 'node', logLevel: 'error', define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}});
const q = await import(dir + '.cache-quietoff-test.mjs');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(q.QUIET_POWEROFF_VALUES[0] === 0 && q.QUIET_POWEROFF_VALUES.length >= 5, 'choices start with never (0)');
ok(q.QUIET_POWEROFF_VALUES.every((v, i, a) => i === 0 || v > a[i - 1]), 'choices rise');
ok(/powerOff '\{"reason":"remoteKey"\}'/.test(q.QUIET_OFF_COMMAND), 'first try uses reason remoteKey');
ok(/localKey/.test(q.QUIET_OFF_COMMAND), 'second try uses localKey');
ok(!/\$\{|undefined/.test(q.QUIET_OFF_COMMAND), 'command has no unfilled parts');
const storage = (await import('node:fs')).readFileSync(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
ok(/quietPowerOff: 0,/.test(storage), 'default is never (saved settings unchanged)');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
