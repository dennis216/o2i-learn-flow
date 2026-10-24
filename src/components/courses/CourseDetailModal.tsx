import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadCustomOutline } from '@/lib/courseOutline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Course } from './types';
const Editor = lazy(() => import('@/components/admin/CourseOutlineManagement').then(m => ({ default: m.CourseOutlineManagement })));
const TopicLesson = lazy(() => import('./TopicLesson'));
interface Props { course: Course; onClose: () => void; supabaseUrl: string; topicId?: string | null; entryId?: string | null; onEntryChange: (id: string | null) => void; resumeTime?: number | null; initialVideoId?: string }
export function CourseDetailModal({ course, onClose, supabaseUrl, topicId, entryId, onEntryChange, resumeTime, initialVideoId }: Props) {
  const { user, adminAccess } = useAuth();
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="data-[state=open]:animate-none data-[state=closed]:animate-none inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 transform-none overflow-y-auto rounded-none p-3 pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-none sm:p-5">
    <DialogHeader><DialogTitle className="text-3xl">{course.title}</DialogTitle><DialogDescription>{course.description}</DialogDescription></DialogHeader>
    <div className="flex gap-2"><Badge variant="secondary" className={course.level === 'advanced' ? 'bg-red-100 text-red-800' : undefined}>{course.level}</Badge><Badge variant="outline">{course.subject}</Badge></div>
    {outline.isPending ? <p role="status">Loading course outline…</p> : outline.isError ? <div role="alert"><p>{outline.error.message}</p><Button onClick={() => void outline.refetch()}>Retry outline</Button></div> : <div className="space-y-4">{outline.data.units.map(unit => {
      const isBC = course.practice_course_scope === 'BC';
      const weightMin = isBC ? unit.bc_exam_weight_min : unit.ab_exam_weight_min;
      const weightMax = isBC ? unit.bc_exam_weight_max : unit.ab_exam_weight_max;
      return <Collapsible key={unit.id} defaultOpen={unit.unit_number === 1 || unit.topics.some(t => t.id === entryId || !entryId && t.cb_topics.some(cb => cb.id === topicId) && (!initialVideoId || t.is_published))} className="rounded-lg border">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#4A90E2]/10">
          <div className="flex items-start gap-3"><Badge variant="secondary" className="mt-0.5 whitespace-nowrap">Unit {unit.unit_number}</Badge><div>
            <h2 aria-label={`Unit ${unit.unit_number}: ${unit.title}`} className="text-lg font-semibold text-[#4A90E2]">{unit.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{unit.topics.length} lessons{weightMin != null && weightMax != null ? ` · ${weightMin}–${weightMax}% of the ${isBC ? 'BC' : 'AB'} exam` : ''}</p>
          </div></div><ChevronDown className="ml-4 h-5 w-5 shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4"><div className="divide-y rounded-md border">{unit.topics.map(topic => {
          const label = <><span className="w-16 shrink-0 break-words font-mono text-sm font-semibold text-primary">{topic.code}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground">{topic.title}</p><div className="mt-1.5 flex flex-wrap gap-2">{topic.cb_topics.map(cb => <Badge key={cb.id} variant="outline" className="text-xs">CB {cb.code}</Badge>)}{topic.cb_topics.some(cb => cb.is_bc_only) && <Badge variant="secondary" className="text-xs">BC only</Badge>}</div></div></>;
          const editButton = isAdmin && <div className="flex items-center gap-2 px-4 py-2"><Badge variant="outline">{topic.is_published ? 'Published' : topic.content_id ? 'Draft' : 'No content'}</Badge><Button size="sm" variant="outline" onClick={() => setEditing(topic.id)}>Edit {topic.code}</Button></div>;
          return topic.is_published || isAdmin ? <Collapsible key={topic.id} open={activeEntryId === topic.id} onOpenChange={open => onEntryChange(open ? topic.id : null)}>
            <CollapsibleTrigger aria-label={`${topic.code} · ${topic.title}`} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30">{label}<ChevronDown aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${activeEntryId === topic.id ? 'rotate-180' : ''}`} /></CollapsibleTrigger>
            {editButton}
            <CollapsibleContent className="px-3 pb-3 sm:px-4">{activeEntryId === topic.id && <Suspense fallback={<p role="status">Loading lesson…</p>}><TopicLesson key={topic.id} course={course} entry={topic} supabaseUrl={supabaseUrl} resumeTime={resumeTime ?? undefined} initialVideoId={initialVideoId} /></Suspense>}</CollapsibleContent>
          </Collapsible> : <div key={topic.id} className="flex items-start gap-3 px-4 py-3">{label}</div>;
        })}</div></CollapsibleContent>
      </Collapsible>;
    })}</div>}
    {entryId && outline.isSuccess && !resolved && <p role="alert">This lesson is no longer available in the course outline.</p>}
    {isAdmin && editing && <Suspense fallback={<p>Loading editor…</p>}><Editor key={editing} courseId={course.id} initialEntryId={editing} onClose={() => setEditing(null)} onSaved={() => { void client.invalidateQueries({ queryKey: ['course-outline'] }); void client.invalidateQueries({ queryKey: ['course-topic'] }); void client.invalidateQueries({ queryKey: ['course-practice-counts'] }); }} /></Suspense>}

  </DialogContent></Dialog>;
}
