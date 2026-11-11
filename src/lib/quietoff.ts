// QP (2.1.6): quiet mode can switch the TV off a set time after the apps hide, as the screen saver does (same luna call as
// `screensaver.sh`: powerOff with reason remoteKey, then localKey when the first answer is not returnValue true). Rooted TVs only.

import {SAVER_POWEROFF_VALUES} from './saverconfig';

/** Choices for the quiet-mode power-off (seconds after the apps hide; 0 = never). Same list as the saver's. */
export const QUIET_POWEROFF_VALUES: readonly number[] = SAVER_POWEROFF_VALUES;

const P = 'luna://com.webos.service.tvpower/power/powerOff';

/** Shell command that puts the TV into standby. Nothing is read first; a failed call changes nothing. */
export const QUIET_OFF_COMMAND =
	`o=$(luna-send -n 1 ${P} '{"reason":"remoteKey"}' 2>&1); case "$o" in *'"returnValue":true'*|*'"returnValue": true'*) ;; *) sleep 2; luna-send -n 1 ${P} '{"reason":"localKey"}' >/dev/null 2>&1;; esac; echo "$o"`;
