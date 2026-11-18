import { useEffect, useMemo, useState } from 'react';
import { EN } from './translations';
import { LocaleContext, useI18n } from './locale';

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try { return localStorage.getItem('pithole-language') === 'en' ? 'en' : 'id'; } catch { return 'id'; }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'en' ? 'PitHole | Road monitoring' : 'PitHole | Pemantauan jalan';
    try { localStorage.setItem('pithole-language', locale); } catch { /* Private mode may disallow storage. */ }
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (text, english) => locale === 'en' ? (english || EN[text] || text) : text }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return <div className="language-switch" role="group" aria-label="Bahasa / Language">
    {['id', 'en'].map(language => <button key={language} type="button" lang={language}
      aria-label={language === 'id' ? 'Bahasa Indonesia' : 'English'} aria-pressed={locale === language}
      onClick={() => setLocale(language)}>{language.toUpperCase()}</button>)}
  </div>;
}
