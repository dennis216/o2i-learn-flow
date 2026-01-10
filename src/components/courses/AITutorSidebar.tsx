import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatMessage, TranscriptEntry } from './types';

interface AITutorSidebarProps {
  videoTitle: string;
  transcript: TranscriptEntry[] | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

// Mock AI response function - to be replaced with Supabase Edge Function
const mockAIResponse = async (
  message: string,
  transcript: TranscriptEntry[] | null,
  currentTime: number
): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  // Get relevant context from transcript around current time
  const contextWindow = 30; // seconds before and after
  const relevantTranscript = transcript?.filter(
    (entry) => entry.s >= currentTime - contextWindow && entry.s <= currentTime + contextWindow
  ) || [];
  
  const contextText = relevantTranscript.map((e) => e.t).join(' ');
  
  // Simple mock responses with timestamps
  if (message.toLowerCase().includes('explain')) {
    return `Based on what's being discussed around [${formatTime(currentTime)}], the concept here relates to the fundamental principles being taught. 

The key points are:
1. Understanding the core concept at [${formatTime(Math.max(0, currentTime - 15))}]
2. Application examples shown at [${formatTime(currentTime + 10)}]

${contextText ? `Current context: "${contextText.slice(0, 100)}..."` : 'No transcript context available for this section.'}`;
  }
  
  if (message.toLowerCase().includes('example')) {
    return `Here's an example related to the video content at [${formatTime(currentTime)}]:

The instructor demonstrates this concept step by step. You can revisit the explanation at [${formatTime(Math.max(0, currentTime - 20))}].`;
  }
  
  return `I understand you're asking about "${message}". 

Based on the current video position at [${formatTime(currentTime)}], I can help explain this concept. The relevant section starts around [${formatTime(Math.max(0, currentTime - 10))}].

${contextText ? `Related content: "${contextText.slice(0, 150)}..."` : 'Feel free to ask more specific questions about the material!'}`;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Parse timestamps from AI response and make them clickable
const parseMessageContent = (content: string, onSeek: (seconds: number) => void) => {
  const timestampRegex = /\[(\d{1,2}):(\d{2})\]/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = timestampRegex.exec(content)) !== null) {
    // Add text before the timestamp
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const totalSeconds = minutes * 60 + seconds;

    parts.push(
      <Badge
        key={match.index}
        variant="secondary"
        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors mx-1"
        onClick={() => onSeek(totalSeconds)}
      >
        {match[0]}
      </Badge>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
};

export function AITutorSidebar({ videoTitle, transcript, currentTime, onSeek }: AITutorSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hi! I'm your AI tutor for "${videoTitle}". Ask me anything about the video content, and I'll help explain concepts with references to specific moments in the video.`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await mockAIResponse(userMessage.content, transcript, currentTime);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="h-full flex flex-col border-l-0 rounded-l-none">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          AI Tutor
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Current position: {formatTime(currentTime)}
        </p>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
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
                  <div className="text-sm whitespace-pre-wrap">
                    {message.role === 'assistant'
                      ? parseMessageContent(message.content, onSeek)
                      : message.content}
                  </div>
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
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
        
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the video..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
