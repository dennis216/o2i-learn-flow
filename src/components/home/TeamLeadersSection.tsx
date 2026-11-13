import { useEffect, useState } from 'react';
import { Crown, Shield } from 'lucide-react';
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
      <Reveal className="mx-auto mb-10 max-w-2xl text-center">
        <h2 id="team-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('Meet the team', '认识团队')}</h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('50+ experts from around the world write the lessons, record the videos and build this site. These are the people leading them.', '50 多位来自世界各地的专家一起写课、录视频、搭网站。下面是带队的人。')}</p>
      </Reveal>
      {leaders === null ? (
        <div aria-busy="true" className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-start gap-4 p-3"><Skeleton className="h-14 w-14 shrink-0 rounded-full" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-40" /></div></div>
          ))}
        </div>
      ) : leaders.length > 0 && (
        <Reveal>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {leaders.map(member => (
              <li key={member.id} className="flex items-start gap-4 rounded-2xl p-3">
                <div aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary ring-1 ring-primary/30">{initials(member.name)}</div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-tight text-foreground">{member.name}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {LEADER_ROLES.filter(role => member.roles.includes(role)).map(role => (
                      <span key={role} className="inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-xs font-semibold text-foreground">
                        {role === 'Team Leader' ? <Shield aria-hidden="true" className="h-3 w-3" /> : <Crown aria-hidden="true" className="h-3 w-3" />}
                        {teamLabel(role, language)}
                      </span>
                    ))}
                  </p>
                  {member.departments.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{member.departments.map(d => teamLabel(d, language)).join(sep)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  );
}
