import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadCourseOutline, loadCourseTopic, saveCourseTopic, youtubeId, type CourseUnit, type EditableVideo } from '@/lib/courseContent';

import { validateGameFile } from '@/lib/courseGame';
const CourseGame = lazy(() => import('@/components/courses/CourseGame'));
type ManagedCourse = { id: string; title: string; practice_course_scope: 'AB' | 'BC' | 'BOTH' | null };
type Mapping = { video_id: string; topic_id: string };
export function CourseContentManagement() {
  const [courses, setCourses] = useState<ManagedCourse[]>([]);
  const [courseId, setCourseId] = useState(''), [topicId, setTopicId] = useState('');
  const [units, setUnits] = useState<CourseUnit[]>([]);
  const [videos, setVideos] = useState<EditableVideo[]>([]), [available, setAvailable] = useState<EditableVideo[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [published, setPublished] = useState(false), [gamePath, setGamePath] = useState<string | null>(null);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const course = courses.find(c => c.id === courseId);
  const topic = units.flatMap(u => u.topics).find(t => t.id === topicId);
  useEffect(() => {
    let active = true;
    void supabase.from('courses').select('id,title,practice_course_scope').order('title').then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setCourses(data ?? []);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; setUnits([]); setTopicId(''); setAvailable([]); setMappings([]); setReady(false); setError('');
    if (!courseId) return;
    setLoading(true);
    void Promise.all([
      loadCourseOutline(supabase, courseId),
      supabase.from('course_videos').select('id,title,video_url').eq('course_id', courseId).order('title'),
      supabase.from('course_topic_videos').select('video_id,topic_id').eq('course_id', courseId),
    ]).then(([outline, list, links]) => {
      if (!active) return;
      if (list.error || links.error) throw new Error(list.error?.message ?? links.error?.message);
      setUnits(outline); setAvailable(list.data ?? []); setMappings(links.data ?? []);
    }).catch(e => { if (active) setError(String(e.message ?? e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, refresh]);
  useEffect(() => {
    let active = true; setReady(false); setVideos([]); setPublished(false); setGamePath(null); setError(''); setNotice(''); setUploadedPaths([]);
    if (!courseId || !topicId) return;
    setLoading(true);
    void loadCourseTopic(supabase, courseId, topicId).then(content => {
      if (!active) return;
      setVideos(content.videos.map(({ id, title, video_url }) => ({ id, title, video_url })));
      setPublished(content.is_published); setGamePath(content.game_path); setReady(true);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, topicId]);
  const updateVideo = (index: number, patch: Partial<EditableVideo>) => setVideos(list => list.map((v, n) => n === index ? { ...v, ...patch } : v));
  const save = async () => {
    if (!ready) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await saveCourseTopic(supabase, courseId, topicId, published, videos, gamePath);
      const content = await loadCourseTopic(supabase, courseId, topicId);
      setVideos(content.videos.map(({ id, title, video_url }) => ({ id, title, video_url })));
      const list = await supabase.from('course_videos').select('id,title,video_url').eq('course_id', courseId).order('title');
      if (list.error) throw list.error;
      setAvailable(list.data ?? []);
      const links = await supabase.from('course_topic_videos').select('video_id,topic_id').eq('course_id', courseId);
      if (links.error) throw links.error;
      setMappings(links.data ?? []);
      setUploadedPaths([]);
      setNotice(content.is_published ? 'Saved. Published changes are visible immediately.' : 'Draft saved. Students see only the Topic title.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <Card><CardHeader><CardTitle>Course Content</CardTitle><p className="text-sm text-muted-foreground">Select a canonical Topic, maintain its videos, and publish when ready. Published edits take effect on Save.</p></CardHeader>
    <CardContent className="space-y-5">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="space-y-2"><Label htmlFor="content-course">Course</Label><select id="content-course" className="w-full rounded border bg-background p-2" disabled={busy} value={courseId} onChange={e => { setCourseId(e.target.value); setTopicId(''); }}><option value="">Choose a course</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      {course && <div className="space-y-2"><Label htmlFor="content-scope">AP practice scope</Label><select id="content-scope" className="rounded border bg-background p-2" disabled={busy || loading} value={course.practice_course_scope ?? ''} onChange={async e => {
        const value = e.target.value as 'AB' | 'BC' | 'BOTH'; setBusy(true); setError('');
        try { const result = await supabase.from('courses').update({ practice_course_scope: value }).eq('id', courseId); if (result.error) throw result.error; setCourses(list => list.map(c => c.id === courseId ? { ...c, practice_course_scope: value } : c)); setRefresh(n => n + 1); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
      }}><option value="" disabled>Choose for AP Calculus</option><option value="AB">AB</option><option value="BC">BC (AB + BC content)</option><option value="BOTH">Shared AB material</option></select></div>}
      {courseId && <div className="space-y-2"><Label htmlFor="content-topic">Unit / Topic</Label><select id="content-topic" className="w-full rounded border bg-background p-2" disabled={busy || loading} value={topicId} onChange={e => setTopicId(e.target.value)}><option value="">Choose a Topic</option>{units.map(u => <optgroup key={u.id} label={`Unit ${u.unit_number}: ${u.title}`}>{u.topics.map(t => <option key={t.id} value={t.id}>{t.code} · {t.title}</option>)}</optgroup>)}</select></div>}
      {loading && <p role="status">Loading course content…</p>}
      {ready && <fieldset disabled={busy} className="space-y-4">
        <h3 className="font-semibold">{topic?.code} · {topic?.title}</h3>
        {videos.map((v, n) => {
          const shared = mappings.filter(m => m.video_id === v.id && m.topic_id !== topicId).map(m => units.flatMap(u => u.topics).find(t => t.id === m.topic_id)?.code ?? m.topic_id);
          return <div key={v.id ?? `new-${n}`} className="space-y-2 rounded border p-3">
            <Label htmlFor={`video-title-${n}`}>Video {n + 1} title</Label><Input id={`video-title-${n}`} maxLength={200} value={v.title} onChange={e => updateVideo(n, { title: e.target.value })} />
            <Label htmlFor={`video-url-${n}`}>YouTube URL</Label><Input id={`video-url-${n}`} type="url" value={v.video_url} onChange={e => updateVideo(n, { video_url: e.target.value })} />
            {shared.length > 0 && <p className="text-sm text-amber-700">Shared with Topic {shared.join(', ')}. Editing this video also updates those lessons.</p>}
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!n} onClick={() => setVideos(list => { const copy = [...list]; [copy[n - 1], copy[n]] = [copy[n], copy[n - 1]]; return copy; })}>Move up</Button><Button type="button" variant="outline" onClick={() => setVideos(list => list.filter((_, i) => i !== n))}>Remove from this lesson</Button></div>
          </div>;
        })}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setVideos(list => [...list, { title: '', video_url: '' }])}>Add YouTube video</Button>
          <select aria-label="Link existing course video" className="max-w-full rounded border bg-background p-2" value="" onChange={e => { const v = available.find(v => v.id === e.target.value); if (v) setVideos(list => [...list, v]); }}><option value="">Link existing course video</option>{available.filter(v => !videos.some(item => item.id === v.id)).map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select></div>
        <div className="space-y-2 rounded border p-3"><Label htmlFor="lesson-game">HTML game (optional)</Label><Input id="lesson-game" type="file" accept=".html,text/html" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          setBusy(true); setError('');
          const path = `${courseId}/${topicId}/${crypto.randomUUID()}.html`;
          try {
            validateGameFile(file);
            const result = await supabase.storage.from('course-games').upload(path, file, { contentType: 'text/html', upsert: false });
            if (result.error) throw result.error;
            setGamePath(path); setUploadedPaths(paths => [...paths, path]); setNotice('Game uploaded. Save lesson to attach it.');
          } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }} /><p className="text-sm text-muted-foreground">One self-contained .html, up to 5 MiB. Embed scripts, styles and images; external requests and host storage are unavailable. Upload first, then Save.</p>
          {gamePath && <div className="flex items-center gap-2"><span>Game attached in this edit</span><Button type="button" variant="outline" onClick={() => setGamePath(null)}>Remove game from lesson</Button></div>}
          {uploadedPaths.some(path => path !== gamePath) && <Button type="button" variant="outline" onClick={async () => {
            setBusy(true); setError(''); try { const unused = uploadedPaths.filter(path => path !== gamePath); const result = await supabase.storage.from('course-games').remove(unused); if (result.error) throw result.error; setUploadedPaths(paths => paths.filter(path => path === gamePath)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Delete unused uploads from this edit</Button>}
        </div>
        <div className="flex items-center gap-2"><Checkbox id="content-published" checked={published} onCheckedChange={v => setPublished(v === true)} /><Label htmlFor="content-published">Published (unchecked = Draft)</Label></div>
        <p className="text-sm text-muted-foreground">Practice links are derived from this Topic. Notes are outside this release.</p>
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPreview(true)}>Preview lesson</Button><Button type="button" onClick={() => void save()}>{busy ? 'Saving…' : 'Save lesson'}</Button></div>
      </fieldset>}
      <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Preview: {topic?.code} · {topic?.title}</DialogTitle></DialogHeader><p className="text-sm">Unsaved preview · {published ? 'Published on Save' : 'Draft'}</p>{videos.map((v, n) => <div key={n} className="space-y-2"><h3>{v.title}</h3>{youtubeId(v.video_url) ? <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${youtubeId(v.video_url)}`} title={`Preview ${v.title}`} allowFullScreen /> : <p>Enter a valid YouTube URL.</p>}</div>)}{gamePath && <Suspense fallback={<p>Loading game preview…</p>}><CourseGame path={gamePath} /></Suspense>}</DialogContent></Dialog>
    </CardContent></Card>;
}
