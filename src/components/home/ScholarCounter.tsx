import { useEffect, useState } from 'react';
import { Award, UsersRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ScholarCounter() {
  const { locale, t } = useLanguage();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // Use the site's public count; do not replace a failed read with a sample number.
    void Promise.resolve(supabase.rpc('count_all_profiles')).then(({ data, error }) => {
      if (active && !error && typeof data === 'number' && Number.isSafeInteger(data) && data >= 0) setCount(data);
    }).catch(() => { /* omit the count if it cannot be verified */ }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="community-badges" aria-label={t('Our learning community and tutors', '学习社区与导师', 'Nuestra comunidad y tutores')}>
      {loading ? <div aria-hidden="true" className="h-16 w-72 max-w-full animate-pulse rounded-full bg-primary/10" /> : count !== null && (
        <div className="community-badge community-badge-learners">
          <UsersRound aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={1.6} />
          <p className="community-learners-copy"><span>{t('Learn alongside', '和', 'Aprende con')}</span> <strong>{count.toLocaleString(locale)}</strong> <span>{t('learners', '名同学一起学', 'estudiantes')}</span></p>
        </div>
      )}
      {/* Mentor count and credentials supplied by the owner in the reference screenshot. */}
      <div className="community-badge community-badge-tutors">
        <Award aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={1.6} />
        <div className="community-tutor-copy">
          <strong>{t('10+ experienced tutors', '10+ 位资深导师', '10+ tutores con experiencia')}</strong>
          <span className="community-tutor-credentials">{t('Euclid Honor Roll · AMC top 1%', 'Euclid 荣誉榜 · AMC 前 1%', 'Cuadro de honor Euclid · 1 % superior en AMC')}</span>
        </div>
      </div>
    </div>
  );
}
