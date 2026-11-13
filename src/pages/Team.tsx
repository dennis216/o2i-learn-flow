import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Reveal from "@/components/Reveal";
import PageHeader from "@/components/PageHeader";
import { groupTeamMembers, loadTeamMembers, teamLabel, type TeamMember } from "@/lib/teamDepartments";
import { Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// The site's subject colours, solid; --on is the text colour that reads on each.
const TONE = {
  blue: { '--c': 'var(--education-blue)', '--on': '0 0% 100%' },
  teal: { '--c': 'var(--education-teal)', '--on': '0 0% 100%' },
  purple: { '--c': 'var(--education-purple)', '--on': '0 0% 100%' },
  green: { '--c': 'var(--education-green)', '--on': '0 0% 100%' },
  amber: { '--c': 'var(--education-orange)', '--on': '26 83% 14%' },
} as const;
type Tone = keyof typeof TONE;

const SECTION_TONE: Record<string, Tone> = {
  Leadership: 'amber', 'Publicity & Marketing': 'amber', 'Web Development & Management': 'blue', 'Curriculum Content & Media Production': 'teal',
  'Math Group': 'blue', 'Chemistry Group': 'teal', 'Physics Group': 'purple', 'Biology Group': 'green',
};

// Line drawings beside each subject group (72×48), in the same spirit as the course card art.
const wave = (phase: number) => 'M' + Array.from({ length: 33 }, (_, i) => `${4 + 2 * i} ${(24 + 14 * Math.sin((i / 32) * 3 * Math.PI + phase)).toFixed(1)}`).join('L');
const HEX = [90, 150, 210, 270, 330, 30].map(d => `${(36 + 18 * Math.cos((d * Math.PI) / 180)).toFixed(1)} ${(24 - 18 * Math.sin((d * Math.PI) / 180)).toFixed(1)}`);
const DOODLES: Record<string, JSX.Element> = {
  'Math Group': <><path d="M4 40H68M14 4V46" strokeWidth="1" strokeOpacity="0.45" /><path d="M20 6Q40 66 60 6" /><circle cx="40" cy="36" r="2.5" fill="currentColor" stroke="none" /></>,
  'Chemistry Group': <><path d={`M${HEX.join('L')}Z`} /><circle cx="36" cy="24" r="9" strokeWidth="1.25" /><path d={`M${HEX[5]}L66 4`} /></>,
  'Physics Group': <>{[0, 60, 120].map(r => <ellipse key={r} cx="36" cy="24" rx="25" ry="8" transform={`rotate(${r} 36 24)`} strokeWidth="1.25" />)}<circle cx="36" cy="24" r="3" fill="currentColor" stroke="none" /></>,
  'Biology Group': <><path d={wave(0)} /><path d={wave(Math.PI)} />{[12, 23, 34, 45, 56].map(x => <path key={x} d={`M${x} ${(24 + 14 * Math.sin(((x - 4) / 64) * 3 * Math.PI)).toFixed(1)}V${(24 - 14 * Math.sin(((x - 4) / 64) * 3 * Math.PI)).toFixed(1)}`} strokeWidth="1" strokeOpacity="0.5" />)}</>,
};

const KEY_ROLES = ['Founder', 'Co-founder', 'Team Leader'];

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();

const TeamMemberCard = ({ member, tone, showGroups = false }: { member: TeamMember; tone: Tone; showGroups?: boolean }) => {
  const { language } = useLanguage();
  const sep = language === 'zh' ? '、' : ', ';
  const label = (value: string) => teamLabel(value, language);
  const keyRoles = KEY_ROLES.filter(role => member.roles.includes(role));
  // "Team Member" says nothing extra next to a founder or leader badge.
  const otherRoles = member.roles.filter(role => !KEY_ROLES.includes(role) && !(keyRoles.length > 0 && role === 'Team Member'));
  return (
    <li className="flex items-start gap-4 py-3">
      <div aria-hidden="true" style={TONE[tone] as React.CSSProperties} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[hsl(var(--c))] font-semibold text-[hsl(var(--on))]">
        {initials(member.name)}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{member.name}</p>
        {/* Leadership and ungrouped members: every role on one line, founder / leader roles in blue */}
        {showGroups ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {keyRoles.length > 0 && <span className="font-semibold text-primary">{keyRoles.map(label).join(sep)}</span>}
            {keyRoles.length > 0 && otherRoles.length > 0 && sep}
            {otherRoles.map(label).join(sep)}
          </p>
        ) : (
          // inside a group the full list is already under Leadership: show the top role only
          <p className={`mt-1 text-sm ${keyRoles.length > 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{label(keyRoles[0] ?? otherRoles[0] ?? 'Team Member')}</p>
        )}
        {showGroups && member.departments.length > 0 && (
          <p className="text-sm text-muted-foreground">{member.departments.map(label).join(sep)}</p>
        )}
        {member.bio && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{member.bio}</p>}
      </div>
    </li>
  );
};

const GRID = "grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3";

const Team = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { language, t } = useLanguage();
  const label = (value: string) => teamLabel(value, language);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    setLoading(true);
    setError(false);
    try {
      const { members } = await loadTeamMembers(supabase);
      setTeamMembers(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const groupedMembers = groupTeamMembers(teamMembers);

  const heading = (name: string, level: 'h2' | 'h3') => level === 'h2' ? (
    <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">{label(name)}</h2>
  ) : (
    <h3 className="mb-3 flex items-center gap-3 text-xl font-bold tracking-tight text-foreground">
      {DOODLES[name] && (
        <svg aria-hidden="true" viewBox="0 0 72 48" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={TONE[SECTION_TONE[name]] as React.CSSProperties} className="h-12 w-[4.5rem] shrink-0 text-[hsl(var(--c))]">
          {DOODLES[name]}
        </svg>
      )}
      {label(name)}
    </h3>
  );

  return (
    <main className={`min-h-screen bg-background ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <PageHeader icon={Users} tone="blue" title={t('Meet the team', '认识团队')}
          description={teamMembers.length > 0
            ? t(`${teamMembers.length} people who write the lessons, record the videos and build this site.`, `${teamMembers.length} 个人：写课、录视频、搭网站。`)
            : t('We write the lessons, record the videos and build this site.', '写课、录视频、搭网站的人。')} />
        {loading ? (
          <div className={GRID} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-start gap-4 py-3">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 pt-1"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="space-y-4 py-16 text-center">
            <p className="text-lg text-muted-foreground">{t('Could not load team members. Please try again.', '团队成员加载失败，请重试。')}</p>
            <Button type="button" onClick={() => void fetchTeamMembers()}>{t('Retry', '重试')}</Button>
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('Team information coming soon', '团队信息即将上线')}</h2>
            <p className="mt-3 text-lg text-muted-foreground">{t('In the meantime, our courses are open to everyone.', '在那之前，课程已经可以直接学了。')}</p>
            <Button size="lg" className="mt-8" asChild><Link to="/courses">{t('Explore courses', '浏览课程')}</Link></Button>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedMembers.leadership.length > 0 && (
              <Reveal>
                <section>
                  {heading('Leadership', 'h2')}
                  <ul className={GRID}>
                    {groupedMembers.leadership.map(member => <TeamMemberCard key={member.id} member={member} tone="amber" showGroups />)}
                  </ul>
                </section>
              </Reveal>
            )}
            {groupedMembers.departments.map(department => (
              <section key={department.department} className="space-y-8">
                <Reveal>
                  {heading(department.department, 'h2')}
                  {department.members.length > 0 && (
                    <ul className={GRID}>
                      {department.members.map(member => <TeamMemberCard key={member.id} member={member} tone={SECTION_TONE[department.department] ?? 'blue'} />)}
                    </ul>
                  )}
                </Reveal>
                {/* One fade per subject group: a whole department is too tall to fade in at once on phones. */}
                {department.groups.map(group => (
                  <Reveal key={group.group}>
                    {heading(group.group, 'h3')}
                    <ul className={GRID}>
                      {group.members.map(member => <TeamMemberCard key={member.id} member={member} tone={SECTION_TONE[group.group] ?? 'blue'} />)}
                    </ul>
                  </Reveal>
                ))}
              </section>
            ))}
            {groupedMembers.fallback.length > 0 && (
              <Reveal>
                <section>
                  {heading('Team Members', 'h2')}
                  <ul className={GRID}>
                    {groupedMembers.fallback.map(member => <TeamMemberCard key={member.id} member={member} tone="blue" showGroups />)}
                  </ul>
                </section>
              </Reveal>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default Team;
