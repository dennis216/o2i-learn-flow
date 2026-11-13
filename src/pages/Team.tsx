import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Reveal from "@/components/Reveal";
import { groupTeamMembers, loadTeamMembers, teamLabel, type TeamMember } from "@/lib/teamDepartments";
import { Users, Crown, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Light tints of the site's subject colours; --ink is the darker shade for text on the tint.
const TONE = {
  blue: { '--c': 'var(--education-blue)', '--ink': 'var(--education-blue)' },
  teal: { '--c': 'var(--education-teal)', '--ink': 'var(--education-teal)' },
  purple: { '--c': 'var(--education-purple)', '--ink': 'var(--education-purple)' },
  green: { '--c': 'var(--education-green)', '--ink': '142 76% 26%' },
  amber: { '--c': 'var(--education-orange)', '--ink': '32 85% 30%' },
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
    <li className="flex items-start gap-4 rounded-2xl p-3">
      <div aria-hidden="true" style={TONE[tone] as React.CSSProperties} className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[hsl(var(--c)/0.1)] text-lg font-semibold text-[hsl(var(--ink))] ring-1 ring-[hsl(var(--c)/0.3)]">
        {initials(member.name)}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{member.name}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {keyRoles.map(role => (
            <span key={role} className="inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-xs font-semibold text-foreground">
              {role === 'Team Leader' ? <Shield aria-hidden="true" className="h-3 w-3" /> : <Crown aria-hidden="true" className="h-3 w-3" />}
              {label(role)}
            </span>
          ))}
          {otherRoles.length > 0 && <span>{otherRoles.map(label).join(sep)}</span>}
        </p>
        {showGroups && member.departments.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{member.departments.map(label).join(sep)}</p>
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
    <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{label(name)}</h2>
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
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 py-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-4 py-1.5 text-sm font-medium text-primary">
            <Users aria-hidden="true" className="h-4 w-4" />
            {teamMembers.length > 0 ? t(`${teamMembers.length} people on the O2I team`, `O2I 团队共 ${teamMembers.length} 人`) : t('O2I Team', 'O2I 团队')}
          </p>
          <h1 className={`text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl ${language === 'zh' ? 'leading-[1.35]' : 'leading-tight'}`}>
            {t('Meet the Team', '认识我们的团队')}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t('Students and educators who love math and science. We write the lessons, record the videos and build this site.', '一群热爱数理的同学和老师。课是我们写的，视频是我们录的，这个网站也是我们搭的。')}
          </p>
        </Reveal>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pb-20 lg:px-8">
        {loading ? (
          <div className={GRID} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-start gap-4 p-3">
                <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
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
            <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
              <Users aria-hidden="true" className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('Team information coming soon', '团队信息即将上线')}</h2>
            <p className="mt-3 text-lg text-muted-foreground">{t('In the meantime, our courses are open to everyone.', '在那之前，课程已经可以直接学了。')}</p>
            <Button size="lg" className="mt-8" asChild><Link to="/courses">{t('Explore courses', '浏览课程')}</Link></Button>
          </div>
        ) : (
          <div className="space-y-14 sm:space-y-16">
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
