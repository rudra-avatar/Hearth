// T2b: a language file ("language pack") loaded like a theme, on a rooted TV. A pack is one JSON file:
//   {"format": 1, "language": "Deutsch", "code": "de", "strings": {"pref.theme.label": "Thema", ...}}
// (format is the user's open question: this is the proposal, checked in one place). The keys are those of `i18n/en.ts`; a key the
// pack lacks reads in English, a key the pack has but English lacks is ignored. A text must keep exactly the `{placeholders}` of
// the English text. A wrong file changes nothing and shows the reason. The kept pack is read once at start-up only when one exists.

import {en} from '../i18n/en';
import {keepPack, type PackData} from '../i18n/pack';
import {exec, shellQuote} from './apps';
import {isSafePath, baseName} from './wallpaper';
import {log} from './log';
import {t as tt} from '../i18n';

export const LANGUAGE_FOLDER = '/media/developer/languages';
export const MAKE_LANGUAGE_FOLDER = `mkdir -p ${LANGUAGE_FOLDER} 2>/dev/null; echo made`;
export const PACK_MAX_BYTES = 400000;
const NAME_MAX = 30;
const TEXT_MAX = 1000;
const SHOWN_ERRORS = 5;

export type PackCheck = ({ok: true} & PackData) | {ok: false; errors: string[]};

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const placeholders = (s: string): string => (s.match(/\{\w+\}/g) || []).sort().join(',');
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;       // a line break is allowed in a text, nothing else

/** Checks the text of a pack file against the English table. Pure. */
export function validatePack (text: string): PackCheck {
	let value: any;
	try { value = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch (e) { return {ok: false, errors: [tt('langpack.theFileIsNotValid')]}; }
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {ok: false, errors: [tt('langpack.theFileMustHoldOne')]};
	const errors: string[] = [];
	if (value.format !== 1) errors.push('"format" must be 1');
	const name = typeof value.language === 'string' ? value.language.trim() : '';
	if (!name || name.length > NAME_MAX || CONTROL.test(name)) errors.push(`"language" must be a name of 1 to ${NAME_MAX} characters`);
	const code = typeof value.code === 'string' ? value.code.trim() : '';
	if (code && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) errors.push('"code" is not a language code such as de or pt-BR');
	const raw = value.strings;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) errors.push('"strings" must be an object of keys and texts');
	if (errors.length) return {ok: false, errors};
	const strings: Record<string, string> = {};
	let ignored = 0;
	for (const key of Object.keys(raw)) {
		if (!has(en, key)) { ignored++; continue; }
		const v = raw[key];
		if (typeof v !== 'string' || !v.length) { errors.push(`${key}: must be a non-empty text`); continue; }
		if (v.length > TEXT_MAX || CONTROL.test(v)) { errors.push(`${key}: too long or has a control character`); continue; }
		if (placeholders(v) !== placeholders((en as Record<string, string>)[key])) { errors.push(`${key}: the {placeholders} differ from English (${placeholders((en as Record<string, string>)[key]) || 'none'})`); continue; }
		strings[key] = v;
	}
	const have = Object.keys(strings).length;
	if (errors.length) return {ok: false, errors: errors.slice(0, SHOWN_ERRORS).concat(errors.length > SHOWN_ERRORS ? [`and ${errors.length - SHOWN_ERRORS} more`] : [])};
	if (!have) return {ok: false, errors: [tt('langpack.theFileHasNoText')]};
	return {ok: true, name, code, strings, missing: Object.keys(en).length - have, ignored};
}

/** The error list as one text for the pop-up. */
export const packErrorText = (errors: string[]): string => errors.join('\n');

// ----- reading a file from the TV -----

export const readCommand = (path: string): string =>
	`Q=${shellQuote(path)}; [ -f "$Q" ] || { echo "@@NOFILE"; exit 0; }; echo "@@SIZE $(wc -c < "$Q")"; head -c ${PACK_MAX_BYTES} "$Q"`;

export function parseRead (out: string): {noFile: boolean; size: number; text: string} {
	if (out.indexOf('@@NOFILE') === 0) return {noFile: true, size: 0, text: ''};
	const m = /^@@SIZE (\d+)\r?\n/.exec(out);
	return m ? {noFile: false, size: parseInt(m[1], 10), text: out.slice(m[0].length)} : {noFile: false, size: 0, text: ''};
}

export type PackOutcome = {ok: true; name: string; summary: string} | {ok: false; reason: string};
const fail = (reason: string): PackOutcome => ({ok: false, reason});

/** `path` = the full path of the .json file (any folder or drive). Nothing changes unless the file is a valid pack. */
export function loadPackFile (path: string): Promise<PackOutcome> {
	if (!isSafePath(path)) return Promise.resolve(fail(tt('langpack.theFileNameCannotBe')));
	const name = baseName(path);
	return exec(readCommand(path), 15000).then((out) => {
		const got = parseRead(out);
		if (got.noFile) return fail(tt('langpack.theFileIsGone'));
		if (got.size > PACK_MAX_BYTES) return fail(tt('langpack.theFileIsTooBig', {v1: Math.round(PACK_MAX_BYTES / 1000)}));
		if (!got.size) return fail(tt('langpack.theFileIsEmptyOr'));
		const checked = validatePack(got.text);
		if (!checked.ok) return fail(packErrorText(checked.errors));
		if (!keepPack(checked)) return fail(tt('langpack.theLanguageFileCouldNot'));
		log(`language: loaded "${checked.name}" from ${name}: ${Object.keys(checked.strings).length} texts, ${checked.missing} read in English, ${checked.ignored} unknown keys left out`);
		return {ok: true, name: checked.name, summary: tt('langpack.lengthTexts', {length: Object.keys(checked.strings).length}) + (checked.missing ? tt('langpack.missingStillInEnglish', {missing: checked.missing}) : '')} as PackOutcome;
	}).catch((e: Error) => fail(tt('langpack.theTvDidNotAnswer') + (e && e.message ? e.message : tt('langpack.noAnswer'))));
}
