// Tests for src/lib/themefile.ts (P78: user theme format and validator).   Run: npm test
import {build} from 'esbuild';
import fs from 'fs';
const out = new URL('../node_modules/.cache-themefile-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/themefile.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const t = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// the dummy theme in the source is valid
const dir = new URL('../docs/theme/theme_name/', import.meta.url).pathname;
const files = {};
const walk = (d, pre) => { for (const n of fs.readdirSync(d)) { const p = d + n; if (fs.statSync(p).isDirectory()) walk(p + '/', pre + n + '/'); else files[pre + n] = fs.statSync(p).size; } };
walk(dir, '');
const man = JSON.parse(fs.readFileSync(dir + 'manifest.json', 'utf8'));
const r = t.validateTheme(man, files);
eq(r.ok, true, 'the dummy theme (docs/theme/theme_name) is valid' + (r.ok ? '' : ' ' + r.errors.join(' | ')));
const zip = fs.readFileSync(new URL('../docs/theme/theme_name.zip', import.meta.url).pathname).toString('latin1');
eq([zip.indexOf('manifest.json') !== -1, zip.indexOf('theme-guide.md') !== -1, zip.indexOf('icons/example.png') !== -1], [true, true, true], 'theme_name.zip holds the manifest, the guide and the example icon');

const F = {'manifest.json': 100};
const ok = (m, f) => t.validateTheme(m, f || F);
const bad = (m, f) => { const x = ok(m, f); return x.ok ? [] : x.errors; };
const base = {format: 1, name: 'T'};

// parts are optional: a name and a format alone is a valid theme
eq(ok(base).ok, true, 'any subset: no components at all is valid');
eq(ok({...base, colors: {widget: 'amber'}}).theme.colors, {widget: 'amber'}, 'colours only: the other colours stay missing (change nothing)');
eq(ok({...base, cities: [{name: 'A', lat: 1, lon: 2}]}).ok, true, 'cities only');
eq(ok({...base, apps: [{id: 'x', name: ' Hi '}]}).theme.apps, [{id: 'x', name: 'Hi'}], 'apps only; names are trimmed');

// manifest basics
eq(bad(base, {}).some((e) => /manifest\.json is missing/.test(e)), true, 'no manifest.json: refused');
eq(bad({name: 'T'}).length > 0, true, 'no format: refused');
eq(/format 2 is not supported/.test(bad({format: 2, name: 'T'})[0]), true, 'a newer format is refused with its number');
eq(bad({format: 1}).some((e) => /needs a "name"/.test(e)), true, 'no name: refused');
eq(bad({...base, extra: 1}).some((e) => /Unknown part "extra"/.test(e)), true, 'an unknown part is refused (typo safety)');
eq(bad([]).length, 1, 'a list instead of an object is refused');
eq(t.parseManifest('{not json').ok, false, 'broken JSON is reported');
eq(t.parseManifest('\uFEFF{"a":1}').ok, true, 'a BOM is accepted');

// colours
eq(bad({...base, colors: {theme: 'neon'}}).length, 1, 'unknown theme refused');
eq(bad({...base, colors: {widget: 'ember'}}).length, 1, 'a removed gradient is not a colour');
eq(ok({...base, colors: {theme: 'teal', widget: 'theme', icon: 'amber'}}).ok, true, 'theme, widget and icon colours are independent');
eq(bad({...base, colors: {name: 'white'}}).length, 1, 'name colour is not part of the format');

// fonts
const fs1 = {...F, 'fonts/a.woff2': 10, 'fonts/b.ttf': 10};
eq(ok({...base, fonts: {files: [{id: 'a-font', file: 'fonts/a.woff2'}, {id: 'b', label: 'B', file: 'fonts/b.ttf'}], widget: 'a-font', names: 'b'}}, fs1).ok, true, 'own fonts, used for widget and names');
eq(ok({...base, fonts: {widget: 'inter', names: 'default'}}).ok, true, 'a built-in font and default need no files');
eq(bad({...base, fonts: {files: [{id: 'inter', file: 'fonts/a.woff2'}]}}, fs1).length, 1, 'an own font cannot reuse a built-in id');
eq(bad({...base, fonts: {files: [{id: 'a', file: 'fonts/a.woff2'}, {id: 'a', file: 'fonts/b.ttf'}]}}, fs1).length, 1, 'a font id twice');
eq(bad({...base, fonts: {widget: 'nothere'}}).length, 1, 'an unknown font id');
eq(bad({...base, fonts: {widget: 'default'}}).length, 1, 'widget cannot be "default"');
eq(bad({...base, fonts: {files: [{id: 'a', file: 'fonts/gone.woff2'}]}}).some((e) => /not in the zip/.test(e)), true, 'a missing font file');
eq(bad({...base, fonts: {files: [{id: 'A!', file: 'fonts/a.woff2'}]}}, fs1).length, 1, 'a bad font id');
eq(bad({...base, fonts: {files: [{id: 'a', file: 'icons/x.png'}]}}, {...F, 'icons/x.png': 5}).length, 1, 'a picture is not a font');

// icon style
eq(ok({...base, iconStyle: {style: 'soft', tile: 'light'}}).ok, true, 'icon style and tile');
eq(bad({...base, iconStyle: {style: 'duotone'}}).length, 1, 'unknown icon style');
eq(bad({...base, iconStyle: {tile: 'grey'}}).length, 1, 'unknown tile');

// icons and apps
const fi = {...F, 'icons/a.png': 5, 'icons/b.jpg': 5};
eq(ok({...base, icons: [{app: 'a', file: 'icons/a.png'}, {app: 'b', file: 'icons/b.jpg'}]}, fi).ok, true, 'png and jpeg icons');
eq(bad({...base, icons: [{app: 'a', file: 'icons/a.png'}, {app: 'a', file: 'icons/b.jpg'}]}, fi).length, 1, 'two icons for one app');
eq(bad({...base, icons: [{app: 'a', file: 'icons/c.webp'}]}, {...fi, 'icons/c.webp': 5}).length >= 1, true, 'webp is not an icon type');
eq(bad({...base, icons: [{app: 'a', file: '../a.png'}]}, fi).length, 1, 'a path with .. is refused');
eq(bad({...base, apps: [{id: 'a'}, {id: 'a'}]}).length, 1, 'an app listed twice');
eq(bad({...base, apps: [{id: 'a', name: ''}]}).length, 1, 'an empty edited name');
eq(ok({...base, apps: [{id: 'b'}, {id: 'a', name: 'x'.repeat(40)}]}).theme.apps, [{id: 'b'}, {id: 'a', name: 'x'.repeat(24)}], 'the app order is kept, long names cut to 24');

// cities
eq(bad({...base, cities: [{name: 'A', lat: 91, lon: 0}]}).length, 1, 'latitude out of range');
eq(bad({...base, cities: [{name: 'A', lat: '1', lon: 0}]}).length, 1, 'latitude must be a number');
eq(bad({...base, cities: [{lat: 1, lon: 0}]}).length, 1, 'a city needs a name');

// no limits on counts
const many = Array.from({length: 5000}, (_, i) => ({id: 'app.' + i, name: 'N' + i}));
const manyIcons = {}; const iconList = Array.from({length: 3000}, (_, i) => { manyIcons['icons/' + i + '.png'] = 100; return {app: 'app.' + i, file: 'icons/' + i + '.png'}; });
eq(ok({...base, apps: many, icons: iconList}, {...F, ...manyIcons}).ok, true, 'no count limit: 5000 apps and 3000 icons are accepted');

// zip content: only data files, size guard
eq(bad(base, {...F, 'run.sh': 10}).some((e) => /run\.sh/.test(e)), true, 'a script in the zip refuses the theme');
eq(bad(base, {...F, 'a.js': 10}).length, 1, 'a .js file is refused');
eq(bad(base, {...F, 'page.HTML': 10}).length, 1, 'extension check ignores case');
eq(bad(base, {...F, 'noext': 10}).length, 1, 'a file without an extension is refused');
eq(ok(base, {...F, 'notes.md': 10, 'x.txt': 1}).ok, true, 'notes (.md, .txt) are allowed');
eq(bad(base, {...F, 'icons/big.png': t.MAX_FILE_BYTES + 1}).some((e) => /too big/.test(e)), true, 'a file above the very high guard is refused');
eq(ok(base, {...F, 'icons/ok.png': 90 * 1024 * 1024}).ok, true, 'a 90 MB file is below the guard');
for (const p of ['/abs.png', 'a/../b.png', 'a\\b.png', 'c:x.png', 'a//b.png', './a.png']) eq(bad(base, {...F, [p]: 1}).length >= 1, true, 'unsafe path refused: ' + p);
eq(t.safePath('icons/a.png'), true, 'a plain path is safe');

// the pop-up text
const many2 = Array.from({length: 9}, (_, i) => 'e' + i);
eq(t.themeErrorText(many2), 'e0. e1. e2. e3. e4. e5. And 3 more.', 'the pop-up shows six reasons and counts the rest');
eq(t.themeErrorText(['x']), 'x', 'one reason as it is');
// P96: wallpaper part (one picture or a folder of the theme's own pictures)
eq(ok({...base, wallpaper: {file: 'w/a.jpg'}}, {...F, 'w/a.jpg': 5}).theme.wallpaper, {file: 'w/a.jpg'}, 'wallpaper: one picture');
const WF = {...F, 'wp/a.jpg': 5, 'wp/b.png': 5, 'wp/sub/c.jpg': 5, 'wp/notes.txt': 1};
const wr = ok({...base, wallpaper: {folder: 'wp/', intervalSec: 30, shuffle: false}}, WF);
eq([wr.ok, wr.theme.wallpaper, wr.files.sort()], [true, {folder: 'wp', intervalSec: 30, shuffle: false}, ['manifest.json', 'wp/a.jpg', 'wp/b.png']], 'wallpaper: folder slideshow uses the pictures directly inside it');
eq(bad({...base, wallpaper: {}}).some((e) => /exactly one of/.test(e)), true, 'wallpaper: file or folder needed');
eq(bad({...base, wallpaper: {file: 'a.jpg', folder: 'wp'}}, WF).some((e) => /exactly one of/.test(e)), true, 'wallpaper: not both');
eq(bad({...base, wallpaper: {file: 'missing.jpg'}}).some((e) => /not in the zip/.test(e)), true, 'wallpaper: a missing picture is refused');
eq(bad({...base, wallpaper: {file: 'w/a.jpg', intervalSec: 10}}, {...F, 'w/a.jpg': 5}).length > 0, true, 'wallpaper: interval belongs to a folder');
eq(bad({...base, wallpaper: {folder: 'empty'}}, WF).some((e) => /no png or jpg/.test(e)), true, 'wallpaper: an empty folder is refused');
eq(bad({...base, wallpaper: {folder: 'wp', intervalSec: 2}}, WF).length, 1, 'wallpaper: interval below 5 s refused');
eq(bad({...base, wallpaper: {folder: 'wp', shuffle: 'yes'}}, WF).length, 1, 'wallpaper: shuffle must be true/false');
eq(bad({...base, wallpaper: {folder: '../x'}}, WF).length, 1, 'wallpaper: unsafe folder refused');
eq(bad({...base, wallpaper: {file: 'a.jpg', x: 1}}, {...F, 'a.jpg': 1}).some((e) => /Unknown entry "x"/.test(e)), true, 'wallpaper: unknown entry refused');
eq(ok({...base, colors: {widgetInk: '#ffe9c7'}}).theme.colors, {widgetInk: '#FFE9C7'}, 'widgetInk: own colour accepted, upper-cased');
eq(bad({...base, colors: {widgetInk: 'red'}}).length, 1, 'widgetInk: not a #RRGGBB colour refused');
eq(bad({...base, colors: {widgetInk: '#FFF'}}).length, 1, 'widgetInk: three digits refused');
eq(bad({...base, colors: {widget: 'amber', widgetInk: '#FFE9C7'}}).length, 1, 'widgetInk together with widget refused');
process.exit(fail ? 1 : 0);
