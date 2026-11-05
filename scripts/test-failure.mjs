// Tests for src/lib/failure.ts and the greyed-out rows in src/lib/prefs.ts.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const opts = {define: {'import.meta.glob': '__glob'}, banner: {js: 'const __glob = () => ({});'}, bundle: true, format: 'esm', platform: 'node', logLevel: 'error'};
const src = new URL('../src/lib/', import.meta.url).pathname;
await build({...opts, stdin: {contents: `export * from './failure'; export * as prefs from './prefs'; export * as system from './system'; export {DEFAULT_CONFIG} from './storage';`, resolveDir: src, loader: 'ts'}, outfile: dir + '.cache-failure-test.mjs'});
const f = await import(dir + '.cache-failure-test.mjs');
const p = f.prefs;
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
eq(f.classifyFailure(new Error('Not running on webOS')), 'not-webos', 'not on a TV');
eq(f.classifyFailure(new Error('Timed out: luna://x/exec')), 'timeout', 'a timeout');
eq(f.classifyFailure(new Error('Service does not exist: org.webosbrew.hbchannel.service')), 'no-service', 'service missing');
eq(f.classifyFailure(new Error('Denied method call "exec" for category "/"')), 'denied', 'denied by the TV');
eq(f.classifyFailure(new Error('exit 3')), 'failed', 'any other error');
eq(f.classifyFailure(undefined), 'failed', 'no error object');
eq(f.failureText(new Error('Timed out: x'), 'read the storage').indexOf("Couldn't read the storage. ") === 0, true, 'text starts with what was attempted');
eq(f.failureText(new Error('Service does not exist: s'), 'x').indexOf('rooted') > 0, true, 'a missing service mentions root');

eq(f.rootState(), 'unknown', 'unknown at first');
f.noteExec(new Error('Timed out: x'));
eq(f.rootState(), 'unknown', 'a timeout proves nothing');
f.noteExec(new Error('exit 1'));
eq(f.rootState(), 'yes', 'an error from the command itself means the service answered');
f.noteExec(new Error('Service does not exist: s'));
eq([f.rootState(), f.lastFailure()], ['no', 'no-service'], 'a missing service means no root');
eq(f.whySuffix().indexOf('. The Homebrew Channel service is not running') === 0, true, 'the suffix explains it');
f.noteExec();
eq([f.rootState(), f.lastFailure(), f.whySuffix()], ['yes', null, ''], 'a good call clears it');

// rows
const rowsOf = (info) => p.optionsFor('system', f.DEFAULT_CONFIG, info);
// (keepRelaunch is greyed while Keep Hearth ready is off, P105: it is left out here)
const greyNow = (info) => rowsOf(info).filter((o) => o.disabled && o.id !== 'keepRelaunch').length;
eq(greyNow(), 0, 'nothing is greyed out when nothing is known');
eq(greyNow({homeApp: null, homeHook: null, root: 'yes'}), 0, 'nothing is greyed out on a rooted TV');
f.noteExec(new Error('Service does not exist: org.webosbrew.hbchannel.service'));
const grey = rowsOf({homeApp: null, homeHook: null, root: 'no', rootDetail: 'Service does not exist'});
const noRootInfo = {homeApp: null, homeHook: null, root: 'no', rootDetail: 'Service does not exist'};
const reasons = p.ROOT_OPTIONS.map((id) => p.disabledReason(id, noRootInfo, f.DEFAULT_CONFIG));
eq(reasons.every((r) => typeof r === 'string'), true, 'every row that needs root is greyed out without it');
eq(grey.map((o) => o.id), ['language', 'tvApps', 'noRootGuide', 'showDebug'], 'P83/T0/P92: without root the System tab shows only the language, the no-root app list, the guide and the Debug switch (all usable)');
eq(grey.every((o) => !o.disabled), true, 'and none of them is greyed out');
eq(p.optionsFor('look', f.DEFAULT_CONFIG, {root: 'no'}).some((o) => o.id === 'resetLook' && !o.disabled), true, 'Reset look and clock (on the Look tab) stays usable without root');
eq(reasons[0].indexOf('Needs a rooted TV') === 0 && reasons[0].indexOf('TV said: Service does not exist') > 0, true, 'the reason says what the TV said');
eq(p.disabledReason('theme', {root: 'no'}), null, 'a look setting is never greyed out');
eq(p.optionsFor('look', f.DEFAULT_CONFIG, {root: 'no'}).filter((o) => o.disabled).length, 0, 'the Look tab has no greyed rows');

// the LG logo setting
const sys = f.system;
eq(sys.parseLogo('{"category":"other","settings":{"lgLogoDisplay":"off"},"returnValue":true}'), 'off', 'logo off is read');
eq(sys.parseLogo('{"settings":{"lgLogoDisplay":"on"},"returnValue":true}'), 'on', 'logo on is read');
eq(sys.parseLogo('{"returnValue":true,"settings":{}}'), 'unsupported', 'an answer without the key means the TV has no such setting');
eq(sys.parseLogo('{"returnValue":false,"errorText":"x"}'), null, 'an error is not an answer');
eq(sys.parseLogo(''), null, 'no output is not an answer');
eq(sys.setLogoCommand(false).indexOf('"lgLogoDisplay":"off"') > 0 && sys.setLogoCommand(true).indexOf('"lgLogoDisplay":"on"') > 0, true, 'set command carries the wanted value');
eq(sys.GET_LOGO_COMMAND.indexOf('"category":"other"') > 0, true, 'read command uses the other category');
f.noteExec();   // rooted again (P83 hides the root rows while root failed)
const logoRow = (info) => p.optionsFor('system', f.DEFAULT_CONFIG, info).find((o) => o.id === 'lgLogo');
eq([logoRow({logo: 'off'}).valueText, logoRow({logo: 'on'}).valueText, logoRow({logo: null}).valueText], ['Off', 'On', 'Unknown'], 'the row shows the real state');
eq(logoRow({logo: 'unsupported', root: 'yes'}).disabled.indexOf("doesn't have") > 0, true, 'greyed out with a reason when this TV has no such setting');
eq(logoRow({logo: 'off', root: 'yes'}).disabled, undefined, 'usable on a rooted TV that has it');
// P21: the no-root app list row is hidden once root is confirmed, unless it is already on (so it can be turned off)
f.noteExec();       // a command worked: root is confirmed
eq(p.optionsFor('system', f.DEFAULT_CONFIG).some((o) => o.id === 'tvApps'), false, 'P21: the no-root app list row is hidden when root is confirmed');
eq(p.optionsFor('system', {...f.DEFAULT_CONFIG, tvApps: true}).some((o) => o.id === 'tvApps'), true, 'P21: but stays while it is on');
f.resetRootState();
eq(p.optionsFor('system', f.DEFAULT_CONFIG).some((o) => o.id === 'tvApps'), true, 'P21: shown while root is unknown');
// P105: Reopen Hearth needs Keep Hearth ready; a row that is already on stays usable
eq(typeof p.disabledReason('keepRelaunch', {root: 'yes'}, {...f.DEFAULT_CONFIG, keepReady: false}), 'string', 'P105: Reopen is greyed out while Keep Hearth ready is off');
eq(p.disabledReason('keepRelaunch', {root: 'yes'}, {...f.DEFAULT_CONFIG, keepReady: true}), null, 'P105: Reopen is usable while Keep Hearth ready is on');
eq(p.disabledReason('keepRelaunch', {root: 'yes'}, {...f.DEFAULT_CONFIG, keepReady: false, keepRelaunch: true}), null, 'P105: an Off-able Reopen row stays usable');
// 2.0.3 R3: the helper and the SAM stand-in grey each other out; a row that is on stays usable
const helperOn = {root: 'yes', homeHook: {running: true, linked: true}};
const samOn = {root: 'yes', homeHook: {running: false, linked: false}, samHome: {enabled: true, mounted: true, web: true, linked: true, watching: true, restartUsed: false}};
const none = {root: 'yes', homeHook: {running: false, linked: false}, samHome: {enabled: false, mounted: false, web: false, linked: false, watching: false, restartUsed: false}};
eq(typeof p.disabledReason('samHome', helperOn, f.DEFAULT_CONFIG), 'string', 'R3: SAM is greyed out while the helper is on');
eq(p.disabledReason('samHome', none, f.DEFAULT_CONFIG), null, 'R3: SAM is usable when nothing replaces LG Home');
eq(p.disabledReason('samHome', samOn, {...f.DEFAULT_CONFIG, samHome: true}), null, 'R3: an on SAM row stays usable (to switch it off)');
eq(typeof p.disabledReason('replaceHome', samOn, {...f.DEFAULT_CONFIG, samHome: true}), 'string', 'R3: the helper is greyed out while SAM is on');
eq(p.disabledReason('replaceHome', helperOn, {...f.DEFAULT_CONFIG, replaceHome: true}), null, 'R3: an on helper row stays usable');
eq(p.disabledReason('replaceHome', none, f.DEFAULT_CONFIG), null, 'R3: the helper is usable when SAM is off');
eq(f.DEFAULT_CONFIG.samHome, false, 'R3: SAM is off by default (additive saved key)');
process.exit(fail ? 1 : 0);
