import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CourseVideo, ChatMessage, TranscriptEntry } from '../types';
import MarkdownWithMath from '@/components/MarkdownWithMath';

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

interface NotesAndPDFProps {
  video: CourseVideo;
  currentTime: number;
}

// Stream AI response
const streamAIResponse = async (
  message: string,
  transcript: TranscriptEntry[] | null,
  videoTitle: string,
  notesUrl: string | null,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `[Context: User is asking about the course notes/PDF] ${message}`,
        transcript,
        currentTime: 0,
        videoTitle,
        isExplainScene: false,
      }),
    });

    if (!response.ok) {
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
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Connection error');
  }
};

export function NotesAndPDF({ video, currentTime }: NotesAndPDFProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! Ask me any questions about the course notes. I can reference the video transcript to help explain difficult concepts.',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasTranscript = video.transcript && video.transcript.length > 0;
  const hasNotes = !!video.notes_url;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    const messageContent = inputValue.trim();
    if (!messageContent || isLoading) return;

    if (!hasTranscript) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: messageContent,
          timestamp: new Date(),
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '⚠️ **Transcript data not available.** Please contact an administrator to add transcript data for this video. AI features require transcript data to provide accurate responses.',
          timestamp: new Date(),
        },
      ]);
      setInputValue('');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

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
      video.transcript || null,
      video.title,
      video.notes_url || null,
      (delta) => {
        assistantContent += delta;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          )
        );
      },
      () => setIsLoading(false),
      (error) => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
      {/* PDF Preview */}
      <div className="border rounded-lg overflow-hidden bg-muted/20">
        <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <span className="font-medium text-sm">Course Notes</span>
        </div>
        {hasNotes ? (
          <iframe
            src={video.notes_url!}
            className="w-full h-[350px]"
            title="Course Notes PDF"
          />
        ) : (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No PDF notes available for this lesson</p>
              <p className="text-sm mt-1">Contact admin to upload notes</p>
            </div>
          </div>
        )}
      </div>

      {/* AI Chat */}
      <div className="border rounded-lg flex flex-col bg-background">
        <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Ask AI about Notes</span>
        </div>

        {!hasTranscript && (
          <Alert variant="destructive" className="m-3 mb-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Transcript data not available. AI features are limited.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="flex-1 p-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownWithMath content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the notes..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
