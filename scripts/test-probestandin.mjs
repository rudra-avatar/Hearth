// V probe (src/lib/probestandincmd.ts tests 49-52, src/lib/probenorootcmd.ts tests 53-55): manifest for the Home stand-in, launch request,
// log summary, evdev text, and that the shell scripts are valid shell.   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const load = async (src, name) => { const out = dir + name; await build({entryPoints: [new URL(src, import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'}); return import(out); };
const c = await load('../src/lib/probestandincmd.ts', '.cache-probestandin-test.mjs');
const n = await load('../src/lib/probenorootcmd.ts', '.cache-probenoroot-test.mjs');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// manifest
const native = JSON.stringify({id: 'com.webos.app.home', type: 'native', main: 'home', splashBackground: 'x.png', noSplashOnLaunch: true, windowGroup: {}, qtModules: [], title: 'Home'});
const o = c.overlayAppinfo(native);
eq([o.id, o.type, o.main, o.bgColor, o.transparent], ['com.webos.app.home', 'web', 'index.html', '#000000', false], 'overlay manifest keeps the Home id and becomes a web page');
eq(['splashBackground', 'noSplashOnLaunch', 'windowGroup', 'qtModules'].filter((k) => k in o), [], 'native-only keys are dropped');
eq(c.overlayAppinfo('not json'), null, 'broken manifest gives null');
eq(c.overlayAppinfo(JSON.stringify({id: 'other.app'})), null, 'another app\'s manifest is refused');
eq(c.overlayAppinfo('[1]'), null, 'an array is refused');
const req = JSON.parse(c.launchRequest(o, false)), reqS = JSON.parse(c.launchRequest(o, true));
eq([req.appDesc.folderPath, req.appDesc.id, req.instanceId], ['/media/developer/launcher-standin/overlay', 'com.webos.app.home', 'hearth-standin'], 'launch request names the staged folder');
eq(typeof reqS.appDesc === 'string' && JSON.parse(reqS.appDesc).folderPath, '/media/developer/launcher-standin/overlay', 'the string form holds the same description');

// facts verdict
eq(c.factsVerdict('home: appinfo=yes type=native main=home\nprogram: /usr/x file=yes start=ELF mounted=0').ok, true, 'native Home with a program: stand-in possible');
eq(c.factsVerdict('home: appinfo=yes type=web main=index.html\nprogram: /usr/x file=no').ok, false, 'web Home: not suited');
eq(c.factsVerdict('home: appinfo=no type= main=\n').ok, false, 'no Home manifest (webOS 3)');

// log summary
const log = ['100.10 standin[7]: started as uid 0, arguments: {}, front: com.webos.app.home', '100.40 standin[7]: launcher shown (start, form 1) in 300 ms',
	'100.50 standin[7]: registered with SAM (registerApp)', '120.00 standin[7]: event relaunch {"event":"relaunch"} | front before: tld.my.customlauncher',
	'120.20 standin[7]: launcher shown (relaunch, form 1) in 180 ms', '120.30 standin[7]: front 2 s later: com.webos.app.home',
	'130.00 standin[7]: preloaded by SAM, not opened (start)', '140.00 standin[7]: webapp-mgr refused (1): {"returnValue": false}'].join('\n');
const s = c.summariseLog(log);
eq([s.started, s.relaunches, s.shown, s.refused, s.preload, s.registered, s.uid], [1, 1, 2, 1, 1, ['registerApp'], '0'], 'log summary counts');
eq(s.times, [300, 180], 'launcher times are read');
eq(/relaunch\) 1/.test(c.logText(s)) && /median/.test(c.logText(s)), true, 'log text shows the Home events and a median');
eq(c.summariseLog('').shown, 0, 'empty log');

// no-root text
const r = n.parseEvdev({uid: 1000, arch: 'arm', node: 'v0.12', devices: [{dev: 'event0', name: 'LGE RCU', readable: true}, {dev: 'event1', name: 'x', readable: false, error: 'EACCES'}]});
eq([n.readableCount(r), /uid 1000/.test(n.devicesText(r)), /EACCES/.test(n.devicesText(r))], [1, true, true], 'devices text');
const w = n.parseEvdev({uid: 0, arch: 'arm', node: 'v8', devices: [], watched: ['event0 LGE RCU'], events: {'773': {down: 1, up: 1, rep: 0, firstMs: 3200}}, launch: {code: 773, ok: true, ms: 40}});
eq([n.sawHome(w), n.sawKeys(w), /773\(Home\)/.test(n.eventsText(w)), /40 ms/.test(n.eventsText(w))], [true, true, true, true], 'events text names the Home code and the launch time');
eq(n.sawKeys(n.parseEvdev({devices: []})), false, 'no events: no keys');
eq(/NO Home key seen/.test(n.eventsText(n.parseEvdev({devices: []}))), true, 'text says no Home key');

// shell scripts are valid
const tmp = mkdtempSync(join(tmpdir(), 'standin-'));
for (const [name, text] of [['standin.sh', c.STANDIN_SH], ['undo.sh', c.UNDO_SH], ['facts.sh', c.FACTS_COMMAND], ['pre.sh', c.PRE_COMMAND], ['mount.sh', c.MOUNT_COMMAND], ['stage.sh', c.STAGE_COMMAND], ['read.sh', c.READ_COMMAND]]) {
	const f = join(tmp, name); writeFileSync(f, text);
	let ok = true; try { execFileSync('sh', ['-n', f]); } catch (e) { ok = false; }
	eq(ok, true, name + ' is valid shell');
}
eq(/--bind \S+standin\.sh/.test(c.MOUNT_COMMAND) && !/ln -s/.test(c.MOUNT_COMMAND + c.STANDIN_SH), true, 'the trial mounts only and writes no start-up link');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
