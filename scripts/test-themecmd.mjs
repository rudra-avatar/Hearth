// Tests for src/lib/themecmd.ts (P79: loading a theme zip: commands and parsers).   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import fs from 'fs';
const out = new URL('../node_modules/.cache-themecmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/themecmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
const vout = new URL('../node_modules/.cache-themefile-test2.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/themefile.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: vout, platform: 'node', logLevel: 'error'});
const v = await import(vout);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

eq(c.parseZipNames('b.zip\nA.ZIP\nnotes.txt\nsub\n\nc.zip.bak\n'), ['A.ZIP', 'b.zip'], 'only .zip names, sorted without case');
eq(c.deleteSavedCommand('my-theme'), "rm -rf /media/developer/launcher-theme/saved/my-theme; echo deleted", 'delete command (P82)');
eq(c.deleteSavedCommand('../x'), 'exit 1', 'delete command refuses a bad slug');
eq(c.zipPath('x.zip'), '/media/developer/themes/x.zip', 'zip path');

const info = '@@TOOL unzip\nArchive:  x.zip\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n     3482  2026-10-30 10:39   theme-guide.md\n        0  2026-10-30 10:39   icons/\n      700  2026-10-30 10:39   my icons/a b.png\n---------                     -------\n     4182                     3 files\n@@END\n';
const p = c.parseInspect(info);
eq([p.tool, p.noFile, p.entries], ['unzip', false, {'theme-guide.md': 3482, 'my icons/a b.png': 700}], 'unzip -l: entries with sizes, folders left out, names with spaces');
eq(c.parseInspect('@@TOOL none\n').tool, 'none', 'no extractor found');
eq(c.parseInspect('@@TOOL busybox\n@@NOFILE\n').noFile, true, 'file gone');
eq(Object.keys(c.parseInspect('@@TOOL busybox\n  Length     Date   Time    Name\n    12 2026-10-30 10:00 manifest.json\n@@END').entries), ['manifest.json'], 'busybox style listing');
eq(Object.keys(c.parseInspect('@@TOOL unzip\n  123  10-30-26 10:39   a.png\n').entries), ['a.png'], 'older date style');

const ex = '@@RC 0\n@@F 100 ./manifest.json\n@@F 5 ./icons/a.png\n@@MANIFEST\n{"format":1}\n\n@@END\n';
const e = c.parseExtract(ex);
eq([e.ok, e.files, e.manifest.trim()], [true, {'manifest.json': 100, 'icons/a.png': 5}, '{"format":1}'], 'extract output: files and manifest');
eq(c.parseExtract('@@RC 1\n@@MANIFEST\n\n@@END\n').ok, false, 'a failing extractor is not ok');
eq(c.parseExtract('@@RC 0\n@@F 1 ./a.png\n').ok, false, 'output without the end marker is not ok');

eq(c.themeSummary({name: 'x'}), 'no parts (the theme changes nothing)', 'summary of an empty theme');
eq(c.themeSummary({name: 'x', colors: {theme: 'teal'}, icons: [{app: 'a', file: 'a.png'}], apps: [{id: 'a'}, {id: 'b'}], cities: [{name: 'D', lat: 1, lon: 1}]}), 'colours, 1 icons, 2 apps, 1 cities', 'summary lists the parts');

// run the real commands with the sandbox's unzip on the dummy theme (store step is not run: it writes to /media)
const zip = new URL('../docs/theme/theme_name.zip', import.meta.url).pathname;
const sh = (cmd) => execSync(cmd, {shell: '/bin/sh', encoding: 'utf8', timeout: 20000});
try {
	const i1 = c.parseInspect(sh(c.inspectCommand(zip)));
	eq([i1.tool, Object.keys(i1.entries).sort()], ['unzip', ['icons/example.png', 'manifest.json', 'theme-guide.md']], 'inspect on the dummy zip');
	eq(v.checkFiles(i1.entries), [], 'the dummy zip passes the file check before extracting');
	const x = c.parseExtract(sh(c.extractCommand(zip, 'unzip')));
	eq(x.ok, true, 'extract succeeded');
	const r = v.validateTheme(v.parseManifest(x.manifest).value, x.files);
	eq(r.ok, true, 'the extracted dummy theme validates' + (r.ok ? '' : ' ' + r.errors.join('|')));
	eq(c.parseInspect(sh(c.inspectCommand('/nonexistent.zip'))).noFile, true, 'a missing zip is reported');
	// a zip with a script is refused before extraction
	const dir = fs.mkdtempSync('/tmp/hearth-tt-');
	fs.writeFileSync(dir + '/manifest.json', '{"format":1,"name":"x"}'); fs.writeFileSync(dir + '/run.sh', 'echo hi');
	sh(`cd ${dir} && zip -q ../bad-theme.zip manifest.json run.sh`);
	const i2 = c.parseInspect(sh(c.inspectCommand(dir + '/../bad-theme.zip')));
	eq(v.checkFiles(i2.entries).length, 1, 'a zip holding a script is refused before extraction');
	sh(`rm -rf ${dir} ${dir}/../bad-theme.zip`);
	// a broken zip
	fs.writeFileSync('/tmp/hearth-notzip.zip', 'not a zip');
	const i3 = c.parseInspect(sh(c.inspectCommand('/tmp/hearth-notzip.zip')));
	eq(Object.keys(i3.entries).length, 0, 'a file that is not a zip has no entries');
	fs.unlinkSync('/tmp/hearth-notzip.zip');
} catch (err) { fail++; console.log('FAIL command run', String(err).slice(0, 300)); }
sh(c.CLEAN_COMMAND);
process.exit(fail ? 1 : 0);
