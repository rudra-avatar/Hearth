// P61g, the part of "Map additional keys" that needs no TV: what Hearth remembers about the extra buttons it set, the key-hook
// entry for a job, and which buttons may not be mapped. See extrakeys.ts for setting and removing them.

import {isKeybind, isHomeCode, isProtected, keyLabel, recordedCode, validCode, type Keybind, type Keybinds} from './homekeycore';
import {LGHOME_COMMAND} from './lghomecmd';
import type {RemapAction} from './remapcmd';
import {t as tt} from '../i18n';

const KEY = 'customlauncher-extrakeys-v1';

/** Hearth's extra buttons: the button number, and what it did before (null: nothing). */
export type ExtraRecord = Record<string, {previous: Keybind | null}>;

export function readExtra (): ExtraRecord {
	try {
		const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
		const v = raw ? JSON.parse(raw) : null;
		const out: ExtraRecord = {};
		if (v && typeof v === 'object') {
			Object.keys(v).forEach((k) => {
				if (/^\d+$/.test(k) && validCode(Number(k))) out[k] = {previous: v[k] && isKeybind(v[k].previous) ? v[k].previous : null};
			});
		}
		return out;
	} catch (e) {
		return {};
	}
}

export function writeExtra (record: ExtraRecord): void {
	try {
		if (typeof localStorage === 'undefined') return;
		if (Object.keys(record).length) localStorage.setItem(KEY, JSON.stringify(record)); else localStorage.removeItem(KEY);
	} catch (e) {
		// refused: the mapping still works, Hearth just forgets what it set
	}
}

/** How many extra buttons Hearth set (for the settings row). */
export function extraCount (): number {
	return Object.keys(readExtra()).length;
}

/** The key-hook entry for a job. */
export function actionToBind (action: RemapAction): Keybind {
	if (action.t === 'app') return {action: 'launch', id: action.id};
	if (action.t === 'mute') return {action: 'replace', keycode: 113};
	if (action.t === 'lghome') return {action: 'exec', command: LGHOME_COMMAND};
	return {action: 'ignore'};
}

/** The buttons Hearth set that are still in the file, with their entries. */
export function mappedExtras (binds: Keybinds): {code: number; bind: Keybind}[] {
	const record = readExtra();
	return Object.keys(record).filter((k) => !!binds[k]).map((k) => ({code: Number(k), bind: binds[k]})).sort((a, b) => a.code - b.code);
}

/** Why a button may not be mapped here, or ''. */
export function whyNot (code: number): string {
	if (!validCode(code)) return tt('extrakeyscore.thatIsNotAButton');
	if (isProtected(code)) return tt('extrakeyscore.buttonV1IsNeededTo', {v1: keyLabel(code)});
	if (isHomeCode(code) || code === recordedCode()) return tt('extrakeyscore.thatIsTheHomeButton');
	return '';
}

