// L4: lists visible English texts written directly in the code (not through t()/td()). Run: node scripts/lang-scan.mjs [--list]
// Needs the `typescript` package (5.x); exits 1 when a text is found that is not in scripts/lang-scan-allow.json.
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, relative} from 'node:path';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); if (!ts.createSourceFile) throw new Error('no API'); } catch { try { ts = require('/tmp/ast/node_modules/typescript'); } catch { console.log('lang-scan: needs typescript 5 (npm i typescript@5 in a scratch folder, or TS 5 in node_modules)'); process.exit(2); } }
const root = new URL('../src/', import.meta.url).pathname;
// Not scanned by design (AGENT: font names, language names, debug/log lines and shell texts stay English): brand and font tables,
// city data (undecided), the Debug/Tests tab, theme colour values, remote drawing labels (brands) and the files that build shell commands.
const SKIP = ['i18n/en.ts', 'i18n/pack.ts', 'config/bundledlanguages.ts', 'lib/cities.ts', 'lib/clockfont.ts', 'lib/debuginfo.ts', 'lib/remotedraw.ts', 'lib/coldstart.ts', 'theme/tokens.ts'];
const SKIP_RE = /^(config\/|lib\/probe|lib\/[a-z]*cmd\.ts$)/;
const SHELL = /(luna-send|mkdir |echo |\$\(|2>|\/dev\/null|grep |awk |\bsed |rm -f|\[ -[fsd] |printf|curl |\bthen\b|; do\b|umount|touch |\bcat |rgba?\(|drop-shadow|\bdd if|\bstat -c|tail -n|df -k|@@|\bexit \d|\.zip\b.*scp |^key_)/;
const files = [];
(function walk (d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'assets') walk(p); } else if (/\.tsx?$/.test(n) && !SKIP.includes(relative(root, p)) && !SKIP_RE.test(relative(root, p))) files.push(p); } })(root);
const QUIET = new Set(['log', 'logLine', 'warn', 'error', 'info', 'debug', 'exec', 'markAliveSoon', 'noteFirstScreen', 'td', 't', 'tt', 'require', 'Error', 'RegExp', 'querySelector', 'querySelectorAll', 'getElementById', 'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'setProperty', 'lunaCall', 'shellQuote', 'noteExec', 'mark', 'startsWith', 'endsWith', 'indexOf', 'includes', 'split', 'join', 'replace', 'test', 'match', 'push', 'concat', 'createElement', 'getAttribute', 'setAttribute', 'cleanForLog']);
const ATTR_QUIET = new Set(['className', 'class', 'key', 'id', 'type', 'role', 'style', 'viewBox', 'd', 'fill', 'stroke', 'points', 'xmlns', 'src', 'href', 'transform', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'strokeLinecap', 'strokeLinejoin', 'tabIndex', 'dir', 'lang']);
const found = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(root, file);
  const add = (node, s, why) => {
    const v = s.replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{3,}/.test(v)) return;
    if (!/[ ]/.test(v) && !/^[A-Z][a-z]{2,}/.test(v)) return;                 // one lower-case word: a code value
    if (/^[a-z0-9_.:\/#-]+$/i.test(v) && !/^[A-Z][a-z]/.test(v)) return;         // ids, paths, css
    if (/^(https?:|\/|\.|#|[a-z]+-[a-z-]+$)/.test(v) || SHELL.test(v)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    found.push({file: rel, line, text: v.slice(0, 110), why, node, sf, abs: file});
  };
  const callName = (n) => { let c = n.parent; while (c && (ts.isParenthesizedExpression(c) || ts.isBinaryExpression(c) || ts.isConditionalExpression(c) || ts.isTemplateSpan(c) || ts.isTemplateExpression(c) || ts.isArrayLiteralExpression(c) || ts.isAsExpression(c))) c = c.parent; return c; };
  const quiet = (n) => {
    for (let c = n.parent; c; c = c.parent) {
      if (ts.isImportDeclaration(c) || ts.isExportDeclaration(c) || ts.isTypeNode(c) || ts.isLiteralTypeNode(c)) return true;
      if (ts.isCallExpression(c)) {
        const e = c.expression; const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
        if (QUIET.has(name)) return true;
        if (name === 'map' || name === 'filter') continue;
      }
      if (ts.isNewExpression(c) && ts.isIdentifier(c.expression) && QUIET.has(c.expression.text)) return true;
      if (ts.isThrowStatement(c)) return true;
      if (ts.isCaseClause(c) && c.expression === n) return true;
      if (ts.isBinaryExpression(c) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(c.operatorToken.kind)) return true;
      if (ts.isJsxAttribute(c)) return ATTR_QUIET.has(c.name.getText());
      if (ts.isStatement(c) && !ts.isExpressionStatement(c) && !ts.isReturnStatement(c) && !ts.isVariableStatement(c)) return false;
    }
    return false;
  };
  (function visit (n) {
    if (ts.isJsxText(n)) add(n, n.getText(), 'jsx');
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !quiet(n)) add(n, n.text, 'str');
    else if (ts.isTemplateExpression(n) && !quiet(n)) add(n, n.head.text + n.templateSpans.map((s) => '{}' + s.literal.text).join(''), 'tpl');
    ts.forEachChild(n, visit);
  })(sf);
}
export const hits = found;
if (process.argv[1] && process.argv[1].endsWith('lang-scan.mjs')) {
  const allowFile = new URL('./lang-scan-allow.json', import.meta.url).pathname;
  const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : [];
  const open = found.filter((f) => !allow.some((a) => a.text === f.text && (!a.file || a.file === f.file)));
  if (process.argv.includes('--list')) for (const f of open) console.log(`${f.file}:${f.line} [${f.why}] ${f.text}`);
  console.log(`lang-scan: ${found.length} candidates, ${found.length - open.length} allowed, ${open.length} open`);
  process.exit(open.length ? 1 : 0);

}
