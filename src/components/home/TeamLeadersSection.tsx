import { useEffect, useState } from 'react';
import Reveal from '@/components/Reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { loadTeamMembers, teamLabel, type TeamMember } from '@/lib/teamDepartments';

// Homepage shows leaders only; everyone else stays on /team.
const LEADER_ROLES = ['Founder', 'Co-founder', 'Team Leader'] as const;
const rank = (member: TeamMember) => LEADER_ROLES.findIndex(role => member.roles.includes(role));
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();

export default function TeamLeadersSection() {
  const { language, t } = useLanguage();
  const [leaders, setLeaders] = useState<TeamMember[] | null>(null);
  const sep = language === 'zh' ? '、' : ', ';

  useEffect(() => {
    let active = true;
    loadTeamMembers(supabase)
      .then(({ members }) => {
        if (!active) return;
        setLeaders(members.filter(member => rank(member) >= 0).sort((a, b) => rank(a) - rank(b) || a.order_index - b.order_index));
      })
      .catch(error => { console.error('Error fetching team leaders:', error); if (active) setLeaders([]); });
    return () => { active = false; };
  }, []);

  return (
    <section aria-labelledby="team-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <Reveal className="mb-8">
        <h2 id="team-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('Meet the team', '认识团队')}</h2>
        <p className="mt-2 text-lg text-muted-foreground">{t('50+ experts. These are the people leading them.', '50 多位专家，下面是带队的人。')}</p>
      </Reveal>
      {leaders === null ? (
        <div aria-busy="true" className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-start gap-4 py-3"><Skeleton className="h-14 w-14 shrink-0 rounded-full" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-40" /></div></div>
          ))}
        </div>
      ) : leaders.length > 0 && (
        <Reveal>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {leaders.map(member => (
              <li key={member.id} className="flex items-start gap-4 py-3">
                <div aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{initials(member.name)}</div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-tight text-foreground">{member.name}</p>
                  {/* highest role only: Founder, Co-founder or Team Leader */}
                  <p className="mt-1 text-sm font-semibold text-primary">{teamLabel(LEADER_ROLES[rank(member)], language)}</p>
                  {member.departments.length > 0 && <p className="text-sm text-muted-foreground">{member.departments.map(d => teamLabel(d, language)).join(sep)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  );
}
