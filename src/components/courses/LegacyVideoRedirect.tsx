import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
export default function LegacyVideoRedirect() {
  const { videoId } = useParams();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!videoId || !/^[0-9a-f-]{36}$/i.test(videoId)) { setTarget('/practice'); return; }
    void supabase.rpc('resolve_course_video', { _video_id: videoId }).then(({ data, error }) => {
      if (!active) return;
      const mapping = data as { course_id?: string; topic_id?: string } | null;
      setTarget(!error && mapping?.course_id && mapping?.topic_id ? '/quiz?' + new URLSearchParams({ course: mapping.course_id, topic: mapping.topic_id, source: 'course' }) : '/practice');
    });
    return () => { active = false; };
  }, [videoId]);
  return target ? <Navigate to={target} replace /> : <p role="status" className="p-6">Finding course practice…</p>;
}
