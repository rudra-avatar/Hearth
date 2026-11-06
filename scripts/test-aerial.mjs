// Tests for Apple TV Aerials (src/lib/aerial.ts): the list, the status lines and the command safety.   Run: npm test
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const dir = new URL('../node_modules/', import.meta.url).pathname;
await build({define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, entryPoints: [new URL('../src/lib/aerial.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: dir + '.cache-aerial-test.mjs', platform: 'node', logLevel: 'error'});
const a = await import(dir + '.cache-aerial-test.mjs');
let fail = 0;
const eq = (x, y, m) => { const ok = JSON.stringify(x) === JSON.stringify(y); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(x), '!=', JSON.stringify(y)); } else console.log('ok  ', m); };

const U = (p) => 'https://sylvan.apple.com/itunes-assets/Aerials116/v4/aa/bb/' + p + '.mov';
const list = JSON.stringify({
	categories: [{id: 'C1', localizedNameKey: 'AerialCategoryLandscapes'}, {id: 'C2', localizedNameKey: 'AerialCategorySpace'}, {id: 'C3', localizedNameKey: 'AerialCategoryCities'}],
	assets: [
		{accessibilityLabel: 'Korea and Japan Night', categories: ['C2'], preferredOrder: 2, 'url-4K-SDR': U('k4'), 'url-1080-H264': U('k1')},
		{accessibilityLabel: 'Antarctica', categories: ['C2'], preferredOrder: 1, 'url-4K-SDR': U('a4'), 'url-1080-H264': U('a1')},
		{accessibilityLabel: 'Hawaii', categories: ['C1'], preferredOrder: 5, 'url-4K-SDR': U('h4'), 'url-1080-H264': U('h1')},
		{accessibilityLabel: 'Hawaii', categories: ['C1'], preferredOrder: 6, 'url-4K-SDR': U('h4b'), 'url-1080-H264': U('h1b')},
		{accessibilityLabel: 'New York', categories: ['C3'], 'url-4K-SDR': U('n4'), 'url-1080-H264': U('n1')},
		{accessibilityLabel: 'No 1080p copy', categories: ['C1'], 'url-4K-SDR': U('x4')},
		{accessibilityLabel: 'Elsewhere', categories: ['C1'], 'url-4K-SDR': 'https://evil.example/a.mov', 'url-1080-H264': U('e1')},
		{accessibilityLabel: 'Quote\'s', categories: ['C1'], 'url-4K-SDR': U("q4';reboot;'"), 'url-1080-H264': U('q1')}
	]
});
const v = a.parseCatalog(list);
eq(v.map((x) => x.name), ['hawaii', 'hawaii-2', 'new-york', 'antarctica', 'korea-and-japan-night'], 'sorted by group (landscapes, cities, space), then Apple\'s order; a clashing name gets -2');
eq(v.map((x) => x.category), ['landscapes', 'landscapes', 'cities', 'space', 'space'], 'groups from Apple\'s category keys');
eq(v.length, 5, 'videos without a 1080p H.264 copy, off Apple\'s server or with unsafe characters are left out');
eq(a.parseCatalog('not json'), [], 'a broken list reads as empty');
const withPic = a.parseCatalog(JSON.stringify({categories: [], assets: [
	{accessibilityLabel: 'P', 'url-4K-SDR': U('p4'), 'url-1080-H264': U('p1'), previewImage: 'https://sylvan.apple.com/itunes-assets/Aerials221/v4/86/GMT110_900x580.png'},
	{accessibilityLabel: 'Q', 'url-4K-SDR': U('q4b'), 'url-1080-H264': U('q1b'), previewImage: 'https://evil.example/x.png'},
	{accessibilityLabel: 'R', 'url-4K-SDR': U('r4'), 'url-1080-H264': U('r1'), previewImage: "https://sylvan.apple.com/a';b.png"}
]}));
eq(withPic.map((x) => x.preview), ['https://sylvan.apple.com/itunes-assets/Aerials221/v4/86/GMT110_900x580.png', '', ''], 'preview: Apple\'s picture kept; one off Apple\'s server or with a quote dropped');
eq(a.previewCommand(withPic[0].preview), `sh '${a.AERIAL_SCRIPT}' preview '${withPic[0].preview}'`, 'preview command');
let pthrew = false; try { a.previewCommand(U('a4')); } catch { pthrew = true; }
eq(pthrew, true, 'preview refuses anything but a picture');
eq(a.parsePreviewFile('file /tmp/hearth-aerial-preview/557e652dfe0c8d38.png\n'), '/tmp/hearth-aerial-preview/557e652dfe0c8d38.png', 'preview: the saved file is read from the answer');
eq([a.parsePreviewFile('result=failed could not fetch the preview'), a.parsePreviewFile('file /etc/passwd'), a.parsePreviewFile("file /tmp/hearth-aerial-preview/x';y.png")], [null, null, null], 'preview: a failure or any other path is not read');
const sz = a.parseSizes('@@sizes running\n' + U('a4') + ' 141913944\n' + U('a1') + ' 105827826\nhttps://evil.example/x.mov 5\ngarbage\n');
eq(sz, {running: true, bytes: {[U('a4')]: 141913944, [U('a1')]: 105827826}}, 'sizes: Apple addresses with their bytes, anything else ignored');
eq(a.parseSizes('@@sizes done\n').running, false, 'sizes: done');
const st = a.parseStatus('place internal /media/developer/screensavers/aerial\nfile hawaii 244175914 internal\nplace usb:/tmp/usb/sda/sda1 /tmp/usb/sda/sda1/hearth-aerials\nfile patagonia 752473479 usb:/tmp/usb/sda/sda1\ntarget usb:/tmp/usb/sda/sda1 ok /tmp/usb/sda/sda1/hearth-aerials\nnet off 192.168.1.71 My+Videos guest\nfree 1000\n');
eq(st.where, {hawaii: 'internal', patagonia: 'usb:/tmp/usb/sda/sda1'}, 'places: where each video is');
eq(st.places.map((p) => p.place), ['internal', 'usb:/tmp/usb/sda/sda1'], 'places: every place that is there now');
eq(st.target, {place: 'usb:/tmp/usb/sda/sda1', ok: true, dir: '/tmp/usb/sda/sda1/hearth-aerials'}, 'target: the place and its folder');
eq(st.net, {on: false, host: '192.168.1.71', share: 'My Videos', guest: true}, 'network folder: host, share (spaces back), guest');
eq(a.parseStatus('target net missing -\nnet none\n').target.ok, false, 'a place that is not there');
eq(a.parseStatus('net none\n').net, null, 'no network folder');
eq([a.placeKind('internal'), a.placeKind('usb:/tmp/usb/sda/sda1'), a.placeKind('net')], ['internal', 'usb', 'net'], 'place kinds');
eq([a.cleanShare('Video'), a.cleanShare('/Video/'), a.cleanShare('\\\\NAS\\Video'), a.cleanShare('//nas/Video/Aerials'), a.cleanShare(' My Videos ')], ['Video', 'Video', 'Video', 'Video/Aerials', 'My Videos'], 'shared folder: a full path or slashes read as the folder');
eq(a.netSetCommand('192.168.1.71', 'Video', '', ''), `sh '${a.AERIAL_SCRIPT}' netset '192.168.1.71' 'Video'`, 'guest: no user and no password');
eq(a.netSetCommand('nas.local', 'My Videos', 'max', "p'a,s s"), `sh '${a.AERIAL_SCRIPT}' netset 'nas.local' 'My Videos' 'max' 'p'\\''a,s s'`, 'user: the password is quoted, a quote in it cannot end the string');
let nthrew = 0; for (const bad of [['evil;h', 'V', '', ''], ['h', "V';x", '', ''], ['h', 'V', "u'x", ''], ['h', 'V', 'u', 'x'.repeat(300)]]) { try { a.netSetCommand(...bad); } catch { nthrew++; } }
eq(nthrew, 4, 'network folder: a bad address, folder, user name or very long password is refused');
eq(a.targetCommand('usb:/tmp/usb/sda/sda1'), `sh '${a.AERIAL_SCRIPT}' target 'usb:/tmp/usb/sda/sda1'`, 'target command');
let tthrew = false; try { a.targetCommand("usb:/x';reboot;'"); } catch { tthrew = true; }
eq(tthrew, true, 'target refuses an unsafe path');
eq([a.slug('Korea and Japan Night'), a.slug('Café / Tokyo!'), a.slug('***')], ['korea-and-japan-night', 'caf-tokyo', 'video'], 'file names: lower-case letters, digits and dashes');

const s = a.parseStatus('file antarctica 141913944\nframe antarctica\njob hawaii downloading 52428800 104857600\njob new-york failed:download 0 0\njob bad;name queued 0 0\nfree 4033852\n');
eq(s.files, {antarctica: 141913944}, 'finished videos with their size');
eq(s.frames, {antarctica: true}, 'stills');
eq(s.jobs, {hawaii: {state: 'downloading', bytes: 52428800, total: 104857600}, 'new-york': {state: 'failed:download', bytes: 0, total: 0}}, 'jobs, a name with unsafe characters ignored');
eq(s.freeKB, 4033852, 'free space');

const cmd = a.getCommand(v[3], '4k');
eq(cmd, `sh '${a.AERIAL_SCRIPT}' get 'antarctica' 4k '${U('a4')}' '${U('a1')}'`, '4K: the 4K address, with the 1080p copy for the still');
eq(a.getCommand(v[3], '1080').indexOf(` 1080 '${U('a1')}' '${U('a1')}'`) > 0, true, '1080p: the 1080p address twice');
let threw = false; try { a.getCommand({...v[3], name: "x'; reboot; '"}, '4k'); } catch { threw = true; }
eq(threw, true, 'an unsafe name never reaches the shell');
threw = false; try { a.removeCommand('../etc'); } catch { threw = true; }
eq(threw, true, 'remove refuses a path');

// the TV script refuses bad input before it touches anything (run against an empty temporary folder)
const tmp = execFileSync('mktemp', ['-d'], {encoding: 'utf8'}).trim();
const sh = (args) => { try { return execFileSync('sh', [new URL('../public/aerial/aerial.sh', import.meta.url).pathname, ...args], {encoding: 'utf8', env: {...process.env, DATA: tmp + '/d', VIDEOS: tmp + '/v', FRAMES: tmp + '/f', NETLINK: tmp + '/link'}}).trim(); } catch (e) { return String(e.stdout || '').trim(); } };   // a refusal exits 1
eq(sh(['get', 'Bad Name', '4k', U('a4'), U('a1')]), 'result=badname', 'script: a bad name is refused');
eq(sh(['get', 'ok', '8k', U('a4'), U('a1')]), 'result=badquality', 'script: an unknown quality is refused');
eq(sh(['get', 'ok', '4k', 'https://evil.example/a.mov', U('a1')]), 'result=badurl', 'script: an address off Apple\'s server is refused');
eq(sh(['get', 'ok', '4k', U("a4';x"), U('a1')]), 'result=badurl', 'script: an address with a quote is refused');
eq(sh(['rm', '../x']), 'result=badname', 'script: remove refuses a path');
eq(sh(['preview', U('a4')]), 'result=badurl', 'script: preview refuses a video address');
eq(sh(['preview', 'https://evil.example/x.png']), 'result=badurl', 'script: preview refuses another server');
eq(sh(['status']).split('\n').filter((l) => /^(file|job|frame)/.test(l)), [], 'script: nothing on an empty TV');
eq(sh(['status']).split('\n').filter((l) => /^(target|net) /.test(l)), [`target internal ok ${tmp}/v`, 'net none'], 'script: the TV memory is the place at first, no network folder');
eq(sh(['target', 'usb:/tmp/usb/nothing-here']), 'result=failed that place is not there', 'script: a USB drive that is not there cannot be chosen');
eq(sh(['target', 'bad;x']), 'result=badtarget', 'script: a bad place is refused');
eq(sh(['netset', 'evil;host', 'V']), 'result=badhost', 'script: a bad address is refused before anything is saved');
eq(sh(['netset', '192.168.1.71', "V';x"]), 'result=badshare', 'script: a bad folder name is refused');
eq(sh(['netset', '192.168.1.71', 'V', "u'x", 'p']), 'result=baduser', 'script: a bad user name is refused');
execFileSync('rm', ['-rf', tmp]);
process.exit(fail ? 1 : 0);
