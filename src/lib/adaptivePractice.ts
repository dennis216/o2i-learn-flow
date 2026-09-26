/** Subject-agnostic selection logic. It does not generate or grade questions. */
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_TARGET_SECONDS: Record<Difficulty, number> = {
  easy: 180,
  medium: 300,
  hard: 600,
};

export interface PracticeQuestionMeta {
  id: string;
  subjectId: string;
  skillIds: string[];
  difficulty: Difficulty;
  approved: boolean;
  /** Option IDs map to educator-reviewed misconception IDs, not AI guesses. */
  misconceptionTagsByOption?: Record<string, string[]>;
}

export interface PracticeAttempt {
  questionId: string;
  subjectId: string;
  skillIds: string[];
  difficulty: Difficulty;
  correct: boolean;
  elapsedSeconds: number;
  selectedOptionIds: string[];
  misconceptionTags: string[];
}

export interface LearningSignal {
  subjectId: string;
  skillId: string;
  kind: 'long_pause' | 'ask_ai';
  /** A student-confirmed review marker is stronger than an inferred pause. */
  confirmed?: boolean;
}

export interface QuestionFeedback {
  correct: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  overTarget: boolean;
  selectedOptionIds: string[];
  misconceptionTags: string[];
  needsReview: boolean;
}

export interface RecommendedQuestion {
  question: PracticeQuestionMeta;
  priority: number;
  reasons: string[];
}

export function evaluateAttempt(
  question: PracticeQuestionMeta,
  selectedOptionIds: string[],
  correct: boolean,
  elapsedSeconds: number,
  targets: Record<Difficulty, number> = DEFAULT_TARGET_SECONDS,
): QuestionFeedback {
  const misconceptionTags = [...new Set(selectedOptionIds.flatMap(
    (optionId) => question.misconceptionTagsByOption?.[optionId] ?? [],
  ))];
  const targetSeconds = targets[question.difficulty];
  const overTarget = elapsedSeconds > targetSeconds;

  return {
    correct,
    elapsedSeconds,
    targetSeconds,
    overTarget,
    selectedOptionIds,
    misconceptionTags,
    // A slow correct answer merits review, but it is not labelled "incorrect".
    needsReview: !correct || overTarget || misconceptionTags.length > 0,
  };
}

/** Attempts must be ordered from oldest to newest. */
export function skillMastery(skillId: string, attempts: PracticeAttempt[]): number {
  const relevant = attempts.filter((attempt) => attempt.skillIds.includes(skillId)).slice(-8);
  // A neutral prior prevents one fast answer from implying mastery.
  let weightedScore = 0.5;
  let totalWeight = 1;

  relevant.forEach((attempt, index) => {
    const weight = 1 + index * 0.1;
    const overTarget = attempt.elapsedSeconds > DEFAULT_TARGET_SECONDS[attempt.difficulty];
    const result = attempt.correct ? (overTarget ? 0.75 : 1) : 0;
    weightedScore += weight * result;
    totalWeight += weight;
  });

  return weightedScore / totalWeight;
}

export function recommendQuestions(
  bank: PracticeQuestionMeta[],
  attempts: PracticeAttempt[],
  signals: LearningSignal[],
  subjectId: string,
  count: number,
): RecommendedQuestion[] {
  if (count <= 0) return [];

  const subjectAttempts = attempts.filter((attempt) => attempt.subjectId === subjectId);
  const attemptedIds = new Set(subjectAttempts.map((attempt) => attempt.questionId));
  const eligible = bank.filter((question) =>
    question.approved && question.subjectId === subjectId && question.skillIds.length > 0,
  );
  const unseen = eligible.filter((question) => !attemptedIds.has(question.id));
  const pool = unseen.length >= count ? unseen : eligible;
  const skillCounts = new Map<string, number>();
  const selected: RecommendedQuestion[] = [];

  while (selected.length < count && selected.length < pool.length) {
    const ranked = pool
      .filter((question) => !selected.some((item) => item.question.id === question.id))
      .map((question) => {
        const mastery = Math.min(...question.skillIds.map((skillId) => skillMastery(skillId, subjectAttempts)));
        const targetDifficulty: Difficulty = mastery >= 0.8 ? 'hard' : mastery >= 0.55 ? 'medium' : 'easy';
        const relatedSignals = signals.filter((signal) =>
          signal.subjectId === subjectId && question.skillIds.includes(signal.skillId),
        );
        const signalBoost = Math.min(0.3, relatedSignals.reduce((sum, signal) =>
          sum + (signal.kind === 'ask_ai' ? 0.1 : signal.confirmed ? 0.08 : 0.03), 0));
        const misconceptionBoost = subjectAttempts.slice(-8).some((attempt) =>
          attempt.misconceptionTags.length > 0 &&
          attempt.skillIds.some((skillId) => question.skillIds.includes(skillId)),
        ) ? 0.15 : 0;
        const repetitionPenalty = question.skillIds.reduce(
          (sum, skillId) => sum + (skillCounts.get(skillId) ?? 0) * 0.2, 0,
        );
        const priority = (1 - mastery) + signalBoost + misconceptionBoost
          + (question.difficulty === targetDifficulty ? 0.3 : 0)
          + (attemptedIds.has(question.id) ? -0.5 : 0.2)
          - repetitionPenalty;
        const reasons = [
          attemptedIds.has(question.id) ? 'repeat_after_bank_exhausted' : 'new_question',
          question.difficulty === targetDifficulty ? 'matched_difficulty' : 'difficulty_alternative',
          ...(signalBoost > 0 ? ['learning_signal'] : []),
          ...(misconceptionBoost > 0 ? ['misconception_review'] : []),
        ];
        return { question, priority, reasons };
      })
      .sort((a, b) => b.priority - a.priority || a.question.id.localeCompare(b.question.id));

    const next = ranked[0];
    if (!next) break;
    selected.push(next);
    next.question.skillIds.forEach((skillId) =>
      skillCounts.set(skillId, (skillCounts.get(skillId) ?? 0) + 1),
    );
  }

  return selected;
}
