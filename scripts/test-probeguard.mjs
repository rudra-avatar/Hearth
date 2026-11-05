// Tests 45-48 (src/lib/probeguardcmd.ts): command text and answer parsing.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-probeguard-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probeguardcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(c.replyKind('{"returnValue":true}'), 'true', 'true reply');
eq(c.replyKind('{"returnValue":false,"errorText":"Denied method call"}'), 'false (Denied method call)', 'false reply with reason');
eq(c.replyKind(''), 'no answer', 'empty reply');
eq(c.alertVerdict('alert: {"returnValue":false,"errorText":"x"}\ntoast: {"returnValue":true}').ok, true, 'toast alone is enough for ok');
eq(c.alertVerdict('alert: \ntoast: ').ok, false, 'nothing accepted is not ok');
eq(c.FACTS_COMMAND.indexOf('getAllInputStatus') !== -1 && c.FACTS_COMMAND.indexOf('/proc/uptime') !== -1, true, 'facts command reads inputs and uptime');
eq(c.launchCommand('com.webos.app.hdmi1').indexOf('"id":"com.webos.app.hdmi1"') !== -1, true, 'launch command names the app');
const d = c.deleteCommand('echo deleteDevice');
eq(d.indexOf('deleteDevice') !== -1 && d.indexOf('before last') !== -1 && d.indexOf('after last') !== -1, true, 'delete command reads before, deletes, reads after');
eq(c.outLines(' a \n\n b\n'), ['a', 'b'], 'outLines trims');
process.exit(fail ? 1 : 0);
