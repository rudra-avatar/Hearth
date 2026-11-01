// Tests for "Keep Hearth ready": the status line, the install steps and the texts.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-keepreadycmd-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/keepreadycmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const k = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = a === b; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${a} != ${b})`); };

const st = k.parseStatus('on=yes watcher=running linked=yes memlist=changed relaunch=no state=ok\n');
eq(st && st.on && st.watcher && st.linked && st.memlist, true, 'a status line is read');
eq(k.parseStatus('garbage'), null, 'garbage is no status');
eq(k.parseStatus('level=3 watcher=running linked=yes preload=works memlist=changed'), null, 'an older script\'s line reads as no status (the script is replaced)');
eq(k.statusMatches(st, true), true, 'matching status');
eq(k.parseStatus('on=yes watcher=running linked=yes memlist=changed') , null, 'the P73 status line (no relaunch/state) reads as no status, the script is replaced');
eq(k.statusMatches(st, true, true), false, 'relaunch must match too');
eq(k.statusMatches({...st, relaunch: true}, true, true), true, 'relaunch on matches');
eq(k.parseStatus('on=yes watcher=stopped linked=yes memlist=no relaunch=no state=no-list').state, 'no-list', 'the failure code is read');
eq(k.keepProblemText('ok') === null && k.keepProblemText('working') === null, true, 'ok and working are no problem');
for (const code of ['no-list', 'no-home-entry', 'bad-copy', 'bad-json', 'mount-failed', 'not-applied', 'no-service', 'restart-failed', 'lost', 'timeout']) eq(typeof k.keepProblemText(code) === 'string' && k.keepProblemText(code).length > 10 && !/undefined/.test(k.keepProblemText(code)), true, `plain text for ${code}`);
eq(/strange-code/.test(k.keepProblemText('strange-code')), true, 'an unknown code is still shown as a problem');
eq(k.statusMatches({...st, memlist: false}, true), false, 'on needs the memory list changed');
eq(k.statusMatches({...st, watcher: false}, true), false, 'a stopped watcher does not match');
eq(k.statusMatches(k.parseStatus('on=no watcher=stopped linked=no memlist=no relaunch=no state=ok'), false), true, 'off matches an empty TV');
eq(k.statusMatches(st, false), false, 'off does not match a TV that is on');
eq(k.statusMatches(null, true), false, 'no status never matches');
eq(k.parseListAnswer('keep-list=yes\n'), true, 'K2: list found');
eq(k.parseListAnswer('keep-list=no'), false, 'K2: no list');
eq(k.parseListAnswer('') === null && k.parseListAnswer(undefined) === null && k.parseListAnswer('error') === null, true, 'K2: no answer greys nothing');
eq(/KeepOnLaunchEx/.test(k.LIST_COMMAND) && /\/etc\/palm/.test(k.LIST_COMMAND) && !/ > |rm |mount/.test(k.LIST_COMMAND), true, 'K2: the list command only reads');
const steps = k.installSteps('#!/bin/sh\necho hi\n');
eq(steps[steps.length - 1].command.endsWith("keepready.sh' apply on"), true, 'the last step turns it on');
eq(k.installSteps('x', true).pop().command.endsWith('apply on relaunch'), true, 'the relaunch choice goes to the script');
eq(/apply off/.test(k.REMOVE_COMMAND), true, 'removing asks the script to apply off');
eq(k.keepMessage(false, true), 'Keep Hearth ready: off', 'off message');
eq(/^Keep Hearth ready: on\./.test(k.keepMessage(true, true)), true, 'on message');
eq(/Nothing was changed/.test(k.keepMessage(true, false, 'x')), true, 'failure message');
eq(/RAM/.test(k.KEEP_WARNING) && /experimental/i.test(k.KEEP_WARNING), true, 'the warning names RAM and experimental');
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all ok');
