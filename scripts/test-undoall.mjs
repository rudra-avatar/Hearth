// U1: Undo all Hearth changes (src/lib/undoallcmd.ts): key-hook plan, script text (sh -n), step order, safety rules.   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const rawPlugin = {name: 'raw', setup (b) {
	b.onResolve({filter: /\?raw$/}, (a) => ({path: join(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw-file'}));
	b.onLoad({filter: /.*/, namespace: 'raw-file'}, (a) => ({contents: readFileSync(a.path, 'utf8'), loader: 'text'}));
}};
const out = new URL('../node_modules/.cache-undoall-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/undoallcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error', plugins: [rawPlugin], define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}});
const u = await import(out);

// key-hook plan
const binds = {
	'773': {action: 'launch', id: 'tld.my.customlauncher'},
	'403': {action: 'exec', command: 'sh /media/developer/launcher-homekey/keyact.sh screenoff'},
	'404': {action: 'launch', id: 'com.example.other'},
	'405': {action: 'exec', command: 'sh /home/root/mine.sh'}
};
const plan = u.planBinds(binds, {'404': {previous: {action: 'replace', keycode: 405}}});
ok(!plan.next['773'] && !plan.next['403'], 'Hearth entries (launch Hearth, keyact script) are removed');
ok(plan.next['404'] && plan.next['404'].action === 'replace', 'a recorded button gets its earlier entry back');
ok(plan.next['405'] && plan.next['405'].command === 'sh /home/root/mine.sh', 'a foreign command stays');
ok(plan.changed && plan.lines.some((l) => /left \(not Hearth's/.test(l)), 'the plan says what is left');
ok(!u.planBinds({}, {}).changed, 'an empty file needs no write');

// script
const text = u.undoScript(['Home app: no saved app, nothing to put back']);
const dir = mkdtempSync(join(tmpdir(), 'undo-'));
const file = join(dir, 'undo.sh');
writeFileSync(file, text);
let syntax = true;
try { execFileSync('sh', ['-n', file]); } catch (e) { syntax = false; console.log(String(e.stderr || e.message).slice(0, 300)); }
ok(syntax, 'the script is valid shell (sh -n)');
ok(text.indexOf('hearth-undo-log.txt') !== -1 && text.split('\n')[3].indexOf(u.UNDO_LOG) !== -1, 'the single log is named at the top');
ok(text.indexOf('== uninstall Hearth') > text.indexOf('== network folder') && text.indexOf('== uninstall Hearth') > text.indexOf('== temporary files'), 'the uninstall comes after every removal');
ok(text.indexOf('== what is still there') > text.indexOf('== uninstall Hearth'), 'the left-over listing comes after the uninstall');
ok(text.indexOf('== key engine start-up job') !== -1 && text.indexOf('== key engine start-up job') < text.indexOf('== temporary files'), 'U1b: the key engine start-up job is stopped before the /tmp files go');
ok(/grep -q homehook "\/proc\/\$p\/cmdline"/.test(text), 'U1b: only a process that is the key engine job is stopped');
ok(/\[ ! -d '[^']*org\.webosbrew\.inputhook' \]; then rm -f \/tmp\/inputhook/.test(text), 'U1b: the hook marker and logs go only when the separate Input Hook app is not installed');
ok(text.indexOf('== uninstall log') > text.indexOf('== uninstall Hearth') && text.indexOf('== uninstall log') < text.indexOf('== what is still there') && /rm -f '\/tmp\/launcher-uninstall.log'/.test(text), 'U1b: the uninstall log is added to the undo log, then removed');
ok(text.indexOf('== TV input entry') !== -1 && /deleteDevice/.test(text) && text.indexOf('== TV input entry') < text.indexOf('== temporary files'), 'p17: the Hearth TV input is taken out before the /tmp files go');
ok(text.indexOf('== start-up check') > text.indexOf('== uninstall Hearth') && text.indexOf('== start-up check') < text.indexOf('== what is still there') && /bootd\.json/.test(text), 'p17: the start-up check probe runs after the uninstall');
ok(/skipped: a Hearth folder is still mounted/.test(text), 'nothing is deleted while a Hearth folder is mounted');
ok(!/rm -rf [^;]*(wallpapers|themes|languages|screensavers)/.test(text), 'the user\'s own folders are never deleted');
ok(!/rm -rf \/tmp/.test(text) && /\[ -f "\$f" \]/.test(text), '/tmp cleanup removes regular files only (never the network mount)');
ok(/Home app: no saved app/.test(text), 'the app part\'s log lines are written first');
ok(!/undefined|\$\{/.test(text), 'no unfilled parts');
ok(text.indexOf('exit $?') !== -1 && /rm -f '\/tmp\/hearth-undo.sh'/.test(text), 'every step logs its exit code; the script deletes itself');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
