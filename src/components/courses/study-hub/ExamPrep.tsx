import { useState } from 'react';
import { ClipboardList, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CourseVideo } from '../types';
import MarkdownWithMath from '@/components/MarkdownWithMath';

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

interface ExamPrepProps {
  video: CourseVideo;
}

interface MockQuestion {
  id: number;
  question: string;
  solution: string;
  showSolution: boolean;
}

export function ExamPrep({ video }: ExamPrepProps) {
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
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Based on the video content, create exactly 5 original practice problems that would appear on an exam. Format your response EXACTLY as follows:

---QUESTION 1---
[Write the question here. Use LaTeX for all math: $inline$ or $$display$$]

---SOLUTION 1---
[Write the complete step-by-step solution with explanations. Use LaTeX for all math.]

---QUESTION 2---
[Question 2]

---SOLUTION 2---
[Solution 2]

---QUESTION 3---
[Question 3]

---SOLUTION 3---
[Solution 3]

---QUESTION 4---
[Question 4]

---SOLUTION 4---
[Solution 4]

---QUESTION 5---
[Question 5]

---SOLUTION 5---
[Solution 5]

Important:
- Make problems progressively harder (easy → medium → hard)
- Use proper LaTeX formatting for ALL math expressions
- Include a variety of problem types (conceptual, computational, application)
- Respond in English only`,
          transcript: video.transcript,
          currentTime: 0,
          videoTitle: video.title,
          isExplainScene: false,
        }),
      });

      if (!response.ok) {
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
      for (let i = 1; i <= 5; i++) {
        const questionMatch = fullContent.match(
          new RegExp(`---QUESTION ${i}---([\\s\\S]*?)(?=---SOLUTION ${i}---|$)`, 'i')
        );
        const solutionMatch = fullContent.match(
          new RegExp(`---SOLUTION ${i}---([\\s\\S]*?)(?=---QUESTION ${i + 1}---|$)`, 'i')
        );

        if (questionMatch) {
          parsedQuestions.push({
            id: i,
            question: questionMatch[1].trim(),
            solution: solutionMatch ? solutionMatch[1].trim() : 'Solution not available',
            showSolution: false,
          });
        }
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
        {questions.map((q, index) => (
          <Card key={q.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {q.id}
                </span>
                <span className="text-muted-foreground text-sm">
                  {index === 0 ? 'Easy' : index < 3 ? 'Medium' : 'Hard'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="prose prose-sm dark:prose-invert max-w-none">
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
                  <div className="mt-3 p-4 bg-muted/50 rounded-lg border-l-4 border-primary">
                    <h4 className="font-semibold text-sm mb-2 text-primary">Solution:</h4>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownWithMath content={q.solution} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
