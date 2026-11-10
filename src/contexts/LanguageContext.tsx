import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'en' | 'zh';
const STORAGE_KEY = 'o2i-language';

function storedLanguage(): Language {
  try { return localStorage.getItem(STORAGE_KEY) === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
}

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'en', setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(storedLanguage);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* private mode: choice lasts for this visit only */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

// Student-facing UI text only; course and question content stays in its original language.
export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = useCallback((en: string, zh: string) => language === 'zh' ? zh : en, [language]);
  return { language, setLanguage, t };
}
