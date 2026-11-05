// Probe tests 38-41 (2.0.3 R3): the timeline reader, and the start-up recorder script run on a fake TV (fake uptime,
// luna-send, sleep, timeout, systemctl).   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-probesam-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probesamcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

const sample = 'start T=31.2\nT=31.9 sam=unknown cfg=no fg=none sys=starting nudge=-\nT=36.0 sam=native cfg=no fg=none sys=starting nudge=-\nT=38.1 sam=native cfg=ok fg=none sys=starting nudge=fail\nT=41.3 sam=native cfg=ok fg=com.webos.app.home sys=starting nudge=ok\nT=60.0 sam=native cfg=ok fg=tld.my.customlauncher sys=running nudge=-\nend T=131.4\n';
const t = h.summariseTimeline(sample);
eq([t.startUp, t.sam, t.cfg, t.nudge, t.fg, t.home, t.running, t.rounds, t.end], [31.2, 36, 38.1, 41.3, 41.3, 41.3, 60, 5, 131.4], 'timeline: first seconds, rounds, end');
eq(t.fgId, 'com.webos.app.home', 'timeline: first app in front');
eq(h.timelineText(h.summariseTimeline('start T=5\n')).includes('not seen'), true, 'timeline text: unseen things say so');
eq(h.summariseTimeline('').rounds, 0, 'timeline: empty input');

// the recorder on a fake TV
const root = mkdtempSync(join(tmpdir(), 'rec-'));
const bin = join(root, 'bin'); mkdirSync(bin);
const script = h.RECORDER_SH.split(h.PROBE_DIR).join(join(root, 'dir')).split('/tmp/launcher-samprobe.pid').join(join(root, 'pid')).split('/proc/uptime').join(join(root, 'uptime'));
mkdirSync(join(root, 'dir'));
writeFileSync(join(root, 'uptime'), '30.0 0\n');
writeFileSync(join(root, 'calls'), '0');
const w = (n, body) => { writeFileSync(join(bin, n), '#!/bin/sh\n' + body); chmodSync(join(bin, n), 0o755); };
w('sleep', `u=$(cut -d' ' -f1 ${join(root, 'uptime')}); echo "$(echo "$u" | awk '{print $1+4}') 0" > ${join(root, 'uptime')}`);   // each sleep moves the fake clock on 4 s
w('timeout', 'shift; exec "$@"');
w('systemctl', 'u=$(cut -d" " -f1 ' + join(root, 'uptime') + '); [ "${u%.*}" -ge 60 ] && echo running || echo starting');
w('luna-send', `u=$(cut -d' ' -f1 ${join(root, 'uptime')}); u=\${u%.*}
case "$*" in
  *getAppInfo*) [ "$u" -ge 34 ] && printf '{\\n "appInfo": {\\n  "type": "qml"\\n }\\n}\\n' ;;
  *getConfigs*) [ "$u" -ge 38 ] && printf '{\\n "configs": {\\n  "profile.blockedAppList": [ "a.b" ]\\n },\\n "returnValue": true\\n}\\n' ;;
  *setConfigs*) echo "$*" >> ${join(root, 'sets')}; echo '{"returnValue": true}' ;;
  *getForegroundAppInfo*) [ "$u" -ge 42 ] && printf '{\\n "appId": "com.webos.app.home",\\n "returnValue": true\\n}\\n' ;;
esac
true`);
writeFileSync(join(root, 'rec.sh'), script);
execSync(`PATH=${bin}:$PATH sh ${join(root, 'rec.sh')} loop`, {shell: '/bin/sh', stdio: 'pipe', timeout: 60000});
const tl = h.summariseTimeline(readFileSync(join(root, 'dir', 'timeline.txt'), 'utf8'));
eq(tl.startUp, 30, 'recorder: start uptime');
eq(tl.sam !== null && tl.sam >= 34 && tl.sam < 40, true, 'recorder: sam seen once it answers');
eq(tl.cfg !== null && tl.cfg >= 38, true, 'recorder: configd seen once it answers');
eq(tl.nudge !== null && tl.nudge >= 38, true, 'recorder: the nudge was accepted');
eq(readFileSync(join(root, 'sets'), 'utf8').trim().split('\n').length, 2, 'recorder: exactly two setConfigs (add, restore)');
eq(/"profile.blockedAppList":\["a.b"\]/.test(readFileSync(join(root, 'sets'), 'utf8').trim().split('\n')[1].replace(/ /g, '')), true, 'recorder: the list is put back as it was');
eq(tl.home !== null && tl.home >= 42, true, 'recorder: LG Home seen in front');
eq(tl.end !== null, true, 'recorder: ends after 100 s');
rmSync(root, {recursive: true, force: true});
console.log(fail ? 'FAILED' : 'probesam: all passed');
process.exit(fail ? 1 : 0);
