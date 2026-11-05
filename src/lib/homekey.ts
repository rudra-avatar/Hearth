// "Home button opens Hearth" (test build): what runs on the TV. Needs a rooted TV (shell commands through the Homebrew
// Channel). The remapping is done by the key hook, which Hearth starts itself (homeengine.ts); the Input Hook app is not
// needed, but if it is there it uses the same hook, log and settings file. Hearth reads the hook's log (to find out which
// button number the Home button sends) and edits the keybinds file.
//
// Rules this file keeps:
//  - The keybinds file is read first. If it cannot be read, nothing is written (the user's other buttons stay safe).
//  - Only Hearth's own entry is added or removed; what a button did before is given back when the mapping is removed.
//  - The file is written in place (one command, same file), the way Input Hook's own screen does, because Input Hook
//    watches that file. It is read back afterwards to check it.

import {APP_ID} from '../config/constants';
import {exec, shellQuote} from './apps';
import {failureText} from './failure';
import {setEngineAtBoot} from './homeengine';
import {writeFileCommands} from './homehookcmd';
import {
	LOG_FILE_PATTERN, OPEN_MARK, OPEN_SCRIPT, OPEN_SCRIPT_TEXT, GUARD_HITS, GUARD_MARK, addGuard, bindLaunch, describeBind, guardScriptPath, guardScriptText, hearthCodes, isGuardBind, isHearthBind, stripGuard, isProtected, keyLabel, parseKeybinds, readRecord,
	sameBind, serialize, unbind, validCode, writeBaseline, writeRecord,
	type DetectBaseline, type Keybind, type Keybinds
} from './homekeycore';
import {log} from './log';
import {loadConfig} from './storage';
import {t as tt} from '../i18n';

export const HOOK_APP_ID = 'org.webosbrew.inputhook';
export const HOOK_DIR = '/home/root/.config/lginputhook';
export const HOOK_CONFIG = `${HOOK_DIR}/keybinds.json`;
const HOOK_APP_DIR = `/media/developer/apps/usr/palm/applications/${HOOK_APP_ID}`;
const LOG_GLOB = '/tmp/lginput-hook-*.log';

export interface Outcome {
	ok: boolean;
	text: string;
}

const done = (text: string): Outcome => ({ok: true, text});
const fail = (text: string): Outcome => ({ok: false, text});

// ----- is Input Hook there, and running? -----

export interface HookStatus {
	/** the Input Hook app is installed */
	app: boolean;
	/** it has injected itself into the TV's input services this start (it does that once per start) */
	injected: boolean;
	/** how many of its log files exist */
	logs: number;
	/** a log says the hook finished starting */
	ready: boolean;
	/** its keybinds file exists */
	config: boolean;
}

const STATUS_COMMAND = [
	`if [ -d ${shellQuote(HOOK_APP_DIR)} ]; then echo app=1; else echo app=0; fi`,
	'if [ -f /tmp/inputhook ]; then echo injected=1; else echo injected=0; fi',
	`n=0; for f in ${LOG_GLOB}; do [ -f "$f" ] && n=$((n+1)); done; echo logs=$n`,
	`if grep -ls 'InputHook initialized' ${LOG_GLOB} >/dev/null 2>&1; then echo ready=1; else echo ready=0; fi`,
	`if [ -f ${shellQuote(HOOK_CONFIG)} ]; then echo config=1; else echo config=0; fi`
].join('; ');

export function parseStatus (output: string): HookStatus {
	const value = (name: string): number => {
		const m = new RegExp(`(?:^|\\s)${name}=(\\d+)`).exec(output);
		return m ? Number(m[1]) : 0;
	};
	return {app: value('app') === 1, injected: value('injected') === 1, logs: value('logs'), ready: value('ready') === 1, config: value('config') === 1};
}

export function readStatus (): Promise<HookStatus> {
	return exec(STATUS_COMMAND, 8000).then(parseStatus);
}

// ----- the keybinds file -----

export type ReadResult = {ok: true; binds: Keybinds} | {ok: false; why: string};

// An empty or missing file is "no buttons" ({}); a file that cannot be read at all prints nothing, which parses as unreadable.
const READ_COMMAND = `if [ -f ${shellQuote(HOOK_CONFIG)} ]; then if [ -s ${shellQuote(HOOK_CONFIG)} ]; then cat ${shellQuote(HOOK_CONFIG)}; else echo '{}'; fi; else echo '{}'; fi`;

export function readBinds (): Promise<ReadResult> {
	return exec(READ_COMMAND, 8000).then((text): ReadResult => {
		const binds = parseKeybinds(text);
		return binds ? {ok: true, binds} : {ok: false, why: tt('homekey.theButtonSettingsFileHook', {HOOK_CONFIG})};
	});
}

export function writeBinds (binds: Keybinds): Promise<Outcome> {
	const pieces = writeFileCommands(HOOK_CONFIG, serialize(binds));
	if (pieces.length !== 1) return Promise.resolve(fail(tt('homekey.thereAreTooManyButton')));
	return exec(`mkdir -p ${shellQuote(HOOK_DIR)} && ${pieces[0]}`, 8000).then(() => done('saved'));
}

// ----- finding the Home button: reading Input Hook's log -----

/** How many lines each Input Hook log has now. Detecting reads only what comes after this. */
export function startDetecting (): Promise<DetectBaseline> {
	const command = `for f in ${LOG_GLOB}; do [ -f "$f" ] && echo "$f $(wc -l < "$f")"; done; true`;
	return exec(command, 8000).then((out) => {
		const files: Record<string, number> = {};
		out.split('\n').forEach((line) => {
			const m = /^(\S+)\s+(\d+)\s*$/.exec(line.trim());
			if (m && LOG_FILE_PATTERN.test(m[1])) files[m[1]] = Number(m[2]);
		});
		const baseline = {at: Date.now(), files};
		writeBaseline(baseline);
		return baseline;
	});
}

/** The command that prints every log line written after `baseline` (newest 600, each cut to 160 characters). */
export function newLinesCommand (baseline: DetectBaseline): string {
	const cases = Object.keys(baseline.files)
		.filter((name) => LOG_FILE_PATTERN.test(name))
		.map((name) => `${shellQuote(name)}) s=${Math.floor(baseline.files[name])};;`)
		.join(' ');
	return `for f in ${LOG_GLOB}; do [ -f "$f" ] || continue; s=0; case "$f" in ${cases} esac; tail -n +$((s+1)) "$f" 2>/dev/null; done | cut -c1-160 | tail -n 600; true`;
}

export function readNewLines (baseline: DetectBaseline): Promise<string> {
	return exec(newLinesCommand(baseline), 8000);
}

// ----- Z5: the Home guard (the key mapper listens without LG Home opening) -----

const GUARD_ID = '/tmp/hearth-hkguard.id';
const GUARD_BAK = '/tmp/hearth-hkguard.bak';
const GUARD_NONE = '/tmp/hearth-hkguard.none';
const GUARD_CLEAN = `rm -f ${GUARD_HITS} /tmp/${GUARD_MARK}-*.sh ${GUARD_ID} ${GUARD_BAK} ${GUARD_NONE}`;
/** Seconds the guard may stay if the page is gone before it can remove it (the file is put back from the copy by a timer). */
const GUARD_SECONDS = 50;

/** Binds the Home codes that have no entry to a recorder. Only when the file holds nothing but Hearth's own entries (someone else's settings are left alone, P61i). */
export function startHomeGuard (): Promise<void> {
	return readBinds().then((read) => {
		if (!read.ok) return undefined;
		const clean = stripGuard(read.binds);
		if (Object.keys(clean).some((k) => !isHearthBind(clean[k]))) return undefined;
		const added = addGuard(clean);
		if (!added.codes.length) return undefined;
		const timerPath = `/tmp/${GUARD_MARK}-timer.sh`;
		const timer = `#!/bin/sh\nsleep ${GUARD_SECONDS}\n[ "$(cat ${GUARD_ID} 2>/dev/null)" = "$1" ] || exit 0\n`
			+ `if [ -f ${GUARD_BAK} ]; then cat ${GUARD_BAK} > ${HOOK_CONFIG}; elif [ -f ${GUARD_NONE} ]; then echo '{}' > ${HOOK_CONFIG}; fi\n${GUARD_CLEAN}\n`;
		const steps = [GUARD_CLEAN, `: > ${GUARD_HITS}`]
			.concat(...added.codes.map((c) => writeFileCommands(guardScriptPath(c), guardScriptText(c))))
			.concat(writeFileCommands(timerPath, timer))
			.concat(writeFileCommands(GUARD_BAK, serialize(clean)));      // the copy is the file without any recorder entry
		return exec(steps.join('; '), 8000).then(() => writeBinds(added.binds)).then((written) => {
			if (!written.ok) return undefined;
			log(`keys: Home guard on ${added.codes.join(' ')}`);
			// a backup: if the page is gone before it removes the guard, this timer puts the file back (only while the id file still names it)
			return exec(`id=$$-$(date +%s); echo "$id" > ${GUARD_ID}; (nohup sh ${timerPath} "$id" > /dev/null 2>&1 < /dev/null &); true`, 8000).then(() => undefined);
		});
	}).catch(() => undefined);
}

/** Takes the recorder entries out again (everything else in the file stays as it is now) and removes the helper files. Safe to call any time. */
export function stopHomeGuard (): Promise<void> {
	return readBinds().then((read) => {
		const had = read.ok && Object.keys(read.binds).some((k) => isGuardBind(read.binds[k]));
		const clean = () => exec(GUARD_CLEAN, 5000).then(() => undefined);
		if (!read.ok || !had) return clean();
		return writeBinds(stripGuard(read.binds)).then((written) => {
			if (written.ok) log('keys: Home guard off');
			return written.ok ? clean() : undefined;     // not removed: the timer's copy still puts the file back
		});
	}).catch(() => undefined);
}

// ----- setting and removing the mapping -----

/** `binds` with Hearth's entry on `code` taken out, and what that button did before put back. */
function release (binds: Keybinds, code: number, previous: Keybind | null): Keybinds {
	return isHearthBind(binds[String(code)]) ? unbind(binds, code, previous) : binds;
}

export function verify (code: number, expected: Keybind | null): Promise<boolean> {
	return readBinds().then((again) => {
		if (!again.ok) return false;
		const now = again.binds[String(code)];
		return expected ? sameBind(now, expected) : !now;
	});
}

/** P71: writes the small script the button runs when "Keep Hearth ready" is on; true when the TV has it afterwards. */
function writeOpenScript (): Promise<boolean> {
	const dir = OPEN_SCRIPT.replace(/\/[^/]*$/, '');
	const write = [`mkdir -p ${shellQuote(dir)}`, ...writeFileCommands(OPEN_SCRIPT, OPEN_SCRIPT_TEXT), `chmod +x ${shellQuote(OPEN_SCRIPT)}`, `[ -s ${shellQuote(OPEN_SCRIPT)} ] && echo script=ok`].join(' && ');
	// a script that already carries this version is left alone (one grep)
	return exec(`if grep -q ${shellQuote(OPEN_MARK)} ${shellQuote(OPEN_SCRIPT)} 2>/dev/null; then echo script=ok; else ${write}; fi`, 10000).then((out) => /script=ok/.test(out), () => false);
}

/** P71: gives every button that opens Hearth the form that fits the keep setting (keepAlive script on, plain launch off).
 *  Reads first and writes only on a change; the script is on the TV before a button points to it. Resolves '' or the reason. */
export function syncKeepBind (keep: boolean): Promise<string> {
	return readBinds().then((read): Promise<string> => {
		if (!read.ok) return Promise.resolve(read.why);
		const codes = hearthCodes(read.binds);
		if (!codes.length) return Promise.resolve('');
		let next = read.binds;
		const fresh = keep && codes.every((c) => sameBind(read.binds[String(c)], bindLaunch(read.binds, c, APP_ID, true)[String(c)])) ? writeOpenScript().then((ok) => (ok ? '' : tt('homekey.theKeepaliveScriptCouldNot'))) : null;
		codes.forEach((c) => { next = bindLaunch(next, c, APP_ID, keep); });
		if (codes.every((c) => sameBind(next[String(c)], read.binds[String(c)]))) return fresh || Promise.resolve('');
		const write = (): Promise<string> => writeBinds(next).then((w) => {
			if (!w.ok) return w.text;
			return Promise.all(codes.map((c) => verify(c, next[String(c)]))).then((same) => {
				log(`Home button: now ${keep ? 'runs the keepAlive script' : 'launches Hearth directly'}${same.every(Boolean) ? '' : ' (read-back differs)'}`);
				return same.every(Boolean) ? '' : tt('homekey.readingTheFileBackDid');
			});
		});
		return keep ? writeOpenScript().then((ok) => (ok ? write() : tt('homekey.theKeepaliveScriptCouldNot'))) : write();
	}).catch((e) => failureText(e, tt('homekey.changeTheButtonSettings')));
}

/** Makes button `code` open Hearth. */
export function setHomeKey (code: number): Promise<Outcome> {
	if (!validCode(code)) return Promise.resolve(fail(tt('homekey.thatIsNotAButton')));
	if (isProtected(code)) return Promise.resolve(fail(tt('homekey.buttonV1IsNeededTo', {v1: keyLabel(code)})));
	return stopHomeGuard().then(() => readBinds()).then((read) => {
		if (!read.ok) return fail(read.why);
		const record = readRecord();
		let binds = read.binds;
		// what this button did before Hearth: kept so Remove can give it back (Hearth's own entry is not "before")
		const existing = binds[String(code)] || null;
		const previous: Keybind | null = isHearthBind(existing) ? (record && record.code === code ? record.previous : null) : existing;
		// a different button was set earlier: give that one back first, so only one button opens Hearth
		if (record && record.code !== code) binds = release(binds, record.code, record.previous);
		return (loadConfig().keepReady ? writeOpenScript() : Promise.resolve(false)).then((keepScript) => {
		const next = bindLaunch(binds, code, APP_ID, keepScript);
		return writeBinds(next).then((written) => {
			if (!written.ok) return written;
			return verify(code, next[String(code)]).then((same) => {
				if (!same) return fail(tt('homekey.savedButReadingTheFile', {HOOK_CONFIG}));
				writeRecord({code, previous});
				setEngineAtBoot(true);      // the hook must be started again at every start of the TV while a button is mapped
				log(`Home button: button ${code} now opens Hearth` + (previous ? ` (it ${describeBind(previous)} before)` : ''));
				return done(tt('homekey.buttonV1NowOpensHearth', {v1: keyLabel(code)}));
			});
		});
		});
	}).catch((e) => fail(failureText(e, tt('homekey.changeTheButtonSettings'))));
}

/** Takes Hearth's button mapping out again, giving back what the button did before. */
export function clearHomeKey (): Promise<Outcome> {
	return stopHomeGuard().then(() => readBinds()).then((read) => {
		if (!read.ok) return fail(read.why);
		const record = readRecord();
		const codes = hearthCodes(read.binds);
		if (!codes.length) { writeRecord(null); return done(tt('homekey.noButtonOpensHearthNow')); }
		let next = read.binds;
		codes.forEach((c) => { next = release(next, c, record && record.code === c ? record.previous : null); });
		return writeBinds(next).then((written) => {
			if (!written.ok) return written;
			return readBinds().then((again) => {
				if (!again.ok || hearthCodes(again.binds).length) return fail(tt('homekey.savedButReadingTheFile2', {HOOK_CONFIG}));
				writeRecord(null);
				// nothing left in the file: the hook has no reason to start at boot (other buttons in it keep the hook going)
				if (!Object.keys(again.binds).length) setEngineAtBoot(false);
				log('Home button: the mapping was removed');
				return done(tt('homekey.removedTheHomeButtonWorks'));
			});
		});
	}).catch((e) => fail(failureText(e, tt('homekey.changeTheButtonSettings'))));
}
