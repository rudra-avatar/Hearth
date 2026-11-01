// Tests for issue #32 (src/lib/legacyids.ts): 1.2.0 photo ids map to the same picture in 2.0.   Run: npm test
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const out = new URL('../node_modules/.cache-legacyids-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/legacyids.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
// verified by image comparison against the 1.2.0 source (2026-11-01)
const want = {'nature-02': 'photo-03', 'nature-03': 'photo-04', 'nature-04': 'photo-08', 'nature-05': 'photo-10', 'nature-06': 'photo-13', 'nature-07': 'photo-14', 'nature-08': 'photo-16', 'nature-09': 'photo-17', 'nature-10': 'photo-19', 'nature-11': 'photo-25'};
Object.keys(want).forEach((k) => eq(c.currentPhotoId(k), want[k], k + ' -> ' + want[k]));
eq(c.currentPhotoId('nature-01'), 'photo-17', 'nature-01 (no match) -> default photo');
eq(c.currentPhotoId('nature-show'), 'photo-show', 'slideshow id');
eq(c.currentPhotoId('photo-04'), 'photo-04', 'a 2.0 id is untouched');
eq(c.currentPhotoId('theme'), 'theme', 'other ids untouched');
eq(c.currentPhotoId('constructor'), 'constructor', 'no prototype keys');
eq(c.currentSaverSource('@photo:nature-04'), '@photo:photo-08', 'saver source mapped');
eq(c.currentSaverSource('@photos'), '@photos', 'saver photo list untouched');
eq(c.currentSaverSource('/media/x.mp4'), '/media/x.mp4', 'path untouched');
const bg = readFileSync(new URL('../src/lib/backgrounds.ts', import.meta.url), 'utf8');
c.LEGACY_PHOTO_TARGETS.forEach((t) => eq(bg.indexOf("id: '" + t + "'") !== -1, true, 'target exists: ' + t));
process.exit(fail ? 1 : 0);
