import {createContext} from 'preact';
import {useCallback, useContext, useState} from 'preact/hooks';
import {getLang, setLang as setGlobalLang, t as rawT, type Lang} from '../lib/i18n';

interface LangCtx {
	lang: Lang;
	setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangCtx | null>(null);

/** Provider that shares the current language across the whole app. Wrap the root component. */
export function LanguageProvider ({children}: {children: any}): any {
	const [lang, setLangState] = useState<Lang>(getLang());
	const setLang = (next: Lang) => {
		setGlobalLang(next);        // the module-level tables (libs without hooks) read this
		setLangState(next);         // re-renders every useLanguage consumer
	};
	return <LangContext.Provider value={{lang, setLang}}>{children}</LangContext.Provider>;
}

/** Reactive translation: returns `t` and `lang`; calling `setLang` re-renders all consumers. */
export function useLanguage (): {t: (key: string, params?: Record<string, string | number>) => string; lang: Lang; setLang: (lang: Lang) => void} {
	const ctx = useContext(LangContext);
	if (!ctx) throw new Error('useLanguage must be used inside a LanguageProvider');
	const {lang, setLang} = ctx;
	const t = useCallback((key: string, params?: Record<string, string | number>) => rawT(key, params), [lang]);
	return {t, lang, setLang};
}
