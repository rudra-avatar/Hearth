import {t as tt} from '../i18n';
// Clean-up of the removed "Replace LG Home with a script and SAM" method (removed in P28r). Older versions of Hearth wrote
// a script, a black stand-in page and a start-up link to the TV; a TV that still has them is cleaned once, at start.
// Pure string-building, so it can be tested on its own. See takeover.ts for the part that runs it.

export const TAKEOVER_DIR = '/media/developer/launcher-takeover';
export const TAKEOVER_LINK = '/var/lib/webosbrew/init.d/47-launcher-takeover';
export const LG_HOME_DIR = '/usr/palm/applications/com.webos.app.home';
const SCRIPT = `${TAKEOVER_DIR}/takeover.sh`;

/** Switches the old method off and deletes everything it added. The installed script does the careful part (stops its
 *  watcher, unmounts the stand-in, makes the TV read LG Home's own manifest again). Without the script only the link is
 *  removed and the mount released. The folder is deleted only once LG Home's folder is free of the mount (deleting the
 *  stand-in's files under a mount would leave the TV with nothing to read). Prints `removed` or `still-mounted`. */
export const REMOVE_COMMAND = `if [ -f '${SCRIPT}' ]; then sh '${SCRIPT}' off; else rm -f '${TAKEOVER_LINK}'; while grep -q ' ${LG_HOME_DIR} ' /proc/mounts; do umount '${LG_HOME_DIR}' || break; done; fi; if grep -q ' ${LG_HOME_DIR} ' /proc/mounts; then echo still-mounted; else rm -rf '${TAKEOVER_DIR}'; echo removed; fi`;

export function parseRemoved (output: string): boolean {
	return /^removed$/m.test(output) && !/^still-mounted$/m.test(output);
}

/** What the toast says after the one-time clean-up. */
export function cleanupMessage (freed: boolean): string {
	return freed
		? tt('takeovercmd.theSamMethodWas')
		: tt('takeovercmd.theSamMethodCould');
}
