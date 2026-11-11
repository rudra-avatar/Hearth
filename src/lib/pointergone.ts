// p33g (user 2026-11-11): the row "Block the Magic Remote pointer (experimental)" is dropped (it did not work for a Magic Remote user; Hearth has no device
// grab, the key hook only sees keys). Only test builds ever had it. A TV that still holds Hearth's `ignore` entry for button 1198 gets it back once,
// through the normal "given back" path (previous entry restored, record removed). No TV call at all when Hearth recorded nothing for 1198.

import {clearExtraKey} from './extrakeys';
import {POINTER_CODE, readExtra} from './extrakeyscore';
import {log} from './log';

/** Runs a while after the start; a failed attempt is tried again at the next start (the record stays until the TV proved the change). */
export function retirePointerBlock (): Promise<void> {
	if (!readExtra()[String(POINTER_CODE)]) return Promise.resolve();
	return clearExtraKey(POINTER_CODE).then((r) => { log(`pointer block: leftover entry for ${POINTER_CODE} ${r.ok ? 'given back' : 'not removed (' + r.text + ')'}`); });
}
