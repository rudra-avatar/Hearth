// L4: no visible English text may be written directly in the code (it would stay English in a translated language), and every
// literal key given to t()/td()/tt() must exist in src/i18n/en.ts.   Run: npm test   (list: node scripts/lang-scan.mjs --list)
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
let fail = 0;
const root = new URL('../src/', import.meta.url).pathname;
try { execFileSync('node', [new URL('./lang-scan.mjs', import.meta.url).pathname], {stdio: 'pipe'}); console.log('ok   no unlisted English text in the code'); }
catch (e) { fail++; console.log('FAIL texts in the code that bypass the string table (run: node scripts/lang-scan.mjs --list):\n' + String(e.stdout || e.message).slice(0, 2000)); }
const body = readFileSync(root + 'i18n/en.ts', 'utf8');
const en = new Function('return (' + body.slice(body.indexOf('export const en = ') + 18, body.indexOf('} as const;') + 1) + ');')();
const files = [];
(function walk (d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'assets') walk(p); } else if (/\.tsx?$/.test(n)) files.push(p); } })(root);
const missing = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\b(?:tt|td|t)\(\s*'((?:\\.|[^'\\])*)'/g)) if (!(m[1] in en) && !/^[a-z]+\.$/.test(m[1]) && !/^(bg|shape|clock\.(day|month))/.test(m[1])) missing.push(f.slice(root.length) + ': ' + m[1]);
}
if (missing.length) { fail++; console.log('FAIL keys not in en.ts:\n' + missing.join('\n')); } else console.log('ok   every key used in the code is in en.ts');
process.exit(fail ? 1 : 0);
