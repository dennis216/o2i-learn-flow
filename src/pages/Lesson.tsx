import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Bot, Check, ChevronRight, Flag, HelpCircle, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { getLesson, getSkill } from '@/data/learningContent';
import { useLearning } from '@/contexts/LearningContext';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function Lesson() {
  const { lessonId = '' } = useParams();
  const navigate = useNavigate();
  const lesson = getLesson(lessonId);
  const { addSignal, completeLesson, setLastLesson, signals } = useLearning();
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const pauseRecorded = useRef(false);

  useEffect(() => { if (lesson) setLastLesson(lesson.id); }, [lesson, setLastLesson]);

  useEffect(() => {
    if (!lesson || !playing) return;
    const timer = window.setInterval(() => setCurrentTime((time) => Math.min(time + 1, lesson.durationSeconds)), 1000);
    return () => window.clearInterval(timer);
  }, [lesson, playing]);

  const segment = useMemo(() => lesson?.segments.find((item) => currentTime >= item.startSeconds && currentTime < item.endSeconds) ?? lesson?.segments[lesson.segments.length - 1], [lesson, currentTime]);
  const skill = segment ? getSkill(segment.skillId) : undefined;

  useEffect(() => {
    if (playing) {
      setPauseSeconds(0);
      pauseRecorded.current = false;
      return;
    }
    if (!lesson || !segment || currentTime === 0 || currentTime >= lesson.durationSeconds) return;
    const timer = window.setInterval(() => {
      setPauseSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= 20 && !pauseRecorded.current) {
          pauseRecorded.current = true;
          addSignal({ lessonId: lesson.id, subjectId: lesson.subjectId, skillId: segment.skillId, kind: 'long_pause', timestampSeconds: currentTime });
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, lesson, segment, currentTime, addSignal]);

  if (!lesson || lesson.status !== 'ready') {
    return <div className="flex min-h-[70vh] items-center justify-center"><div className="text-center"><h1 className="text-2xl font-bold">This lesson is not available yet</h1><Button asChild className="mt-5"><Link to="/learn">Back to learning paths</Link></Button></div></div>;
  }

  const markReview = () => segment && addSignal({ lessonId: lesson.id, subjectId: lesson.subjectId, skillId: segment.skillId, kind: 'long_pause', timestampSeconds: currentTime, confirmed: true });
  const askForHelp = () => {
    if (segment) addSignal({ lessonId: lesson.id, subjectId: lesson.subjectId, skillId: segment.skillId, kind: 'ask_ai', timestampSeconds: currentTime, confirmed: true });
    setHelpOpen(true);
  };
  const finish = () => { completeLesson(lesson.id); navigate(`/quiz?subject=${lesson.subjectId}&lesson=${lesson.id}&source=lesson`); };
  const lessonSignals = signals.filter((signal) => signal.lessonId === lesson.id);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Button asChild variant="ghost"><Link to="/learn"><ArrowLeft />All lessons</Link></Button>
          <div className="text-right"><p className="text-sm text-muted-foreground">{lesson.unit}</p><p className="font-semibold">{lesson.title}</p></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="relative aspect-video overflow-hidden bg-slate-950">
                <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
                  <p className="text-sm text-blue-200">Lesson preview</p>
                  <h1 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">{segment?.title}</h1>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">{skill?.summary}</p>
                  <p className="mt-6 text-xs text-slate-500">Your lesson video will appear here when it is uploaded.</p>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-16">
                  <Slider value={[currentTime]} max={lesson.durationSeconds} step={1} onValueChange={([value]) => setCurrentTime(value)} className="mb-4" />
                  <div className="flex items-center gap-4 text-white">
                    <Button size="icon" className="rounded-full bg-white text-slate-950 hover:bg-slate-200" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}</Button>
                    <span className="font-mono text-sm">{formatTime(currentTime)} / {formatTime(lesson.durationSeconds)}</span>
                    <span className="ml-auto text-xs text-slate-300">{!playing && pauseSeconds > 0 ? `Paused ${pauseSeconds}s${pauseRecorded.current ? ' · Saved for review' : ''}` : ''}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardContent className="flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
                <div><h2 className="font-semibold">A moment worth revisiting?</h2><p className="mt-1 text-sm text-muted-foreground">Save this point or ask for a little extra context before moving on.</p></div>
                <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={markReview}><Flag />Save for review</Button><Button onClick={askForHelp}><HelpCircle />Ask for help</Button></div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="h-5 w-5 text-primary" />Lesson chapters</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {lesson.segments.map((item) => {
                  const active = item === segment;
                  return <button key={item.startSeconds} onClick={() => setCurrentTime(item.startSeconds)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}><span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground/30'}`} /><span className="flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatTime(item.startSeconds)}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>;
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center justify-between text-lg"><span>Saved moments</span><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{lessonSignals.length}</span></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {lessonSignals.length ? lessonSignals.slice(-4).reverse().map((signal) => (
                  <div key={signal.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-background text-primary">{signal.kind === 'ask_ai' ? <Bot className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</span>
                    <span className="flex-1"><span className="block font-medium">{signal.kind === 'ask_ai' ? 'Question asked' : signal.confirmed ? 'Saved for review' : 'Paused here'}</span><span className="text-xs text-muted-foreground">{formatTime(signal.timestampSeconds)} · {getSkill(signal.skillId)?.shortName}</span></span>
                  </div>
                )) : <p className="py-4 text-center text-sm text-muted-foreground">Nothing saved yet. Keep learning at your own pace.</p>}
              </CardContent>
            </Card>

            <Button className="h-12 w-full" onClick={finish}><Check />Finish lesson and practice</Button>
          </aside>
        </div>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setHelpOpen(false)}>
          <Card className="w-full max-w-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
            <CardHeader><CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-primary" />{skill?.name}</CardTitle></CardHeader>
            <CardContent><p className="leading-7 text-muted-foreground">{skill?.summary}</p><div className="mt-5 rounded-lg bg-muted/50 p-4"><p className="text-sm font-medium">We saved this moment to your review list and will bring it back when it is most useful.</p></div><Button className="mt-6 w-full" onClick={() => setHelpOpen(false)}>Continue lesson</Button></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
