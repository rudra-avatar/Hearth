// Tests for src/lib/zipwrite.ts and src/lib/themebase.ts (P97: theme base zip).   Run: npm test
import {build} from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execSync} from 'child_process';
const root = new URL('..', import.meta.url).pathname;
const bundle = async (entry, name) => { const out = path.join(root, 'node_modules', name); await build({entryPoints: [path.join(root, entry)], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'}); return import(out); };
const z = await bundle('src/lib/zipwrite.ts', '.cache-zipwrite-test.mjs');
const b = await bundle('src/lib/themebase.ts', '.cache-themebase-test.mjs');
const f = await bundle('src/lib/themefile.ts', '.cache-themefile-test2.mjs');
let fail = 0;
const eq = (a, c, m) => { const ok = JSON.stringify(a) === JSON.stringify(c); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(c)); } else console.log('ok  ', m); };

eq(z.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'crc32 check value');
eq(Buffer.from(z.utf8('a←€😀')).toString('hex'), Buffer.from('a←€😀').toString('hex'), 'utf8 matches Buffer');
const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
eq(z.bytesToBase64(bytes), Buffer.from(bytes).toString('base64'), 'base64 of bytes');
eq(Array.from(z.dataUriBytes('data:image/png;base64,' + Buffer.from(bytes).toString('base64'))), Array.from(bytes), 'data address back to bytes');
eq(z.dataUriBytes('nonsense'), null, 'not a data address');

// a real PNG (1x1) for icons
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const apps = [
	{id: 'com.webos.app.browser', name: 'Web Browser', icon: new Uint8Array(png), type: 'png'},
	{id: 'com.example.noicon', name: 'No icon app with a very long name over limit', icon: null},
	{id: 'a:b/c', name: 'Odd id', icon: new Uint8Array(png), type: 'png'},
	{id: 'a_b_c', name: 'Same safe name', icon: new Uint8Array(png), type: 'png'},
	{id: 'com.webos.app.browser', name: 'Duplicate id', icon: null}
];
const guide = '# Guide ← → test\n';
const r = b.buildThemeBase(apps, guide);
eq([r.apps, r.icons], [4, 3], 'four apps, three icons, duplicate id dropped');
const man = JSON.parse(r.manifest);
eq(man.apps.map((a) => a.id), ['com.webos.app.browser', 'com.example.noicon', 'a:b/c', 'a_b_c'], 'app order kept');
eq(man.apps[1].name.length, 24, 'name cut to 24');
eq(man.icons.map((i) => i.file), ['icons/com.webos.app.browser.png', 'icons/a_b_c.png', 'icons/a_b_c-2.png'], 'icon file names safe and unique');

// the zip is readable by real tools, and Hearth's own validator accepts the manifest
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-'));
const zip = path.join(dir, 'theme_base.zip');
fs.writeFileSync(zip, Buffer.from(r.bytes));
let t = '';
try { t = execSync(`unzip -t "${zip}" 2>&1`).toString(); } catch (e) { t = String(e.stdout || e); }
eq(/No errors detected/.test(t), true, 'unzip -t: no errors');
const out = path.join(dir, 'x'); execSync(`unzip -q "${zip}" -d "${out}"`);
eq(fs.readFileSync(path.join(out, 'theme-guide.md'), 'utf8'), guide, 'guide round trip');
eq(fs.readFileSync(path.join(out, 'icons/a_b_c.png')).equals(png), true, 'icon bytes round trip');
const files = {};
const walk = (d, pre) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, pre + n + '/'); else files[pre + n] = fs.statSync(p).size; } };
walk(out, '');
const v = f.validateTheme(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')), files);
eq(v.ok, true, 'Hearth validator accepts the base' + (v.ok ? '' : ' ' + v.errors.join(' | ')));
try { eq(execSync(`python3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).testzip())" "${zip}"`).toString().trim(), 'None', 'python zipfile test'); } catch (e) { console.log('skip python'); }

// the write commands, run in a shell against a temporary folder, give back the same file (both piece sizes)
const big = new Uint8Array(100000); for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 8)) & 255;
for (const size of [b.PIECE_CHARS, b.SMALL_PIECE_CHARS]) {
	const cmds = b.writeCommands(big, size).map((c) => c.split('/media/developer/themes').join(path.join(dir, 'themes')));
	let last = '';
	for (const c of cmds) last = execSync(c, {shell: '/bin/sh'}).toString();
	eq(b.parseWritten(last), big.length, `shell write, pieces of ${size}: size printed`);
	eq(fs.readFileSync(path.join(dir, 'themes/theme_base.zip')).equals(Buffer.from(big)), true, `shell write, pieces of ${size}: same bytes`);
	eq(fs.existsSync(path.join(dir, 'themes/theme_base.zip.part')), false, 'no .part file left');
}
fs.rmSync(dir, {recursive: true, force: true});
if (fail) { console.log(fail + ' failed'); process.exit(1); }
