// Tests for H3a (src/lib/coldstart.ts): the marker file that says an app was opened since the TV started.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-coldstart-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/coldstart.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stubs', setup(b) {
    b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps', namespace: 'stub'}));
    b.onResolve({filter: /\.\/luna$/}, () => ({path: 'luna', namespace: 'stub'}));
    b.onResolve({filter: /\.\/log$/}, () => ({path: 'log', namespace: 'stub'}));
    b.onLoad({filter: /^log$/, namespace: 'stub'}, () => ({contents: 'export const log = () => {};', loader: 'js'}));
    b.onLoad({filter: /^apps$/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve("");', loader: 'js'}));
    b.onLoad({filter: /^luna$/, namespace: 'stub'}, () => ({contents: 'export const isWebOS = () => false;', loader: 'js'}));
  }}]});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(c.parseMarker('1\n'), true, 'marker found');
eq(c.parseMarker('0\n'), false, 'no marker');
eq(c.parseMarker(''), null, 'empty output');
eq(c.parseMarker('error'), null, 'not an answer');
eq(c.READ_COMMAND.includes('/tmp/hearth-opened') && c.WRITE_COMMAND === 'touch /tmp/hearth-opened', true, 'commands use the marker file');
eq(c.openedThisPage(), false, 'nothing opened yet');
c.markOpened();
eq(c.openedThisPage(), true, 'opening an app is noted at once');
let called = false;
c.checkColdBoot(() => { called = true; }, () => false);
eq(called, false, 'not on a TV: nothing is run');
process.exit(fail ? 1 : 0);
