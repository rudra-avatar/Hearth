// "Keep Hearth ready", page side: a web app that was launched without keepAlive is closed by the TV when
// another app is launched (webOS App Lifecycle: "keepAlive false: terminated when another app launches"). The launcher
// asks the TV once per page start to launch it again WITH keepAlive. A relaunch while in front raises `webOSRelaunch`
// (which the launcher would read as a Home press), so the time of the request is kept and that event is ignored for 4 s.
// One Luna call, a few seconds after the page started: nothing at idle.

import {APP_ID, LUNA} from '../config/constants';
import {exec} from './apps';
import {log} from './log';
import {isWebOS, lunaCall} from './luna';
import {KEEP_LOG} from './keepreadycmd';
import {previousLife} from './lifemark';

const KEY = 'hearth-keepask-v1';
let askedAt = 0;

/** Did the launcher ask the TV to relaunch it less than `ms` ago? */
export function askedRecently (ms: number = 4000): boolean {
	return askedAt > 0 && Date.now() - askedAt < ms;
}

function lastAsk (): number {
	try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}

/** Ask for keepAlive (not more than once a minute: if the TV starts the page again because of the request, the new page must not ask again). */
export function askKeepAlive (): Promise<void> {
	if (!isWebOS() || document.hidden) return Promise.resolve();
	const now = Date.now();
	if (now - lastAsk() < 60000) { log('keep: asked less than a minute ago, not again'); return Promise.resolve(); }
	try { localStorage.setItem(KEY, String(now)); } catch { /* ignore */ }
	askedAt = now;
	// the TV's log gets the same facts as the debug report (what the page before this one was doing), for /tmp/hearth-keep.log
	const note = `page: asked for keepAlive (page age ${Math.round(performance.now())} ms; ${previousLife()})`.replace(/[^\x20-\x7e]/g, '?').replace(/"/g, "'");
	exec(`echo "$(date '+%H:%M:%S') up=$(cut -d. -f1 /proc/uptime)s keep: ${note}" >> ${KEEP_LOG}`, 4000).catch(() => undefined);
	return lunaCall(LUNA.launch, {id: APP_ID, keepAlive: true}).then(
		() => { log('keep: asked the TV to keep Hearth alive'); },
		(e: Error) => { log(`keep: the TV refused the keepAlive request: ${(e && e.message) || 'no answer'}`); }
	);
}
