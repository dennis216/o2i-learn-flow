import { useState, useRef, useEffect } from 'react';
import { Bot, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TranscriptEntry } from './types';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';
import { AITutorDrawer } from './AITutorDrawer';

interface AITutorSidebarProps {
  videoTitle: string;
  transcript: TranscriptEntry[] | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
  videoId?: string;
  courseId?: string;
  courseSubject?: string;
}

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Stream AI response from edge function
const streamAIResponse = async (
  message: string,
  transcript: TranscriptEntry[] | null,
  currentTime: number,
  isExplainScene: boolean,
  videoTitle: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      onError('Please sign in to use the AI Tutor');
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message,
        transcript,
        currentTime,
        videoTitle,
        isExplainScene,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        onError('Please sign in to use the AI Tutor');
        return;
      }
      if (response.status === 429) {
        onError('Rate limit exceeded. Please wait a moment and try again.');
        return;
      }
      if (response.status === 402) {
        onError('AI credits exhausted. Please add credits to continue.');
        return;
      }
      const errorData = await response.json().catch(() => ({}));
      onError(errorData.error || 'Failed to get AI response');
      return;
    }

    if (!response.body) {
      onError('No response stream available');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process line by line
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          // Incomplete JSON, put back and wait for more
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Final flush
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (raw.startsWith(':') || raw.trim() === '') continue;
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (error) {
    console.error('Stream error:', error);
    onError(error instanceof Error ? error.message : 'Connection error');
  }
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function AITutorSidebar({ videoTitle, transcript, currentTime, onSeek, videoId, courseId, courseSubject }: AITutorSidebarProps) {
  // Scene explanation state
  const [sceneExplanation, setSceneExplanation] = useState<string | null>(null);
  const [sceneTimestamp, setSceneTimestamp] = useState<number | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  // Drawer state for "Ask more details"
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSceneContext, setDrawerSceneContext] = useState<string>('');
  const [drawerTimestamp, setDrawerTimestamp] = useState<string>('');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when scene explanation updates
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sceneExplanation]);

  const handleExplainScene = async () => {
    if (isExplaining) return;
    
    // Clear previous explanation and set loading state
    setSceneExplanation(null);
    setSceneTimestamp(currentTime);
    setIsExplaining(true);
    
    let explanationContent = '';

    await streamAIResponse(
      'Explain current scene',
      transcript,
      currentTime,
      true,
      videoTitle,
      (delta) => {
        explanationContent += delta;
        setSceneExplanation(explanationContent);
      },
      () => {
        setIsExplaining(false);
      },
      (error) => {
        console.error('Explain scene error:', error);
        setSceneExplanation(`Sorry, I encountered an error: ${error}`);
        setIsExplaining(false);
      }
    );
  };

  const handleAskMoreDetails = () => {
    const sceneContext = sceneExplanation || 'the current scene';
    const timestamp = formatTime(sceneTimestamp || currentTime);
    
    // Open the drawer instead of navigating
    setDrawerSceneContext(sceneContext);
    setDrawerTimestamp(timestamp);
    setIsDrawerOpen(true);
  };

  return (
    <Card className="h-full flex flex-col border-l-0 rounded-l-none overflow-hidden">
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          AI Tutor
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Current position: {formatTime(currentTime)}
        </p>
        {/* Explain Current Scene Button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-2 w-full gap-2"
          onClick={handleExplainScene}
          disabled={isExplaining}
        >
          <Sparkles className="h-4 w-4" />
          {isExplaining ? 'Explaining...' : 'Explain Current Scene'}
        </Button>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4 w-full overflow-hidden">
            {/* Scene Explanation Panel */}
            {(sceneExplanation || isExplaining) && (
              <div className="bg-accent/50 border border-accent rounded-lg p-3 w-full overflow-hidden">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  Scene at {formatTime(sceneTimestamp || currentTime)}
                </div>
                {isExplaining && !sceneExplanation ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Analyzing scene...</span>
                  </div>
                ) : (
                  <div className="text-sm prose prose-sm max-w-none break-words overflow-hidden">
                    <MarkdownWithMath content={sceneExplanation || ''} />
                  </div>
                )}
                {/* Ask More Details Button */}
                {sceneExplanation && !isExplaining && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 gap-2 text-primary hover:text-primary"
                    onClick={handleAskMoreDetails}
                  >
                    Ask more details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            
            {/* Empty state when no scene explanation */}
            {!sceneExplanation && !isExplaining && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Click "Explain Current Scene" to get an AI-powered explanation of what's happening in the video.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* AI Tutor Drawer for detailed discussions */}
      <AITutorDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        sceneExplanation={drawerSceneContext}
        sceneTimestamp={drawerTimestamp}
        videoTitle={videoTitle}
        videoSubject={courseSubject}
      />
    </Card>
  );
}
