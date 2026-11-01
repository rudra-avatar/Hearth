// T2b: writes the English base language file for translators (docs/languages/en.json) from src/i18n/en.ts.
// Run after changing en.ts:  node scripts/gen-language-base.mjs      (test-langpack.mjs fails when the file is out of date)
import {readFileSync, writeFileSync} from 'node:fs';

export function readEnglish () {
  const src = readFileSync(new URL('../src/i18n/en.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export const en = ') + 'export const en = '.length, src.indexOf('} as const;') + 1);
  return new Function(`return (${body});`)();
}

export function baseFileText () {
  return JSON.stringify({format: 1, language: 'English', code: 'en', strings: readEnglish()}, null, 2) + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('gen-language-base.mjs')) {
  writeFileSync(new URL('../docs/languages/en.json', import.meta.url), baseFileText());
  console.log('docs/languages/en.json written, ' + Object.keys(readEnglish()).length + ' texts');
}
