import { lazy, Suspense, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadCourseOutline } from '@/lib/courseContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Course } from './types';
const TopicLesson = lazy(() => import('./TopicLesson'));
interface Props { course: Course; onClose: () => void; supabaseUrl: string; topicId?: string | null; onTopicChange: (id: string | null) => void; resumeTime?: number | null; initialVideoId?: string }
export function CourseDetailModal({ course, onClose, supabaseUrl, topicId, onTopicChange, resumeTime, initialVideoId }: Props) {
  const { user } = useAuth();
  const client = useQueryClient();
  const account = user?.id ?? 'visitor';
  const outline = useQuery({ queryKey: ['course-outline', account, course.id], queryFn: () => loadCourseOutline(supabase, course.id), retry: false });
  useEffect(() => () => {
    client.removeQueries({ queryKey: ['course-outline', account, course.id] });
    client.removeQueries({ queryKey: ['course-topic', account, course.id] });
  }, [client, account, course.id]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] w-[96vw] max-w-6xl overflow-y-auto">
    <DialogHeader><DialogTitle className="text-2xl">{course.title}</DialogTitle><DialogDescription>{course.description}</DialogDescription></DialogHeader>
    {outline.isPending ? <p role="status">Loading course outline…</p> : outline.isError ? <div role="alert"><p>{outline.error.message}</p><Button onClick={() => void outline.refetch()}>Retry outline</Button></div> : <div className="space-y-4">{outline.data.map(unit => <section key={unit.id} className="rounded-lg border p-3 sm:p-4"><h2 className="mb-3 text-lg font-semibold">Unit {unit.unit_number}: {unit.title}</h2><div className="divide-y">{unit.topics.map(topic => topic.is_published ? <Collapsible key={topic.id} open={topicId === topic.id} onOpenChange={open => onTopicChange(open ? topic.id : null)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 py-3 text-left font-medium"><span>{topic.code} · {topic.title}</span><span aria-hidden>{topicId === topic.id ? '−' : '+'}</span></CollapsibleTrigger>
      <CollapsibleContent>{topicId === topic.id && <Suspense fallback={<p role="status">Loading lesson…</p>}><TopicLesson key={topic.id} course={course} topicId={topic.id} supabaseUrl={supabaseUrl} resumeTime={resumeTime ?? undefined} initialVideoId={initialVideoId} /></Suspense>}</CollapsibleContent>
    </Collapsible> : <div key={topic.id} className="py-3 text-sm text-muted-foreground">{topic.code} · {topic.title}</div>)}</div></section>)}</div>}
  </DialogContent></Dialog>;
}
