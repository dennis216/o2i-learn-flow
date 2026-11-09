import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadCustomOutline } from '@/lib/courseOutline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Course } from './types';
import { LEVEL_ZH } from './CourseCard';
const Editor = lazy(() => import('@/components/admin/CourseOutlineManagement').then(m => ({ default: m.CourseOutlineManagement })));
const TopicLesson = lazy(() => import('./TopicLesson'));
interface Props { course: Course; onClose: () => void; supabaseUrl: string; topicId?: string | null; entryId?: string | null; onEntryChange: (id: string | null) => void; resumeTime?: number | null; initialVideoId?: string }
export function CourseDetailModal({ course, onClose, supabaseUrl, topicId, entryId, onEntryChange, resumeTime, initialVideoId }: Props) {
  const { user, adminAccess, loading: authLoading } = useAuth();
  const { language, t } = useLanguage();
  const location = useLocation();
  const requestedUnit = new URLSearchParams(location.search).get('unit');
  const isAdmin = adminAccess.courses;
  const [editing, setEditing] = useState<string | null>(null);

  const client = useQueryClient();
  const account = user?.id ?? 'visitor';
  const outline = useQuery({ queryKey: ['course-outline', account, course.id], queryFn: () => loadCustomOutline(supabase, course.id), retry: false });
  useEffect(() => () => {
    client.removeQueries({ queryKey: ['course-outline', account, course.id] });
    client.removeQueries({ queryKey: ['course-topic', account, course.id] });
  }, [client, account, course.id]);
  const resolved = outline.data?.units.flatMap(u => u.topics).find(e => entryId ? e.id === entryId : !initialVideoId && e.cb_topics.some(t => t.id === topicId) && (isAdmin || e.is_published));
  const activeEntryId = resolved?.id;
  useEffect(() => { if (!entryId && resolved) onEntryChange(resolved.id); }, [entryId, resolved, onEntryChange]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent scrollable className="data-[state=open]:animate-none data-[state=closed]:animate-none inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 transform-none rounded-none p-3 pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-none sm:p-5">
    <DialogHeader><DialogTitle className="text-3xl">{course.title}</DialogTitle></DialogHeader>
      <DialogBody><DialogDescription>{course.description}</DialogDescription>
    <div className="flex gap-2"><Badge variant="secondary" className={course.level === 'advanced' ? 'bg-red-100 text-red-800' : undefined}>{language === 'zh' ? LEVEL_ZH[course.level] ?? course.level : course.level}</Badge><Badge variant="outline">{course.subject}</Badge></div>
    {outline.isPending ? <p role="status">{t('Loading course outline…', '课程大纲加载中…')}</p> : outline.isError ? <div role="alert"><p>{outline.error.message}</p><Button onClick={() => void outline.refetch()}>{t('Retry outline', '重新加载大纲')}</Button></div> : <div className="space-y-4">{outline.data.units.map(unit => {
      const locked = !user && unit.unit_number >= 4;
      const returnParams = new URLSearchParams(location.search);
      returnParams.set('unit', String(unit.unit_number));
      const loginUrl = '/auth?' + new URLSearchParams({ returnTo: location.pathname + '?' + returnParams });
      const isBC = course.practice_course_scope === 'BC';
      const weightMin = isBC ? unit.bc_exam_weight_min : unit.ab_exam_weight_min;
      const weightMax = isBC ? unit.bc_exam_weight_max : unit.ab_exam_weight_max;
      return <Collapsible key={unit.id} defaultOpen={String(unit.unit_number) === requestedUnit || unit.unit_number === 1 || unit.topics.some(t => t.id === entryId || !entryId && t.cb_topics.some(cb => cb.id === topicId) && (!initialVideoId || t.is_published))} className="rounded-lg border">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#4A90E2]/10">
          <div className="flex items-start gap-3"><Badge variant="secondary" className="mt-0.5 whitespace-nowrap">Unit {unit.unit_number}</Badge><div>
            <h2 aria-label={`Unit ${unit.unit_number}: ${unit.title}`} className="text-lg font-semibold text-[#4A90E2]">{unit.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`${unit.topics.length} lessons`, `${unit.topics.length} 节课`)}{weightMin != null && weightMax != null ? t(` · ${weightMin}–${weightMax}% of the ${isBC ? 'BC' : 'AB'} exam`, ` · 占 ${isBC ? 'BC' : 'AB'} 考试 ${weightMin}–${weightMax}%`) : ''}</p>
          </div></div><ChevronDown className="ml-4 h-5 w-5 shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">{authLoading ? <p role="status">{t('Checking login…', '正在确认登录状态…')}</p> : locked ? <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-6 text-center"><p className="font-medium">{t('Log in to access more', '登录后查看后面的内容')}</p><Button asChild><Link to={loginUrl}>{t('Log in', '登录')}</Link></Button></div> : <div className="divide-y rounded-md border">{unit.topics.map((topic, index) => {
          const lessonNumber = `${unit.unit_number}.${index + 1}`;
          const label = <><span className="w-16 shrink-0 whitespace-nowrap font-mono text-sm font-semibold text-primary">{lessonNumber}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground">{topic.title}</p><div className="mt-1.5 flex flex-wrap gap-2">{topic.cb_topics.map(cb => <Badge key={cb.id} variant="outline" className="text-xs">CB {cb.code}</Badge>)}{topic.cb_topics.some(cb => cb.is_bc_only) && <Badge variant="secondary" className="text-xs">{t('BC only', '仅 BC')}</Badge>}</div></div></>;
          const editButton = isAdmin && <div className="flex items-center gap-2 px-4 py-2"><Badge variant="outline">{topic.is_published ? 'Published' : topic.content_id ? 'Draft' : 'No content'}</Badge><Button size="sm" variant="outline" onClick={() => setEditing(topic.id)}>Edit {lessonNumber}</Button></div>;
          return topic.is_published || isAdmin ? <Collapsible key={topic.id} open={activeEntryId === topic.id} onOpenChange={open => onEntryChange(open ? topic.id : null)}>
            <CollapsibleTrigger aria-label={`${lessonNumber} · ${topic.title}`} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30">{label}<ChevronDown aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${activeEntryId === topic.id ? 'rotate-180' : ''}`} /></CollapsibleTrigger>
            {editButton}
            <CollapsibleContent className="px-3 pb-3 sm:px-4">{activeEntryId === topic.id && <Suspense fallback={<p role="status">{t('Loading lesson…', '课节加载中…')}</p>}><TopicLesson key={topic.id} course={course} entry={topic} supabaseUrl={supabaseUrl} resumeTime={resumeTime ?? undefined} initialVideoId={initialVideoId} /></Suspense>}</CollapsibleContent>
          </Collapsible> : <div key={topic.id} className="flex items-start gap-3 px-4 py-3">{label}</div>;
        })}</div>}</CollapsibleContent>
      </Collapsible>;
    })}</div>}
    {entryId && outline.isSuccess && !resolved && <p role="alert">{t('This lesson is no longer available in the course outline.', '这节课已不在课程大纲中。')}</p>}
    {isAdmin && editing && <Suspense fallback={<p>Loading editor…</p>}><Editor key={editing} courseId={course.id} initialEntryId={editing} onClose={() => setEditing(null)} onSaved={() => { void client.invalidateQueries({ queryKey: ['course-outline'] }); void client.invalidateQueries({ queryKey: ['course-topic'] }); void client.invalidateQueries({ queryKey: ['course-practice-counts'] }); }} /></Suspense>}

  </DialogBody>
    </DialogContent></Dialog>;
}
