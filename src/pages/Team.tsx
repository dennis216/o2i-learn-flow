import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Reveal from "@/components/Reveal";
import { groupTeamMembers, loadTeamMembers, type TeamMember } from "@/lib/teamDepartments";
import { Users, Crown, Shield, Megaphone, Code2, Clapperboard, Sigma, FlaskConical, Atom, Dna, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Same colour tiles as the homepage feature icons.
const TILE = {
  blue: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white',
  teal: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white',
  amber: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950',
} as const;
type Tone = keyof typeof TILE;

// Chinese names and icons for the fixed lists in src/lib/teamDepartments.ts; anything else shows as stored.
const ZH: Record<string, string> = {
  Leadership: '负责人', 'Team Members': '团队成员',
  Founder: '创始人', 'Co-founder': '联合创始人', 'Team Leader': '组长', 'Team Member': '成员', 'Website Developer': '网站开发',
  'Publicity & Marketing': '宣传与推广', 'Web Development & Management': '网站开发与管理', 'Curriculum Content & Media Production': '课程内容与视频制作',
  'Math Group': '数学组', 'Chemistry Group': '化学组', 'Physics Group': '物理组', 'Biology Group': '生物组',
};
const SECTION: Record<string, { icon: LucideIcon; tone: Tone }> = {
  'Publicity & Marketing': { icon: Megaphone, tone: 'amber' },
  'Web Development & Management': { icon: Code2, tone: 'blue' },
  'Curriculum Content & Media Production': { icon: Clapperboard, tone: 'teal' },
  'Math Group': { icon: Sigma, tone: 'blue' },
  'Chemistry Group': { icon: FlaskConical, tone: 'teal' },
  'Physics Group': { icon: Atom, tone: 'amber' },
  'Biology Group': { icon: Dna, tone: 'teal' },
};
const KEY_ROLES = ['Founder', 'Co-founder', 'Team Leader'];

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();

const TeamMemberCard = ({ member, tone, showGroups = false }: { member: TeamMember; tone: Tone; showGroups?: boolean }) => {
  const { language } = useLanguage();
  const label = (value: string) => (language === 'zh' && ZH[value]) || value;
  const keyRoles = KEY_ROLES.filter(role => member.roles.includes(role));
  // "Team Member" says nothing extra next to a founder or leader badge.
  const otherRoles = member.roles.filter(role => !KEY_ROLES.includes(role) && !(keyRoles.length > 0 && role === 'Team Member'));
  return (
    <li className="flex items-start gap-4 rounded-2xl p-3">
      <div aria-hidden="true" className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-lg font-bold shadow-md ${TILE[tone]}`}>
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
          {otherRoles.length > 0 && <span>{otherRoles.map(label).join(' · ')}</span>}
        </p>
        {showGroups && member.departments.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{member.departments.map(label).join(' · ')}</p>
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
  const label = (value: string) => (language === 'zh' && ZH[value]) || value;

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

  const heading = (name: string, fallbackIcon: LucideIcon, fallbackTone: Tone, level: 'h2' | 'h3') => {
    const { icon: Icon, tone } = SECTION[name] ?? { icon: fallbackIcon, tone: fallbackTone };
    const Tag = level;
    return (
      <Tag className={`flex items-center gap-3 font-bold tracking-tight text-foreground ${level === 'h2' ? 'mb-6 text-2xl sm:text-3xl' : 'mb-3 text-xl'}`}>
        <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-md ${TILE[tone]} ${level === 'h2' ? 'h-11 w-11' : 'h-8 w-8'}`}>
          <Icon strokeWidth={2.25} className={level === 'h2' ? 'h-6 w-6' : 'h-4 w-4'} />
        </span>
        {label(name)}
      </Tag>
    );
  };

  return (
    <main className={`min-h-screen bg-background ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 py-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-4 py-1.5 text-sm font-medium text-primary">
            <Users aria-hidden="true" className="h-4 w-4" />
            {t('O2I Team', 'O2I 团队')}
            {teamMembers.length > 0 && <span className="text-muted-foreground">· {t(`${teamMembers.length} people`, `${teamMembers.length} 人`)}</span>}
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
                <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
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
            <div className={`mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br shadow-lg ${TILE.blue}`}>
              <Users aria-hidden="true" strokeWidth={2.25} className="h-8 w-8" />
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
                  {heading('Leadership', Crown, 'amber', 'h2')}
                  <ul className={GRID}>
                    {groupedMembers.leadership.map(member => <TeamMemberCard key={member.id} member={member} tone="amber" showGroups />)}
                  </ul>
                </section>
              </Reveal>
            )}
            {groupedMembers.departments.map(department => (
              <section key={department.department} className="space-y-8">
                <Reveal>
                  {heading(department.department, Users, 'blue', 'h2')}
                  {department.members.length > 0 && (
                    <ul className={GRID}>
                      {department.members.map(member => <TeamMemberCard key={member.id} member={member} tone={SECTION[department.department]?.tone ?? 'blue'} />)}
                    </ul>
                  )}
                </Reveal>
                {/* One fade per subject group: a whole department is too tall to fade in at once on phones. */}
                {department.groups.map(group => (
                  <Reveal key={group.group}>
                    {heading(group.group, Users, 'blue', 'h3')}
                    <ul className={GRID}>
                      {group.members.map(member => <TeamMemberCard key={member.id} member={member} tone={SECTION[group.group]?.tone ?? 'blue'} />)}
                    </ul>
                  </Reveal>
                ))}
              </section>
            ))}
            {groupedMembers.fallback.length > 0 && (
              <Reveal>
                <section>
                  {heading('Team Members', Users, 'blue', 'h2')}
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
