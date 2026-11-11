import { outlineRpc } from '@/lib/courseOutline';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CourseCard } from '@/components/courses/CourseCard';
import { CourseDetailModal } from '@/components/courses/CourseDetailModal';
import { CourseFilters, type Category, type Subject } from '@/components/courses/CourseFilters';
import { Button } from '@/components/ui/button';
import type { Course } from '@/components/courses/types';
import { CalendarClock } from 'lucide-react';

export default function Courses() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requestedEntryId = params.get('lesson');
  const requestedCourseId = params.get('course'), requestedTopicId = params.get('topic'), requestedVideoId = params.get('video');
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [category, setCategory] = useState<Category>('High School'), [subject, setSubject] = useState<Subject>('AP Calc');
  useEffect(() => { setCourses([]); }, [user?.id]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    let query = supabase.from('courses').select('id,title,description,level,subject,category,price,image_url,is_published,practice_course_scope').eq('category', category).order('created_at', { ascending: false });
    if (subject && !requestedCourseId) query = query.eq('subject', subject);
    if (requestedCourseId) query = supabase.from('courses').select('id,title,description,level,subject,category,price,image_url,is_published,practice_course_scope').eq('id', requestedCourseId!);
    void query.then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setCourses((data ?? []) as Course[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [category, subject, user?.id, retry, requestedCourseId]);
  useEffect(() => {
    let active = true;
    const videoId = requestedVideoId;
    if (!videoId || (requestedCourseId && requestedEntryId)) return;
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) { setParams({}, { replace: true }); return; }
    void Promise.resolve(requestedCourseId ? outlineRpc(supabase, 'resolve_course_entry', { _course_id: requestedCourseId, _topic_id: requestedTopicId, _video_id: videoId }).then(entry => ({ data: entry ? { course_id: requestedCourseId, entry_id: entry } : null, error: null })) : supabase.rpc('resolve_course_video', { _video_id: videoId })).then(({ data, error }) => {
      if (!active) return;
      const mapping = data as { course_id?: string; topic_id?: string; entry_id?: string } | null;
      setParams(!error && mapping?.course_id && mapping.entry_id ? { course: mapping.course_id, lesson: mapping.entry_id, video: videoId } : {}, { replace: true });
    }).catch(() => { if (active) setError(t('Could not resolve this course video. Retry the course.', '找不到这个课程视频，请重新打开课程。')); });
    return () => { active = false; };
  }, [requestedVideoId, requestedCourseId, requestedTopicId, requestedEntryId, setParams]);
  const changeEntry = useCallback((entryId: string | null) => { if (requestedCourseId) setParams({ course: requestedCourseId, ...(entryId ? { lesson: entryId } : {}), ...(entryId && requestedVideoId ? { video: requestedVideoId } : {}) }, { replace: true }); }, [requestedCourseId, requestedVideoId, setParams]);
  const selected = courses.find(c => c.id === requestedCourseId);
  const select = (course: Course) => setParams({ course: course.id });
  return <div className={`mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
    <div className="mb-8 text-center"><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('Math Courses', '数学课程')}</h1><p className="mt-3 text-lg text-muted-foreground">{t('Free video lessons that follow the official syllabus, one unit at a time.', '免费视频课，按官方大纲一个单元一个单元学。')}</p></div>
    <CourseFilters category={category} subject={subject} onCategoryChange={setCategory} onSubjectChange={setSubject} />
    {loading ? <p role="status" className="py-12 text-center text-muted-foreground">{t('Loading courses…', '课程加载中…')}</p> : error ? <div role="alert" className="space-y-3 py-12 text-center"><p>{error}</p><Button onClick={() => setRetry(n => n + 1)}>{t('Retry', '重试')}</Button></div> : <div className="mt-10 grid justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),24rem))]">{courses.map((course, i) => <CourseCard key={course.id} course={course} index={i} onSelect={select} />)}</div>}
    {!loading && !error && !courses.length && <div className="mx-auto flex max-w-xl flex-col items-center py-12 text-center">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-lg"><CalendarClock aria-hidden="true" className="h-7 w-7" /></div>
      <h2 className="text-2xl font-bold tracking-tight">{t('Coming soon', '即将上线')}</h2>
      <p className="mt-2 text-muted-foreground">{t("We're still making lessons for this one. Meanwhile, practise problems or play the Limit Arena.", '这门课还在制作中。可以先去做练习，或者去竞技场玩一局。')}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button asChild><Link to="/practice">{t('Go to Practice', '去做练习')}</Link></Button><Button variant="outline" asChild><Link to="/arena">{t('Play Limit Arena', '去竞技场')}</Link></Button></div>
    </div>}
    {selected && <CourseDetailModal key={`${user?.id ?? 'visitor'}:${selected.id}`} course={selected} supabaseUrl={SUPABASE_URL} topicId={requestedTopicId} entryId={requestedEntryId} initialVideoId={requestedVideoId ?? undefined} resumeTime={(location.state as { resumeTime?: number } | null)?.resumeTime} onEntryChange={changeEntry} onClose={() => setParams({})} />}
  </div>;
}
