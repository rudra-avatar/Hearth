// K1 (2.1.6): what a remote button can DO besides opening an app or acting as another button. One small script on the TV
// (keyact.sh <id>) is run by the key hook's `exec` entry; each id is one action. Pure strings (no imports), so a shell test can
// run the script on a fake `luna-send`. The part that puts the script on the TV and binds it: keyactions.ts.
// Only "screenoff" and the hook's `exec` are TV-verified (Q4 test 48); every other action is a guess from Magic Mapper's action
// names and LG's settings keys: `tested: false` shows as "untested" on the screen, the user tries them on the TV and reports.

export const KEYACT_DIR = '/media/developer/launcher-homekey';
export const KEYACT_SCRIPT = `${KEYACT_DIR}/keyact.sh`;
export const KEYACT_MARK = 'keyact-v1';
export const KEYACT_LOG = '/tmp/hearth-keyact.log';

export interface KeyAction {
	id: string;
	/** seen working on a TV (the user's report); the texts are the keys keyact.<id>.label and keyact.<id>.detail */
	tested: boolean;
}

/** The actions, in the order the screen lists them. "System settings" is no script (a plain launch), see maptargets.ts. */
export const KEY_ACTIONS: KeyAction[] = [
	{id: 'screenoff', tested: true},
	{id: 'standby', tested: false},
	{id: 'saver', tested: false},
	{id: 'energy', tested: false},
	{id: 'backlightup', tested: false},
	{id: 'backlightdown', tested: false},
	{id: 'picturemode', tested: false},
	{id: 'eyecomfort', tested: false},
	{id: 'tonemap', tested: false},
	{id: 'reboot', tested: false}
];

const IDS = KEY_ACTIONS.map((a) => a.id);

/** The command the key hook runs for an action. */
export const keyActionCommand = (id: string): string => `sh ${KEYACT_SCRIPT} ${id}`;

/** The action id of a key-hook `exec` command written by keyActionCommand, or null. */
export function keyActionId (command: string): string | null {
	const prefix = `sh ${KEYACT_SCRIPT} `;
	if (command.indexOf(prefix) !== 0) return null;
	const id = command.slice(prefix.length);
	return IDS.indexOf(id) !== -1 ? id : null;
}

/** The script (ASCII only). HEARTH_LUNA / HEARTH_LOG point it at a fake TV in tests. One line is logged per run. */
export const KEYACT_SCRIPT_TEXT = [
	'#!/bin/sh',
	`# ${KEYACT_MARK}: one remote-button action per run (sh keyact.sh <id>). Written by Hearth.`,
	'PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH',
	`LOG=\${HEARTH_LOG:-${KEYACT_LOG}}`,
	'LUNA=${HEARTH_LUNA:-luna-send}',
	'S=luna://com.webos.settingsservice',
	'P=luna://com.webos.service.tvpower/power',
	'say () { echo "$(date +%H:%M:%S) $1 $2" >> "$LOG"; }',
	'# get <key>: the value of one picture setting (empty when the TV gives none)',
	'get () { "$LUNA" -n 1 -w 4000 $S/getSystemSettings "{\\"category\\":\\"picture\\",\\"keys\\":[\\"$1\\"]}" 2>/dev/null </dev/null | tr -d "\\n" | grep -o "\\"$1\\":[^,}]*" | head -n 1 | cut -d: -f2- | tr -d "\\" "; }',
	'# put <key> <json value>',
	'put () { r=$("$LUNA" -n 1 -w 4000 $S/setSystemSettings "{\\"category\\":\\"picture\\",\\"settings\\":{\\"$1\\":$2}}" 2>&1 </dev/null | tr -d "\\n" | cut -c1-70); say "$1=$2" "$r"; }',
	'# next <key> <word>...: the word after the current value (the first one when the value is not in the list)',
	'next () { k=$1; shift; cur=$(get "$k"); pick=$1; take=0; for w in "$@"; do if [ "$take" = 1 ]; then pick=$w; take=0; fi; [ "$w" = "$cur" ] && take=1; done; put "$k" "\\"$pick\\""; }',
	'# flip <key>: on becomes off, anything else becomes on',
	'flip () { cur=$(get "$1"); if [ "$cur" = on ]; then put "$1" "\\"off\\""; else put "$1" "\\"on\\""; fi; }',
	'# step <key> <delta>: a number setting changed by delta, kept between 0 and 100',
	'step () { cur=$(get "$1"); case "$cur" in \'\'|*[!0-9]*) say "$1" "no number ($cur)"; return ;; esac; n=$((cur + $2)); [ "$n" -lt 0 ] && n=0; [ "$n" -gt 100 ] && n=100; put "$1" "$n"; }',
	'call () { r=$("$LUNA" -n 1 -w 5000 "$1" "$2" 2>&1 </dev/null | tr -d "\\n" | cut -c1-70); say "$3" "$r"; }',
	'case "$1" in',
	'  screenoff) call $P/turnOffScreen \'{}\' screenoff ;;',
	'  standby) call $P/powerOff \'{"reason":"remoteKey"}\' standby ;;',
	'  saver) call $P/turnOnScreenSaver \'{}\' saver ;;',
	'  energy) next energySaving off min med max ;;',
	'  backlightup) step backlight 10 ;;',
	'  backlightdown) step backlight -10 ;;',
	'  picturemode) next pictureMode standard cinema game vivid sports eco ;;',
	'  eyecomfort) flip eyeComfortMode ;;',
	'  tonemap) flip dynamicToneMapping ;;',
	'  reboot) call $P/reboot \'{"reason":"remoteKey"}\' reboot ;;',
	'  *) say "$1" "unknown action"; echo "keyact=fail unknown" ;;',
	'esac',
	'echo "keyact=done $1"',
	''
].join('\n');

/** Writes nothing when the script on the TV already carries the mark (`write` is the commands that write it). */
export function ensureKeyActCommand (write: string[]): string {
	return `mkdir -p '${KEYACT_DIR}' && if grep -q '${KEYACT_MARK}' '${KEYACT_SCRIPT}' 2>/dev/null; then true; else ${write.join(' && ')} && chmod +x '${KEYACT_SCRIPT}'; fi`;
}
