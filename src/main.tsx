import {render} from 'preact';
import {App} from './app';
import {loadConfig} from './lib/storage';
import {applyTokens} from './theme/tokens';
import {loadTables, initLang, setLang} from './lib/i18n';
import {LanguageProvider} from './hooks/useLanguage';
import enTable from './locales/en.json';
import esTable from './locales/es.json';
import './theme/global.css';

const initial = loadConfig();
loadTables({en: enTable as Record<string, string>, es: esTable as Record<string, string>});
initLang(initial);
setLang(initial.language);       // sync the shared context with the persisted language
applyTokens(initial.theme, document.documentElement, initial.glassTint, initial.reduceEffects);       // theme first, so there is no flash of the wrong colours
render(<LanguageProvider><App /></LanguageProvider>, document.getElementById('root')!);
