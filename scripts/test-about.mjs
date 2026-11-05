// The version line, the saved-order helper and the tile switches (Phase 1).
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url)) + '/';
const src = path.resolve(dir, '../src') + '/';
const out = dir + '.cache-about-test.mjs';
await build({stdin: {contents: `export * from './lib/about'; export * from './lib/apporder'; export * from './config/version'; export * from './lib/sourceicons'; export {parseStats} from './lib/system'; export {appTile} from './lib/tiles'; export * from './lib/log'; export * from './lib/debuginfo'; export {DEFAULT_CONFIG, loadConfig} from './lib/storage';`, resolveDir: src, loader: 'ts'},
	bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}});
const a = await import(out);
let fail = 0;
const eq = (got, want, name) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`)); if (!ok) fail++; };

const pkg = JSON.parse(readFileSync(dir + '../package.json', 'utf8')).version;
const info = JSON.parse(readFileSync(dir + '../public/appinfo.json', 'utf8')).version;
eq([a.HEARTH_VERSION, a.HEARTH_VERSION], [pkg, info], 'the version in the app matches package.json and appinfo.json');

eq(a.aboutText({webos: '11.2.0', firmware: '43.21.79', homebrew: '0.7.3'}, 'yes', null, '9.9.9'), 'Hearth 9.9.9  ·  webOS 11.2.0  ·  firmware 43.21.79  ·  Homebrew 0.7.3  ·  Root: yes', 'full line when rooted');
eq(a.aboutText({webos: '11.2.0', firmware: '43.21.79'}, 'no', 'denied', '9.9.9'), 'Hearth 9.9.9  ·  webOS 11.2.0  ·  firmware 43.21.79  ·  Root: not available (the TV refused the command)', 'root refused: says so, no Homebrew version');
eq(a.aboutText({}, 'no', 'no-service', '1'), 'Hearth 1  ·  Root: not available (Homebrew Channel service not found)', 'no service: says so');
eq(a.aboutText({}, 'unknown', null, '1'), 'Hearth 1  ·  Root: checking…', 'before the check ends');

const apps = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
eq(a.extendOrder(apps, ['b']), ['b', 'a', 'c'], 'apps not in the saved order go after it, in list order');
const same = ['a', 'b', 'c'];
eq(a.extendOrder(apps, same) === same, true, 'nothing new: the same array comes back (nothing to save)');
eq(a.extendOrder(apps, null), ['a', 'b', 'c'], 'no saved order yet: the list order is saved');
eq(a.extendOrder([], ['x']), ['x'], 'an empty list changes nothing');
eq(a.extendOrder(apps, ['c', 'x']), ['c', 'x', 'a', 'b'], 'uninstalled apps stay in the order');
// a new app lands after the last visible one
eq(a.visibleApps([{id: 'a'}, {id: 'n'}, {id: 'b'}], a.extendOrder([{id: 'a'}, {id: 'b'}], null), []).map((x) => x.id), ['a', 'b', 'n'], 'a newly installed app appears after the last app');
eq(a.visibleApps([{id: 'a'}, {id: 'n'}, {id: 'b'}], ['a', 'b', 'n'], ['b']).map((x) => x.id), ['a', 'n'], 'hidden apps stay hidden, the new one follows');

eq([a.DEFAULT_CONFIG.showLgHome, a.DEFAULT_CONFIG.showSystem], [false, false], 'LG Home and System Settings tiles are hidden by default (P41c)');
eq([a.autoIcon('gameconsole.png'), a.autoIcon('HDMI_1.png'), a.autoIcon('pc.png'), a.autoIcon('unknown.png')], ['console', 'hdmi', 'desktop', 'hdmi'], "the TV's icon names map to our icons");
const e1 = a.setEdit({}, 'h1', {label: '  PS5  ', icon: 'console'});
eq(e1, {h1: {label: 'PS5', icon: 'console'}}, 'an edit is saved trimmed');
eq(a.setEdit(e1, 'h1', {label: '', icon: ''}), {}, 'clearing name and icon removes the edit');
eq(a.setEdit(e1, 'h1', {icon: 'nonsense'}), {h1: {label: 'PS5'}}, 'an unknown icon is dropped');
eq(a.cleanEdits({x: {label: 'A'.repeat(60)}}).x.label.length, 24, 'long names are cut');
const png = 'data:image/png;base64,iVBORw0KGgo=';
eq(a.cleanEdits({x: {iconData: png}}), {x: {iconData: png}}, 'a small picture is kept');
eq(a.cleanEdits({x: {iconData: 'javascript:alert(1)'}, y: {iconData: 'data:text/html;base64,AAAA'}}), {}, 'anything but a png or jpeg data URI is dropped');
eq(a.cleanEdits({x: {iconData: png, icon: 'tv'}}).x, {icon: 'tv', iconData: png}, 'a picture and an icon can be saved together (the picture wins)');
a.clearLog();
for (let i = 0; i < 60; i++) a.log('event ' + i + '\nwith newline', new Date(2026, 0, 1, 9, 5, 7));
eq([a.logLines().length, a.logLines()[0].slice(0, 17), a.logLines()[39].indexOf('\n')], [40, '09:05:07 event 20', -1], 'the log keeps the last 40 events, one line each');
a.log('x'.repeat(300)); eq(a.logLines().pop().length <= 110, true, 'long events are cut');
const pages = a.debugPages({about: 'Hearth 1', rootDetail: '', appList: {source: 'catalog', count: 7, ago: 'just now'}, weather: 'off', config: a.DEFAULT_CONFIG, events: a.logLines(), userAgent: 'Chrome/132.0.1'});
eq(pages.length, 2, 'two debug pages');
eq(pages[0].lines.length <= 20 && pages[0].lines.every((l) => l.length <= 118), true, 'page 1 fits one screen (20 lines of 118 characters)');
eq(pages[1].lines.every((l) => l.length <= 76) && pages[1].right.lines.length <= a.DENSE_ROWS && pages[1].right.lines.every((l) => l.length <= 60), true, 'page 2: this TV on the left, events on the right, within the column widths');
eq([pages[0].lines[0].slice(-8), pages[0].lines.some((l) => l.indexOf('Rooted TV, over SSH: open this tab once, then on a computer run') === 0), pages[0].lines.some((l) => l.indexOf('ssh root@<TV address> cat /tmp/hearth-debug.txt') > 0)], [' these).', true, true], 'page 1 instructions are not cut (the index was once used as the clip width)');
const longPages = a.debugPages({about: 'x', rootDetail: '', appList: null, weather: 'off', config: a.DEFAULT_CONFIG, events: ['12:00:00 ' + 'abcdefghij'.repeat(8)], userAgent: ''});
eq([longPages[1].right.lines.length, longPages[1].right.lines[1].slice(0, 2), longPages[1].right.lines[0] + longPages[1].right.lines[1].slice(2) === '12:00:00 ' + 'abcdefghij'.repeat(8)], [2, '  ', true], 'a long event (up to 98 characters since P94b) continues on a second row, nothing is cut');
eq(a.reportText(pages).indexOf('Latest events\n') > 0, true, 'the report file holds the events column');
eq(a.reportText(pages).indexOf('Debug 2 of 2') > 0 && a.reportText(pages).indexOf('built-in list') > 0, true, 'the report file has the pages as text');
eq(a.reportText(pages, [], [], ['t1', 't2']).indexOf('Boot trace of the webOS 3 guard (oldest first)\nt1\nt2\n') > 0, true, 'S3c: the report file ends with the boot trace when there is one');
eq(a.reportText(pages).indexOf('Boot trace') < 0, true, 'S3c: no boot trace section without a trace');
const st = a.parseStats('---\nFilesystem 1K-blocks Used Available Use% Mounted on\n/dev/root 2097152 1048576 1048576 50% /\n/dev/root 2097152 1048576 1048576 50% /var\n/dev/sda1 8388608 4194304 4194304 50% /media/internal\n');
eq([st.disks.length, st.disks[1].mount, st.disks[1].freeMB], [2, '/media/internal', 4096], 'storage figures are read, the same disk once');
eq(a.parseStats('garbage'), {disks: []}, 'unreadable output gives no figures');
const p2 = a.debugPages({about: 'Hearth 1', rootDetail: '', appList: null, weather: 'off', config: a.DEFAULT_CONFIG, events: [], userAgent: '', stats: st});
eq(p2[0].title.indexOf('share the logs') > 0 && p2[1].lines.some((l) => l.indexOf('Storage /media/internal:') === 0) && !p2[1].lines.some((l) => l.indexOf('Hearth 1') === 0), true, 'instructions first, figures on the TV page, no repeat of the watermark line');
const app = {id: 'x.app', title: 'Real', iconUrl: 'icons/x.png', color: '#123456'};
eq(a.appTile(app), {key: 'x.app', label: 'Real', imageUrl: 'icons/x.png', color: '#123456'}, 'an app without edits is drawn as before');
eq(a.appTile(app, {'x.app': {label: 'Mine'}}).label + a.appTile(app, {'x.app': {label: 'Mine'}}).imageUrl, 'Mineicons/x.png', 'a new name keeps the app artwork');
const t2 = a.appTile(app, {'x.app': {icon: 'tv'}});
eq([t2.imageUrl, t2.sourceIcon], [undefined, 'tv'], 'a drawn icon replaces the artwork');
const t3 = a.appTile(app, {'x.app': {icon: 'tv', iconData: 'data:image/png;base64,AAAA'}});
eq([t3.imageUrl, t3.sourceIcon], ['data:image/png;base64,AAAA', undefined], 'the user picture wins over a drawn icon');
console.log(fail ? `\n${fail} FAILED` : '\nall ok');
process.exit(fail ? 1 : 0);
