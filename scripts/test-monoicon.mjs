// Tests for the dark mono icon conversion (src/lib/monoicon.ts).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-monoicon-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/monoicon.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const {monoPixels, smoothAlpha} = await import(out + '?' + Date.now());
let bad = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) bad++; };
const W = 32;
const make = (fn) => { const d = new Uint8ClampedArray(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) d.set(fn(x, y), (y * W + x) * 4); return d; };
const at = (d, x, y) => d[(y * W + x) * 4 + 3];
const red = [220, 20, 20, 255], white = [255, 255, 255, 255], blue = [0, 80, 255, 255], clear = [0, 0, 0, 0];
const inLogo = (x, y) => x > 10 && x < 22 && y > 10 && y < 22;

let d = make((x, y) => (inLogo(x, y) ? red : white));          // coloured logo on a white tile
monoPixels(d, W, W);
check('logo on a white tile becomes solid', at(d, 16, 16) === 255);
check('white background becomes empty', at(d, 2, 2) === 0);
check('the shape is white', d[(16 * W + 16) * 4] > 230 && d[(16 * W + 16) * 4 + 2] > 230);

d = make((x, y) => (inLogo(x, y) ? white : blue));             // white logo on a coloured tile
monoPixels(d, W, W);
check('white logo on a blue tile stays a solid shape', at(d, 16, 16) === 255 && at(d, 2, 2) === 0);

d = make((x, y) => (inLogo(x, y) ? red : clear));              // transparent icon: its own outline
monoPixels(d, W, W);
check('transparent icon keeps its outline', at(d, 16, 16) === 255 && at(d, 2, 2) === 0);

d = make((x, y) => ((x < 2 && y < 2) || (x > W - 3 && y < 2) ? clear : inLogo(x, y) ? white : blue));   // rounded corners
monoPixels(d, W, W);
check('transparent corners of a filled icon stay empty', at(d, 0, 0) === 0 && at(d, 16, 16) === 255);

d = make(() => white);                                          // a plain icon has no shape
monoPixels(d, W, W);
check('a plain icon becomes empty', at(d, 16, 16) === 0);
// P47: inner detail that differs from the logo's body brightness is cut out so the tile shows through.
const mark = (x, y) => x >= 15 && x <= 17 && y >= 15 && y <= 17;
d = make((x, y) => (mark(x, y) ? [90, 20, 20, 255] : inLogo(x, y) ? [250, 250, 250, 255] : blue));   // white logo, dark red mark, blue tile
monoPixels(d, W, W);
check('inner dark detail is cut out (P47)', at(d, 16, 16) < 20);
check('the logo body stays solid', at(d, 12, 12) >= 250);
d = make((x, y) => (inLogo(x, y) ? [20, 20, 20, 255] : clear));   // a dark logo on transparency still shows fully
monoPixels(d, W, W);
check('a dark single-colour logo stays solid', at(d, 16, 16) === 255);
// Z3: smoothing softens a hard edge, keeps solid and empty areas
d = make((x, y) => (x < 16 ? [255, 255, 255, 255] : [255, 255, 255, 0]));
smoothAlpha(d, W, W);
check('smoothing keeps the inside solid and the outside empty', at(d, 4, 16) === 255 && at(d, 28, 16) === 0);
check('smoothing gives the edge a middle value', at(d, 15, 16) > 128 && at(d, 15, 16) < 255 && at(d, 16, 16) > 0 && at(d, 16, 16) < 128);
console.log(bad ? bad + ' failed' : 'all ok');
process.exit(bad ? 1 : 0);
