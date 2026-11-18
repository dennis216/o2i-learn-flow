import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { translateSpanish } from '@/lib/i18n/translate';

export type Language = 'en' | 'zh' | 'es';
const STORAGE_KEY = 'o2i-language';
const isLanguage = (value: string | null): value is Language => value === 'en' || value === 'zh' || value === 'es';

function storedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : 'en';
  } catch { return 'en'; }
}

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'en', setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(storedLanguage);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* choice lasts for this visit */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

// Translate interface text only; user posts, course titles, questions and videos keep their source language.
export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  const locale = language === 'zh' ? 'zh-CN' : language === 'es' ? 'es' : 'en-GB';
  const t = useCallback((en: string, zh: string, es?: string) => language === 'zh' ? zh : language === 'es' ? es ?? translateSpanish(en) : en, [language]);
  return { language, setLanguage, locale, t };
}
