import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { TopicContent } from '@/lib/courseContent';
import { supabase } from '@/integrations/supabase/client';
import { loadCustomOutline, editOutline, outlineRpc, loadOutlineEntry, type CourseOutline, type OutlineEntry, type OutlineUnit, type CanonicalTopic } from '@/lib/courseOutline';
import { CourseContentManagement } from './CourseContentManagement';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

const CourseGame = lazy(() => import('@/components/courses/CourseGame'));
interface ArchivedEntry { entry_id: string; title: string; unit_id: string; topic_ids: string[]; content_id: string | null }
interface EditSelection { unit: OutlineUnit; entry?: OutlineEntry; merge?: OutlineEntry[] }
interface Props { courseId: string; initialEntryId?: string; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; onClose?: () => void }
export function CourseOutlineManagement({ courseId, initialEntryId, onSaved, onDirtyChange, onBusyChange, onClose }: Props) {
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [archive, setArchive] = useState<ArchivedEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditSelection | null>(null);
  const [title, setTitle] = useState(''), [topicIds, setTopicIds] = useState<string[]>([]);
  const [mergePreview, setMergePreview] = useState<TopicContent | null>(null);
  const [previewGame, setPreviewGame] = useState(false);
  const [sourceId, setSourceId] = useState(''), [keepPublished, setKeepPublished] = useState(false);
  const [busy, setBusy] = useState(false), [contentBusy, setContentBusy] = useState(false), [contentDirty, setContentDirty] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [savedMetadata, setSavedMetadata] = useState('');
  const metadataDirty = !!editing && JSON.stringify({ title, topicIds }) !== savedMetadata;
  const dirty = metadataDirty || contentDirty;
  const blocked = busy || contentBusy;
  const canLeave = () => !blocked && (!dirty || window.confirm('Discard unsaved lesson changes?'));
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(blocked); return () => onBusyChange?.(false); }, [blocked, onBusyChange]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty || blocked) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, blocked]);
  useEffect(() => {
    const guard = (e: MouseEvent) => { const a = (e.target as Element).closest?.('a[href]'); if ((dirty || blocked) && a && a.getAttribute('target') !== '_blank' && (blocked || !window.confirm('Discard unsaved lesson changes?'))) { e.preventDefault(); e.stopPropagation(); } };
    document.addEventListener('click', guard, true); return () => document.removeEventListener('click', guard, true);
  }, [dirty, blocked]);
  useEffect(() => {
    if (!dirty && !blocked) return;
    const original = window.history.state?.idx; let restoring = false;
    const guard = (e: PopStateEvent) => { if (restoring) { restoring = false; e.stopImmediatePropagation(); return; } const next = window.history.state?.idx; if (typeof original === 'number' && typeof next === 'number' && original !== next && (blocked || !window.confirm('Discard unsaved lesson changes?'))) { e.stopImmediatePropagation(); restoring = true; window.history.go(original - next); } };
    window.addEventListener('popstate', guard, true); return () => window.removeEventListener('popstate', guard, true);
  }, [dirty, blocked]);
  const refresh = useCallback(async () => {
    const [data, archived] = await Promise.all([loadCustomOutline(supabase, courseId), outlineRpc(supabase, 'list_course_outline_archive', { _course_id: courseId })]);
    if (!Array.isArray(archived)) throw new Error('Could not verify archived lessons.');
    setOutline(data); setArchive(archived); return data;
  }, [courseId]);
  useEffect(() => { let active = true; void refresh().then(data => {
    if (!active || !initialEntryId) return;
    const unit = data.units.find(u => u.topics.some(e => e.id === initialEntryId));
    const entry = unit?.topics.find(e => e.id === initialEntryId);
    if (unit && entry) { setEditing({ unit, entry }); setTitle(entry.title); const ids = entry.cb_topics.map(t => t.id); setTopicIds(ids); setSavedMetadata(JSON.stringify({ title: entry.title, topicIds: ids })); }
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [refresh, initialEntryId]);
  const open = (selection: EditSelection) => {
    if (!canLeave()) return;
    const entries = selection.merge ?? (selection.entry ? [selection.entry] : []);
    const ids = [...new Set(entries.flatMap(e => e.cb_topics.map(t => t.id)))];
    const name = selection.merge ? entries.map(e => e.title).join(' / ').slice(0, 200) : selection.entry?.title ?? '';
    setEditing(selection); setTitle(name); setTopicIds(ids); setSourceId(entries[0]?.id ?? ''); setKeepPublished(false); setContentDirty(false); setError('');
    setSavedMetadata(JSON.stringify({ title: name, topicIds: ids }));
  };
  useEffect(() => {
    let active = true; setMergePreview(null); setPreviewGame(false);
    if (editing?.merge && sourceId) void loadOutlineEntry(supabase, courseId, sourceId).then(data => { if (active) setMergePreview(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [editing, sourceId, courseId]);
  const mutate = async (action: Parameters<typeof editOutline>[3], payload: Record<string, unknown>) => {
    if (!outline || blocked) return;
    setBusy(true); setError(''); setNotice('');
    try { const id = await editOutline(supabase, courseId, outline.revision, action, payload); await refresh(); setSelected([]); onSaved?.(); return id; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
    finally { setBusy(false); }
  };
  const saveMetadata = async () => {
    if (!editing || contentDirty) return;
    try {
      let payload: Record<string, unknown> = { title, topic_ids: topicIds, entry_id: editing.entry?.id };
      if (editing.merge) {
        if (!window.confirm('Merge these lessons? Original lessons remain recoverable. This changes the student outline immediately.')) return;
        if (!mergePreview) throw new Error('Wait for the selected content preview.');
        const source = mergePreview;
        payload = { ...payload, entry_ids: editing.merge.map(e => e.id), source_entry_id: sourceId, source_revision: source.revision, keep_published: keepPublished };
      }
      const id = await mutate(editing.merge ? 'merge' : 'save', payload);
      if (!id) return;
      const updated = await refresh(); const unit = updated.units.find(u => u.topics.some(e => e.id === id))!; const entry = unit.topics.find(e => e.id === id)!;
      setEditing({ unit, entry }); setTitle(entry.title); setTopicIds(entry.cb_topics.map(t => t.id)); setSavedMetadata(JSON.stringify({ title: entry.title, topicIds: entry.cb_topics.map(t => t.id) })); setNotice('Outline saved. Student titles and order update immediately.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const move = async (unit: OutlineUnit, index: number, offset: number) => {
    const ids = unit.topics.map(e => e.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    await mutate('reorder', { unit_id: unit.id, entry_ids: ids }).catch(() => {});
  };
  const topicsFor = (unit: OutlineUnit): CanonicalTopic[] => [...new Map(unit.topics.flatMap(e => e.cb_topics).map(t => [t.id, t])).values()].sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const editorDialog = <Dialog open={!!editing} onOpenChange={openState => { if (!openState && canLeave()) { setEditing(null); setContentDirty(false); onClose?.(); } }}><DialogContent className="max-h-[95dvh] w-[96vw] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{editing?.merge ? 'Merge lessons' : editing?.entry ? 'Edit lesson' : 'Add lesson'}</DialogTitle></DialogHeader>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {editing && <><fieldset disabled={blocked} className="space-y-3 rounded border p-3"><Label htmlFor="outline-title">Lesson title shown to students</Label><Input id="outline-title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <div className="space-y-2"><p className="font-medium">CB Topics · Unit {editing.unit.unit_number}</p>{topicsFor(editing.unit).map(t => <label key={t.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={topicIds.includes(t.id)} disabled={!!editing.merge} onChange={e => setTopicIds(ids => e.target.checked ? [...ids,t.id] : ids.filter(id => id !== t.id))} />{t.code} · {t.title}</label>)}</div>
        {editing.merge && <><Label htmlFor="merge-source">Content to keep</Label><select id="merge-source" className="w-full rounded border bg-background p-2" value={sourceId} onChange={e => setSourceId(e.target.value)}>{editing.merge.map(e => <option key={e.id} value={e.id}>{e.title} · {e.is_published ? 'Published' : e.content_id ? 'Draft' : 'No content'}</option>)}</select><p className="text-sm">Videos and game are copied from the chosen lesson. Original lessons remain recoverable. Other courses keep their content and outline.</p>
        {mergePreview ? <div className="space-y-2 rounded border p-3"><p className="font-medium">Selected content preview · {mergePreview.is_published ? 'Published' : 'Draft / no content'}</p>{mergePreview.videos.map(v => <p key={v.id}><a className="underline" href={v.video_url} target="_blank" rel="noreferrer">{v.title}</a></p>)}{!mergePreview.videos.length && <p>No videos.</p>}{mergePreview.game_path ? <><Button variant="outline" onClick={() => setPreviewGame(v => !v)}>Preview selected game</Button>{previewGame && <Suspense fallback={<p>Loading game…</p>}><CourseGame path={mergePreview.game_path} /></Suspense>}</> : <p>No game.</p>}</div> : <p role="status">Loading selected content preview…</p>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={keepPublished} onChange={e => setKeepPublished(e.target.checked)} />Keep selected content published if it is already published</label></>}
        {editing.entry?.is_published && <p className="text-sm text-amber-700">Saving the title or CB Topics changes the published student outline immediately.</p>}
        {contentDirty && <p className="text-sm text-amber-700">Save or reload content edits before changing the outline.</p>}
        <Button disabled={contentDirty || !title.trim() || !topicIds.length || !!editing.merge && !mergePreview} onClick={() => void saveMetadata()}>{editing.merge ? 'Confirm merge' : 'Save lesson title and Topics'}</Button>
        {editing.entry && <div className="flex flex-wrap gap-2">{editing.entry.cb_topics.length > 1 && <Button variant="outline" onClick={() => { if (contentDirty || !window.confirm('Split this lesson into its original CB Topic rows? Current content remains recoverable.')) return; void mutate('split', { entry_id: editing.entry!.id }).then(() => setEditing(null)).catch(() => {}); }}>Split into Topic rows</Button>}<Button variant="outline" onClick={() => { if (contentDirty || !window.confirm('Remove this lesson from the outline? Content stays recoverable; uncovered CB Topics return as individual rows.')) return; void mutate('remove', { entry_id: editing.entry!.id }).then(() => setEditing(null)).catch(() => {}); }}>Remove lesson from outline</Button></div>}
      </fieldset>
      {editing.entry && <CourseContentManagement key={editing.entry.id} initialCourseId={courseId} initialEntryId={editing.entry.id} onDirtyChange={setContentDirty} onBusyChange={setContentBusy} onSaved={() => { void refresh().catch(e => setError(e.message)); onSaved?.(); }} />}</>}
    </DialogContent></Dialog>;
  if (initialEntryId && error && !editing) return <div role="alert"><p>{error}</p><Button variant="outline" onClick={onClose}>Close editor</Button></div>;
  if (initialEntryId) return editorDialog;
  return <Card><CardHeader><CardTitle>Course Content</CardTitle><p className="text-sm text-muted-foreground">Choose a lesson from the outline. Custom titles and order belong to this course; CB Topics keep their canonical identities.</p></CardHeader><CardContent className="space-y-4">
    {error && <div role="alert" className="space-y-2 text-destructive"><p>{error}</p><Button variant="outline" disabled={blocked} onClick={() => { if (!canLeave()) return; void refresh().then(() => { setError(''); setNotice('Reloaded the saved outline. Your editor remains open.'); }).catch(e => setError(e.message)); }}>Reload saved outline</Button></div>}
    {notice && <p role="status" className="rounded border border-green-600 bg-green-50 p-3 text-green-900">{notice}</p>}
    {!outline && !error && <p role="status">Loading course outline…</p>}
    {outline?.units.length === 0 && <p>No curriculum outline is configured for this course.</p>}
    {outline?.units.map(unit => <Collapsible key={unit.id} defaultOpen={unit.unit_number === 1} className="rounded border">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left"><div><h2 className="font-semibold">Unit {unit.unit_number}: {unit.title}</h2><p className="text-sm text-muted-foreground">{unit.topics.length} lessons</p></div><ChevronDown className="h-4 w-4" /></CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-4 pb-4"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={blocked} onClick={() => open({ unit })}>Add lesson</Button><Button variant="outline" disabled={blocked || unit.topics.filter(e => selected.includes(e.id)).length < 2} onClick={() => open({ unit, merge: unit.topics.filter(e => selected.includes(e.id)) })}>Merge selected lessons</Button></div>
        {unit.topics.map((entry, index) => <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
          <input type="checkbox" aria-label={`Select ${entry.title}`} checked={selected.includes(entry.id)} disabled={blocked} onChange={e => setSelected(ids => e.target.checked ? [...ids, entry.id] : ids.filter(id => id !== entry.id))} />
          <button className="min-w-0 flex-1 text-left" disabled={blocked} onClick={() => open({ unit, entry })}><span className="block font-medium">{entry.title}</span><span className="text-sm text-muted-foreground">CB {entry.cb_topics.map(t => t.code).join(' · ')}</span></button>
          <Badge variant="outline">{entry.is_published ? 'Published' : entry.content_id ? 'Draft' : 'No content'}</Badge>
          <Button size="sm" variant="outline" disabled={blocked || index === 0} aria-label={`Move ${entry.title} up`} onClick={() => void move(unit,index,-1)}>↑</Button><Button size="sm" variant="outline" disabled={blocked || index === unit.topics.length-1} aria-label={`Move ${entry.title} down`} onClick={() => void move(unit,index,1)}>↓</Button>
        </div>)}
      </CollapsibleContent></Collapsible>)}
    {archive.length > 0 && <details className="rounded border p-3"><summary>Recoverable lessons ({archive.length})</summary><div className="mt-3 space-y-2">{archive.map(e => <div key={e.entry_id} className="flex items-center justify-between gap-3"><span>{e.title}</span><Button variant="outline" disabled={blocked} onClick={() => { if (window.confirm('Restore this lesson to the outline? Existing lessons stay in place.')) void mutate('restore', { entry_id: e.entry_id }).catch(() => {}); }}>Restore lesson</Button></div>)}</div></details>}
    {editorDialog}

  </CardContent></Card>;
}
