import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { loadCourseTopic } from '@/lib/courseContent';
import { Button } from '@/components/ui/button';
import type { Course } from './types';
const Player = lazy(() => import('./VideoPlayerWithTutor').then(m => ({ default: m.VideoPlayerWithTutor })));
export default function TopicLesson({ course, topicId, supabaseUrl, resumeTime }: { course: Course; topicId: string; supabaseUrl: string; resumeTime?: number }) {
  const { user } = useAuth();
  const [videoIndex, setVideoIndex] = useState(0);
  const lesson = useQuery({ queryKey: ['course-topic', user?.id ?? 'visitor', course.id, topicId], queryFn: () => loadCourseTopic(supabase, course.id, topicId), retry: false });
  if (lesson.isPending) return <p role="status">Loading lesson content…</p>;
  if (lesson.isError) return <div role="alert" className="space-y-2 py-3"><p>{lesson.error.message}</p><Button onClick={() => void lesson.refetch()}>Retry lesson</Button></div>;
  const video = lesson.data.videos[videoIndex] ?? lesson.data.videos[0];
  return <div className="space-y-4 pb-4">
    {lesson.data.videos.length > 1 && <div className="flex flex-wrap gap-2">{lesson.data.videos.map((v, n) => <Button key={v.id} variant={video?.id === v.id ? 'default' : 'outline'} onClick={() => setVideoIndex(n)}>{v.title}</Button>)}</div>}
    {video && <Suspense fallback={<p role="status">Loading video player…</p>}><Player key={video.id} video={video} supabaseUrl={supabaseUrl} courseSubject={course.subject} initialTime={resumeTime} showStudyHub={false} /></Suspense>}
  </div>;
}
