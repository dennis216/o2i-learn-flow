import { Link } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { loadOutlineEntry, type OutlineEntry } from '@/lib/courseOutline';
import { Button } from '@/components/ui/button';
import type { Course } from './types';
const CourseGame = lazy(() => import('./CourseGame'));
const Player = lazy(() => import('./VideoPlayerWithTutor').then(m => ({ default: m.VideoPlayerWithTutor })));
export default function TopicLesson({ course, entry, supabaseUrl, resumeTime, initialVideoId }: { course: Course; entry: OutlineEntry; supabaseUrl: string; resumeTime?: number; initialVideoId?: string }) {
  const { user } = useAuth();
  const { t: tr } = useLanguage();
  const [selectedVideoId, setSelectedVideoId] = useState(initialVideoId);
  const [gameOpen, setGameOpen] = useState(false);
  const practice = useQuery({ queryKey: ['course-practice-counts', user?.id ?? 'visitor', course.id], queryFn: async () => { const { data, error } = await supabase.rpc('list_course_practice_topics', { _course_id: course.id }); if (error) throw new Error(error.message); if (!Array.isArray(data) || data.some(t => !t || typeof t !== 'object' || Array.isArray(t) || typeof t.id !== 'string' || typeof t.question_count !== 'number' || !Number.isInteger(t.question_count) || t.question_count < 0)) throw new Error('Invalid practice availability response.'); return data as unknown as { id: string; question_count: number }[]; }, retry: false });
  const lesson = useQuery({ queryKey: ['course-topic', user?.id ?? 'visitor', course.id, entry.id], queryFn: () => loadOutlineEntry(supabase, course.id, entry.id), retry: false });
  if (lesson.isPending) return <p role="status">{tr('Loading lesson content…', '课节内容加载中…')}</p>;
  if (lesson.isError) return <div role="alert" className="space-y-2 py-3"><p>{lesson.error.message}</p><Button onClick={() => void lesson.refetch()}>{tr('Retry lesson', '重新加载课节')}</Button></div>;
  const video = lesson.data.videos.find(v => v.id === selectedVideoId) ?? lesson.data.videos[0];
  return <div className="space-y-4 pb-4">
    {lesson.data.videos.length > 1 && <div className="flex flex-wrap gap-2">{lesson.data.videos.map((v, n) => <Button key={v.id} variant={video?.id === v.id ? 'default' : 'outline'} onClick={() => setSelectedVideoId(v.id)}>{v.title}</Button>)}</div>}
    {practice.isPending && <p role="status">{tr('Checking practice availability…', '正在加载练习…')}</p>}
    {practice.isError && <p role="alert">{tr('Practice availability could not be checked. ', '练习题加载失败。')}<button className="underline" onClick={() => void practice.refetch()}>{tr('Retry practice availability', '重试')}</button></p>}
    {practice.isSuccess && <div className="flex flex-wrap gap-2">{entry.cb_topics.map(topic => practice.data.some(t => t.id === topic.id && t.question_count > 0) ? <Button asChild key={topic.id}><Link to={'/quiz?' + new URLSearchParams({ course: course.id, topic: topic.id, lesson: entry.id, source: 'course', mode: 'continuous' })}>{entry.cb_topics.length === 1 ? tr('Start practice', '开始练习') : tr(`Practice CB ${topic.code}`, `练习 CB ${topic.code}`)}</Link></Button> : <p key={topic.id} className="rounded border bg-muted/30 p-3 text-sm">{entry.cb_topics.length > 1 ? `CB ${topic.code}: ` : ''}{tr('Practice for this topic is being prepared. Stay tuned.', '这个 Topic 的练习正在准备中，敬请期待。')}</p>)}</div>}
    {video && <Suspense fallback={<p role="status">{tr('Loading video player…', '播放器加载中…')}</p>}><Player key={video.id} video={video} supabaseUrl={supabaseUrl} courseSubject={course.subject} initialTime={video.id === initialVideoId ? resumeTime : undefined} showStudyHub={false} /></Suspense>}
    {lesson.data.game_path && <section className="space-y-3"><Button variant="outline" onClick={() => setGameOpen(v => !v)}>{gameOpen ? tr('Close game', '关闭游戏') : tr('Start game', '开始游戏')}</Button>{gameOpen && <Suspense fallback={<p role="status">{tr('Loading game…', '游戏加载中…')}</p>}><CourseGame path={lesson.data.game_path} /></Suspense>}</section>}
  </div>;
}
