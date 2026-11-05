// P61g: "Map additional keys" on the Input Hook engine (the same key hook that makes the Home button work): any remote button
// found by detection (keydetect.ts) can open an app, be switched off or act as mute. Entries go into the same keybinds file as the
// Home button; only entries Hearth wrote (listed in a small record) are ever changed or removed, and what the button did before
// is given back. The older way (PR #19's key filter, `remap.ts`) stays as a separate method behind its own button on the screen.

import {APP_ID} from '../config/constants';
import {readStatus, readBinds, verify, writeBinds, type Outcome} from './homekey';
import {failureText} from './failure';
import {setEngineAtBoot, startEngine} from './homeengine';
import {describeBind, isHearthBind, keyLabel, unbind, type Keybinds} from './homekeycore';
import {actionToBind, readExtra, whyNot, writeExtra} from './extrakeyscore';
import {ensureLgHomeScript} from './lghome';
import {log} from './log';
import type {RemapAction} from './remapcmd';
import {t as tt} from '../i18n';

export {extraCount, mappedExtras, whyNot} from './extrakeyscore';

/** Makes button `code` do `action` (the key engine is started first if it is not running). */
export function setExtraKey (code: number, action: RemapAction): Promise<Outcome> {
	const why = whyNot(code);
	if (why) return Promise.resolve({ok: false, text: why});
	if (action.t === 'app' && action.id === APP_ID) return Promise.resolve({ok: false, text: tt('extrakeys.useMapHomeButtonTo')});
	// the LG Home job runs a small script: it is on the TV before a button points to it
	if (action.t === 'lghome') {
		return ensureLgHomeScript().then((ready): Promise<Outcome> => (ready ? applyExtraKey(code, action) : Promise.resolve({ok: false, text: tt('extrakeys.couldnTPutTheLg')})));
	}
	return applyExtraKey(code, action);
}

function applyExtraKey (code: number, action: RemapAction): Promise<Outcome> {
	return readStatus().then((s) => (s.injected && s.ready ? null : startEngine())).then(() => readBinds())
		.then((read): Promise<Outcome> => {
		if (!read.ok) return Promise.resolve({ok: false, text: read.why});
		const existing = read.binds[String(code)] || null;
		if (isHearthBind(existing)) return Promise.resolve({ok: false, text: tt('extrakeys.thisButtonAlreadyOpensHearth')});
		const record = readExtra();
		const previous = record[String(code)] ? record[String(code)].previous : existing;
		const next: Keybinds = {};
		Object.keys(read.binds).forEach((k) => { next[k] = read.binds[k]; });
		next[String(code)] = actionToBind(action);
		return writeBinds(next).then((written) => {
			if (!written.ok) return written;
			return verify(code, next[String(code)]).then((same): Outcome => {
				if (!same) return {ok: false, text: tt('extrakeys.savedButReadingTheFile')};
				record[String(code)] = {previous};
				writeExtra(record);
				setEngineAtBoot(true);
				log(`extra key: button ${code} now ${describeBind(next[String(code)])}` + (previous ? ` (it ${describeBind(previous)} before)` : ''));
				return {ok: true, text: tt('extrakeys.buttonV1V2', {v1: keyLabel(code), v2: describeBind(next[String(code)])})};
			});
		});
	}).catch((e): Outcome => ({ok: false, text: failureText(e, tt('extrakeys.changeTheButtonSettings'))}));
}

/** Takes Hearth's entry for `code` out and gives back what the button did before. */
export function clearExtraKey (code: number): Promise<Outcome> {
	return readBinds().then((read): Promise<Outcome> => {
		if (!read.ok) return Promise.resolve({ok: false, text: read.why});
		const record = readExtra();
		const entry = record[String(code)];
		const next = unbind(read.binds, code, entry ? entry.previous : null);
		return writeBinds(next).then((written) => {
			if (!written.ok) return written;
			return verify(code, next[String(code)] || null).then((same): Outcome => {
				if (!same) return {ok: false, text: tt('extrakeys.savedButReadingTheFile')};
				delete record[String(code)];
				writeExtra(record);
				if (!Object.keys(next).length) setEngineAtBoot(false);
				log(`extra key: button ${code} given back`);
				return {ok: true, text: tt('extrakeys.buttonV1WorksAsLg', {v1: keyLabel(code)})};
			});
		});
	}).catch((e): Outcome => ({ok: false, text: failureText(e, tt('extrakeys.changeTheButtonSettings'))}));
}
