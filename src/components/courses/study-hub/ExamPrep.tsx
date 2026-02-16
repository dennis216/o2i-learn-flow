import { useState } from 'react';
import { ClipboardList, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Target, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { CourseVideo } from '../types';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

interface ExamPrepProps {
  video: CourseVideo;
  onAskTutor?: (prompt: string) => void;
}

interface MockQuestion {
  id: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  question: string;
  solution: string;
  showSolution: boolean;
}

const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const isSolutionMissing = (solution: string): boolean => {
  if (!solution) return true;
  const lower = solution.trim().toLowerCase();
  return lower === '' || lower === 'solution not available' || lower === 'no solution';
};

export function ExamPrep({ video, onAskTutor }: ExamPrepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hasTranscript = video.transcript && video.transcript.length > 0;

  const generateMockTest = async () => {
    if (!hasTranscript) {
      setError('Transcript data not available. Please contact an administrator to add transcript data for this video.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Please sign in to use this feature');
        setIsGenerating(false);
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: `Based on the video content, create exactly 5 original exam-style practice problems with FULL step-by-step solutions for each.

CRITICAL FORMATTING RULES:
1. Every mathematical expression MUST be wrapped in $$ delimiters on its own line (display math) or $ delimiters inline.
2. NEVER put LaTeX directly adjacent to text - always add blank lines before and after display math.
3. Use $$...$$ for display math (fractions, integrals, equations).
4. Use $...$ for short inline references like $x$, $y$, $m = 2$.

MANDATORY LaTeX PATTERNS:
- Derivatives: Always write $$\\frac{dy}{dx}$$ — never write dy/dx as plain text.
- Integration: Always write $$\\int_{a}^{b} f(x)\\,dx$$ with \\, before dx.
- Coordinates/Points: Write $$\\left(\\frac{\\sqrt{2}}{2},\\, \\frac{\\pi}{4}\\right)$$ using \\left( and \\right).
- Fractions: Always use $$\\frac{a}{b}$$ — never write a/b for non-trivial fractions.
- Piecewise functions: ALWAYS use the cases environment:
   $$f(x) = \\begin{cases} x^2 & x < 3 \\\\ 10 - x & x \\geq 3 \\end{cases}$$
- Implicit differentiation: Show each step on its own line, e.g.:

$$\\cos(y) \\cdot \\frac{dy}{dx} = 2x$$

$$\\frac{dy}{dx} = \\frac{2x}{\\cos(y)}$$

6. NEVER leave $$ tags unclosed. Every $$ must have a matching closing $$.

YOU MUST GENERATE EXACTLY 5 QUESTIONS. No fewer. If topics are narrow, create variations with different parameters.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

===QUESTION_1===
DIFFICULTY: Easy

[Write the problem statement here. When including math, put it on a new line:]

$$\\frac{x^2}{2}$$

[Continue with more text if needed]
===END_QUESTION_1===

===SOLUTION_1===
**Step 1:** [Explanation text]

$$[math expression]$$

**Step 2:** [Next step explanation]

$$[resulting expression]$$

**Final Answer:**

$$[final answer]$$
===END_SOLUTION_1===

===QUESTION_2===
DIFFICULTY: Easy

[Question 2 content]
===END_QUESTION_2===

===SOLUTION_2===
[Solution 2 content with full steps]
===END_SOLUTION_2===

===QUESTION_3===
DIFFICULTY: Medium

[Question 3 content]
===END_QUESTION_3===

===SOLUTION_3===
[Solution 3 content with full steps]
===END_SOLUTION_3===

===QUESTION_4===
DIFFICULTY: Medium

[Question 4 content]
===END_QUESTION_4===

===SOLUTION_4===
[Solution 4 content with full steps]
===END_SOLUTION_4===

===QUESTION_5===
DIFFICULTY: Hard

[Question 5 content]
===END_QUESTION_5===

===SOLUTION_5===
[Solution 5 content with full steps]
===END_SOLUTION_5===

IMPORTANT REMINDERS:
- Always leave a blank line before and after every $$ block
- Never clump text and math: write "Since we have\\n\\n$$\\frac{0}{0}$$\\n\\n" not "Sincewehave$$..."
- Include a variety of problem types (conceptual, computational, application)
- EVERY solution must have detailed step-by-step work. NEVER leave a solution empty.
- For implicit differentiation, show the full chain rule steps with proper \\frac{dy}{dx}
- For tangent line problems, clearly substitute coordinates into the derivative
- Use \\left( and \\right) for parentheses around fractions/roots
- Respond in English only`,
          transcript: video.transcript,
          currentTime: 0,
          videoTitle: video.title,
          isExplainScene: false,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to use this feature');
        }
        throw new Error('Failed to generate mock test');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) fullContent += content;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Parse questions and solutions
      const parsedQuestions: MockQuestion[] = [];
      for (let i = 1; i <= 10; i++) {
        const questionMatch = fullContent.match(
          new RegExp(`===QUESTION_${i}===([\\s\\S]*?)===END_QUESTION_${i}===`, 'i')
        );
        const solutionMatch = fullContent.match(
          new RegExp(`===SOLUTION_${i}===([\\s\\S]*?)===END_SOLUTION_${i}===`, 'i')
        );

        const oldQuestionMatch = !questionMatch ? fullContent.match(
          new RegExp(`---QUESTION ${i}---([\\s\\S]*?)(?=---SOLUTION ${i}---|$)`, 'i')
        ) : null;
        const oldSolutionMatch = !solutionMatch ? fullContent.match(
          new RegExp(`---SOLUTION ${i}---([\\s\\S]*?)(?=---QUESTION ${i + 1}---|$)`, 'i')
        ) : null;

        const questionContent = questionMatch?.[1] || oldQuestionMatch?.[1];
        const solutionContent = solutionMatch?.[1] || oldSolutionMatch?.[1];

        if (questionContent) {
          const difficultyMatch = questionContent.match(/DIFFICULTY:\s*(Easy|Medium|Hard)/i);
          let difficulty: 'Easy' | 'Medium' | 'Hard' = i <= 2 ? 'Easy' : i <= 4 ? 'Medium' : 'Hard';
          if (difficultyMatch) {
            difficulty = difficultyMatch[1] as 'Easy' | 'Medium' | 'Hard';
          }

          const cleanQuestion = questionContent
            .replace(/DIFFICULTY:\s*(Easy|Medium|Hard)\s*/i, '')
            .trim();

          parsedQuestions.push({
            id: i,
            difficulty,
            question: cleanQuestion,
            solution: solutionContent?.trim() || '',
            showSolution: false,
          });
        }

        if (parsedQuestions.length >= 5) break;
      }

      // Guarantee exactly 5 questions - pad if fewer were parsed
      while (parsedQuestions.length < 5) {
        const idx = parsedQuestions.length + 1;
        parsedQuestions.push({
          id: idx,
          difficulty: idx <= 2 ? 'Easy' : idx <= 4 ? 'Medium' : 'Hard',
          question: `**Bonus Question ${idx}:** Based on the concepts from "${video.title}", create and solve a practice problem applying the key techniques discussed in this lesson.`,
          solution: '',
          showSolution: false,
        });
      }

      setQuestions(parsedQuestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate mock test');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSolution = (id: number) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, showSolution: !q.showSolution } : q))
    );
  };

  const handleAskTutorForQuestion = (question: MockQuestion) => {
    const prompt = `Explain the solution for this Mock Test question:\n\n"${question.question.slice(0, 500)}"`;
    if (onAskTutor) {
      onAskTutor(prompt);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ClipboardList className="h-16 w-16 text-primary/50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">Mock Test Generator</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Generate 5 original practice problems based on this lesson's content, complete with step-by-step solutions.
        </p>

        {!hasTranscript && (
          <Alert variant="destructive" className="mb-4 max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Transcript data not available. Please contact an administrator.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4 max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={generateMockTest}
          disabled={isGenerating || !hasTranscript}
          size="lg"
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <ClipboardList className="h-4 w-4" />
              Create Mock Test
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Mock Test: {video.title}</h3>
        <Button variant="outline" size="sm" onClick={generateMockTest} disabled={isGenerating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
          New Test
        </Button>
      </div>

      <div className="space-y-4">
        {questions.map((q) => (
          <Card key={q.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                  {q.id}
                </span>
                <Badge className={DIFFICULTY_COLORS[q.difficulty]}>
                  <Target className="h-3 w-3 mr-1" />
                  {q.difficulty}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 p-4 rounded-lg">
                <MarkdownWithMath content={q.question} />
              </div>

              <Collapsible open={q.showSolution} onOpenChange={() => toggleSolution(q.id)}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    {q.showSolution ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Hide Solution
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Show Solution
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {isSolutionMissing(q.solution) ? (
                    <div className="mt-3 p-5 rounded-lg border-2 border-[#4A90E2]/30 bg-[#4A90E2]/5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#4A90E2]/10 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="h-5 w-5 text-[#4A90E2]" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-[#4A90E2] mb-1">
                            No pre-written solution available
                          </h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Click below to ask our AI Tutor for a detailed step-by-step solution to this problem.
                          </p>
                          <Button
                            size="sm"
                            className="gap-2 bg-[#4A90E2] hover:bg-[#4A90E2]/90 text-white"
                            onClick={() => handleAskTutorForQuestion(q)}
                          >
                            <Sparkles className="h-4 w-4" />
                            Ask AI Tutor to Solve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border-l-4 border-green-500">
                      <h4 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">
                        Step-by-Step Solution:
                      </h4>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownWithMath content={q.solution} />
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
