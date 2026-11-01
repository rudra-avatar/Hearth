// S1: the SSAP register messages (new and old form) and the close-error marker.   Run: npm test
import {build} from 'esbuild';

const out = new URL('../node_modules/.cache-ssapreg-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/ssapreg.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const s = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

const n = JSON.parse(s.registerMessage('', 'new'));
eq(n.type + '/' + n.id, 'register/register_0', 'new request is a register message');
eq(n.payload.pairingType + '/' + n.payload.forcePairing, 'PROMPT/false', 'new request asks with a prompt');
eq('signed' in n.payload.manifest, false, 'new request has no signed block');
eq('appVersion' in n.payload.manifest, false, 'new request has no appVersion');
eq(n.payload.manifest.permissions.length >= 25 && n.payload.manifest.permissions.indexOf('LAUNCH') === 0, true, 'new request has the long outer permission list');
eq(n.payload.manifest.permissions.indexOf('READ_INSTALLED_APPS') >= 0, true, 'and can read the installed apps');
eq('client-key' in n.payload, false, 'no key = no client-key field');
const o = JSON.parse(s.registerMessage('abc', 'old'));
eq(o.payload.manifest.appVersion, '1.0', 'old request keeps appVersion (as in 1.2.0)');
eq(o.payload.manifest.permissions.join(','), 'LAUNCH,READ_INSTALLED_APPS,READ_RUNNING_APPS', 'old request keeps its 3 permissions');
eq(o.payload['client-key'], 'abc', 'a saved key is sent as client-key');
eq(s.variantOf('new'), 'new', 'saved variant new is read');
eq(s.variantOf(undefined), 'old', 'a key saved before S1 counts as old');
eq(s.variantOf('x'), 'old', 'junk counts as old');
const e = s.closedError(1006, false);
eq(s.isEarlyClose(e), true, 'a close without reply is early (fallback allowed)');
eq(e.message, 'the TV closed the connection (code 1006, no reply)', 'its text carries the close code');
eq(s.isEarlyClose(s.closedError(1000, true)), false, 'a close after a reply is not early');
eq(s.closedError(undefined, true).message, 'the TV closed the connection (code ?, after a reply)', 'an unknown code shows ?');
eq(s.isEarlyClose(new Error('x')), false, 'other errors are not early');
eq(s.isEarlyClose(null), false, 'null is not early');
process.exit(fail ? 1 : 0);
