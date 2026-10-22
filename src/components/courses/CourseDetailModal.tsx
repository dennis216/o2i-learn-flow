import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadCourseOutline, listSavedCourseLessons } from '@/lib/courseContent';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Course } from './types';
const Editor = lazy(() => import('@/components/admin/CourseContentManagement').then(m => ({ default: m.CourseContentManagement })));
const TopicLesson = lazy(() => import('./TopicLesson'));
interface Props { course: Course; onClose: () => void; supabaseUrl: string; topicId?: string | null; onTopicChange: (id: string | null) => void; resumeTime?: number | null; initialVideoId?: string }
export function CourseDetailModal({ course, onClose, supabaseUrl, topicId, onTopicChange, resumeTime, initialVideoId }: Props) {
  const { user, isAdmin } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const managed = useQuery({ queryKey: ['course-saved', user?.id, course.id], enabled: isAdmin, queryFn: () => listSavedCourseLessons(supabase) });
  const client = useQueryClient();
  const account = user?.id ?? 'visitor';
  const outline = useQuery({ queryKey: ['course-outline', account, course.id], queryFn: () => loadCourseOutline(supabase, course.id), retry: false });
  useEffect(() => () => {
    client.removeQueries({ queryKey: ['course-outline', account, course.id] });
    client.removeQueries({ queryKey: ['course-topic', account, course.id] });
  }, [client, account, course.id]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="data-[state=open]:animate-none data-[state=closed]:animate-none inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 transform-none overflow-y-auto rounded-none p-3 pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-none sm:p-5">
    <DialogHeader><DialogTitle className="text-3xl">{course.title}</DialogTitle><DialogDescription>{course.description}</DialogDescription></DialogHeader>
    <div className="flex gap-2"><Badge variant="secondary" className={course.level === 'advanced' ? 'bg-red-100 text-red-800' : undefined}>{course.level}</Badge><Badge variant="outline">{course.subject}</Badge></div>
    {managed.isError && <p role="alert">Saved content status could not be loaded. <Button variant="outline" onClick={() => void managed.refetch()}>Retry saved content</Button></p>}
    {outline.isPending ? <p role="status">Loading course outline…</p> : outline.isError ? <div role="alert"><p>{outline.error.message}</p><Button onClick={() => void outline.refetch()}>Retry outline</Button></div> : <div className="space-y-4">{outline.data.map(unit => {
      const isBC = course.practice_course_scope === 'BC';
      const weightMin = isBC ? unit.bc_exam_weight_min : unit.ab_exam_weight_min;
      const weightMax = isBC ? unit.bc_exam_weight_max : unit.ab_exam_weight_max;
      return <Collapsible key={unit.id} defaultOpen={unit.unit_number === 1 || unit.topics.some(t => t.id === topicId)} className="rounded-lg border">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#4A90E2]/10">
          <div className="flex items-start gap-3"><Badge variant="secondary" className="mt-0.5 whitespace-nowrap">Unit {unit.unit_number}</Badge><div>
            <h2 aria-label={`Unit ${unit.unit_number}: ${unit.title}`} className="text-lg font-semibold text-[#4A90E2]">{unit.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{unit.topics.length} topics{weightMin != null && weightMax != null ? ` · ${weightMin}–${weightMax}% of the ${isBC ? 'BC' : 'AB'} exam` : ''}</p>
          </div></div><ChevronDown className="ml-4 h-5 w-5 shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4"><div className="divide-y rounded-md border">{unit.topics.map(topic => {
          const label = <><span className="min-w-12 font-mono text-sm font-semibold text-primary">{topic.code}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground">{topic.title}</p><div className="mt-1.5 flex gap-2">{topic.big_idea && <Badge variant="outline" className="text-xs">{topic.big_idea}</Badge>}{topic.is_bc_only && <Badge variant="secondary" className="text-xs">BC only</Badge>}</div></div></>;
          const editButton = isAdmin && <div className="flex items-center gap-2 px-4 py-2"><Badge variant="outline">{topic.is_published ? 'Published' : managed.data?.some(l => l.topic_id === topic.id && l.courses.some(c => c.id === course.id)) ? 'Draft' : 'No content'}</Badge><Button size="sm" variant="outline" onClick={() => setEditing(topic.id)}>Edit {topic.code}</Button></div>;
          return topic.is_published || isAdmin ? <Collapsible key={topic.id} open={topicId === topic.id} onOpenChange={open => onTopicChange(open ? topic.id : null)}>
            <CollapsibleTrigger aria-label={`${topic.code} · ${topic.title}`} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30">{label}<ChevronDown aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${topicId === topic.id ? 'rotate-180' : ''}`} /></CollapsibleTrigger>
            {editButton}
            <CollapsibleContent className="px-3 pb-3 sm:px-4">{topicId === topic.id && <Suspense fallback={<p role="status">Loading lesson…</p>}><TopicLesson key={topic.id} course={course} topicId={topic.id} supabaseUrl={supabaseUrl} resumeTime={resumeTime ?? undefined} initialVideoId={initialVideoId} /></Suspense>}</CollapsibleContent>
          </Collapsible> : <div key={topic.id} className="flex items-start gap-3 px-4 py-3">{label}</div>;
        })}</div></CollapsibleContent>
      </Collapsible>;
    })}</div>}
    {isAdmin && <Dialog open={!!editing} onOpenChange={open => { if (!open && !editorBusy && (!editorDirty || window.confirm('Discard unsaved lesson changes?'))) setEditing(null); }}><DialogContent className="max-h-[95dvh] w-[96vw] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Edit lesson content</DialogTitle></DialogHeader>{editing && <Suspense fallback={<p>Loading editor…</p>}><Editor key={editing} initialCourseId={course.id} initialTopicId={editing} onDirtyChange={setEditorDirty} onBusyChange={setEditorBusy} onSaved={() => { void client.invalidateQueries({ queryKey: ['course-outline'] }); void client.invalidateQueries({ queryKey: ['course-topic'] }); void client.invalidateQueries({ queryKey: ['course-saved'] }); void client.invalidateQueries({ queryKey: ['course-practice-counts'] }); }} /></Suspense>}</DialogContent></Dialog>}
  </DialogContent></Dialog>;
}
