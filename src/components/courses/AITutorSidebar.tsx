import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatMessage, TranscriptEntry } from './types';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';

interface AITutorSidebarProps {
  videoTitle: string;
  transcript: TranscriptEntry[] | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
  videoId?: string;
  courseId?: string;
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

// Parse timestamps from AI response and make them clickable, while preserving markdown
const parseMessageWithTimestamps = (content: string, onSeek: (seconds: number) => void) => {
  const timestampRegex = /\[(\d{1,2}):(\d{2})\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = timestampRegex.exec(content)) !== null) {
    // Add text before the timestamp (rendered with markdown)
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <MarkdownWithMath key={`text-${keyIndex++}`} content={textBefore} className="inline" />
      );
    }

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const totalSeconds = minutes * 60 + seconds;

    parts.push(
      <Badge
        key={`ts-${keyIndex++}`}
        variant="secondary"
        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors mx-1 inline-flex"
        onClick={() => onSeek(totalSeconds)}
      >
        {match[0]}
      </Badge>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (rendered with markdown)
  if (lastIndex < content.length) {
    parts.push(
      <MarkdownWithMath key={`text-${keyIndex++}`} content={content.slice(lastIndex)} className="inline" />
    );
  }

  // If no timestamps found, render entire content with markdown
  if (parts.length === 0) {
    return <MarkdownWithMath content={content} />;
  }

  return <div className="inline">{parts}</div>;
};

export function AITutorSidebar({ videoTitle, transcript, currentTime, onSeek, videoId, courseId }: AITutorSidebarProps) {
  const navigate = useNavigate();
  // Regular chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Scene explanation state (separate from chat)
  const [sceneExplanation, setSceneExplanation] = useState<string | null>(null);
  const [sceneTimestamp, setSceneTimestamp] = useState<number | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sceneExplanation]);

  const handleSendMessage = async (customMessage?: string) => {
    const messageContent = customMessage || inputValue.trim();
    if (!messageContent || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customMessage) setInputValue('');
    setIsLoading(true);

    // Create assistant message placeholder for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    let assistantContent = '';

    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    await streamAIResponse(
      messageContent,
      transcript,
      currentTime,
      false,
      videoTitle,
      (delta) => {
        assistantContent += delta;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          )
        );
      },
      () => {
        setIsLoading(false);
      },
      (error) => {
        console.error('AI Tutor error:', error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: `Sorry, I encountered an error: ${error}` }
              : msg
          )
        );
        setIsLoading(false);
      }
    );
  };

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
    const contextPreview = sceneContext.slice(0, 300) + (sceneContext.length > 300 ? '...' : '');
    
    navigate('/ai-tutor', {
      state: {
        fromSceneExplainer: true,
        sceneExplanation: sceneContext,
        sceneTimestamp: timestamp,
        videoTitle,
        autoMessage: `Here is the context from the scene at ${timestamp}:\n\n"${contextPreview}"\n\nPlease give me more details about this.`,
        // Return context for "Back to Lesson" button
        returnToLesson: {
          videoId,
          courseId,
          videoTime: currentTime,
          videoTitle,
        },
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
            {/* Scene Explanation Panel - separate from chat */}
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
            
            {/* Regular Chat Messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 w-full overflow-hidden ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-lg p-3 overflow-hidden break-words ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="text-sm overflow-hidden">
                    {message.role === 'assistant'
                      ? parseMessageWithTimestamps(message.content, onSeek)
                      : <div className="whitespace-pre-wrap break-words">{message.content}</div>}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the video..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
