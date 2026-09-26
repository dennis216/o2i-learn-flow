import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Difficulty, LearningSignal, PracticeAttempt } from '@/lib/adaptivePractice';

export interface StoredLearningSignal extends LearningSignal {
  id: string;
  lessonId: string;
  timestampSeconds: number;
  createdAt: string;
}

export interface SelectionStep {
  optionId: string;
  elapsedSeconds: number;
}

export interface StoredAttempt extends PracticeAttempt {
  id: string;
  sessionId: string;
  lessonId?: string;
  finalOptionId: string;
  selectionTrajectory: SelectionStep[];
  targetSeconds: number;
  overTarget: boolean;
  completedAt: string;
}

interface LearningState {
  signals: StoredLearningSignal[];
  attempts: StoredAttempt[];
  completedLessonIds: string[];
  lastLessonId?: string;
}

interface SignalInput {
  lessonId: string;
  subjectId: string;
  skillId: string;
  kind: LearningSignal['kind'];
  timestampSeconds: number;
  confirmed?: boolean;
}

interface AttemptInput {
  sessionId: string;
  questionId: string;
  lessonId?: string;
  subjectId: string;
  skillIds: string[];
  difficulty: Difficulty;
  correct: boolean;
  elapsedSeconds: number;
  selectedOptionIds: string[];
  misconceptionTags: string[];
  finalOptionId: string;
  selectionTrajectory: SelectionStep[];
  targetSeconds: number;
  overTarget: boolean;
}

interface LearningContextValue extends LearningState {
  addSignal: (input: SignalInput) => void;
  saveAttempt: (input: AttemptInput) => void;
  completeLesson: (lessonId: string) => void;
  setLastLesson: (lessonId: string) => void;
}

const STORAGE_KEY = 'o2i-learning-prototype-v1';
const initialState: LearningState = { signals: [], attempts: [], completedLessonIds: [] };
const LearningContext = createContext<LearningContextValue | null>(null);

function loadState(): LearningState {
  if (typeof window === 'undefined') return initialState;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
  } catch {
    return initialState;
  }
}

export function LearningProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LearningState>(loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<LearningContextValue>(() => ({
    ...state,
    addSignal: (input) => setState((current) => {
      const duplicate = current.signals.some((signal) =>
        signal.lessonId === input.lessonId && signal.skillId === input.skillId && signal.kind === input.kind &&
        Math.abs(signal.timestampSeconds - input.timestampSeconds) < 12,
      );
      if (duplicate) return current;
      return {
        ...current,
        signals: [...current.signals, {
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }],
      };
    }),
    saveAttempt: (input) => setState((current) => ({
      ...current,
      attempts: [...current.attempts, {
        ...input,
        id: crypto.randomUUID(),
        completedAt: new Date().toISOString(),
      }],
    })),
    completeLesson: (lessonId) => setState((current) => ({
      ...current,
      completedLessonIds: current.completedLessonIds.includes(lessonId)
        ? current.completedLessonIds
        : [...current.completedLessonIds, lessonId],
      lastLessonId: lessonId,
    })),
    setLastLesson: (lessonId) => setState((current) =>
      current.lastLessonId === lessonId ? current : { ...current, lastLessonId: lessonId },
    ),
  }), [state]);

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

// The provider and its hook intentionally share one context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error('useLearning must be used inside LearningProvider');
  return context;
}
