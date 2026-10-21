import { useEffect, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CourseCard } from '@/components/courses/CourseCard';
import { CourseDetailModal } from '@/components/courses/CourseDetailModal';
import { CourseFilters, type Category, type Subject } from '@/components/courses/CourseFilters';
import { Button } from '@/components/ui/button';
import type { Course } from '@/components/courses/types';
import apCalculusThumbnail from '@/assets/ap-calculus-thumbnail.jpg';

export default function Courses() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requestedCourseId = params.get('course'), requestedTopicId = params.get('topic'), requestedVideoId = params.get('video');
  const { user } = useAuth();
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
    if (!videoId || (requestedCourseId && requestedTopicId)) return;
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) { setParams({}, { replace: true }); return; }
    void supabase.rpc('resolve_course_video', { _video_id: videoId }).then(({ data, error }) => {
      if (!active) return;
      const mapping = data as { course_id?: string; topic_id?: string } | null;
      setParams(!error && mapping?.course_id && mapping.topic_id ? { course: mapping.course_id, topic: mapping.topic_id, video: videoId } : {}, { replace: true });
    });
    return () => { active = false; };
  }, [requestedVideoId, requestedCourseId, requestedTopicId, setParams]);
  const selected = courses.find(c => c.id === requestedCourseId);
  const select = (course: Course) => setParams({ course: course.id });
  return <div className="container mx-auto min-h-screen px-4 py-10">
    <div className="mb-8 text-center"><h1 className="text-4xl font-bold">Math Courses</h1><p className="mt-3 text-muted-foreground">Explore mathematics by Unit and Topic.</p></div>
    <CourseFilters category={category} subject={subject} onCategoryChange={setCategory} onSubjectChange={setSubject} />
    {loading ? <p role="status" className="py-8">Loading courses…</p> : error ? <div role="alert" className="space-y-3 py-8"><p>{error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry</Button></div> : <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{courses.map(course => <CourseCard key={course.id} course={course} thumbnail={course.subject === 'AP Calc' ? apCalculusThumbnail : undefined} onSelect={select} />)}</div>}
    {!loading && !error && !courses.length && <p className="py-8 text-center text-muted-foreground">No published courses in this category.</p>}
    {selected && <CourseDetailModal key={`${user?.id ?? 'visitor'}:${selected.id}`} course={selected} supabaseUrl={SUPABASE_URL} topicId={requestedTopicId} initialVideoId={requestedVideoId ?? undefined} resumeTime={(location.state as { resumeTime?: number } | null)?.resumeTime} onTopicChange={topicId => setParams({ course: selected.id, ...(topicId ? { topic: topicId } : {}) }, { replace: true })} onClose={() => setParams({})} />}
  </div>;
}
