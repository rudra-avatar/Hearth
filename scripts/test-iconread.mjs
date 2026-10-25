// Tests for reading app icons in small groups (src/lib/iconread.ts).   Run: npm test
// The fake service runs the real shell commands and, like the Homebrew service on webOS 6 (Node 8),
// fails a whole command whose output is over 200 KB.
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
const out = new URL('../node_modules/.cache-iconread-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/iconread.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const LIMIT = 200 * 1024;
// the TV's busybox base64 takes a file name; macOS's does not, so the commands run with a small stand-in that does
const shim = mkdtempSync(join(tmpdir(), 'hearth-b64-'));
writeFileSync(join(shim, 'base64'), '#!/bin/sh\nif [ -n "$1" ]; then exec /usr/bin/base64 < "$1"; else exec /usr/bin/base64; fi\n', {mode: 0o755});
const env = {...process.env, PATH: `${shim}:${process.env.PATH}`};
let calls = 0;
const service = (command) => new Promise((resolve, reject) => {
	calls++;
	try {
		const stdout = String(execSync(command, {shell: '/bin/sh', maxBuffer: 100000000, env}));
		if (stdout.length > LIMIT) reject(new Error('stdout maxBuffer exceeded'));
		else resolve(stdout);
	} catch (e) { reject(e); }
});

const dir = mkdtempSync(join(tmpdir(), 'hearth-icons-'));
const file = (name, bytes) => { const p = join(dir, name); writeFileSync(p, Buffer.alloc(bytes, name.charCodeAt(0))); return p; };
// 26 icons of ~10 KB each: ~350 KB of base64 together, more than one command may print (the bug seen on a webOS 6.5 TV)
const many = Array.from({length: 26}, (_, i) => ({id: 'app' + i, path: file(`icon${i}.png`, 10000 + i * 100)}));
const expected = (p) => execSync(`base64 < '${p}' | tr -d '\\n'`, {shell: '/bin/sh'}).toString();

eq(c.groups([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'groups of 2');
eq(c.groups([1, 2], 0), [[1], [2]], 'a group size below 1 is taken as 1');
eq(c.parseIconOutput('0 QUJD\n1 \n2 not base64!\n7 REVG\n', 3), {0: 'QUJD'}, 'empty, malformed and out-of-range lines are skipped');
eq(c.iconScript(["/a/it's.png"]).includes(`'/a/it'\\''s.png'`), true, 'paths are shell-quoted');

let found = await c.readIcons(many, service, 26, 1);
eq(Object.keys(found).length > 0 && calls > 1, true, 'all in one command fails on the size limit, then falls back to one at a time');
eq(Object.keys(found).length, 26, '... and still finds every icon');

calls = 0;
found = await c.readIcons(many, service, 4, 2);
eq(calls, 7, '26 icons, 4 per call: 7 calls');
eq(Object.keys(found).length, 26, 'every icon is read');
eq(found[many[17].path], expected(many[17].path), 'the data is the file, base64');

const huge = {id: 'big', path: file('huge.png', 180 * 1024)};
const group = [many[0], huge, many[1], many[2]];
found = await c.readIcons(group, service, 4, 1);
eq(Object.keys(found).sort(), [many[0].path, many[1].path, many[2].path].sort(), 'one oversized icon costs only itself, not its group');

found = await c.readIcons([{id: 'gone', path: join(dir, 'missing.png')}, many[3]], service, 4, 1);
eq(Object.keys(found), [many[3].path], 'a missing file is skipped');

found = await c.readIcons(many.slice(0, 3), () => Promise.reject(new Error('service down')), 4, 2);
eq(found, {}, 'service down: no icons, no error');

rmSync(dir, {recursive: true, force: true});
rmSync(shim, {recursive: true, force: true});
process.exit(fail ? 1 : 0);
