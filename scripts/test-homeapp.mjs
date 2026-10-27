// Tests for "Set Hearth as the TV's Home app": reading the TV's replies, the messages, and the start-up check's install
// commands run against a fake TV folder.   Run: npm test
import {build} from 'esbuild';
import {execSync} from 'child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, lstatSync, readlinkSync} from 'fs';
import {tmpdir} from 'os';

const out = new URL('../node_modules/.cache-homeappcmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/homeappcmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const h = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

// ---- the TV's replies (as luna-send prints them on a webOS 4.5 TV, and as a Luna call hands them over) ----
const printed = '{\n    "subscribed": false,\n    "category": "general",\n    "method": "getSystemSettings",\n    "settings": {\n        "defaultApps": {\n            "home": "com.webos.app.fullhome"\n        }\n    },\n    "returnValue": true\n}\n';
eq(h.parseHomeSetting(printed), 'com.webos.app.fullhome', 'the Home app is read from luna-send\'s output');
eq(h.parseHomeSetting({returnValue: true, settings: {defaultApps: {home: 'tld.my.customlauncher'}}}), 'tld.my.customlauncher', 'and from a Luna call\'s reply');
const missing = '{\n    "subscribed": false,\n    "returnValue": false,\n    "errorText": "There is no matched result from DB"\n}\n';
eq(h.parseHomeSetting(missing), '', 'a TV without the setting says so (no matched result): ""');
eq(h.parseHomeSetting({returnValue: true, settings: {}}), '', 'an answer without the setting: ""');
eq(h.parseHomeSetting({returnValue: false, errorText: 'Denied method call'}), null, 'a refusal is no answer: null');
eq(h.parseHomeSetting('garbage'), null, 'output that is not JSON: null');
eq(h.parseHomeSetting(''), null, 'no output: null');
eq(h.parseHomeSetting({returnValue: true, settings: {defaultApps: {home: "x'; reboot"}}}), '', 'a value that is not an app id is never used');
eq(h.isMissing('There is no matched result from DB'), true, 'the "no such setting" reply is recognised');
eq(h.isMissing('Denied method call'), false, 'and a refusal is not taken for it');

// ---- messages ----
eq(h.homeAppMessage('restored', 'com.webos.app.fullhome'), 'Turned off. The Home button opens LG Home again', 'LG\'s overlay is called LG Home');
eq(h.homeAppMessage('restored', 'com.example.home'), 'Turned off. The Home button opens com.example.home again', 'another app is named by its id');
eq(/other two/.test(h.homeAppMessage('unsupported')), true, 'without the setting, the other methods are suggested');
eq(/Nothing was changed/.test(h.homeAppMessage('refused')), true, 'a refusal says nothing was changed');

// ---- the start-up check: install and remove on a fake TV ----
let rejected = 0; for (const bad of ["x'; reboot; '", 'a b', '', '$(id)']) { try { h.guardSteps('#!/bin/sh\n', bad); } catch { rejected++; } }
eq(rejected, 4, 'only a plain app id is ever saved (no shell injection)');
const root = mkdtempSync(tmpdir() + '/homeapp-');
const onTv = (cmd) => cmd.split(h.HOME_APP_DIR).join(root + '/dir').split(h.HOME_APP_LINK).join(root + '/46-launcher-homeapp');
const guardSh = readFileSync(new URL('../src/homeapp/guard.sh', import.meta.url).pathname, 'utf8');
const steps = h.guardSteps(guardSh, 'com.webos.app.fullhome');
eq(steps[steps.length - 1].name, 'add the start-up link', 'the start-up link is added last, so a half-written check never runs');
for (const step of steps) execSync(onTv(step.command), {shell: '/bin/sh'});
eq(readFileSync(root + '/dir/guard.sh', 'utf8'), guardSh, 'the check is written to the TV as it is');
eq(readFileSync(root + '/dir/previous', 'utf8').trim(), 'com.webos.app.fullhome', 'with the app from before');
eq(lstatSync(root + '/46-launcher-homeapp').isSymbolicLink() && readlinkSync(root + '/46-launcher-homeapp'), root + '/dir/guard.sh', 'and linked from the startup folder');
eq(h.parseSaved(execSync(onTv(h.SAVED_COMMAND), {shell: '/bin/sh'}).toString()), 'com.webos.app.fullhome', 'the saved app can be read back');
eq(execSync(onTv(h.REMOVE_GUARD_COMMAND), {shell: '/bin/sh'}).toString().trim(), 'removed', 'removing it reports itself done');
eq(existsSync(root + '/dir') || existsSync(root + '/46-launcher-homeapp'), false, 'and leaves nothing behind');
eq(h.parseSaved(execSync(onTv(h.SAVED_COMMAND), {shell: '/bin/sh'}).toString()), '', 'nothing saved: ""');
rmSync(root, {recursive: true, force: true});
process.exit(fail ? 1 : 0);
