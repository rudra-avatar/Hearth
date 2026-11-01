// Tests for the icon stamps that tell a changed icon from a cached one (src/lib/iconstamps.ts).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-iconstamps-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/iconstamps.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const s = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

eq(s.stampCommand(["'/a/one.png'", "'/b/two.png'"]), "stat -c '%s %Y %n' '/a/one.png' '/b/two.png' 2>/dev/null; true", 'one stat command for every icon; a missing file does not fail it');

const stamps = s.parseStamps('6699 1793119386 /apps/plexlite/img/largeIcon.png\n847 1790000000 /apps/x/icon.png\nstat: can\'t stat \'/gone.png\': No such file\n\ngarbage line\n');
eq(stamps, {'/apps/plexlite/img/largeIcon.png': '6699:1793119386', '/apps/x/icon.png': '847:1790000000'}, 'size and change time per path; error and odd lines are ignored');
eq(s.parseStamps(''), {}, 'no output -> no stamps');

const P = '/apps/plexlite/img/largeIcon.png';
eq(s.iconIsFresh(P, {[P]: '6699:1793119386'}, {[P]: '6699:1793119386'}), true, 'same size and time -> the cached icon is used');
eq(s.iconIsFresh(P, {[P]: '6699:1793119386'}, {[P]: '847:1790000000'}), false, 'the app was updated with a new icon at the same path -> read it again');
eq(s.iconIsFresh(P, {[P]: '6699:1793119386'}, {}), false, 'an icon cached before stamps existed is read once more');
eq(s.iconIsFresh(P, {}, {}), true, 'stat failed (no stamp now) -> the cache is trusted, as before');
eq(s.iconIsFresh(P, {}, {[P]: '847:1790000000'}), true, 'no stamp now but one saved -> still trusted');
process.exit(fail ? 1 : 0);
