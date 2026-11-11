// Tests for the install probe (src/lib/probeinstallcmd.ts, test 37): the target reader, the log reader and the install
// script run on a fake TV (fake wget, sha256sum, luna-send, timeout).   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-probeinstall-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probeinstallcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

const SHA = 'a'.repeat(64);
const list = (extra = {}) => JSON.stringify({packages: [{manifest: Object.assign({ipkUrl: 'https://github.com/rudra-avatar/Hearth/releases/download/v2.0.2/tld.my.customlauncher_2.0.2_all.ipk', ipkHash: {sha256: SHA}}, extra)}]});
eq(h.installTarget(list()), {url: 'https://github.com/rudra-avatar/Hearth/releases/download/v2.0.2/tld.my.customlauncher_2.0.2_all.ipk', sha: SHA, version: '2.0.2'}, 'target: version from the address');
eq(h.installTarget(list({version: '2.0.9'})).version, '2.0.9', 'target: manifest version wins');
eq(typeof h.installTarget(list({ipkUrl: 'https://evil.example/x.ipk'})), 'string', 'target: foreign address refused');
eq(typeof h.installTarget(list({ipkUrl: 'https://github.com/rudra-avatar/Hearth/releases/download/v2/x;rm -rf'})), 'string', 'target: shell characters refused');
eq(typeof h.installTarget('{'), 'string', 'target: bad json');
let threw = false; try { h.installScript({url: 'https://github.com/x', sha: SHA, version: '2.0.2'}); } catch (e) { threw = true; }
eq(threw, true, 'script: a bad target throws');

const log = '10:00:00 up=900 start target=2.0.2\n10:00:07 up=907 download size=19168446\n10:00:07 up=907 sha ok, installing\n10:00:09 up=909 luna: {"returnValue":true,"statusValue":0}\n10:00:20 up=920 luna: {"returnValue":true,"details":{"state":"installed"}}\n10:00:21 up=921 installed appinfo "version": "2.0.2"\n10:00:21 up=921 end\n';
const p = h.parseInstallLog(log);
eq([p.started, p.ended, p.stopped, p.target, p.version, p.luna.length, p.problems.length], [true, true, false, '2.0.2', '2.0.2', 2, 0], 'log: finished install read');
eq(h.installWorked(p), true, 'log: worked when the version matches');
eq(h.installWorked(h.parseInstallLog(log.replace('"2.0.2"\n10:00:21 up=921 end', '"2.0.3"\n10:00:21 up=921 end'))), false, 'log: version unchanged is not a success');
eq(h.parseInstallLog('').started, false, 'log: empty');
eq(h.parseInstallLog('x start target=1.0.0\n').started, false, 'log: lines without the time prefix are not a start');
eq(h.parseInstallLog('10:00:00 up=9 start target=2.0.2\n10:00:01 up=10 luna: {"returnValue":false,"errorText":"denied"}\n').problems.length, 1, 'log: a refusal is a problem');

// the script on a fake TV: the first place is "not seen" by the service, the second works
const root = mkdtempSync(join(tmpdir(), 'inst-'));
const bin = join(root, 'bin'); mkdirSync(bin);
mkdirSync(join(root, 'first')); mkdirSync(join(root, 'second'));
const w = (n, body) => { writeFileSync(join(bin, n), '#!/bin/sh\n' + body); chmodSync(join(bin, n), 0o755); };
w('wget', 'while [ $# -gt 0 ]; do [ "$1" = -O ] && { shift; echo payload > "$1"; }; shift; done');
w('sha256sum', `echo "${SHA}  $1"`);
w('timeout', 'shift; exec "$@"');
w('sleep', 'exec /bin/sleep 0.05');
const lunaBody = (firstWorks) => `echo "$*" >> ${join(root, 'lunaargs')}
case "$*" in
  *first*) ${firstWorks ? 'printf \'%s\\n\' \'{"returnValue":true,"status":"installing"}\' \'{"returnValue":true,"status":"installed"}\'' : 'printf \'%s\\n\' \'{"statusValue":23,"details":{"reason":"app/install failed Server response: [0] appFile is missing"}}\''} ;;
  *) printf '%s\\n' '{"returnValue":true,"status":"installing"}' '{"returnValue":true,"status":"installed"}' ;;
esac`;
w('luna-send', lunaBody(false));
writeFileSync(join(root, 'uptime'), '900.5 1\n');
mkdirSync(join(root, 'app'));
writeFileSync(join(root, 'app', 'appinfo.json'), '{"id": "tld.my.customlauncher", "version": "2.0.2"}');
const target = {url: 'https://github.com/rudra-avatar/Hearth/releases/download/v2.0.2/tld.my.customlauncher_2.0.2_all.ipk', sha: SHA, version: '2.0.2'};
const fake = (text) => text.split(h.INSTALL_LOG).join(join(root, 'log')).split(h.INSTALL_OUT).join(join(root, 'out')).split(h.INSTALL_PLACES[0]).join(join(root, 'first', 'x.ipk')).split(h.INSTALL_PLACES[1]).join(join(root, 'second', 'x.ipk')).split('/proc/uptime').join(join(root, 'uptime'))
	.split('/media/developer/apps/usr/palm/applications/tld.my.customlauncher').join(join(root, 'app'));
writeFileSync(join(root, 'run.sh'), fake(h.installScript(target)));
execSync(`PATH=${bin}:$PATH sh ${join(root, 'run.sh')}`, {stdio: 'pipe'});
const q = h.parseInstallLog(readFileSync(join(root, 'log'), 'utf8'));
eq([q.started, q.ended, q.stopped, q.version, q.tries.length, q.removed], [true, true, false, '2.0.2', 2, 'yes'], 'script: first place refused, second place installs, version read back, files removed (fake TV)');
eq(q.problems.length >= 1, true, 'script: the refusal is logged');
eq([existsSync(join(root, 'first', 'x.ipk')), existsSync(join(root, 'second', 'x.ipk')), existsSync(join(root, 'out'))], [false, false, false], 'script: no downloaded file is left');
eq(/appInstallService\/dev\/install .*"id":"tld.my.customlauncher".*"subscribe":true/.test(readFileSync(join(root, 'lunaargs'), 'utf8')), true, 'script: the install call carries id, file and subscribe');

// the first place works: only one try
w('luna-send', lunaBody(true));
writeFileSync(join(root, 'lunaargs'), '');
execSync(`PATH=${bin}:$PATH sh ${join(root, 'run.sh')}`, {stdio: 'pipe'});
const one = h.parseInstallLog(readFileSync(join(root, 'log'), 'utf8'));
eq([one.tries.length, one.removed, h.installWorked(one)], [1, 'yes', true], 'script: first place works, one try, success');

// a wrong hash stops before the install
w('sha256sum', `echo "${'b'.repeat(64)}  $1"`);
writeFileSync(join(root, 'lunaargs'), '');
try { execSync(`PATH=${bin}:$PATH sh ${join(root, 'run.sh')}`, {stdio: 'pipe'}); } catch (e) { /* exit 1 expected */ }
const r = h.parseInstallLog(readFileSync(join(root, 'log'), 'utf8'));
eq([r.stopped, r.ended, readFileSync(join(root, 'lunaargs'), 'utf8'), existsSync(join(root, 'first', 'x.ipk'))], [true, true, '', false], 'script: a wrong SHA-256 stops, nothing installed, file removed');

// the launch command writes the script and starts it (fake TV: setsid missing -> plain background)
const launch = h.installLaunch(target);
eq([launch.indexOf("<<'HEARTH_EOF'") > 0, launch.indexOf('\nHEARTH_EOF\n') > 0, /echo started$/.test(launch)], [true, true, true], 'launch: heredoc and detached start');
console.log(fail ? `\n${fail} FAILED` : '\nall ok');
process.exit(fail ? 1 : 0);
