import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface VideoContext {
  title: string;
  subject: string;
  transcript?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AITutorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneExplanation: string;
  sceneTimestamp: string;
  videoTitle: string;
  videoSubject?: string;
  onBackToVideo?: () => void;
}

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Chat memory constants
const MAX_HISTORY_MESSAGES = 10;

// Stream AI response from edge function
const streamAIResponse = async (
  message: string,
  selectedTopic: string,
  videoContext: VideoContext | null,
  conversationHistory: ChatMessage[],
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      onError('Please sign in to use the AI Tutor');
      return;
    }

    const historyForAPI = conversationHistory
      .filter(msg => msg.id !== 'greeting')
      .slice(-MAX_HISTORY_MESSAGES)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor-standalone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ 
        message,
        selectedTopic,
        videoContext,
        conversationHistory: historyForAPI,
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
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

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

export function AITutorDrawer({
  open,
  onOpenChange,
  sceneExplanation,
  sceneTimestamp,
  videoTitle,
  videoSubject,
  onBackToVideo,
}: AITutorDrawerProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Video context for AI
  const videoContext: VideoContext | null = videoTitle ? {
    title: videoTitle,
    subject: videoSubject || 'general',
  } : null;

  // Map subject to topic
  const getTopicFromSubject = (subject?: string): string => {
    if (!subject) return 'general';
    const lowerSubject = subject.toLowerCase();
    if (lowerSubject.includes('calc')) return 'ap-calc';
    if (lowerSubject.includes('geo')) return 'geometry';
    if (lowerSubject.includes('alg')) return 'algebra-1';
    if (lowerSubject.includes('sat')) return 'sat-math';
    if (lowerSubject.includes('amc')) return 'amc-10';
    return 'general';
  };

  const selectedTopic = getTopicFromSubject(videoSubject);

  // Auto-trigger the AI when drawer opens with scene explanation
  useEffect(() => {
    if (open && sceneExplanation && !hasAutoTriggered && user) {
      setHasAutoTriggered(true);
      
      // Create user message with scene context
      const contextPreview = sceneExplanation.slice(0, 300) + (sceneExplanation.length > 300 ? '...' : '');
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: `Here is the context from the scene at ${sceneTimestamp}:\n\n"${contextPreview}"\n\nPlease give me more details about this.`,
        timestamp: new Date(),
      };
      
      setMessages([userMessage]);
      
      // Trigger AI response
      setTimeout(() => {
        triggerAIResponse(userMessage.content, [userMessage]);
      }, 100);
    }
  }, [open, sceneExplanation, hasAutoTriggered, user, sceneTimestamp]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      // Small delay to allow animation to complete
      setTimeout(() => {
        setMessages([]);
        setHasAutoTriggered(false);
        setInputValue('');
        setIsLoading(false);
      }, 300);
    }
  }, [open]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const triggerAIResponse = async (userMessageContent: string, currentMessages: ChatMessage[]) => {
    setIsLoading(true);
    const assistantMessageId = (Date.now() + 1).toString();
    let assistantContent = '';

    setMessages(prev => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    await streamAIResponse(
      userMessageContent,
      selectedTopic,
      videoContext,
      currentMessages,
      (delta) => {
        assistantContent += delta;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          )
        );
      },
      () => {
        setIsLoading(false);
      },
      (error) => {
        console.error('AI Tutor error:', error);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: `Sorry, I encountered an error: ${error}` }
              : msg
          )
        );
        setIsLoading(false);
      }
    );
  };

  const handleSendMessage = async (customMessage?: string) => {
    const messageContent = customMessage || inputValue.trim();
    if (!messageContent || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!customMessage) setInputValue('');

    await triggerAIResponse(messageContent, newMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setHasAutoTriggered(false);
  };

  const handleBackClick = () => {
    onOpenChange(false);
    onBackToVideo?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[540px] sm:max-w-[540px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={handleBackClick}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Video
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <SheetTitle className="flex items-center gap-2 text-left">
            <Bot className="h-5 w-5 text-primary" />
            AI Tutor - Scene Details
          </SheetTitle>
          {videoTitle && (
            <p className="text-sm text-muted-foreground text-left">
              Discussing: {videoTitle}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Scene Context Badge */}
          {sceneTimestamp && (
            <div className="px-4 py-2 bg-accent/50 border-b">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Scene at</span>
                <Badge variant="secondary">{sceneTimestamp}</Badge>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="text-sm prose prose-sm max-w-none break-words">
                      {message.role === 'assistant' ? (
                        <MarkdownWithMath content={message.content} />
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
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

          {/* Input */}
          <div className="p-4 border-t flex-shrink-0">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button 
                onClick={() => handleSendMessage()} 
                disabled={isLoading || !inputValue.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
