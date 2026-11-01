// The screen saver's command builders, plus a replay of the real install steps on a fake TV folder.   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-screensavercmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/screensavercmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
const out2 = new URL('../node_modules/.cache-saverconfig-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/saverconfig.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out2, platform: 'node', logLevel: 'error'});
const sc = await import(out2);
const here = (p) => new URL(p, import.meta.url).pathname;
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

eq(['applied\n[exit 0]', 'x\nunsupported', 'no-photos', 'garbage', ''].map(h.parseSaverResult).join(','), 'applied,unsupported,no-photos,failed,failed', 'the result word is found in the output');
eq(h.parseShown('shown\n[exit 0]') && !h.parseShown('failed'), true, 'show: shown or not');
const s = {source: '/media/internal/Pictures', interval: 20, shuffle: true, dim: false, care: 1, powerOff: 0};
eq(h.settingsText(s), 'source=/media/internal/Pictures\ninterval=20\nshuffle=1\ndim=0\ncare=1\nfill=0\npoweroff=0\nrecursive=0\ndimlevel=40\n', 'the settings file text');
eq(h.settingsText({...s, source: '/media/internal/Bilder/ä.jpg'}).split('\n')[0], 'source=', 'a path with non-ASCII letters is left out (bundled photos are used)');
eq(h.settingsText({...s, source: "/a/b'c"}).split('\n')[0], 'source=', 'a path with a quote is left out');
eq(h.settingsText({...s, interval: 1}).split('\n')[1], 'interval=5', 'the interval is at least 5 s');
eq(h.settingsText({...s, interval: 99999}).split('\n')[1], 'interval=3600', 'and at most 1 hour');
eq(h.settingsText({...s, dim: true, shuffle: false}).split('\n').slice(2, 4).join(','), 'shuffle=0,dim=1', 'shuffle off and dim on are written');
eq(h.settingsText({...s, care: 0}).split('\n')[4] + h.settingsText({...s, care: 5}).split('\n')[4], 'care=0care=1', 'care off is written, anything else is on');
eq(h.settingsText({...s, powerOff: 60}).split('\n')[6] + h.settingsText({...s, powerOff: -5}).split('\n')[6], 'poweroff=60poweroff=0', 'power off seconds are written, never negative');
eq(h.settingsText({...s, fill: 1}).split('\n')[5], 'fill=1', 'fill is written');
eq(sc.SAVER_POWEROFF_VALUES.indexOf(60) !== -1 && sc.SAVER_POWEROFF_VALUES.indexOf(30) === -1 && sc.powerOffText(60) === '1 minute', true, 'the 1 minute choice exists, the 30 s test choice is gone');
eq(sc.careNumber(true) + ',' + sc.careNumber(false), '1,0', 'care becomes a number');
eq(sc.SAVER_INTERVAL_VALUES.indexOf(20) !== -1, true, '20 seconds is a choice for the saver');
const cfg = (saver, wp) => ({screensaverSource: saver, wallpaper: {mode: wp.mode, path: wp.path || ''}});
eq(sc.saverIsSlideshow(cfg('@photos', {mode: 'image', path: '/media/y/a.jpg'})), true, 'the built-in photos are a slideshow');
eq(sc.saverIsSlideshow(cfg('@video', {mode: 'folder', path: '/media/y'})), false, 'the built-in video is not');
eq(sc.saverIsSlideshow(cfg('', {mode: 'gradient'})), true, 'no choice and no wallpaper picture: the bundled photos are a slideshow');
eq(sc.saverIsSlideshow(cfg('/media/x/Pics', {mode: 'gradient'})), true, 'a folder is a slideshow');
eq(sc.saverIsSlideshow(cfg('/media/x/a.mp4', {mode: 'folder', path: '/media/y'})), false, 'one video is not');
eq(sc.saverIsSlideshow(cfg('', {mode: 'image', path: '/media/y/a.jpg'})), false, 'following a single wallpaper picture is not');
eq(sc.saverSource(cfg('', {mode: 'folder', path: '/media/y'})), '/media/y', 'the saver follows the wallpaper folder');
for (const r of ['applied', 'launcher-missing', 'files-missing', 'unsupported', 'no-target', 'no-photos', 'no-video', 'not-taken', 'off', 'failed']) eq(h.saverMessage(r, 'x').length > 10, true, `a message for ${r}`);

// replay the install on a fake folder: the steps write the real script and QML, and the last one mounts
const sh = readFileSync(here('../src/screensaver/screensaver.sh'), 'utf8');
const qml = readFileSync(here('../src/screensaver/main.qml'), 'utf8');
eq(/^[\x00-\x7f]*$/.test(sh) && /^[\x00-\x7f]*$/.test(qml), true, 'the script and the QML are ASCII only');
const T = mkdtempSync(join(tmpdir(), 'saver-'));
const dir = join(T, 'dir'), app = join(T, 'app'), launcher = join(T, 'launcher');
mkdirSync(join(app, 'qml'), {recursive: true}); mkdirSync(join(launcher, 'wallpapers'), {recursive: true});
writeFileSync(join(app, 'appinfo.json'), '{"type":"qml","main":"qml/main.qml"}'); writeFileSync(join(app, 'qml/main.qml'), 'stock');
writeFileSync(join(launcher, 'appinfo.json'), '{}'); writeFileSync(join(launcher, 'wallpapers/photo-01.jpg'), '');
writeFileSync(join(T, 'mounts'), '');
writeFileSync(join(T, 'mount'), '#!/bin/sh\necho "x $3 y z" >> "$MOUNTS"\n', {mode: 0o755});
const env = {...process.env, DIR: dir, APP: app, LAUNCHER: launcher, LINK: join(T, 'link'), LOG: join(T, 'log'), MOUNTS: join(T, 'mounts'), MOUNT_CMD: join(T, 'mount'), NAP: 'true'};
const steps = h.installSteps({screensaverSh: sh, qml}, {...s, source: ''});
let last = '';
for (const step of steps) {
	const command = step.command.split(h.SAVER_DIR).join(dir).split(h.SAVER_LINK).join(join(T, 'link'));
	last = execSync(command, {env, encoding: 'utf8'});
}
eq(h.parseSaverResult(last), 'applied', 'the install steps end with the screen saver mounted');
eq(readFileSync(join(dir, 'version'), 'utf8').trim(), h.SAVER_VERSION, 'the version is written');
eq(existsSync(join(dir, 'screensaver.sh')) && existsSync(join(dir, 'main.qml')), true, 'the script and the finished QML are in place');
eq(readFileSync(join(dir, 'settings'), 'utf8').indexOf('shuffle=1') !== -1, true, 'the settings were written');
const applied = h.applyCommand({...s, source: '', interval: 45}).split(h.SAVER_DIR).join(dir);
eq(h.parseSaverResult(execSync(applied, {env, encoding: 'utf8'})), 'applied', 'new settings are applied in one call');
eq(readFileSync(join(dir, 'main.qml'), 'utf8').indexOf('intervalSec: 45') !== -1, true, 'and show up in the QML');
rmSync(T, {recursive: true, force: true});
if (fail) { console.log(`${fail} FAILED`); process.exit(1); }
console.log('screen saver commands: all ok');
