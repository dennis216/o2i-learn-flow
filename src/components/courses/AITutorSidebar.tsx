import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
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

// Get transcript segments within a time window (±60 seconds)
const getContextWindow = (
  transcript: TranscriptEntry[] | null,
  currentTime: number,
  windowSize: number = 7
): TranscriptEntry[] => {
  if (!transcript) return [];
  return transcript.filter(
    (entry) => entry.s >= currentTime - windowSize && entry.s <= currentTime + windowSize
  );
};

// Format context for AI prompt
const formatContextForAI = (
  relevantSegments: TranscriptEntry[],
  currentTime: number
): string => {
  if (relevantSegments.length === 0) return '';
  
  return relevantSegments
    .map((seg) => `[${formatTime(seg.s)}] ${seg.t}`)
    .join('\n');
};

// Mock AI response function - to be replaced with Supabase Edge Function
const mockAIResponse = async (
  message: string,
  transcript: TranscriptEntry[] | null,
  currentTime: number,
  isExplainScene: boolean = false
): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  // Get relevant context from transcript around current time (±60 seconds)
  const relevantTranscript = getContextWindow(transcript, currentTime, 60);
  const contextText = formatContextForAI(relevantTranscript, currentTime);
  
  // Find the closest transcript entry to current time
  const closestEntry = relevantTranscript.reduce((closest, entry) => {
    if (!closest) return entry;
    return Math.abs(entry.s - currentTime) < Math.abs(closest.s - currentTime) ? entry : closest;
  }, relevantTranscript[0]);

  if (isExplainScene) {
    if (!closestEntry) {
      return `I don't have transcript data for this moment at [${formatTime(currentTime)}]. Try seeking to a different part of the video or ask me a specific question!`;
    }
    
    return `**📍 Current Scene at [${formatTime(currentTime)}]**

**What's happening:** ${closestEntry.t}

**Context from nearby segments:**
${relevantTranscript.slice(0, 3).map(seg => `• [${formatTime(seg.s)}] ${seg.t}`).join('\n')}

**Key takeaway:** This section covers ${closestEntry.t.toLowerCase().includes('limit') ? 'limit concepts' : closestEntry.t.toLowerCase().includes('derivative') ? 'derivative techniques' : 'fundamental calculus principles'}. 

Would you like me to explain this concept in more detail?`;
  }
  
  if (message.toLowerCase().includes('explain')) {
    return `Based on what's being discussed around [${formatTime(currentTime)}]:

${closestEntry ? `**Current topic:** ${closestEntry.t}` : 'No specific topic detected.'}

**Key points:**
1. Understanding the core concept at [${formatTime(Math.max(0, currentTime - 15))}]
2. Application examples shown at [${formatTime(currentTime + 10)}]

${contextText ? `**Transcript context:**\n${contextText}` : 'No transcript context available for this section.'}`;
  }
  
  if (message.toLowerCase().includes('example')) {
    return `Here's an example related to the video content at [${formatTime(currentTime)}]:

The instructor demonstrates this concept step by step. You can revisit the explanation at [${formatTime(Math.max(0, currentTime - 20))}].

${closestEntry ? `**Related concept:** ${closestEntry.t}` : ''}`;
  }
  
  return `I understand you're asking about "${message}". 

Based on the current video position at [${formatTime(currentTime)}]:

${closestEntry ? `**Currently discussing:** ${closestEntry.t}` : 'No specific topic at this timestamp.'}

The relevant section starts around [${formatTime(Math.max(0, currentTime - 10))}].

${contextText ? `**Related content:**\n${contextText}` : 'Feel free to ask more specific questions about the material!'}`;
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
      content: `Hi! I'm your AI tutor for "${videoTitle}". Ask me anything about the video content, or click **"Explain Current Scene"** to get context about what's happening right now!`,
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

  const handleSendMessage = async (customMessage?: string, isExplainScene: boolean = false) => {
    const messageContent = customMessage || inputValue.trim();
    if (!messageContent || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: isExplainScene ? `🎬 Explain what's happening at ${formatTime(currentTime)}` : messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customMessage) setInputValue('');
    setIsLoading(true);

    try {
      const response = await mockAIResponse(messageContent, transcript, currentTime, isExplainScene);
      
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

  const handleExplainScene = () => {
    handleSendMessage('Explain current scene', true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="h-full flex flex-col border-l-0 rounded-l-none">
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
          disabled={isLoading}
        >
          <Sparkles className="h-4 w-4" />
          Explain Current Scene
        </Button>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
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
