// Tests for the picture view of "Reassign remote buttons" (src/lib/remotes.ts).   Run: npm test
import {build} from 'esbuild';

const out = new URL('../node_modules/.cache-remotes-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/remotes.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const m = await import(out);
const rc = new URL('../node_modules/.cache-remotes-remapcmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/remapcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: rc, platform: 'node', logLevel: 'error'});
const r = await import(rc);
let fail = 0;
const eq = (a, b, msg) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg, ok ? '' : `(${a} != ${b})`); };

// ----- the drawings -----
const PROTECTED = ['power', 'stbpower', 'vol', 'ch', 'volup', 'voldown', 'chup', 'chdown', 'volch', 'mute', 'ok', 'back', 'home', 'play', 'pause', 'n0', 'n1', 'n5', 'n9'];
const known = r.BUTTONS.map((b) => b.name);
m.REMOTES.forEach((layout) => {
	const ids = layout.buttons.map((b) => b.id);
	eq(ids.length, new Set(ids).size, `${layout.model}: every button has its own id`);
	eq(layout.buttons.filter((b) => PROTECTED.indexOf(b.id) !== -1 && b.key).length, 0, `${layout.model}: arrows/OK, Back, Home, power, volume, channels, mute and numbers can't be picked`);
	eq(layout.buttons.filter((b) => b.key && known.indexOf(b.key) === -1).map((b) => b.id).join(), '', `${layout.model}: every reassignable button is one Hearth knows by name`);
	eq(layout.buttons.filter((b) => b.key && r.canonicalButton(b.key) !== b.key).length, 0, `${layout.model}: buttons use the usual name (not an alias)`);
	const b = layout.body;
	eq(layout.buttons.filter((x) => x.x - x.w / 2 < b.x || x.x + x.w / 2 > b.x + b.w || x.y - x.h / 2 < b.y || x.y + x.h / 2 > b.y + b.h).map((x) => x.id).join(), '', `${layout.model}: every button is inside the remote`);
	const overlaps = [];
	layout.buttons.forEach((p, i) => layout.buttons.slice(i + 1).forEach((q) => {
		if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2) overlaps.push(p.id + '/' + q.id);
	}));
	eq(overlaps.join(), '', `${layout.model}: no two buttons overlap`);
	// every reassignable button can be reached with the arrows from the first one
	const all = m.reassignable(layout);
	const seen = {[all[0].id]: true};
	let frontier = [all[0]];
	while (frontier.length) {
		const next = [];
		frontier.forEach((f) => ['up', 'down', 'left', 'right'].forEach((d) => { const n = m.nextButton(layout, f, d); if (n && !seen[n.id]) { seen[n.id] = true; next.push(n); } }));
		frontier = next;
	}
	eq(all.filter((x) => !seen[x.id]).map((x) => x.id).join(), '', `${layout.model}: the arrows reach every highlighted button`);
});
const mr19 = m.remoteLayout('magic-2019');
eq(m.REMOTES.map((x) => x.model).join(), 'magic-2019,magic-2021,magic-2025', 'three Magic Remotes (the IR remote uses the list)');
eq(mr19.buttons.filter((b) => b.key).map((b) => b.id).join(), 'more,mic,settings,guide,netflix,input,prime,red,green,yellow,blue,movies', 'the 2019-2020 Magic Remote: what can be reassigned');
eq(mr19.buttons.filter((b) => ['play', 'pause', 'stbpower'].indexOf(b.id) !== -1 && !b.key).length, 3, 'Play, Pause (apps use them for playback) and set-top box power stay as they are');
eq(m.buttonForKey(mr19, 'Key_webOS_RakutenTV').id, 'movies', 'its Movies button is the Rakuten TV / Movies button (sent as Key_webOS_USP)');
eq(m.buttonForKey(mr19, 'Key_webOS_Disneyplus'), null, 'a button the remote does not have is not drawn');
eq(mr19.buttons.filter((b) => b.color).length + m.remoteLayout('magic-2021').buttons.filter((b) => b.color).length, 8, 'the 2019 and 2021 remotes have the four colour keys');
eq(m.remoteLayout('magic-2025').buttons.filter((b) => /^n[0-9]$/.test(b.id)).length, 0, 'the 2025 remote has no number keys');
eq(['alexa', 'ai', 'homehub', 'help'].map((id) => m.remoteLayout('magic-2025').buttons.filter((b) => b.id === id)[0]).filter((b) => !b || b.key).length, 0, 'Alexa, AI, Home Hub and Quick Help are drawn but not reassignable (the TV has no name for them)');

// ----- moving with the arrows -----
const at = (id) => mr19.buttons.filter((b) => b.id === id)[0];
eq((m.nextButton(mr19, at('netflix'), 'down') || {}).id, 'red', '↓ from Netflix: the red key below it');
eq((m.nextButton(mr19, at('netflix'), 'right') || {}).id, 'input', '→ from Netflix: Input');
eq((m.nextButton(mr19, at('input'), 'right') || {}).id, 'prime', '→ from Input: Prime Video');
eq((m.nextButton(mr19, at('movies'), 'up') || {}).id, 'red', '↑ from Movies: the red key');
eq(m.nextButton(mr19, at('movies'), 'down'), null, '↓ from the last button: nothing (focus stays)');
eq(m.nextButton(mr19, at('more'), 'right'), null, '→ from the right edge: nothing (the screen moves to the side panel)');
eq((m.nextButton(mr19, at('more'), 'down') || {}).id, 'settings', '↓ from ••• goes to Settings straight below');

// ----- labels beside the drawing -----
eq(m.placeLabels([100, 300], 30, 0, 900).join(), '100,300', 'labels far apart stay level with their buttons');
eq(m.placeLabels([700, 700, 748], 34, 0, 900).join(), '700,734,768', 'labels too close are pushed apart, in order');
eq(m.placeLabels([880, 890], 34, 0, 900).join(), '866,900', 'at the bottom they are pushed up instead');
eq(m.placeLabels([748, 700], 34, 0, 900).join(), '748,700', 'each label keeps its own button');
eq(m.placeLabels([], 34, 0, 900).length, 0, 'no labels');

// ----- which remote -----
const log = (t) => `x NL_BUTTON_CLICK {"remote_type":"${t}","button_type":"KEY_HOME"}`;
eq(m.remoteFromLog(log('LGE MR19')), 'magic-2019', 'MR19 in the TV log: the 2019 Magic Remote');
eq(m.remoteFromLog(log('LGE MR20')), 'magic-2019', 'MR20: the same 2019-2020 remote');
eq(m.remoteFromLog(log('LGE MR19') + '\n' + log('LGE MR21')), 'magic-2021', 'the last remote named counts (MR21: 2021-2024)');
eq(m.remoteFromLog(log('LGE MR25')), 'magic-2025', 'MR25: the 2025 AI Magic Remote');
eq(m.remoteFromLog(log('LGE MR18')), null, 'older Magic Remotes: ask');
eq(m.remoteFromLog(log('LGE RCU')), null, 'a remote that does not say its model: ask');
eq(m.remoteFromLog(''), null, 'nothing in the log: ask');

// ----- LG Input Hook -----
eq(m.inputHookCodes('{"773":{"action":"launch","id":"tld.my.customlauncher"},"1037":{"action":"disable"}}').join(), '773,1037', "Input Hook's bindings are read by key code");
eq(m.inputHookCodes('{}').length + m.inputHookCodes('').length + m.inputHookCodes('not json').length + m.inputHookCodes('[1,2]').length, 0, 'no file, an empty or broken file: no bindings');
eq(m.inputHookCodes('{"abc":{},"398":null,"399":{"action":"replace","id":"400"}}').join(), '399', 'odd entries are left out');
eq(m.boundByInputHook(mr19, [773, 1037, 1083]).join(), 'home,netflix,movies', 'the drawing marks the buttons Input Hook also acts on');
eq(m.boundByInputHook(m.remoteLayout('magic-2021'), [398]).join(), 'red', 'colour keys too');
eq(m.INPUT_HOOK_COMMAND.indexOf('cat ') === 0 && m.INPUT_HOOK_COMMAND.replace('2>/dev/null', '').indexOf('>') === -1, true, "Hearth only reads Input Hook's file");

process.exit(fail ? 1 : 0);
