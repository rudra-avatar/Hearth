// "LG preloaded apps" (P38b): the pure helpers and the script replayed on a fake TV folder.   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {existsSync, mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, chmodSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-preload-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/preloadcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const p = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

// LG's list as the TV has it, and what the read command prints
const list = [
	{id: 'youtube.leanback.v4', isEnabled: true, requiredMemory: 180, preloadMode: 'full'},
	{id: 'netflix', isEnabled: true, requiredMemory: 150},
	{id: 'airplay', isEnabled: true, requiredMemory: 40},
	{id: 'com.webos.app.home', isEnabled: true, requiredMemory: 90},
	{id: 'amazon', isEnabled: false, requiredMemory: 120},
	{id: 'ghost.app', isEnabled: true, requiredMemory: 10}
];
const call = (l) => JSON.stringify({configs: {[p.PRELOAD_KEY]: l}});
const output = (offText, lgList, nowList, running) => `${offText}\n@@lg\n${lgList ? call(lgList) : ''}\n@@list\n${JSON.stringify({configs: {[p.PRELOAD_KEY]: nowList}, returnValue: true})}\n@@running\n${JSON.stringify({running: running.map((id) => ({id})), returnValue: true})}\n[exit 0]\n`;
const titles = {'youtube.leanback.v4': 'YouTube', netflix: 'Netflix', amazon: 'Prime Video', 'com.webos.app.home': 'Home', airplay: 'AirPlay'};

const r0 = p.parseRead(output('', null, list, ['netflix']));
eq([r0.state.off, r0.state.lg, r0.list.length, r0.running], [[], null, 6, ['netflix']], 'a fresh read: nothing off, no saved LG list, six entries, one running');
eq(p.offeredApps(r0, titles).map((a) => [a.id, a.memoryMb, a.off, a.loaded]), [['netflix', 150, false, true], ['youtube.leanback.v4', 180, false, false]], 'offered: installed, preloaded by LG, not essential (Home, AirPlay), sorted by name; Prime Video (LG does not preload) and the app with no title are left out');
eq(p.parseRead('nonsense').list, null, 'garbage reads as no list');
eq(p.parseRead('\n@@lg\n\n@@list\n{"returnValue": false}\n@@running\n{}\n').list, null, 'a TV with no such list reads as unsupported');

// switching one off: the first change keeps LG's list
const plan = p.planChange(r0, 'netflix', true);
eq([plan.ids, plan.enabled, plan.state.off, plan.lg !== null], [['netflix'], false, ['netflix'], true], 'switch off: the first change also saves LG\'s list');
const want = JSON.parse(plan.want).configs[p.PRELOAD_KEY];
eq(want.map((e) => e.isEnabled), [true, false, true, true, false, true], 'the written list has only Netflix changed (Prime Video was off already)');
eq(want[0].preloadMode, 'full', 'other fields of an entry pass through unchanged');
eq(p.planChange(r0, 'com.webos.app.home', true), null, 'an essential app is refused');
eq(p.planChange(r0, 'nothere', true), null, 'an app that is not in the TV list is refused');
eq(p.planChange(r0, 'bad id;rm', true), null, 'an id with odd characters is refused');

// with it off: read again, switch another off, then give one back
const nowList = JSON.parse(plan.want).configs[p.PRELOAD_KEY];
const r1 = p.parseRead(output('netflix\n', list, nowList, []));
eq(p.offeredApps(r1, titles).map((a) => [a.id, a.off]), [['netflix', true], ['youtube.leanback.v4', false]], 'a switched-off app is still offered (to give back)');
const plan2 = p.planChange(r1, 'youtube.leanback.v4', true);
eq([plan2.state.off, plan2.lg], [['netflix', 'youtube.leanback.v4'], null], 'second change: both off, LG\'s list is not saved again');
const plan3 = p.planChange(r1, 'netflix', false);
eq([plan3.state.off, plan3.enabled, JSON.parse(plan3.want).configs[p.PRELOAD_KEY][1].isEnabled], [[], true, true], 'give back: the list has it enabled again and the off list is empty');
const reset = p.planReset(p.parseRead(output('netflix\nyoutube.leanback.v4\n', list, JSON.parse(plan2.want).configs[p.PRELOAD_KEY], [])));
eq([reset.ids, reset.enabled, reset.state.off, JSON.parse(reset.want).configs[p.PRELOAD_KEY].map((e) => e.isEnabled)], [['netflix', 'youtube.leanback.v4'], true, [], [true, true, true, true, false, true]], 'reset: every switched-off app gets LG\'s own setting back (Prime Video stays off as LG has it)');
eq(p.planReset(r0), null, 'nothing to reset when nothing is off');
const odd = p.planChange(p.parseRead(output('', null, [{id: 'netflix', isEnabled: true, name: '\u00e9\u4e2d'}], [])), 'netflix', true);
eq(/^[\x00-\x7f]*$/.test(odd.want), true, 'the written JSON is ASCII only');

// the steps
const steps = p.changeSteps(plan);
eq([steps[0].name, steps[steps.length - 1].command.indexOf('set 0 netflix') > 0], ['clear out older files', true], 'the steps end with the script\'s set call');
eq(steps.some((s) => /lg\.json\.new/.test(s.command)), true, 'the first change writes LG\'s list');
eq(p.changeSteps(plan2).some((s) => /lg\.json\.new/.test(s.command)), false, 'a later change does not');
eq([p.parseSetResult('x\nresult=ok\n'), p.parseSetResult('result=failed'), p.parseSetResult('')], ['ok', 'failed', 'failed'], 'result words');

// the script on a fake TV
const root = mkdtempSync(join(tmpdir(), 'pl-'));
const dir = join(root, 'dir'), link = join(root, 'init', '50-launcher-preload'), app = join(root, 'app');
mkdirSync(dir); mkdirSync(app);
writeFileSync(join(app, 'appinfo.json'), '{}');
const script = new URL('../src/preload/preload.sh', import.meta.url).pathname;
execSync(`cp '${script}' '${dir}/preload.sh'`);
const calls = join(root, 'calls');
writeFileSync(join(root, 'luna'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nif [ -f '${root}/refuse' ]; then echo '{"returnValue": false}'; else echo '{"returnValue": true}'; fi\n`);
chmodSync(join(root, 'luna'), 0o755);
const env = `DIR='${dir}' LINK='${link}' LAUNCHER='${app}' LOG='${root}/log' LUNA_SEND='${root}/luna' NAP=true`;
const sh = (args) => execSync(`${env} sh '${dir}/preload.sh' ${args}`, {shell: '/bin/sh'}).toString();
const stage = (pl) => {
	writeFileSync(join(dir, 'want.json.new'), pl.want);
	writeFileSync(join(dir, 'off.txt.new'), pl.state.off.length ? pl.state.off.join('\n') + '\n' : '');
	if (pl.lg) writeFileSync(join(dir, 'lg.json.new'), pl.lg);
};
const callLog = () => (existsSync(calls) ? readFileSync(calls, 'utf8') : '');

stage(plan);
eq(/result=ok/.test(sh('set 0 netflix')), true, 'set: ok when the TV takes the list');
eq([existsSync(join(dir, 'want.json')), readFileSync(join(dir, 'off.txt'), 'utf8'), existsSync(join(dir, 'lg.json')), existsSync(join(dir, 'want.json.new')), existsSync(link)], [true, 'netflix\n', true, false, true], 'the files are in place and the start-up link exists');
eq(/setConfigs/.test(callLog()) && /setPreloadPolicy \{"application":\{"id":"netflix","isEnabled":false\}\}/.test(callLog()), true, 'the list was sent and the manager told now');
eq(/result=ok/.test(sh('apply')) && /isEnabled":false/.test(callLog().split('setConfigs')[1]), true, 'apply tells the manager again');
eq(sh('status').trim().split('\n'), ['switched-off', 'linked'], 'status');

// a refused list changes nothing
writeFileSync(join(root, 'refuse'), '');
stage(p.planChange(r1, 'youtube.leanback.v4', true));
eq(/result=failed/.test(sh('set 0 youtube.leanback.v4')), true, 'set: failed when the TV refuses');
eq([readFileSync(join(dir, 'off.txt'), 'utf8'), existsSync(join(dir, 'off.txt.new'))], ['netflix\n', false], 'and nothing was changed (the old off list stays, the .new files are gone)');
rmSync(join(root, 'refuse'));
eq(/result=badid/.test(sh("set 0 'bad;id'")), true, 'an odd id is refused by the script too');

// everything back: the link goes
stage(p.planChange(r1, 'netflix', false));
eq(/result=ok/.test(sh('set 1 netflix')), true, 'give back: ok');
eq([readFileSync(join(dir, 'off.txt'), 'utf8'), existsSync(link)], ['', false], 'the off list is empty and the link is removed');

// boot with Hearth gone: LG's list back, files deleted
stage(plan);
sh('set 0 netflix');
rmSync(join(app, 'appinfo.json'));
execSync(`${env} DRY_RUN=1 sh '${dir}/preload.sh' boot`, {shell: '/bin/sh'});
eq([existsSync(dir), existsSync(link)], [false, false], 'boot with Hearth uninstalled: LG\'s list is sent back and our files and link are deleted');
eq(callLog().split('\n').filter((l) => /setConfigs/.test(l)).length >= 3, true, 'LG\'s list was sent again');
rmSync(root, {recursive: true, force: true});
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
