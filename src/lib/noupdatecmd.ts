// 2.1.6 (p1): the "Block LG update pop-up" row (2.1.5) and the pop-up probe tests 58-63 are gone (the pop-up cannot be closed
// by any call; ARCHIVE "log 22"). TVs that used them still hold start-up links, folders and (for the block) a bind mount over
// LG's updater. This one-time clean-up takes all of it away. Pure (no bundled-file imports), tested on its own.

const INIT = '/var/lib/webosbrew/init.d';
const MEDIA = '/media/developer';
export const NOUPDATE_TARGET = '/usr/sbin/update';

/** [start-up link, folder] of each leftover: 52 the block, 53 the probe, 54 the watcher. */
export const LEFTOVERS: readonly (readonly [string, string])[] = [
	[`${INIT}/52-launcher-noupdate`, `${MEDIA}/launcher-noupdate`],
	[`${INIT}/53-launcher-popupprobe`, `${MEDIA}/launcher-popupprobe`],
	[`${INIT}/54-launcher-popupwatch`, `${MEDIA}/launcher-popupwatch`]
];

/**
 * Prints cleanup=none (nothing of ours was there), cleanup=done (removed, and read back as gone) or cleanup=failed.
 * The empty file over the updater is unmounted only when the block's own link or folder was there: a mount somebody
 * else made by hand is not ours and stays.
 */
export const CLEANUP_COMMAND = [
	'FOUND=0; LEFT=0',
	`if [ -L '${LEFTOVERS[0][0]}' ] || [ -e '${LEFTOVERS[0][1]}' ]; then FOUND=1; if grep -q " ${NOUPDATE_TARGET} " /proc/mounts; then umount '${NOUPDATE_TARGET}' 2>/dev/null || umount -l '${NOUPDATE_TARGET}' 2>/dev/null; grep -q " ${NOUPDATE_TARGET} " /proc/mounts && LEFT=1; fi; fi`,
	...LEFTOVERS.map(([link, dir]) => `if [ -L '${link}' ] || [ -e '${dir}' ]; then FOUND=1; rm -f '${link}'; rm -rf '${dir}'; if [ -L '${link}' ] || [ -e '${dir}' ]; then LEFT=1; fi; fi`),
	'if [ $LEFT = 1 ]; then echo cleanup=failed; elif [ $FOUND = 1 ]; then echo cleanup=done; else echo cleanup=none; fi'
].join('; ');

/** done or none: finished for good (a fresh read proved it); failed or anything else: try again at the next start. */
export function cleanupFinished (output: unknown): boolean {
	const s = typeof output === 'string' ? output : (output && typeof (output as {stdout?: unknown}).stdout === 'string' ? (output as {stdout: string}).stdout : '');
	return /cleanup=(none|done)/.test(s);
}
