import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CourseVideo } from '../types';
import MarkdownWithMath from '@/components/MarkdownWithMath';

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

interface AISummaryProps {
  video: CourseVideo;
}

interface ReviewPacket {
  coreConcepts: string;
  keyFormulas: string;
  commonPitfalls: string;
}

export function AISummary({ video }: AISummaryProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewPacket, setReviewPacket] = useState<ReviewPacket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasTranscript = video.transcript && video.transcript.length > 0;

  const generateReviewPacket = async () => {
    if (!hasTranscript) {
      setError('Transcript data not available. Please contact an administrator to add transcript data for this video.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const transcriptText = video.transcript!
        .map((entry) => entry.t)
        .join(' ');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Based on the video transcript, generate a comprehensive review packet. Structure your response EXACTLY as follows with these three sections:

## Core Concepts
[List the main concepts and ideas covered in this lesson. Use bullet points. Include mathematical definitions where appropriate using LaTeX formatting like $formula$.]

## Key Formulas
[List all important formulas and equations from this lesson. Use LaTeX formatting for all math, e.g., $$\\int f(x) dx$$. Explain when each formula is used.]

## Common Pitfalls
[List common mistakes students make with these concepts. Provide tips on how to avoid them.]

Make sure to use proper LaTeX formatting ($$...$$ for display math, $...$ for inline) for ALL mathematical expressions. Respond in English only.`,
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
    const regex = new RegExp(`##\\s*${sectionName}([\\s\\S]*?)(?=##|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : `No ${sectionName.toLowerCase()} found in this lesson.`;
  };

  if (!reviewPacket) {
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

        <Button
          onClick={generateReviewPacket}
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
              <Sparkles className="h-4 w-4" />
              Generate Review Packet
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Review Packet: {video.title}</h3>
        <Button variant="outline" size="sm" onClick={generateReviewPacket} disabled={isGenerating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
          Regenerate
        </Button>
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
