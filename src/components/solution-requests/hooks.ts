import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { signImages, type Bilingual } from '@/lib/solutionRequests';

/** t() for a [en, zh] pair. */
export function useBilingual() {
  const { t, language } = useLanguage();
  const tt = useCallback((pair: Bilingual) => t(pair[0], pair[1]), [t]);
  const when = useCallback((iso: string) => new Date(iso).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), [language]);
  return { t, tt, when, language };
}

export function useSignedImages(paths: string[]) {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void signImages(supabase, key ? key.split('|') : []).then(result => { if (live) setUrls(result); });
    return () => { live = false; };
  }, [key]);
  return urls;
}
