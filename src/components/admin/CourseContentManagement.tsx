import { loadCustomOutline, loadOutlineEntry, saveOutlineContent, outlineRpc } from '@/lib/courseOutline';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadCourseOutline, loadCourseTopic, saveCourseTopic, youtubeId, listSavedCourseLessons, shareCourseLesson, restoreCourseLesson, type SavedCourseLesson, type TopicContent, type CourseUnit, type EditableVideo } from '@/lib/courseContent';

import { validateGameFile } from '@/lib/courseGame';
const CourseGame = lazy(() => import('@/components/courses/CourseGame'));
type ManagedCourse = { id: string; title: string; practice_course_scope: 'AB' | 'BC' | 'BOTH' | null };
export function CourseContentManagement({ initialCourseId = '', initialTopicId = '', initialEntryId = '', onSaved, onDirtyChange, onBusyChange }: { initialCourseId?: string; initialTopicId?: string; initialEntryId?: string; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const pendingTopic = useRef(initialEntryId || initialTopicId);
  const [courses, setCourses] = useState<ManagedCourse[]>([]);
  const [courseId, setCourseId] = useState(initialCourseId), [topicId, setTopicId] = useState('');
  const [units, setUnits] = useState<CourseUnit[]>([]);
  const [videos, setVideos] = useState<EditableVideo[]>([]), [available, setAvailable] = useState<EditableVideo[]>([]);
  const [content, setContent] = useState<TopicContent | null>(null);
  const [sharingWith, setSharingWith] = useState<TopicContent | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [sharingPreview, setSharingPreview] = useState<string | null>(null);
  const [published, setPublished] = useState(false), [gamePath, setGamePath] = useState<string | null>(null);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [savedLessons, setSavedLessons] = useState<SavedCourseLesson[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const snapshot = JSON.stringify({ videos, published, gamePath });
  const dirty = ready && snapshot !== savedSnapshot;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, busy, onDirtyChange]);
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (!initialEntryId && (dirty || busy)) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, busy, initialEntryId]);
  useEffect(() => { const guard = (e: MouseEvent) => { const link = (e.target as Element).closest?.('a[href]'); if (!initialEntryId && (dirty || busy) && link && link.getAttribute('target') !== '_blank' && link.getAttribute('href') !== window.location.pathname + window.location.search && (busy || !window.confirm('Discard unsaved lesson changes?'))) { e.preventDefault(); e.stopPropagation(); } }; document.addEventListener('click', guard, true); return () => document.removeEventListener('click', guard, true); }, [dirty, busy, initialEntryId]);
  useEffect(() => {
    if (initialEntryId || !dirty && !busy) return;
    const originalIndex = window.history.state?.idx;
    let restoring = false;
    const guard = (e: PopStateEvent) => {
      if (restoring) { restoring = false; e.stopImmediatePropagation(); return; }
      const nextIndex = window.history.state?.idx;
      if (typeof originalIndex !== 'number' || typeof nextIndex !== 'number' || originalIndex === nextIndex) return;
      if (busy || !window.confirm('Discard unsaved lesson changes?')) { e.stopImmediatePropagation(); restoring = true; window.history.go(originalIndex - nextIndex); }
    };
    window.addEventListener('popstate', guard, true);
    return () => window.removeEventListener('popstate', guard, true);
  }, [dirty, busy, initialEntryId]);
  const canLeave = () => !busy && (!dirty || window.confirm('Discard unsaved lesson changes?'));
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const readContent = useCallback((cid: string, tid: string) => initialEntryId ? loadOutlineEntry(supabase, cid, tid) : loadCourseTopic(supabase, cid, tid), [initialEntryId]);
  const reloadSaved = useCallback(async () => { if (!initialEntryId) setSavedLessons(await listSavedCourseLessons(supabase)); }, [initialEntryId]);
  const applyContent = (c: TopicContent) => { const list = c.videos.map(({ id, title, video_url }) => ({ id, title, video_url })); setContent(c); setVideos(list); setPublished(c.is_published); setGamePath(c.game_path); setSavedSnapshot(JSON.stringify({ videos: list, published: c.is_published, gamePath: c.game_path })); };
  const reloadCurrent = async () => { applyContent(await readContent(courseId, topicId)); await reloadSaved(); onSaved?.(); };
  useEffect(() => { void reloadSaved().catch(e => setError(e.message)); }, [reloadSaved]);
  const course = courses.find(c => c.id === courseId);
  const topic = units.flatMap(u => u.topics).find(t => t.id === topicId);
  const shared = (content?.linked_courses?.length ?? 0) > 1;
  const sharingCourses = topic && !topic.is_bc_only ? courses.filter(c => c.id !== courseId && ((course?.practice_course_scope === 'AB' && c.practice_course_scope === 'BC') || (course?.practice_course_scope === 'BC' && c.practice_course_scope === 'AB'))) : [];
  useEffect(() => {
    let active = true;
    void supabase.from('courses').select('id,title,practice_course_scope').order('title').then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setCourses(data ?? []);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; setUnits([]); setTopicId(''); setAvailable([]); setReady(false); setError('');
    if (!courseId) return;
    setLoading(true);
    void Promise.all([
      initialEntryId ? loadCustomOutline(supabase, courseId).then(o => o.units.map(u => ({ ...u, topics: u.topics.map(t => ({ ...t, is_bc_only: t.cb_topics.some(cb => cb.is_bc_only) })) }))) : loadCourseOutline(supabase, courseId),
      supabase.from('course_videos').select('id,title,video_url').eq('course_id', courseId).order('title'),
    ]).then(([outline, list]) => {
      if (!active) return;
      if (list.error) throw new Error(list.error.message);
      setUnits(outline); setAvailable(list.data ?? []); setTopicId(pendingTopic.current); pendingTopic.current = '';
    }).catch(e => { if (active) setError(String(e.message ?? e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, initialCourseId, initialTopicId, initialEntryId]);
  useEffect(() => {
    let active = true; setReady(false); setContent(null); setVideos([]); setPublished(false); setGamePath(null); setError(''); setNotice(''); setUploadedPaths([]);
    if (!courseId || !topicId) return;
    setLoading(true);
    void readContent(courseId, topicId).then(content => {
      if (!active) return;
      applyContent(content); setReady(true);
      void supabase.from('course_videos').select('id,title,video_url').eq('course_id', content.owner_course_id ?? courseId).order('title').then(({data, error}) => { if (!active) return; if (error) setError(error.message); else setAvailable(data ?? []); });
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, topicId, readContent]);
  const updateVideo = (index: number, patch: Partial<EditableVideo>) => setVideos(list => list.map((v, n) => n === index ? { ...v, ...patch } : v));
  const save = async () => {
    if (!ready) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (initialEntryId && content) await saveOutlineContent(supabase, content, published, videos, gamePath);
      else await saveCourseTopic(supabase, courseId, topicId, published, videos, gamePath, content ?? undefined);
      const savedContent = await readContent(courseId, topicId);
      applyContent(savedContent);
      const list = await supabase.from('course_videos').select('id,title,video_url').eq('course_id', savedContent.owner_course_id ?? courseId).order('title');
      if (list.error) throw list.error;
      setAvailable(list.data ?? []);
      setUploadedPaths([]);
      setSavedSnapshot(JSON.stringify({ videos: savedContent.videos.map(({ id, title, video_url }) => ({ id, title, video_url })), published: savedContent.is_published, gamePath: savedContent.game_path }));
      await reloadSaved(); onSaved?.();
      setNotice(savedContent.is_published ? 'Saved. Published changes are visible immediately.' : 'Draft saved. Students see only the Topic title.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const changeAvailability = async (value: string) => {
    if (!content?.lesson_id || busy || dirty) return;
    if (value === 'bc' && !window.confirm('Create a BC-only unpublished draft? AB keeps its current content. Publish the BC draft when ready.')) return;
    setBusy(true); setError('');
    try {
      if (value === 'bc' && course?.practice_course_scope === 'BC' && shared) {
        if (initialEntryId) await outlineRpc(supabase, 'link_course_outline_content', { _entry_id: initialEntryId, _source_entry_id: initialEntryId, _expected_content_id: content.lesson_id, _expected_revision: content.revision, _source_content_id: content.lesson_id, _source_revision: content.revision, _independent: true });
        else await restoreCourseLesson(supabase, content, { lesson_id: content.lesson_id, revision: content.revision! });
        await reloadCurrent(); setNotice('BC-only draft created. AB keeps its current content. Preview and publish the BC draft when ready.');
      } else {
        const targetCourse = sharingCourses.find(c => c.id === value);
        if (!targetCourse) return;
        let other: TopicContent;
        if (initialEntryId) {
          const [ownOutline, otherOutline] = await Promise.all([loadCustomOutline(supabase, courseId), loadCustomOutline(supabase, targetCourse.id)]);
          const ids = ownOutline.units.flatMap(u => u.topics).find(e => e.id === initialEntryId)?.cb_topics.map(t => t.id).sort().join(',');
          const target = otherOutline.units.flatMap(u => u.topics).find(e => e.cb_topics.map(t => t.id).sort().join(',') === ids);
          if (!target) throw new Error('No matching lesson in the other course. Configure the same CB Topics there first.');
          other = await loadOutlineEntry(supabase, targetCourse.id, target.id);
        } else other = await loadCourseTopic(supabase, targetCourse.id, topicId);
        setUseOther(false); setSharingWith(other);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const failure = error && <div role="alert" className="space-y-2 text-destructive"><p>{error}</p>{ready && <Button variant="outline" disabled={busy} onClick={async () => { if (!canLeave()) return; setBusy(true); try { await reloadCurrent(); setError(''); setNotice('Reloaded saved lesson.'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>Reload saved lesson</Button>}</div>;
  return <Card><CardHeader><CardTitle>Course Content</CardTitle><p className="text-sm text-muted-foreground">Maintain lesson videos and publish when ready. Published edits take effect on Save.</p></CardHeader>
    <CardContent className="space-y-5">
      {!ready && failure}

      {!initialEntryId && <div className="space-y-2"><Label htmlFor="content-course">Course</Label><select id="content-course" className="w-full rounded border bg-background p-2" disabled={busy || !!initialCourseId} value={courseId} onChange={e => { if (canLeave()) { setCourseId(e.target.value); setTopicId(''); } }}><option value="">Choose a course</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>}
      {!initialCourseId && <section aria-label="Saved course content" className="space-y-2 rounded border p-3"><h3 className="font-semibold">Saved content</h3><select aria-label="Saved content status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded border bg-background p-2"><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Unlinked content</option></select><div className="flex flex-wrap gap-2">{savedLessons.filter(l => (!courseId || l.courses.some(c => c.id === courseId) || l.owner_course_id === courseId && l.archived) && (statusFilter === 'all' || statusFilter === 'archived' ? statusFilter === 'all' || l.archived : !l.archived && l.is_published === (statusFilter === 'published'))).map(l => <Button key={l.lesson_id} variant="outline" disabled={busy} onClick={async () => {
        if (!canLeave()) return;
        const target = l.archived ? courseId || l.owner_course_id : l.courses.find(c => c.id === courseId)?.id ?? l.courses[0].id;
        if (l.archived) {
          if (!window.confirm('Restore this saved content as an unpublished draft? Any current lesson is kept in Saved content.')) return;
          setBusy(true); setError('');
          try { const existing = await loadCourseTopic(supabase, target, l.topic_id); await restoreCourseLesson(supabase, existing, l); await reloadSaved(); if (target === courseId && l.topic_id === topicId) await reloadCurrent(); }
          catch (e) { setError(e instanceof Error ? e.message : String(e)); return; } finally { setBusy(false); }
        }
        if (target === courseId) setTopicId(l.topic_id); else { pendingTopic.current = l.topic_id; setCourseId(target); }
      }}>{l.courses.map(c => c.title).join(' / ') || l.owner_course_title} · {l.topic_code} · {l.archived ? 'Restore draft' : l.is_published ? 'Published' : 'Draft'}</Button>)}</div>{!savedLessons.length && <p>No saved lessons yet.</p>}</section>}
      {courseId && !initialEntryId && <div className="space-y-2"><Label htmlFor="content-topic">Unit / Topic</Label><select id="content-topic" className="w-full rounded border bg-background p-2" disabled={busy || loading || !!initialTopicId} value={topicId} onChange={e => { if (canLeave()) setTopicId(e.target.value); }}><option value="">Choose a Topic</option>{units.map(u => <optgroup key={u.id} label={`Unit ${u.unit_number}: ${u.title}`}>{u.topics.map(t => <option key={t.id} value={t.id}>{t.code} · {t.title} · {savedLessons.some(l => l.courses.some(c => c.id === courseId) && l.topic_id === t.id) ? savedLessons.find(l => l.courses.some(c => c.id === courseId) && l.topic_id === t.id)?.is_published ? 'Published' : 'Draft' : 'No content'}</option>)}</optgroup>)}</select></div>}
      {loading && <p role="status">Loading course content…</p>}
      {ready && content && <section aria-label="Content availability" className="space-y-2 rounded border p-3"><h3 className="font-semibold">Content availability</h3>
        {course?.practice_course_scope === 'AB' || course?.practice_course_scope === 'BC' ? <>
          <Label htmlFor="lesson-availability">Used in</Label>
          <select id="lesson-availability" className="w-full rounded border bg-background p-2" value={shared ? 'shared' : course.practice_course_scope === 'BC' ? 'bc' : ''} disabled={busy || dirty || !content.lesson_id || course.practice_course_scope === 'AB' && shared || !!topic?.is_bc_only} onChange={e => void changeAvailability(e.target.value)}>
            {!shared && course.practice_course_scope === 'AB' && <option value="" disabled>Choose availability</option>}
            {shared ? <option value="shared">AB / BC shared</option> : sharingCourses.map(c => <option key={c.id} value={c.id}>AB / BC shared{sharingCourses.length > 1 ? ` · ${c.title}` : ''}</option>)}
            {course.practice_course_scope === 'BC' && <option value="bc">BC only</option>}
          </select>
          {shared ? <p>Both courses use this content. Editing, publishing or withdrawing affects both. Lesson titles and outline order remain separate.</p> : topic?.is_bc_only ? <p>This lesson includes BC-only CB Topics and cannot be shared with AB.</p> : course.practice_course_scope === 'BC' ? <p>This content is currently used only in BC. Choose AB / BC shared to use the same content in both courses.</p> : <p>This content has not been shared yet. Choose AB / BC shared and review the other course before confirming.</p>}
          {!content.lesson_id && !topic?.is_bc_only && <p>Save a draft before sharing content.</p>}
          {!shared && !topic?.is_bc_only && !sharingCourses.length && <p role="alert">No matching AB / BC course is configured. Check the course curriculum templates.</p>}
        </> : <p>Only {course?.title}</p>}
        {dirty && <p className="text-sm">Save your edits before changing content availability.</p>}
      </section>}
      <Dialog open={!!sharingWith} onOpenChange={open => { if (!open && !busy) setSharingWith(null); }}><DialogContent scrollable className="max-h-[90dvh]"><DialogHeader><DialogTitle>Share AB and BC content</DialogTitle></DialogHeader>
      <DialogBody>{error && <p role="alert" className="text-destructive">{error}</p>}<p>Both courses will use one lesson, including its publication status. Future edits, publishing and withdrawal affect both.</p>{sharingWith && <><div className="rounded border p-3"><p className="font-semibold">Current course · {content?.is_published ? 'Published' : 'Draft'}</p>{content?.videos.map(v => <p key={v.id}>{v.title} · <a className="underline" href={v.video_url} target="_blank" rel="noreferrer">View video</a></p>)}<p>Game: {content?.game_path ? 'Attached' : 'None'}</p>{content?.game_path && <Button variant="outline" onClick={() => setSharingPreview(content.game_path)}>Preview current game</Button>}</div><div className="rounded border p-3"><p className="font-semibold">{courses.find(c => c.id === sharingWith.course_id)?.title} · {sharingWith.lesson_id ? sharingWith.is_published ? 'Published' : 'Draft' : 'No content'}</p>{sharingWith.videos.map(v => <p key={v.id}>{v.title} · <a className="underline" href={v.video_url} target="_blank" rel="noreferrer">View video</a></p>)}<p>Game: {sharingWith.game_path ? 'Attached' : 'None'}</p>{sharingWith.game_path && <Button variant="outline" onClick={() => setSharingPreview(sharingWith.game_path)}>Preview other game</Button>}</div>{sharingWith.lesson_id && <><p>These are different saved lessons. The unselected lesson stays recoverable in Saved content.</p><Label htmlFor="sharing-source">Content to keep in both courses</Label><select id="sharing-source" disabled={busy} value={useOther ? 'other' : 'current'} onChange={e => setUseOther(e.target.value === 'other')} className="rounded border bg-background p-2"><option value="current">Use current course content</option><option value="other">Use other course content</option></select></>}<Button disabled={busy} onClick={async () => { if (!content) return; setBusy(true); setError(''); try { if (initialEntryId) {
          const target = useOther ? content : sharingWith, source = useOther ? sharingWith : content;
          await outlineRpc(supabase, 'link_course_outline_content', { _entry_id: target.entry_id, _source_entry_id: source.entry_id, _expected_content_id: target.lesson_id ?? null, _expected_revision: target.revision, _source_content_id: source.lesson_id, _source_revision: source.revision, _independent: false });
        } else await shareCourseLesson(supabase, content, sharingWith, useOther); setSharingWith(null); await reloadCurrent(); setNotice('Saved. AB and BC now share this lesson and its publication status.'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>{busy ? 'Sharing…' : 'Confirm shared content'}</Button></>}</DialogBody>
    </DialogContent></Dialog>
      <Dialog open={!!sharingPreview} onOpenChange={open => { if (!open) setSharingPreview(null); }}><DialogContent scrollable className="data-[state=open]:animate-none data-[state=closed]:animate-none inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 transform-none rounded-none sm:rounded-none"><DialogHeader><DialogTitle>Saved game preview</DialogTitle></DialogHeader>
      <DialogBody>{sharingPreview && <Suspense fallback={<p>Loading saved game…</p>}><CourseGame path={sharingPreview} /></Suspense>}</DialogBody>
    </DialogContent></Dialog>
      {ready && <fieldset disabled={busy} className="space-y-4">
        <h3 className="font-semibold">{topic?.code} · {topic?.title}</h3>
        {videos.map((v, n) => {
          const shared = content?.shared_video_topics?.filter(m => m.video_id === v.id).map(m => m.topic_code) ?? [];
          return <div key={v.id ?? `new-${n}`} className="space-y-2 rounded border p-3">
            <Label htmlFor={`video-title-${n}`}>Video {n + 1} title</Label><Input id={`video-title-${n}`} maxLength={200} value={v.title} onChange={e => updateVideo(n, { title: e.target.value })} />
            <Label htmlFor={`video-url-${n}`}>YouTube URL</Label><Input id={`video-url-${n}`} type="url" value={v.video_url} onChange={e => updateVideo(n, { video_url: e.target.value })} />
            {shared.length > 0 && <p className="text-sm text-amber-700">Shared with Topic {shared.join(', ')}. Editing this video also updates those lessons.</p>}
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!n} onClick={() => setVideos(list => { const copy = [...list]; [copy[n - 1], copy[n]] = [copy[n], copy[n - 1]]; return copy; })}>Move up</Button><Button type="button" variant="outline" onClick={() => setVideos(list => list.filter((_, i) => i !== n))}>Remove from this lesson</Button></div>
          </div>;
        })}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setVideos(list => [...list, { id: crypto.randomUUID(), title: '', video_url: '' }])}>Add YouTube video</Button>
          <select aria-label="Link existing course video" className="max-w-full rounded border bg-background p-2" value="" onChange={e => { const v = available.find(v => v.id === e.target.value); if (v) setVideos(list => [...list, v]); }}><option value="">Link existing course video</option>{available.filter(v => !videos.some(item => item.id === v.id)).map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select></div>
        <div className="space-y-2 rounded border p-3"><Label htmlFor="lesson-game">HTML game (optional)</Label><Input id="lesson-game" type="file" accept=".html,text/html" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          setBusy(true); setError('');
          const path = `${content?.owner_course_id ?? courseId}/${content?.topic_id ?? topicId}/${crypto.randomUUID()}.html`;
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
        <p className="text-sm text-muted-foreground">Practice entries follow the canonical CB Topics linked to this lesson.</p>
        <div className="sticky bottom-0 space-y-2 border-t bg-background py-3">{failure}{notice && <p role="status" className="rounded border border-green-600 bg-green-50 p-3 font-semibold text-green-900">{course?.title} · {topic?.code} · {notice}</p>}{dirty && <p className="text-sm text-amber-700">Unsaved changes</p>}<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPreview(true)}>Preview lesson</Button><Button type="button" onClick={() => void save()}>{busy ? 'Saving…' : published ? 'Save and publish changes' : (content?.is_published || savedLessons.some(l => l.courses.some(c => c.id === courseId) && l.topic_id === topicId && l.is_published)) ? 'Save and withdraw lesson' : 'Save draft'}</Button></div></div>
      </fieldset>}
      <Dialog open={preview} onOpenChange={setPreview}><DialogContent scrollable className="data-[state=open]:animate-none data-[state=closed]:animate-none inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 transform-none rounded-none sm:rounded-none"><DialogHeader><DialogTitle>Preview: {topic?.code} · {topic?.title}</DialogTitle></DialogHeader>
      <DialogBody><p className="text-sm">Unsaved preview · {published ? 'Published on Save' : 'Draft'}</p>{videos.map((v, n) => <div key={n} className="space-y-2"><h3>{v.title}</h3>{youtubeId(v.video_url) ? <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${youtubeId(v.video_url)}`} title={`Preview ${v.title}`} allowFullScreen /> : <p>Enter a valid YouTube URL.</p>}</div>)}{gamePath && <Suspense fallback={<p>Loading game preview…</p>}><CourseGame path={gamePath} /></Suspense>}</DialogBody>
    </DialogContent></Dialog>
    </CardContent></Card>;
}
