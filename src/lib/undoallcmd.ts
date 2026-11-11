// U1 "Undo all Hearth changes" (rooted TVs, last System row). Takes every change Hearth made on the TV back, writes ONE log
// file that survives the uninstall (UNDO_LOG, for the user to share), then uninstalls Hearth itself.
//
// Two parts: (1) in the app, the things that need Hearth's own records: the key-hook buttons (what each button did before)
// and the Home app setting; (2) one shell script, run detached (it must outlive the app it removes), that calls the same
// removal commands the single features use, then deletes what is left of Hearth's start-up links, folders and /tmp files, then
// asks the TV to uninstall Hearth. Every step writes its output and exit code into the log. Probe status (user 2026-11-08):
// how the uninstall is triggered is untested on a TV; the log shows what worked and what did not.
// Not touched on purpose: the folders for the user's own files (wallpapers, themes, languages, screensavers), an Input Hook
// app installed separately, and buttons in keybinds.json that Hearth did not record.

import {APP_ID} from '../config/constants';
import {exec} from './apps';
import {detached} from './fdclean';
import {readBinds, writeBinds} from './homekey';
import {isHearthBind, unbind, type Keybinds} from './homekeycore';
import {readExtra} from './extrakeyscore';
import {REMOVE_GUARD_COMMAND as HOME_APP_GUARD_OFF, SAVED_COMMAND as HOME_APP_SAVED, parseSaved} from './homeappcmd';
import {restoreHomeApp} from './homeapp';
import {REMOVE_COMMAND as POWER_ON_OFF, OVERRIDE_FILE, LOADED_FILE} from './poweroncmd';
import {removeInputCommand} from './tvinput';
import {REMOVE_COMMAND as TAKEOVER_OFF} from './takeovercmd';
import {REMOVE_COMMAND as HOOK_OFF, writeFileCommands} from './homehookcmd';
import {REMOVE_COMMAND as KEEP_OFF} from './keepreadycmd';
import {REMOVE_COMMAND as REMAP_OFF} from './remapcmd';
import {REMOVE_COMMAND as SAVER_OFF} from './screensavercmd';
import {RESTORE_COMMAND as PRELOAD_RESTORE, PRELOAD_LINK, PRELOAD_DIR} from './preloadcmd';
import {REMOVE_GUARD_COMMAND as BOOT_GUARD_OFF} from './bootguardsh';
import {CLEANUP_COMMAND as NOUPDATE_CLEANUP} from './noupdatecmd';
import {netForgetCommand, NETFOLDER_MOUNT} from './netfoldercmd';
import {uninstallCommand, UNINSTALL_LOG} from './uninstall';

/** The one log the user shares. Outside the app folder and /tmp, so it stays after the uninstall and a restart. */
export const UNDO_LOG = '/media/developer/hearth-undo-log.txt';
export const UNDO_SCRIPT = '/tmp/hearth-undo.sh';
/** The key engine's start-up job writes its pid here (`homehook.sh`, JOBPID). */
const HOOK_JOB_PID = '/tmp/hearth-hook-job.pid';

/** Entries Hearth is sure it wrote into keybinds.json: it opens Hearth, or runs a script in its own folders. */
export function isHearthEntry (bind: Keybinds[string] | undefined): boolean {
	if (!bind) return false;
	if (isHearthBind(bind)) return true;
	return bind.action === 'exec' && /launcher-homekey|hearth-hkguard|hearth-keep/.test(bind.command);
}

export interface BindPlan {
	next: Keybinds;
	lines: string[];
	changed: boolean;
}

/** Pure: what the key-hook file looks like after the undo, and the log lines for it. `recorded` = the buttons Hearth set
 *  (button number -> what it did before). Foreign entries stay. */
export function planBinds (binds: Keybinds, recorded: Record<string, {previous: Keybinds[string] | null}>): BindPlan {
	let next: Keybinds = {};
	Object.keys(binds).forEach((k) => { next[k] = binds[k]; });
	const lines: string[] = [];
	Object.keys(recorded).forEach((code) => {
		const prev = recorded[code].previous;
		next = unbind(next, Number(code), prev);
		lines.push(`button ${code}: Hearth's entry removed${prev ? ', its earlier entry put back' : ''}`);
	});
	Object.keys(next).forEach((k) => {
		if (isHearthEntry(next[k])) {
			const rest: Keybinds = {};
			Object.keys(next).forEach((j) => { if (j !== k) rest[j] = next[j]; });
			next = rest;
			lines.push(`button ${k}: a Hearth entry removed`);
		}
	});
	const left = Object.keys(next);
	lines.push(left.length ? `keybinds.json: ${left.length} entr${left.length === 1 ? 'y' : 'ies'} left (not Hearth's: ${left.join(', ')})` : 'keybinds.json: no entries left');
	return {next, lines, changed: Object.keys(binds).length !== left.length || lines.length > 1};
}

/** One step of the script: its output and exit code go to the log. */
export function stepLine (name: string, command: string): string {
	return `echo '== ${name}' >> "$L"; ( ${command} ) >> "$L" 2>&1; echo "${name}: exit $?" >> "$L"`;
}

const PRE = (lines: string[]): string[] => lines.map((l) => `echo '${l.replace(/'/g, '')}' >> "$L"`);

/** The script text (LF). `pre` = log lines already known from the app part. */
export function undoScript (pre: string[]): string {
	const media = '/media/developer';
	const init = '/var/lib/webosbrew/init.d';
	return [
		'#!/bin/sh',
		'# Hearth: Undo all Hearth changes (U1). Written by Hearth; deletes itself at the end.',
		'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
		`L='${UNDO_LOG}'`,
		'echo "Hearth undo log, started $(date) (uptime $(cut -d. -f1 /proc/uptime)s)" > "$L"',
		...PRE(pre),
		stepLine('network folder: forget and unmount', `${netForgetCommand()}; while grep -q ' ${NETFOLDER_MOUNT} ' /proc/mounts; do umount '${NETFOLDER_MOUNT}' || umount -l '${NETFOLDER_MOUNT}' || break; done`),
		stepLine('screen saver', SAVER_OFF),
		stepLine('LG Home takeover', TAKEOVER_OFF),
		stepLine('helper watcher (Replace LG Home)', HOOK_OFF),
		stepLine('Home app guard', HOME_APP_GUARD_OFF),
		// p17b: bootd reads its start-up file only when it starts, so removing the file does not change a bootd that already
		// loaded Hearth as the first app: until a restart the TV still asks for the gone Hearth ("app not found"). The start-up
		// check noted what bootd loaded; read it BEFORE the temporary files go, and restart the TV at the very end.
		`RB=0; LA=$(cat '${LOADED_FILE}' 2>/dev/null); case "$LA" in ""|stock) [ -f '${OVERRIDE_FILE}' ] && [ -z "$LA" ] && RB=1 ;; *) RB=1 ;; esac; echo "power-on app loaded by bootd: $LA (restart needed: $RB)" >> "$L"`,
		stepLine('power-on app', POWER_ON_OFF),
		stepLine('keep ready', KEEP_OFF),
		stepLine('preload list', `${PRELOAD_RESTORE}; rm -f '${PRELOAD_LINK}'; rm -rf '${PRELOAD_DIR}'`),
		stepLine('boot guard', BOOT_GUARD_OFF),
		stepLine('old key filter (Reassign remote buttons)', REMAP_OFF),
		stepLine('update-block leftovers', NOUPDATE_CLEANUP),
		// p17: Hearth as a TV input (row *Add Hearth as a TV input*); the TV may start on that input, and then asks for a Hearth that is gone
		stepLine('TV input entry', removeInputCommand()),
		// the key engine: its link and folder (the injection itself stays in memory until the TV restarts)
		stepLine('key engine link and folder', `rm -f '${init}/49-launcher-homekey' '${init}/48-launcher-homehook'; rm -rf '${media}/launcher-homekey'`),
		// anything of Hearth's that is left, by name; never while something of it is still mounted
		stepLine('left-over links and folders', `if grep -q ' ${media}/launcher-' /proc/mounts; then echo 'skipped: a Hearth folder is still mounted'; else rm -f ${init}/*-launcher-*; rm -rf ${media}/launcher-* '${media}/hearth-install.ipk'; fi`),
		// the key engine's start-up job watches the TV's input processes for about 3 minutes after a boot and keeps writing its /tmp files: stop it first
		stepLine('key engine start-up job', `p=$(cat '${HOOK_JOB_PID}' 2>/dev/null); if [ -n "$p" ] && grep -q homehook "/proc/$p/cmdline" 2>/dev/null; then kill "$p"; echo "stopped ($p)"; sleep 1; else echo 'not running'; fi`),
		stepLine('temporary files', `for f in /tmp/launcher-* /tmp/hearth-*; do [ -f "$f" ] && [ "$f" != '${UNDO_SCRIPT}' ] && rm -f "$f"; done; if [ ! -d '${media}/apps/usr/palm/applications/org.webosbrew.inputhook' ]; then rm -f /tmp/inputhook /tmp/lginput-hook-*.log /tmp/ezinject-*.log; fi; true`),
		'echo "== uninstall Hearth" >> "$L"',
		`( ${uninstallCommand(APP_ID)} ) >> "$L" 2>&1; echo "uninstall: exit $?" >> "$L"`,
		// the uninstall's own log is added to this one, then removed
		stepLine('uninstall log', `cat '${UNINSTALL_LOG}'; rm -f '${UNINSTALL_LOG}'`),
		// p17 probe (the leftover start-up after an undo is unexplained): what on the TV still names Hearth or holds a start-up file
		stepLine('start-up check', `SEND=luna-send-pub; command -v luna-send-pub >/dev/null 2>&1 || SEND=luna-send; echo \"TV input list names Hearth: $($SEND -n 1 luna://com.webos.service.eim/getAllInputStatus '{}' 2>&1 | grep -c '${APP_ID}')\"; echo 'start-up file:'; ls -l '${OVERRIDE_FILE}' 2>&1; echo 'files that name Hearth:'; grep -rl '${APP_ID}' /var/luna/preferences /var/lib/webosbrew 2>&1; true`),
		stepLine('what is still there', `ls -d ${init}/*launcher* ${media}/launcher-* ${media}/apps/usr/palm/applications/${APP_ID} /tmp/launcher-* /tmp/hearth-* /tmp/inputhook /tmp/lginput-hook-* /tmp/ezinject-* 2>&1; true`),
		'echo "Not touched: the folders wallpapers, themes, languages, screensavers; a separate Input Hook app; the key engine stays in memory until the TV restarts." >> "$L"',
		'[ "$RB" = 1 ] && echo "the TV restarts now (its start-up file was still loaded)" >> "$L"',
		'echo "finished $(date)" >> "$L"',
		`rm -f '${UNDO_SCRIPT}'`,
		'[ "$RB" = 1 ] && { sync; sleep 3; reboot; }',
		''
	].join('\n');
}

/** Everything the app part does, then starts the script detached. Resolves with the log lines written before it starts. */
export function undoAll (): Promise<string[]> {
	const pre: string[] = [];
	const homeApp = (): Promise<void> => exec(HOME_APP_SAVED, 5000).then(parseSaved).catch(() => '').then((saved) => {
		if (!saved) { pre.push('Home app: no saved app, nothing to put back'); return; }
		return restoreHomeApp(saved).then((r) => { pre.push(`Home app: ${r.result}${r.detail ? ' (' + r.detail + ')' : ''}`); });
	}).catch((e) => { pre.push('Home app: failed (' + String(e && e.message ? e.message : e).slice(0, 60) + ')'); });
	const keys = (): Promise<void> => readBinds().then((read) => {
		if (!read.ok) { pre.push('keybinds.json: not read (' + read.why.slice(0, 60) + '), left as it is'); return; }
		const plan = planBinds(read.binds, readExtra());
		pre.push(...plan.lines);
		if (!plan.changed) return;
		return writeBinds(plan.next).then((w) => { pre.push(w.ok ? 'keybinds.json: written' : 'keybinds.json: NOT written'); });
	}).catch((e) => { pre.push('keybinds.json: failed (' + String(e && e.message ? e.message : e).slice(0, 60) + ')'); });
	return homeApp().then(keys).then(() => {
		const pieces = writeFileCommands(UNDO_SCRIPT, undoScript(pre));
		const run = (i: number): Promise<unknown> => (i >= pieces.length ? Promise.resolve() : exec(pieces[i], 8000).then(() => run(i + 1)));
		return run(0).then(() => exec(`chmod +x '${UNDO_SCRIPT}'; ${detached(`sh '${UNDO_SCRIPT}'`)}; echo started`, 8000)).then(() => pre);
	});
}
