import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Bot, User, Loader2, Sparkles, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Stream AI response from edge function
const streamAIResponse = async (
  message: string,
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

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor-standalone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message }),
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

export default function AITutor() {
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `👋 Hi! I'm your **AP Calculus AI Tutor**. I can help you with:

• **Limits** - evaluating limits, indeterminate forms, L'Hôpital's Rule
• **Derivatives** - power rule, chain rule, product/quotient rules
• **Integrals** - u-substitution, integration by parts, definite integrals
• **Applications** - related rates, optimization, area/volume problems

Ask me anything about calculus concepts, or paste a problem you're working on!`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasHandledPrefill = useRef(false);

  // Handle prefilled question from Practice page
  useEffect(() => {
    const state = location.state as { prefilledQuestion?: string; topic?: string; fromPractice?: boolean } | null;
    if (state?.prefilledQuestion && state?.fromPractice && !hasHandledPrefill.current) {
      hasHandledPrefill.current = true;
      
      // Add a welcome message about the practice question
      const welcomeMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `📝 I see you have a practice question${state.topic ? ` about **${state.topic}**` : ''}! Let me help you work through it step by step.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, welcomeMessage]);
      
      // Automatically send the prefilled question as the first user message
      setTimeout(() => {
        handleSendMessage(state.prefilledQuestion);
      }, 500);

      // Clear the state so it doesn't re-trigger on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        // Show gentle inline error instead of disruptive toast
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

  const suggestedQuestions = [
    "How do I find the derivative of sin(x²)?",
    "Explain the chain rule with an example",
    "What is L'Hôpital's Rule?",
    "How do I solve related rates problems?",
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                AI Tutor
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Powered by Gemini
                </Badge>
              </h1>
              <p className="text-sm text-muted-foreground">
                Your personal AP Calculus assistant
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 sm:p-4 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownWithMath 
                      content={message.content} 
                      className="text-sm leading-relaxed"
                    />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex gap-3 sm:gap-4 justify-start">
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Questions (only show if few messages) */}
        {messages.length <= 2 && (
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleSendMessage(question)}
                  disabled={isLoading}
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">{question}</span>
                  <span className="sm:hidden">{question.length > 25 ? question.slice(0, 25) + '...' : question}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t bg-background p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about calculus..."
              disabled={isLoading}
              className="flex-1 h-12 text-base px-4 rounded-full"
            />
            <Button 
              onClick={() => handleSendMessage()} 
              disabled={isLoading || !inputValue.trim()}
              size="lg"
              className="h-12 w-12 rounded-full p-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
