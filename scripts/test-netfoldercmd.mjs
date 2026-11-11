// Network folder (SMB): the pure helpers of src/lib/netfoldercmd.ts.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-netfoldercmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/netfoldercmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const n = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };
const S = n.NETFOLDER_SCRIPT;

eq([n.cleanHost('smb://nas.local/'), n.cleanHost('\\\\NAS\\Video'), n.cleanHost('//192.168.1.71/Video'), n.cleanHost(' nas '), n.cleanHost('192.168.1.71')], ['nas.local', 'NAS', '192.168.1.71', 'nas', '192.168.1.71'], 'address: a full path or slashes read as the server');
eq([n.cleanShare('Video'), n.cleanShare('/Video/'), n.cleanShare('\\\\NAS\\Video'), n.cleanShare('//nas/Video/Photos'), n.cleanShare(' My Videos ')], ['Video', 'Video', 'Video', 'Video/Photos', 'My Videos'], 'shared folder: a full path or slashes read as the folder');
eq(n.netSetCommand('192.168.1.71', 'Video', '', ''), `sh '${S}' set '192.168.1.71' 'Video'`, 'guest: no user and no password');
eq(n.netSetCommand('nas.local', 'My Videos', 'max', "p'a,s s"), `sh '${S}' set 'nas.local' 'My Videos' 'max' 'p'\\''a,s s'`, 'user: the password is quoted, a quote in it cannot end the string');
let bad = 0;
for (const args of [['evil;h', 'V', '', ''], ['h', "V';x", '', ''], ['h', 'V', "u'x", ''], ['h', 'V', 'u', 'x'.repeat(201)], ['', 'V', '', ''], ['h', '', '', '']]) { try { n.netSetCommand(...args); } catch { bad++; } }
eq(bad, 6, 'a bad address, folder, user name, a very long password or an empty address or folder is refused');
eq([n.netMountCommand(), n.netForgetCommand(), n.netStatusCommand()], [`sh '${S}' mount`, `sh '${S}' forget`, `sh '${S}' status`], 'mount, forget and status commands');
eq(n.parseNetStatus('net none\n'), null, 'status: nothing saved');
eq(n.parseNetStatus('net on 192.168.1.71 My+Videos guest /tmp/hearth-netfolder\n'), {on: true, host: '192.168.1.71', share: 'My Videos', guest: true, mount: '/tmp/hearth-netfolder'}, 'status: on, share with spaces, guest');
eq(n.parseNetStatus('net off nas.local Video user /tmp/hearth-netfolder').guest, false, 'status: a user');
eq(n.parseNetStatus("net on h s guest /tmp/x';reboot"), null, 'status: an unsafe mount point is not read');
eq([n.parseNetResult('result=ok\n'), n.parseNetResult('result=login'), n.parseNetResult('result=guest\n'), n.parseNetResult('result=share'), n.parseNetResult('result=down'), n.parseNetResult('result=host'), n.parseNetResult('result=none')],
	[{ok: true}, {ok: false, reason: 'login'}, {ok: false, reason: 'guest'}, {ok: false, reason: 'share'}, {ok: false, reason: 'down'}, {ok: false, reason: 'host'}, {ok: false, reason: 'none'}], 'result: ok and each reason');
eq([n.parseNetResult('result=badhost'), n.parseNetResult('result=badpass')], [{ok: false, reason: 'refused'}, {ok: false, reason: 'refused'}], 'result: refused text');
eq(n.parseNetResult('result=other weird failure'), {ok: false, reason: 'other', detail: 'weird failure'}, 'result: other with its text');
eq(n.parseNetResult(''), {ok: false, reason: 'other'}, 'result: no answer is a failure');
eq([n.inNetFolder(n.NETFOLDER_MOUNT), n.inNetFolder(n.NETFOLDER_MOUNT + '/Photos/a.jpg'), n.inNetFolder(n.NETFOLDER_MOUNT + 'x/a.jpg'), n.inNetFolder('/media/developer/wallpapers'), n.inNetFolder('/tmp')], [true, true, false, false, false], 'a path in the network folder: the mount point and what is inside it only');
process.exit(fail ? 1 : 0);
