// Tests for the saved list of recent apps (src/lib/recentcache.ts).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-recentcache-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/recentcache.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const A = {id: 'a.one', title: 'One'}, B = {id: 'b.two', title: 'Two'}, C = {id: 'c.three', title: 'Three'}, D = {id: 'd.four', title: 'Four'};
const list = [A, B, C];

// ---- saving ----
eq(c.deserializeRecents(c.serializeRecents(list)), list, 'the list comes back as it was saved');
eq(c.deserializeRecents(c.serializeRecents([{id: 'x', title: 'X', extra: 1}])), [{id: 'x', title: 'X'}], 'only the id and title are kept');
eq(c.deserializeRecents(c.serializeRecents([])), [], 'an empty list is a list (no recent apps), not nothing');
eq(c.deserializeRecents(null), null, 'nothing saved -> null (the panel waits for the TV)');
eq(c.deserializeRecents('{broken'), null, 'a broken copy -> null');
eq(c.deserializeRecents('{"id":"x"}'), null, 'the wrong shape -> null');
eq(c.deserializeRecents('[{"id":1,"title":"x"},null,{"id":"ok","title":"Ok"}]'), [{id: 'ok', title: 'Ok'}], 'bad entries are dropped');
eq(c.deserializeRecents('[{"id":"a b;rm","title":"x"},{"id":"ok.app","title":"Ok"}]'), [{id: 'ok.app', title: 'Ok'}], 'an id the TV could not have given is dropped');

// ---- comparing ----
eq(c.sameRecents(list, list.map((a) => ({...a}))), true, 'equal lists are the same');
eq(c.sameRecents(list, [B, A, C]), false, 'another order differs');
eq(c.sameRecents(list, [A, B]), false, 'another length differs');
eq(c.sameRecents(list, [A, B, {id: 'c.three', title: 'Renamed'}]), false, 'another title differs');

// ---- an app opened from Hearth ----
eq(c.moveToFront(list, 'c.three', 'Three'), [C, A, B], 'the opened app goes first');
eq(c.moveToFront(list, 'a.one', 'One') === list, true, 'already first: the same list');
eq(c.moveToFront(list, 'z.new', 'New'), [{id: 'z.new', title: 'New'}, A, B, C], 'not a recent app yet: added first');
eq(c.moveToFront([], 'z.new', 'New'), [{id: 'z.new', title: 'New'}], 'after Close all: the opened app is the list');
eq(list, [A, B, C], 'the old list is not changed');

// ---- apps closed ----
eq(c.withoutApps(list, ['b.two']), [A, C], 'a closed app leaves the list');
eq(c.withoutApps(list, ['a.one', 'c.three']), [B], 'several');
eq(c.withoutApps(list, ['z.none']) === list, true, 'none of them in it: the same list');

// ---- the highlight when a newer list arrives ----
eq(c.followFocus(list, [D, A, B, C], 0, false), 0, 'not moved yet: stays on the first tile (the newest app)');
eq(c.followFocus(list, [D, A, B, C], 1, true), 2, 'moved: stays on the same app (B) where it now is');
eq(c.followFocus(list, [A, C], 1, true), 1, 'its app was closed: keeps its place');
eq(c.followFocus(list, [A], 2, true), 0, 'and stays inside a shorter list');
eq(c.followFocus(list, [], 2, true), 0, 'an empty list');
eq(c.followFocus([], list, 0, true), 0, 'nothing shown before');
process.exit(fail ? 1 : 0);
