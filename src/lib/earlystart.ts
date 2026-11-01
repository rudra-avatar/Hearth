// Start-up work that must not wait for the first render (P35l): with the helper on, the key engine's start-up job and the
// helper watcher are started from main.tsx before the UI is drawn. The Homebrew service may not be up yet, so each is tried
// again a few times until it answers. Never throws.

import {kickEngine} from './homeengine';
import {applyHomeHook} from './homehook';
import {isWebOS} from './luna';
import {log} from './log';
import {t as tt} from '../i18n';

export const EARLY_DELAYS = [0, 1500, 4000, 9000, 15000];
const WATCHER_DELAYS = [0, 3000, 6000, 12000, 25000, 50000];

function retry (delays: number[], job: () => Promise<boolean>, name: string): void {
	const attempt = (n: number): void => {
		job().then((ok) => {
			if (ok) { if (n > 0) log(`early start: ${name} worked on try ${n + 1}`); return; }
			if (n + 1 >= delays.length) { log(`early start: ${name} gave up`); return; }
			window.setTimeout(() => attempt(n + 1), delays[n + 1]);
		});
	};
	if (delays[0] > 0) window.setTimeout(() => attempt(0), delays[0]); else attempt(0);
}

export function earlyStart (replaceHome: boolean): void {
	if (!replaceHome || !isWebOS()) return;
	retry(EARLY_DELAYS, kickEngine, tt('earlystart.keyEngine'));
	retry(WATCHER_DELAYS, () => applyHomeHook().then((r) => r !== 'failed'), 'helper');
}
