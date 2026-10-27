// Tests for "Reassign remote buttons": the map and commands (remapcmd.ts), and the TV key filter (src/remap/keyfilter.js)
// run against a fake surface-manager.   Run: npm test
import {build, transformSync} from 'esbuild';
import {readFileSync} from 'fs';
import vm from 'vm';

const out = new URL('../node_modules/.cache-remapcmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/remapcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const r = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

// ----- the map -----
const clean = r.cleanRemap({on: true, keys: {
	Key_webOS_Netflix: {t: 'app', id: 'com.example.app'},
	'#1234': {t: 'none'},
	Key_webOS_Amazon: {t: 'mute'},
	'bad name': {t: 'none'},
	Key_webOS_Red: {t: 'app', id: "x'; rm -rf /"},
	Key_webOS_Green: {t: 'launch-rocket'}
}});
eq(JSON.stringify(clean), '{"on":true,"keys":{"Key_webOS_Netflix":{"t":"app","id":"com.example.app"},"#1234":{"t":"none"},"Key_webOS_Amazon":{"t":"mute"}}}', 'unknown names, bad app ids and unknown actions are left out');
eq(JSON.stringify(r.cleanRemap(null)), '{"on":false,"keys":{}}', 'no saved map: off, nothing reassigned');
eq(JSON.stringify(r.cleanRemap({on: 'yes', keys: []})), '{"on":false,"keys":{}}', 'a malformed map is off');
const set = r.setButton(clean, 'Key_webOS_Netflix', null);
eq(Object.keys(set.keys).join(','), '#1234,Key_webOS_Amazon', 'setting a button to the TV\'s own action takes it out of the map');
eq(Object.keys(clean.keys).length, 3, 'setButton does not change the old map');
eq(r.setButton(clean, 'Key_webOS_Disneyplus', {t: 'none'}).keys.Key_webOS_Disneyplus.t, 'none', 'a new button is added');
eq(r.listedButtons({on: true, keys: {'#77': {t: 'none'}}}).join(','), 'Key_webOS_Netflix,Key_webOS_Amazon,Key_webOS_Disneyplus,Key_webOS_RakutenTV,Key_webOS_LGChannels,#77', 'the list shows the partner buttons, then any other reassigned button');
eq([r.buttonLabel('Key_webOS_Amazon'), r.buttonLabel('#1086'), r.buttonLabel('Key_webOS_Something')].join('|'), 'Prime Video|Button 1086|Something', 'button labels');
// one button, two key names (2019 remotes send Key_webOS_USP for Rakuten TV / Movies)
eq(r.buttonLabel('Key_webOS_USP') + ' | ' + r.buttonLabel('Key_webOS_RakutenTV'), 'Rakuten TV / Movies | Rakuten TV / Movies', 'the Movies key (USP) and the Rakuten TV key are one button');
eq(JSON.stringify(r.cleanRemap({on: true, keys: {Key_webOS_USP: {t: 'mute'}}}).keys), '{"Key_webOS_RakutenTV":{"t":"mute"}}', 'a button saved under its other name is stored under the usual one');
eq(JSON.stringify(r.cleanRemap({on: true, keys: {Key_webOS_RakutenTV: {t: 'none'}, Key_webOS_USP: {t: 'mute'}}}).keys), '{"Key_webOS_RakutenTV":{"t":"none"}}', 'the usual name wins if both were saved');
eq(Object.keys(r.setButton({on: true, keys: {}}, 'Key_webOS_USP', {t: 'none'}).keys).join(), 'Key_webOS_RakutenTV', 'a captured Movies key is saved as the Rakuten TV button');
eq(r.listedButtons({on: true, keys: {}}).indexOf('Key_webOS_USP'), -1, 'and is not listed twice');
eq([r.sameAction({t: 'app', id: 'a'}, {t: 'app', id: 'a'}), r.sameAction({t: 'app', id: 'a'}, {t: 'app', id: 'b'}), r.sameAction(null, undefined), r.sameAction({t: 'mute'}, null)].join(), 'true,false,true,false', 'sameAction');
eq(r.mapJson(clean, true).indexOf('"capture":1') > 0, true, 'the capture flag is sent only when asked for');
eq(r.mapJson(clean).indexOf('capture'), -1, 'and is never saved');
eq(r.mapJson({on: true, keys: {}}).indexOf("'"), -1, 'the map never contains a single quote (it goes in a single-quoted command)');

// ----- commands -----
const steps = r.remapInstallSteps({keyfilterJs: 'var a = 1;\n', applySh: '#!/bin/sh\necho applied\n'}, clean);
eq(steps[steps.length - 1].command, `sh '${r.REMAP_DIR}/apply.sh' reload`, 'install ends by loading the filter chain again');
eq(steps.some((s) => s.command.indexOf(`ln -sf '${r.REMAP_DIR}/apply.sh' '${r.REMAP_LINK}'`) !== -1), true, 'install adds the boot link');
eq(r.REMAP_LINK, '/var/lib/webosbrew/init.d/47-launcher-remap', 'the boot link sorts before the home helper (48)');
eq(r.captureCommand(true).indexOf("apply.sh' capture") > 0 && r.captureCommand(false).indexOf("apply.sh' nocapture") > 0, true, 'capture goes through the apply script');
eq(r.REMOVE_COMMAND.indexOf(`rm -f '${r.REMAP_LINK}'`) > 0 && r.REMOVE_COMMAND.indexOf('apply.sh\' off') > 0 && r.REMOVE_COMMAND.indexOf(`rm -rf '${r.REMAP_DIR}'`) > 0, true, 'remove takes the filter out and deletes the link and the files');
eq([r.parseRemapResult('applied\n[exit 0]'), r.parseRemapResult('removed'), r.parseRemapResult('x\nfiles-missing'), r.parseRemapResult('')].join(), 'applied,removed,files-missing,failed', 'result words');

// ----- the key filter -----
const src = readFileSync(new URL('../src/remap/keyfilter.js', import.meta.url), 'utf8');
// webOS 4's Qt JS engine is ES5: lowering to ES5 must change nothing (an arrow function, let, a template... would)
const as = (target) => transformSync(src, {target, loader: 'js', minifyWhitespace: true}).code;
let es5same = false;
try { es5same = as('es5') === as('esnext'); } catch { es5same = false; }
eq(es5same, true, 'keyfilter.js is plain ES5');

const QtKeys = {Key_Left: 0x01000012, Key_Up: 0x01000013, Key_Right: 0x01000014, Key_Down: 0x01000015, Key_Return: 0x01000004, Key_Super_L: 0x01000053, Key_VolumeMute: 0x01000071, Key_0: 0x30, Key_5: 0x35};
const WebOSKeys = {Key_webOS_Netflix: 18874408, Key_webOS_Amazon: 18874409, Key_webOS_RakutenTV: 18874426, Key_webOS_USP: 18874413, Key_webOS_Red: 18874385, Key_webOS_Back: 18874371};
const makeTv = () => {
	const tv = {launched: [], muted: 0, logs: [], subscribed: null, fg: 'com.example.other', launchOk: true};
	const ctx = {
		Qt: QtKeys, WebOS: WebOSKeys, JSON, Object, Date, String,
		KeyPolicy: {NotAccepted: 0, Accepted: 1, NextPolicy: 2},
		pmLog: {info: (id, info) => tv.logs.push(id + ' ' + JSON.stringify(info))},
		lunaCall: {subscribe: (service, method, params, cb) => { tv.subscribed = {service, method, params: JSON.parse(params), cb}; }},
		applicationManager: {launch: (id, params) => tv.launched.push(id + ' ' + params)},
		volume: {mute: () => { tv.muted++; }},
		get fullscreenView () { return {appId: tv.fg, activeFocus: true}; },
		get access () { return {keyAction: {launchApp: tv.launchOk}}; }
	};
	vm.createContext(ctx);
	vm.runInContext(src, ctx);
	ctx.init();
	tv.ctx = ctx;
	tv.push = (value) => tv.subscribed.cb(JSON.stringify({returnValue: true, configs: value === undefined ? {} : {[r.REMAP_CONFIG]: value}}));
	tv.key = (code, pressed = true, repeat = false) => ctx.hearthRemap(code, pressed, repeat);
	return tv;
};
const NEXT = 2, TAKEN = 1;
let tv = makeTv();
eq(tv.subscribed.params.configNames[0] + ' ' + tv.subscribed.params.subscribe, 'tld.my.customlauncher.remap true', 'the filter subscribes to its map');
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'with no map every button goes on to the TV');
tv.push({on: true, keys: {Key_webOS_Netflix: {t: 'app', id: 'com.example.plex'}, Key_webOS_Amazon: {t: 'mute'}, Key_webOS_Red: {t: 'none'}, '#4242': {t: 'app', id: 'com.example.hdmi'}}});
eq(tv.key(WebOSKeys.Key_webOS_Netflix), TAKEN, 'a reassigned button is taken');
eq(tv.launched.join(), 'com.example.plex {}', 'and opens its app');
eq(tv.key(WebOSKeys.Key_webOS_Netflix, true, true), TAKEN, 'its repeats are taken too');
eq(tv.key(WebOSKeys.Key_webOS_Netflix, false), TAKEN, 'and its release');
eq(tv.launched.length, 1, 'held down, it opens the app once');
eq(tv.key(WebOSKeys.Key_webOS_Amazon) + ',' + tv.key(WebOSKeys.Key_webOS_Amazon, false) + ',' + tv.muted, '1,1,1', 'mute');
eq(tv.key(WebOSKeys.Key_webOS_Red) + ',' + tv.launched.length + ',' + tv.muted, '1,1,1', '"nothing" swallows the button');
eq(tv.key(4242), TAKEN, 'a button without a name works by its number');
eq(tv.key(WebOSKeys.Key_webOS_Back) + ',' + tv.key(QtKeys.Key_Left) + ',' + tv.key(QtKeys.Key_Left, false), '2,2,2', 'other buttons go on to the TV, press and release');
tv.push({on: true, keys: {Key_webOS_Back: {t: 'none'}, ['#' + QtKeys.Key_Return]: {t: 'none'}, ['#' + QtKeys.Key_5]: {t: 'none'}, ['#' + QtKeys.Key_Super_L]: {t: 'none'}}});
eq([tv.key(WebOSKeys.Key_webOS_Back), tv.key(QtKeys.Key_Return), tv.key(QtKeys.Key_5), tv.key(QtKeys.Key_Super_L)].join(), '2,2,2,2', 'Back, OK, the numbers and Home can never be taken over');
tv.push({on: false, keys: {Key_webOS_Netflix: {t: 'app', id: 'com.example.plex'}}});
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'switched off, the map is ignored');
tv.push(undefined);
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'and when the map is taken away');
tv.push({on: true, keys: {Key_webOS_Netflix: {t: 'app', id: 'com.example.plex'}}});
tv.launchOk = false;
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'when the TV takes no app launches (an alert, first-time setup) the TV decides');
tv.launchOk = true;
tv.subscribed.cb('not json');
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'a broken map turns everything off');

// the Movies key of 2019 remotes is the Rakuten TV button
tv = makeTv();
tv.push({on: true, keys: {Key_webOS_RakutenTV: {t: 'app', id: 'com.example.youtube'}}});
eq(tv.key(WebOSKeys.Key_webOS_USP) + ' ' + tv.launched.join(), '1 com.example.youtube {}', 'a Rakuten TV / Movies job works for the 2019 Movies key (USP)');
eq(tv.key(WebOSKeys.Key_webOS_RakutenTV) + ' ' + tv.launched.length, '1 2', 'and for the later Rakuten TV key');
tv = makeTv();
tv.push({on: true, keys: {Key_webOS_USP: {t: 'app', id: 'com.example.old'}}});
eq(tv.key(WebOSKeys.Key_webOS_USP) + ' ' + tv.launched.join(), '1 com.example.old {}', 'a map saved under the USP name still works');
tv = makeTv();
tv.push({on: true, keys: {}, capture: 1});
tv.fg = 'tld.my.customlauncher';
tv.key(WebOSKeys.Key_webOS_USP);
eq(tv.launched.join(), 'tld.my.customlauncher {"hearthRemapKey":"Key_webOS_RakutenTV"}', 'pressing the Movies key in "Press a button" reports the Rakuten TV button');

// "Press a button"
tv = makeTv();
tv.push({on: true, keys: {}, capture: 1});
tv.fg = 'com.example.other';
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'capture only works while Hearth is in front');
tv.fg = 'tld.my.customlauncher';
eq(tv.key(QtKeys.Key_Down), NEXT, 'the arrows still move around while waiting');
eq(tv.key(WebOSKeys.Key_webOS_Amazon), TAKEN, 'the pressed button is taken');
eq(tv.launched.join(), 'tld.my.customlauncher {"hearthRemapKey":"Key_webOS_Amazon"}', 'and Hearth is told which one');
eq(tv.key(WebOSKeys.Key_webOS_Amazon, false), TAKEN, 'its release is taken too');
eq(tv.key(WebOSKeys.Key_webOS_Amazon), NEXT, 'one press only: then the button works as before');
tv = makeTv();
tv.push({on: true, keys: {}, capture: 1});
tv.fg = 'tld.my.customlauncher';
tv.key(777);
eq(tv.launched.join(), 'tld.my.customlauncher {"hearthRemapKey":"#777"}', 'a button without a name is reported by number');
tv = makeTv();
const realNow = Date.now;
tv.push({on: true, keys: {}, capture: 1});
tv.fg = 'tld.my.customlauncher';
tv.ctx.Date = {now: () => realNow() + 61000};
eq(tv.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'capture gives up after a minute');
tv.ctx.Date = Date;

const throwing = makeTv();
throwing.push({on: true, keys: {Key_webOS_Netflix: {t: 'app', id: 'com.example.plex'}}});
throwing.ctx.applicationManager = {launch: () => { throw new Error('boom'); }};
eq(throwing.key(WebOSKeys.Key_webOS_Netflix), NEXT, 'if anything goes wrong the TV gets the button');
eq(throwing.logs.some((l) => l.indexOf('HEARTH_REMAP_ERROR') === 0), true, 'and it is logged');

process.exit(fail ? 1 : 0);
