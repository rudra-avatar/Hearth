// K1: everything a remote button can be given, in four categories (the mapping screen of "Map additional keys"): an app,
// an input / source, another button, a TV action. Pure data; the screen is screens/ExtraKeys.tsx.

import {KEY_ACTIONS} from './keyactcmd';
import type {RemapAction} from './remapcmd';
import {t as tt, td} from '../i18n';

export type TargetGroup = 'app' | 'input' | 'key' | 'act';

/** Something a button can be given. */
export interface RemapTarget {
	key: string;
	group: TargetGroup;
	label: string;
	detail?: string;
	action: RemapAction;
}

/** Another button the pressed one can act as (Linux key codes, the key hook's `replace`); texts: keytarget.<code>. Only the volume ones are TV-verified. */
export const KEY_TARGETS: {code: number; tested: boolean}[] = [
	{code: 115, tested: true},
	{code: 114, tested: true},
	{code: 402, tested: false},
	{code: 403, tested: false},
	{code: 164, tested: false},
	{code: 207, tested: false},
	{code: 119, tested: false},
	{code: 128, tested: false},
	{code: 168, tested: false},
	{code: 208, tested: false},
	{code: 358, tested: false},
	{code: 365, tested: false},
	{code: 370, tested: false}
];

export interface TargetInput {
	appId: string;
	label: string;
}

export interface TargetApp {
	id: string;
	title: string;
}

/** The normal Settings app of the TV (the same id Hearth's Settings tile uses). */
export const SETTINGS_APP_ID = 'com.palm.app.settings';

/** All targets. `inputs` are the TV's inputs as Hearth read them (HDMI 1-4, AV, Live TV...), already named; `apps` are the launchable apps. */
export function buildTargets (apps: TargetApp[], inputs: TargetInput[], hearthId: string): RemapTarget[] {
	const list: RemapTarget[] = [];
	list.push({key: 'lghome', group: 'app', label: tt('app.lgHome2'), detail: tt('app.opensLgSOwnHome'), action: {t: 'lghome'}});
	apps.filter((a) => a.id !== hearthId && a.id !== SETTINGS_APP_ID).slice().sort((a, b) => a.title.localeCompare(b.title))
		.forEach((a) => list.push({key: 'app:' + a.id, group: 'app', label: a.title, detail: tt('app.app2'), action: {t: 'app', id: a.id}}));
	inputs.forEach((i) => list.push({key: 'in:' + i.appId, group: 'input', label: i.label, detail: tt('app.input'), action: {t: 'app', id: i.appId}}));
	list.push({key: 'mute', group: 'key', label: tt('app.muteOrUnmute'), detail: tt('app.likeTheMuteButton'), action: {t: 'mute'}});
	KEY_TARGETS.forEach((k) => list.push({key: 'key:' + k.code, group: 'key', label: td('keytarget.' + k.code), detail: k.tested ? tt('maptargets.likeThatButton') : tt('maptargets.likeThatButtonUntested'), action: {t: 'key', code: k.code}}));
	list.push({key: 'settings', group: 'act', label: tt('maptargets.systemSettings'), detail: tt('maptargets.opensTheTvSNormal'), action: {t: 'app', id: SETTINGS_APP_ID}});
	KEY_ACTIONS.forEach((a) => list.push({key: 'act:' + a.id, group: 'act', label: td('keyact.' + a.id + '.label'), detail: a.tested ? td('keyact.' + a.id + '.detail') : `${td('keyact.' + a.id + '.detail')} (${tt('maptargets.untested')})`, action: {t: 'act', id: a.id}}));
	return list;
}
