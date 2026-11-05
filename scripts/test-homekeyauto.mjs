// Tests for K1 (src/lib/homekeycore.ts): automatic Home button mapping pick.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-homekeyauto-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/homekeycore.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const seen = (...codes) => codes.map((code) => ({code, count: 2}));
eq(c.autoPick(seen(773), {}), {code: 773}, 'detected 773 is picked');
eq(c.autoPick(seen(774), {}), {code: 774}, 'detected 774 is picked');
eq(c.autoPick(seen(125), {}), {code: 125}, 'detected 125 is picked');
eq(c.autoPick(seen(125, 774), {}), {code: 774}, 'LG table order: 774 before 125');
eq(c.autoPick(seen(398), {}), null, 'a colour key is not a Home code');
eq(c.autoPick(seen(773), null), null, 'keybinds file unknown: nothing is written');
eq(c.autoPick([], {}), null, 'nothing detected');
const ours = {'773': {action: 'launch', id: 'tld.my.customlauncher'}};
eq(c.autoPick(seen(774), ours), null, 'Hearth already has a button: no second one');
const foreign = {'773': {action: 'launch', id: 'com.other.app'}};
const p = c.autoPick(seen(773), foreign);
eq(p && p.code === 773 && !!p.blockedBy, true, 'a code used by another app is reported blocked, not overwritten');
// detectKeys: the lginput hook (webOS 3) logs the slot in LG's key table as keyid and the button number as uinput_code;
// the hook matches the keybinds file on uinput_code, so that is the number to take.
const codes = (text) => c.detectKeys(text).map((k) => k.code);
const lginput = '[INFO] lginput_uinput_send_button called: keyid=3, state=1 uinput_code=773\n[INFO] lginput_uinput_send_button called: keyid=3, state=0 uinput_code=773\n';
eq(codes(lginput), [773], 'lginput hook line: uinput_code, not the table slot keyid');
eq(c.detectKeys(lginput)[0].count, 2, 'lginput hook line: press and release both count');
eq(codes('[INFO] lginput_uinput_send_button called: keyid=6, state=1 uinput_code=103\n' + lginput), [103, 773], 'lginput hook: newest last');
eq(codes('key id => 773\n'), [773], 'older "id =>" line still read');
eq(codes('keyid=774, state=1\n'), [774], 'a keyid line without uinput_code still read');
// Z5: the Home guard (recorder entries while the key mapper listens)
{
	const g = c.addGuard({'398': {action: 'exec', command: c.OPEN_COMMAND}, '774': {action: 'launch', id: 'tld.my.customlauncher'}});
	eq(g.codes, [773, 125], 'guard: only Home codes without an entry get a recorder');
	eq(c.isGuardBind(g.binds['773']) && c.isGuardBind(g.binds['125']) && !c.isGuardBind(g.binds['774']), true, 'guard: recorder entries are recognised');
	eq(Object.keys(c.stripGuard(g.binds)).sort(), ['398', '774'], 'guard: stripGuard leaves the other entries');
	eq(c.guardScriptText(773).includes('773 >> ' + c.GUARD_HITS), true, 'guard: the script appends its code to the hits file');
	eq(c.hearthCodes(c.stripGuard(g.binds)), [398, 774], 'guard: recorder entries are not Hearth mappings');
}
process.exit(fail ? 1 : 0);
