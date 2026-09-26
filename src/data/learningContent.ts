import type { Difficulty, PracticeQuestionMeta } from '@/lib/adaptivePractice';

export interface SkillDefinition {
  id: string;
  subjectId: string;
  name: string;
  shortName: string;
  summary: string;
  keyPoints: string[];
  commonMistake: string;
}

export interface LessonSegment {
  startSeconds: number;
  endSeconds: number;
  title: string;
  skillId: string;
}

export interface LessonDefinition {
  id: string;
  courseId: string;
  subjectId: string;
  unit: string;
  order: number;
  title: string;
  description: string;
  durationSeconds: number;
  status: 'ready' | 'coming_soon';
  segments: LessonSegment[];
}

export interface CourseDefinition {
  id: string;
  subjectId: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  available: boolean;
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionDefinition extends PracticeQuestionMeta {
  courseId: string;
  lessonId?: string;
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
}

export const subjects = [
  { id: 'calculus', name: 'AP Calculus', note: 'AB + BC pilot', available: true },
  { id: 'physics', name: 'Physics', note: 'Framework ready', available: false },
  { id: 'chemistry', name: 'Chemistry', note: 'Framework ready', available: false },
];

export const courses: CourseDefinition[] = [
  {
    id: 'ap-calculus-core',
    subjectId: 'calculus',
    eyebrow: 'FIRST PILOT · AP CALCULUS AB/BC',
    title: 'Functions, Limits & Derivatives',
    description: 'Build a strong foundation in limits, continuity, and the ideas that lead into differentiation.',
    accent: 'from-blue-600 to-cyan-500',
    available: true,
  },
  {
    id: 'physics-mechanics',
    subjectId: 'physics',
    eyebrow: 'CONTENT SLOT · PHYSICS',
    title: 'Mechanics Foundations',
    description: 'Develop a clear, connected understanding of motion, forces, energy, and momentum.',
    accent: 'from-violet-600 to-fuchsia-500',
    available: false,
  },
  {
    id: 'chemistry-foundations',
    subjectId: 'chemistry',
    eyebrow: 'CONTENT SLOT · CHEMISTRY',
    title: 'Chemistry Foundations',
    description: 'Connect atomic structure, bonding, reactions, and quantitative problem solving.',
    accent: 'from-emerald-600 to-teal-500',
    available: false,
  },
];

export const skills: SkillDefinition[] = [
  {
    id: 'limit-meaning',
    subjectId: 'calculus',
    name: 'Interpreting limits',
    shortName: 'Limit meaning',
    summary: 'A limit describes the value a function approaches, not necessarily the value it takes at that point.',
    keyPoints: ['Read left- and right-hand behavior separately', 'The limit can exist when f(a) is undefined', 'A two-sided limit requires both one-sided limits to agree'],
    commonMistake: 'Replacing lim x→a f(x) with f(a) without checking nearby behavior.',
  },
  {
    id: 'limit-algebra',
    subjectId: 'calculus',
    name: 'Evaluating limits algebraically',
    shortName: 'Limit algebra',
    summary: 'Use direct substitution first, then simplify only when the original form is indeterminate.',
    keyPoints: ['Try substitution before manipulating', 'Factor and cancel only common factors', 'The simplified expression agrees away from the hole'],
    commonMistake: 'Treating 0/0 as the answer instead of an indeterminate form.',
  },
  {
    id: 'continuity',
    subjectId: 'calculus',
    name: 'Continuity and discontinuities',
    shortName: 'Continuity',
    summary: 'Continuity at a requires a defined function value, an existing limit, and equality between them.',
    keyPoints: ['Check all three continuity conditions', 'Classify removable, jump and infinite discontinuities', 'Piecewise constants can be solved using matching limits'],
    commonMistake: 'Checking only that f(a) exists.',
  },
  {
    id: 'derivative-definition',
    subjectId: 'calculus',
    name: 'Derivative from the limit definition',
    shortName: 'Derivative definition',
    summary: 'The derivative is the limiting slope of secant lines as the horizontal change approaches zero.',
    keyPoints: ['Recognize both standard difference-quotient forms', 'The numerator measures change in output', 'The derivative is a rate and a tangent slope'],
    commonMistake: 'Substituting h = 0 before simplifying the difference quotient.',
  },
];

export const lessons: LessonDefinition[] = [
  {
    id: 'limits-foundations',
    courseId: 'ap-calculus-core',
    subjectId: 'calculus',
    unit: 'Unit 1 · Limits',
    order: 1,
    title: 'What a limit really means',
    description: 'Connect graphical, numerical and symbolic views of a limit.',
    durationSeconds: 1080,
    status: 'ready',
    segments: [
      { startSeconds: 0, endSeconds: 300, title: 'Approaching vs. arriving', skillId: 'limit-meaning' },
      { startSeconds: 300, endSeconds: 660, title: 'One-sided limits', skillId: 'limit-meaning' },
      { startSeconds: 660, endSeconds: 1080, title: 'Algebraic evaluation', skillId: 'limit-algebra' },
    ],
  },
  {
    id: 'continuity-checklist',
    courseId: 'ap-calculus-core',
    subjectId: 'calculus',
    unit: 'Unit 1 · Limits',
    order: 2,
    title: 'The three conditions for continuity',
    description: 'Diagnose and repair discontinuities in graphs and piecewise functions.',
    durationSeconds: 1320,
    status: 'ready',
    segments: [
      { startSeconds: 0, endSeconds: 460, title: 'The continuity checklist', skillId: 'continuity' },
      { startSeconds: 460, endSeconds: 900, title: 'Types of discontinuity', skillId: 'continuity' },
      { startSeconds: 900, endSeconds: 1320, title: 'Piecewise parameters', skillId: 'limit-algebra' },
    ],
  },
  {
    id: 'derivative-as-limit',
    courseId: 'ap-calculus-core',
    subjectId: 'calculus',
    unit: 'Unit 2 · Differentiation',
    order: 3,
    title: 'Derivative as a limit',
    description: 'Build the derivative from average rate of change.',
    durationSeconds: 1440,
    status: 'coming_soon',
    segments: [{ startSeconds: 0, endSeconds: 1440, title: 'Difference quotients', skillId: 'derivative-definition' }],
  },
];

const question = (
  id: string,
  lessonId: string,
  skillIds: string[],
  difficulty: Difficulty,
  prompt: string,
  options: QuestionOption[],
  correctOptionId: string,
  explanation: string,
  misconceptionTagsByOption: Record<string, string[]> = {},
): QuestionDefinition => ({
  id, lessonId, skillIds, difficulty, prompt, options, correctOptionId, explanation,
  misconceptionTagsByOption, subjectId: 'calculus', courseId: 'ap-calculus-core', approved: true,
});

export const questions: QuestionDefinition[] = [
  question('lim-01', 'limits-foundations', ['limit-meaning'], 'easy', 'If lim x→2 f(x) = 5 but f(2) is undefined, which statement is true?', [
    { id: 'a', label: 'The limit does not exist because f(2) is undefined.' },
    { id: 'b', label: 'The limit can still equal 5 because it describes nearby behavior.' },
    { id: 'c', label: 'The limit must equal 0.' },
    { id: 'd', label: 'The function is continuous at x = 2.' },
  ], 'b', 'A limit depends on values near x = 2. The function value may be missing even when the limit exists.', {
    a: ['limit_equals_function_value'], c: ['undefined_means_zero'], d: ['continuity_missing_value'],
  }),
  question('lim-02', 'limits-foundations', ['limit-meaning'], 'medium', 'The left-hand limit of g at x = 1 is 3 and the right-hand limit is 7. What is lim x→1 g(x)?', [
    { id: 'a', label: '3' }, { id: 'b', label: '5' }, { id: 'c', label: '7' }, { id: 'd', label: 'It does not exist.' },
  ], 'd', 'A two-sided limit exists only when the left- and right-hand limits are equal.', {
    a: ['uses_left_side_only'], b: ['averages_one_sided_limits'], c: ['uses_right_side_only'],
  }),
  question('lim-03', 'limits-foundations', ['limit-algebra'], 'easy', 'Evaluate lim x→3 (x² − 9)/(x − 3).', [
    { id: 'a', label: '0' }, { id: 'b', label: '3' }, { id: 'c', label: '6' }, { id: 'd', label: 'Does not exist' },
  ], 'c', 'Factor x² − 9 = (x − 3)(x + 3), cancel for x ≠ 3, then evaluate x + 3 at 3.', {
    a: ['treats_zero_over_zero_as_zero'], b: ['cancels_incorrectly'], d: ['stops_at_indeterminate_form'],
  }),
  question('lim-04', 'limits-foundations', ['limit-algebra'], 'medium', 'Evaluate lim x→4 (√x − 2)/(x − 4).', [
    { id: 'a', label: '1/4' }, { id: 'b', label: '1/2' }, { id: 'c', label: '2' }, { id: 'd', label: 'Does not exist' },
  ], 'a', 'Rationalizing gives 1/(√x + 2), which approaches 1/4.', {
    b: ['forgets_conjugate_denominator'], c: ['uses_function_value'], d: ['stops_at_indeterminate_form'],
  }),
  question('lim-05', 'limits-foundations', ['limit-meaning', 'limit-algebra'], 'hard', 'For what value of k is h(x) continuous at x = 2 if h(x) = (x² − 4)/(x − 2) for x ≠ 2 and h(2) = k?', [
    { id: 'a', label: '0' }, { id: 'b', label: '2' }, { id: 'c', label: '4' }, { id: 'd', label: 'No value works' },
  ], 'c', 'For continuity, k must equal the limit. Simplifying gives x + 2, so the limit is 4.', {
    a: ['treats_zero_over_zero_as_zero'], b: ['uses_input_as_output'], d: ['continuity_cannot_be_repaired'],
  }),
  question('con-01', 'continuity-checklist', ['continuity'], 'easy', 'Which condition is NOT required for f to be continuous at x = a?', [
    { id: 'a', label: 'f(a) is defined' }, { id: 'b', label: 'lim x→a f(x) exists' }, { id: 'c', label: 'The derivative f′(a) exists' }, { id: 'd', label: 'lim x→a f(x) = f(a)' },
  ], 'c', 'Differentiability implies continuity, but continuity does not require differentiability.', {
    a: ['missing_continuity_condition'], b: ['missing_continuity_condition'], d: ['missing_continuity_condition'],
  }),
  question('con-02', 'continuity-checklist', ['continuity'], 'medium', 'A graph approaches 4 from both sides at x = 3, but the filled point is at (3, 1). What type of discontinuity occurs?', [
    { id: 'a', label: 'Jump' }, { id: 'b', label: 'Removable' }, { id: 'c', label: 'Infinite' }, { id: 'd', label: 'There is no discontinuity' },
  ], 'b', 'The limit exists but differs from the function value. Redefining f(3) = 4 removes the discontinuity.', {
    a: ['confuses_hole_with_jump'], c: ['confuses_hole_with_asymptote'], d: ['checks_limit_only'],
  }),
  question('con-03', 'continuity-checklist', ['continuity', 'limit-algebra'], 'hard', 'Let f(x) = kx + 1 for x < 2 and x² − 1 for x ≥ 2. Which k makes f continuous at 2?', [
    { id: 'a', label: '1/2' }, { id: 'b', label: '1' }, { id: 'c', label: '3/2' }, { id: 'd', label: '2' },
  ], 'b', 'Continuity requires 2k + 1 = 2² − 1 = 3, so k = 1.', {
    a: ['algebra_parameter_error'], c: ['algebra_parameter_error'], d: ['substitutes_k_for_x'],
  }),
];

export const getSkill = (id: string) => skills.find((skill) => skill.id === id);
export const getLesson = (id: string) => lessons.find((lesson) => lesson.id === id);
export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} min`;
