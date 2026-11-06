import { useEffect, useRef, useState } from 'react';
import { advanceCapture, emptyCapture, PRACTICE_CAPTURE_PREFIX, readCapture, selectCapture, type PracticeCapture } from '@/lib/practiceCapture';
import type { IssuedPracticeQuestion } from '@/lib/studentPractice';

export function usePracticeCapture(userId: string, sessionId: string, question: IssuedPracticeQuestion | undefined, blocked: boolean) {
  const current = useRef<PracticeCapture>(emptyCapture(false));
  const running = useRef(false), last = useRef(0), key = useRef('');
  const [capture, setCapture] = useState(current.current);
  const [readyVersion, setReadyVersion] = useState('');
  const checkpoint = () => {
    const now = performance.now();
    if (running.current) current.current = advanceCapture(current.current, now - last.current);
    last.current = now;
    if (key.current) {
      try { if (sessionStorage.getItem(key.current + ':seen')) sessionStorage.setItem(key.current, JSON.stringify(current.current)); }
      catch { current.current.complete = false; }
    }
    setCapture({ ...current.current });
    return current.current;
  };
  useEffect(() => {
    running.current = false;
    if (!question || question.attempt) {
      if (question) { try { sessionStorage.removeItem(`${PRACTICE_CAPTURE_PREFIX}${userId}:${sessionId}:${question.version_id}`); } catch { /* Storage may be disabled. */ } }
      key.current = ''; setReadyVersion(''); return;
    }
    key.current = `${PRACTICE_CAPTURE_PREFIX}${userId}:${sessionId}:${question.version_id}`;
    let restored: PracticeCapture | null = null, fresh = false;
    try {
      restored = readCapture(sessionStorage.getItem(key.current), question.options.map(o => o.id));
      const seenKey = key.current + ':seen';
      fresh = sessionStorage.getItem(`${PRACTICE_CAPTURE_PREFIX}${userId}:${sessionId}:new`) === 'true' && !sessionStorage.getItem(seenKey);
      sessionStorage.setItem(seenKey, 'true');
    } catch { fresh = false; }
    current.current = restored ?? emptyCapture(fresh);
    setCapture({ ...current.current }); setReadyVersion(question.version_id);
    // This ref always contains the current question's draft; cleanup preserves the final visible interval.
    return () => { running.current = false; };
  }, [userId, sessionId, question?.version_id, question?.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sync = () => {
      checkpoint();
      running.current = !!question && !question.attempt && !blocked && !current.current.paused && !current.current.frozen && document.visibilityState === 'visible';
    };
    sync();
    const timer = window.setInterval(checkpoint, 1000);
    document.addEventListener('visibilitychange', sync); window.addEventListener('pagehide', checkpoint);
    return () => { checkpoint(); running.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', sync); window.removeEventListener('pagehide', checkpoint); };
  }, [question?.version_id, question?.attempt, blocked, capture.paused]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    capture, ready: !!question && (question.attempt !== null || readyVersion === question.version_id),
    select(option: string) { checkpoint(); current.current = selectCapture(current.current, option); checkpoint(); },
    pause() { checkpoint(); current.current = { ...current.current, paused: !current.current.paused }; checkpoint(); },
    freeze() { checkpoint(); current.current = { ...current.current, frozen: true }; running.current = false; checkpoint(); return current.current; },
  };
}
