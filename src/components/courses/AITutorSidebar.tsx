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
  windowSize: number = 15
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

// Build system prompt with embedded video context
const buildSystemPrompt = (
  relevantSegments: TranscriptEntry[],
  currentTime: number,
  videoTitle: string
): string => {
  const contextText = formatContextForAI(relevantSegments, currentTime);
  
  return `You are an expert AP Calculus tutor helping a student understand a video lesson titled "${videoTitle}".

CURRENT VIDEO CONTEXT (±15 seconds around playback position [${formatTime(currentTime)}]):
${contextText || 'No transcript data available for this moment.'}

INSTRUCTIONS:
1. Use your calculus knowledge to EXPLAIN the mathematical steps mentioned in the transcript
2. When referencing video moments, use [MM:SS] timestamp format so students can click to seek
3. Break down complex concepts step-by-step
4. Provide additional examples when helpful
5. If the transcript mentions a formula or technique, explain WHY it works mathematically`;
};

// Get math-specific explanation based on transcript content
const getMathExplanation = (transcriptText: string): string => {
  const text = transcriptText.toLowerCase();
  
  if (text.includes('limit') || text.includes('substitute')) {
    return `**Mathematical Explanation:**
When evaluating limits by direct substitution, we simply plug in the value of x directly into the function. This works when the function is continuous at that point.

**Key Steps:**
1. Identify the value x is approaching
2. Substitute that value into every x in the expression
3. Simplify to get your answer

If you get an indeterminate form (like 0/0), you'll need techniques like factoring, rationalization, or L'Hôpital's Rule.`;
  }
  
  if (text.includes('sin(x)/x') || text.includes('trig')) {
    return `**Mathematical Explanation:**
The fundamental trigonometric limit states: lim(x→0) sin(x)/x = 1

**Why This Works:**
Using the Squeeze Theorem: cos(x) ≤ sin(x)/x ≤ 1 for small x
As x→0, both bounds approach 1, so sin(x)/x must equal 1.

**Key Technique:**
When you have sin(kx)/mx, multiply by k/k to get: (k/m) · sin(kx)/(kx) = k/m · 1 = k/m`;
  }
  
  if (text.includes('squeeze theorem') || text.includes('bound')) {
    return `**Mathematical Explanation:**
The Squeeze Theorem states: If g(x) ≤ f(x) ≤ h(x) near a point c, and lim g(x) = lim h(x) = L, then lim f(x) = L.

**Application:**
1. Find lower and upper bound functions
2. Show both bounds approach the same limit L
3. Conclude the middle function also approaches L

**Common Use:** For oscillating functions like x·sin(1/x), bound by -|x| and |x|.`;
  }
  
  if (text.includes('derivative') || text.includes('f(x+h)')) {
    return `**Mathematical Explanation:**
The limit definition of the derivative is: f'(x) = lim(h→0) [f(x+h) - f(x)]/h

**Steps to Apply:**
1. Write f(x+h) by substituting (x+h) for every x
2. Subtract f(x) from f(x+h)
3. Divide the result by h
4. Take the limit as h→0

This gives the instantaneous rate of change at point x.`;
  }
  
  if (text.includes('chain rule')) {
    return `**Mathematical Explanation:**
Chain Rule: If y = f(g(x)), then dy/dx = f'(g(x)) · g'(x)

**Memory Aid:** "Derivative of outside, times derivative of inside"

**Steps:**
1. Identify the outer function f and inner function g
2. Differentiate the outer function, keeping inner unchanged
3. Multiply by the derivative of the inner function`;
  }
  
  if (text.includes('product') || text.includes('quotient')) {
    return `**Mathematical Explanation:**
**Product Rule:** d/dx[f·g] = f'g + fg'

**Quotient Rule:** d/dx[f/g] = (g·f' - f·g')/g²
Memory: "Low d-high minus high d-low, over low squared"

**Steps for Quotient:**
1. Identify numerator (high) and denominator (low)
2. Derivative of top times bottom, minus top times derivative of bottom
3. Divide by bottom squared`;
  }
  
  if (text.includes('implicit')) {
    return `**Mathematical Explanation:**
Implicit differentiation is used when y is not isolated.

**Key Rule:** When differentiating a y term, apply chain rule and multiply by dy/dx.

**Steps:**
1. Differentiate both sides with respect to x
2. Every time you differentiate y, attach dy/dx
3. Solve algebraically for dy/dx`;
  }
  
  if (text.includes('continuity') || text.includes('continuous')) {
    return `**Mathematical Explanation:**
A function is continuous at x=c if:
1. f(c) is defined
2. lim(x→c) f(x) exists
3. lim(x→c) f(x) = f(c)

**Types of Discontinuities:**
- Removable (hole): Limit exists but ≠ f(c)
- Jump: Left and right limits differ
- Infinite: Limit is ±∞ (asymptote)`;
  }
  
  if (text.includes('ivt') || text.includes('intermediate value')) {
    return `**Mathematical Explanation:**
The Intermediate Value Theorem states: If f is continuous on [a,b] and k is between f(a) and f(b), then there exists at least one c in (a,b) where f(c) = k.

**Application:**
1. Verify f is continuous on the interval
2. Calculate f(a) and f(b)
3. Show k is between these values
4. Conclude c exists (you may not know its exact value)`;
  }
  
  return `**Mathematical Insight:**
This concept is fundamental to calculus. Focus on understanding the underlying principles and practice applying them to different problem types.`;
};

// Mock AI response function - to be replaced with Supabase Edge Function
const mockAIResponse = async (
  message: string,
  transcript: TranscriptEntry[] | null,
  currentTime: number,
  isExplainScene: boolean = false,
  videoTitle: string = ''
): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  
  // Get relevant context using tight ±15 second window
  const relevantTranscript = getContextWindow(transcript, currentTime, 15);
  const contextText = formatContextForAI(relevantTranscript, currentTime);
  
  // Find the closest transcript entry to current time
  const closestEntry = relevantTranscript.reduce((closest, entry) => {
    if (!closest) return entry;
    return Math.abs(entry.s - currentTime) < Math.abs(closest.s - currentTime) ? entry : closest;
  }, relevantTranscript[0]);

  // System prompt would be sent to LLM - shown here for debugging
  const systemPrompt = buildSystemPrompt(relevantTranscript, currentTime, videoTitle);
  console.log('System Prompt for AI:', systemPrompt);

  if (isExplainScene) {
    if (!closestEntry) {
      return `I don't have transcript data for [${formatTime(currentTime)}]. 

Try seeking to one of these timestamps where I have context, or ask me a general calculus question!`;
    }
    
    const mathExplanation = getMathExplanation(closestEntry.t);
    
    return `**📍 Scene Analysis at [${formatTime(currentTime)}]**

**What the instructor is saying:**
"${closestEntry.t}"

${mathExplanation}

**📎 Nearby Context:**
${relevantTranscript.map(seg => `• [${formatTime(seg.s)}] ${seg.t}`).join('\n')}

Would you like me to work through a specific example?`;
  }
  
  // For user questions, provide context-aware responses
  if (closestEntry) {
    const mathExplanation = getMathExplanation(closestEntry.t);
    
    return `Based on what's being discussed at [${formatTime(currentTime)}]:

**Current Topic:** ${closestEntry.t}

${mathExplanation}

**Your Question:** "${message}"

${contextText ? `**Video Context:**\n${contextText}` : ''}

Would you like me to clarify any specific part?`;
  }
  
  return `I understand you're asking about "${message}".

I don't have specific transcript data for [${formatTime(currentTime)}], but I can help with general calculus concepts!

Try clicking "Explain Current Scene" when the video is at a transcribed moment, or seek to a different timestamp.`
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
      const response = await mockAIResponse(messageContent, transcript, currentTime, isExplainScene, videoTitle);
      
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
