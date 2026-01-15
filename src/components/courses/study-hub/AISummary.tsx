import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, RefreshCw, Zap, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CourseVideo } from '../types';
import MarkdownWithMath from '@/components/MarkdownWithMath';

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

interface AISummaryProps {
  video: CourseVideo;
}

type DetailLevel = 'quick' | 'detailed';

interface ReviewPacket {
  coreConcepts: string;
  keyFormulas: string;
  commonPitfalls: string;
}

export function AISummary({ video }: AISummaryProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewPacket, setReviewPacket] = useState<ReviewPacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<DetailLevel | null>(null);

  const hasTranscript = video.transcript && video.transcript.length > 0;

  const generateReviewPacket = async (level: DetailLevel) => {
    if (!hasTranscript) {
      setError('Transcript data not available. Please contact an administrator to add transcript data for this video.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSelectedLevel(level);

    const quickPrompt = `Based on the video transcript, generate a QUICK SUMMARY review packet. Keep it concise and to the point.

CRITICAL FORMATTING RULES:
1. Every mathematical expression MUST be on its own line with $$ delimiters
2. NEVER put LaTeX directly adjacent to text - always add blank lines before and after
3. Use bullet points for easy scanning
4. Keep each section brief (3-5 bullet points max)

FORMAT:

## Core Concepts

- [Key concept 1]
- [Key concept 2 with formula:]

$$[formula]$$

- [Key concept 3]

## Key Formulas

- **[Formula name]:**

$$[formula]$$

- **[Another formula]:**

$$[formula]$$

## Common Pitfalls

- [Common mistake 1]
- [Common mistake 2]
- [How to avoid them]

Respond in English only. Be brief and direct.`;

    const detailedPrompt = `Based on the video transcript, generate a COMPREHENSIVE DETAILED GUIDE. Include thorough explanations and step-by-step breakdowns.

CRITICAL FORMATTING RULES:
1. Every mathematical expression MUST be on its own line with $$ delimiters
2. NEVER put LaTeX directly adjacent to text - always add blank lines before and after
3. Include examples and detailed explanations
4. Reference specific concepts from the video

FORMAT:

## Core Concepts

### [Concept 1 Name]
[Detailed explanation of the concept...]

When we apply this, we get:

$$[relevant formula]$$

This means that...

### [Concept 2 Name]
[Another detailed explanation...]

The key insight here is:

$$[formula]$$

## Key Formulas

### [Formula 1 Name]
**Definition:**

$$[formula]$$

**When to use:** [Explanation of when this applies]

**Example:** If we have...

$$[example calculation]$$

### [Formula 2 Name]
**Definition:**

$$[formula]$$

**Derivation/Intuition:** [Why this formula works...]

## Common Pitfalls

### Mistake 1: [Description]
Many students incorrectly assume...

**Correct approach:**

$$[correct formula/approach]$$

### Mistake 2: [Description]
[Detailed explanation of the mistake and how to avoid it]

Respond in English only. Be thorough and educational.`;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: level === 'quick' ? quickPrompt : detailedPrompt,
          transcript: video.transcript,
          currentTime: 0,
          videoTitle: video.title,
          isExplainScene: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate review packet');
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

      // Parse sections from the response
      const coreConcepts = extractSection(fullContent, 'Core Concepts');
      const keyFormulas = extractSection(fullContent, 'Key Formulas');
      const commonPitfalls = extractSection(fullContent, 'Common Pitfalls');

      setReviewPacket({
        coreConcepts,
        keyFormulas,
        commonPitfalls,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate review packet');
    } finally {
      setIsGenerating(false);
    }
  };

  const extractSection = (content: string, sectionName: string): string => {
    const regex = new RegExp(`##\\s*${sectionName}([\\s\\S]*?)(?=##\\s*[A-Z]|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : `No ${sectionName.toLowerCase()} found in this lesson.`;
  };

  const resetAndRegenerate = () => {
    setReviewPacket(null);
    setSelectedLevel(null);
  };

  if (!reviewPacket && !selectedLevel) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Sparkles className="h-16 w-16 text-primary/50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">AI Review Sheet</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Generate a comprehensive review packet with core concepts, key formulas, and common pitfalls.
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

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => generateReviewPacket('quick')}
            disabled={isGenerating || !hasTranscript}
            size="lg"
            variant="outline"
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            Quick Summary
          </Button>
          <Button
            onClick={() => generateReviewPacket('detailed')}
            disabled={isGenerating || !hasTranscript}
            size="lg"
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            Detailed Guide
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground mt-3 text-center max-w-sm">
          <strong>Quick Summary:</strong> Bullet points &amp; key formulas.
          <br />
          <strong>Detailed Guide:</strong> In-depth explanations &amp; examples.
        </p>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          Generating {selectedLevel === 'quick' ? 'Quick Summary' : 'Detailed Guide'}...
        </h3>
        <p className="text-muted-foreground text-center max-w-md">
          Analyzing video transcript and creating your personalized review packet.
        </p>
      </div>
    );
  }

  if (!reviewPacket) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Review Packet: {video.title}</h3>
          <span className="text-xs bg-muted px-2 py-1 rounded-full">
            {selectedLevel === 'quick' ? '⚡ Quick' : '📖 Detailed'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={resetAndRegenerate}>
            Change Type
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => selectedLevel && generateReviewPacket(selectedLevel)} 
            disabled={isGenerating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            Regenerate
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                1
              </span>
              Core Concepts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownWithMath content={reviewPacket.coreConcepts} />
          </CardContent>
        </Card>

        <Card className="border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-600">
                2
              </span>
              Key Formulas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownWithMath content={reviewPacket.keyFormulas} />
          </CardContent>
        </Card>

        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center text-xs font-bold text-amber-600">
                3
              </span>
              Common Pitfalls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownWithMath content={reviewPacket.commonPitfalls} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
