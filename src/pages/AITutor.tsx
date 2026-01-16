import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Bot, User, Loader2, Sparkles, BookOpen, Trash2, Download, FileText, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Subject/topic options for the selector
const TOPIC_OPTIONS = [
  { value: 'general', label: 'General Math Help', category: 'General' },
  { value: 'ap-calc', label: 'AP Calculus', category: 'High School' },
  { value: 'ap-stats', label: 'AP Statistics', category: 'High School' },
  { value: 'ap-precalc', label: 'AP Precalculus', category: 'High School' },
  { value: 'sat-math', label: 'SAT Math', category: 'High School' },
  { value: 'algebra-1', label: 'Algebra 1', category: 'High School' },
  { value: 'algebra-2', label: 'Algebra 2', category: 'High School' },
  { value: 'geometry', label: 'Geometry', category: 'High School' },
  { value: 'counting-prob', label: 'Counting & Probability', category: 'High School' },
  { value: 'amc-10', label: 'AMC 10', category: 'Contest' },
  { value: 'amc-12', label: 'AMC 12', category: 'Contest' },
  { value: 'euclid', label: 'Euclid Contest', category: 'Contest' },
  { value: 'fermat', label: 'Fermat Contest', category: 'Contest' },
  { value: 'cayley', label: 'Cayley Contest', category: 'Contest' },
  { value: 'pascal', label: 'Pascal Contest', category: 'Contest' },
  { value: 'gauss', label: 'Gauss Contest', category: 'Contest' },
];

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

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Stream AI response from edge function
const streamAIResponse = async (
  message: string,
  selectedTopic: string,
  videoContext: VideoContext | null,
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
      body: JSON.stringify({ 
        message,
        selectedTopic,
        videoContext,
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

export default function AITutor() {
  const location = useLocation();
  const { user } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState('general');
  const [videoContext, setVideoContext] = useState<VideoContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasHandledPrefill = useRef(false);
  const hasInitialized = useRef(false);

  // Generate the greeting message
  const getGreetingMessage = useCallback((videoTitle?: string): ChatMessage => {
    let greeting = `👋 Hi! I'm your **O2I AI Tutor**. I can help you with:

• **High School Courses** — AP Calc, AP Stats, SAT Math, Algebra, Geometry, Pre-Calculus
• **Contest Prep** — AMC 10/12, Euclid, Fermat, Cayley, Pascal, Gauss`;

    if (videoTitle) {
      greeting += `\n\n📺 I see you're studying **${videoTitle}**. Feel free to ask questions about this lesson!`;
    } else {
      greeting += `\n\nAsk me any conceptual questions or paste a problem you're working on!`;
    }

    return {
      id: 'greeting',
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    };
  }, []);

  // Save message to database
  const saveMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!user) return;
    
    try {
      await supabase.from('ai_tutor_chats').insert({
        user_id: user.id,
        role,
        content,
        topic: selectedTopic,
        video_context: videoContext ? {
          title: videoContext.title,
          subject: videoContext.subject,
        } : null,
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }, [user, selectedTopic, videoContext]);

  // Load chat history from database
  const loadChatHistory = useCallback(async () => {
    if (!user) {
      setIsLoadingHistory(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ai_tutor_chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        const loadedMessages: ChatMessage[] = data.map((msg) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
        setMessages(loadedMessages);
      } else {
        // No history, show greeting
        const state = location.state as { videoTitle?: string } | null;
        setMessages([getGreetingMessage(state?.videoTitle)]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      const state = location.state as { videoTitle?: string } | null;
      setMessages([getGreetingMessage(state?.videoTitle)]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, location.state, getGreetingMessage]);

  // Clear chat history
  const clearChatHistory = useCallback(async () => {
    if (!user) return;

    try {
      await supabase
        .from('ai_tutor_chats')
        .delete()
        .eq('user_id', user.id);

      const state = location.state as { videoTitle?: string } | null;
      setMessages([getGreetingMessage(state?.videoTitle)]);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
    }
  }, [user, location.state, getGreetingMessage]);

  // Initialize on mount - load history and set context
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const state = location.state as { 
      prefilledQuestion?: string; 
      topic?: string; 
      fromPractice?: boolean;
      videoTitle?: string;
      videoSubject?: string;
      videoTranscript?: string;
    } | null;

    // Set video context if coming from a video page
    if (state?.videoTitle && state?.videoSubject) {
      setVideoContext({
        title: state.videoTitle,
        subject: state.videoSubject,
        transcript: state.videoTranscript,
      });
      
      // Auto-select topic based on video subject
      const matchedTopic = TOPIC_OPTIONS.find(
        opt => opt.label.toLowerCase().includes(state.videoSubject.toLowerCase())
      );
      if (matchedTopic) {
        setSelectedTopic(matchedTopic.value);
      }
    }

    // Load chat history
    loadChatHistory();
  }, [location.state, loadChatHistory]);

  // Handle prefilled question from Practice page
  useEffect(() => {
    const state = location.state as { prefilledQuestion?: string; topic?: string; fromPractice?: boolean } | null;
    if (state?.prefilledQuestion && state?.fromPractice && !hasHandledPrefill.current && messages.length > 0) {
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
  }, [location.state, messages.length]);

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

    // Save user message to database
    saveMessage('user', messageContent);

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
      selectedTopic,
      videoContext,
      (delta) => {
        assistantContent += delta;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: assistantContent } : msg
          )
        );
      },
      () => {
        // Save assistant response to database
        saveMessage('assistant', assistantContent);
        setIsLoading(false);
      },
      (error) => {
        console.error('AI Tutor error:', error);
        const errorMessage = `Sorry, I encountered an error: ${error}`;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: errorMessage }
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
    "How do I solve quadratic equations?",
    "Explain the chain rule with an example",
    "Tips for AMC 10 number theory problems?",
    "How do I find the area of a triangle using coordinates?",
  ];

  // Export chat as Markdown
  const exportAsMarkdown = useCallback(() => {
    const topicLabel = TOPIC_OPTIONS.find(t => t.value === selectedTopic)?.label || 'General';
    const date = new Date().toLocaleDateString();
    
    let markdown = `# O2I AI Tutor Chat Export\n`;
    markdown += `**Topic:** ${topicLabel}\n`;
    markdown += `**Date:** ${date}\n`;
    if (videoContext) {
      markdown += `**Lesson:** ${videoContext.title}\n`;
    }
    markdown += `\n---\n\n`;

    messages.forEach((msg) => {
      if (msg.id === 'greeting') return; // Skip greeting in export
      const role = msg.role === 'user' ? '**You:**' : '**AI Tutor:**';
      markdown += `${role}\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `o2i-tutor-chat-${date.replace(/\//g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, selectedTopic, videoContext]);

  // Export chat as PDF (uses print dialog with KaTeX rendering)
  const exportAsPDF = useCallback(() => {
    const topicLabel = TOPIC_OPTIONS.find(t => t.value === selectedTopic)?.label || 'General';
    const date = new Date().toLocaleDateString();

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Function to convert markdown + LaTeX to HTML
    const convertToHTML = (text: string): string => {
      let result = text;
      
      // Escape HTML first (except for our conversions)
      result = result
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Convert display math ($$...$$) - must be before inline math
      result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        return `<div class="math-display" data-math="${encodeURIComponent(math.trim())}"></div>`;
      });
      
      // Convert inline math ($...$)
      result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
        return `<span class="math-inline" data-math="${encodeURIComponent(math.trim())}"></span>`;
      });
      
      // Convert markdown formatting
      result = result
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      
      return result;
    };

    let messagesHTML = '';
    messages.forEach((msg) => {
      if (msg.id === 'greeting') return;
      const roleClass = msg.role;
      const roleLabel = msg.role === 'user' ? 'You' : 'AI Tutor';
      const content = convertToHTML(msg.content);
      
      messagesHTML += `
        <div class="message ${roleClass}">
          <div class="role">${roleLabel}</div>
          <div class="content">${content}</div>
        </div>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>O2I AI Tutor Chat - ${date}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; }
          h1 { color: #6366f1; margin-bottom: 8px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
          .message { margin-bottom: 24px; padding: 16px; border-radius: 12px; }
          .user { background: #6366f1; color: white; margin-left: 40px; }
          .assistant { background: #f3f4f6; margin-right: 40px; }
          .role { font-weight: bold; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .user .role { color: rgba(255,255,255,0.8); }
          .assistant .role { color: #6366f1; }
          pre { background: #1f2937; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow-x: auto; }
          code { font-family: 'Fira Code', monospace; font-size: 14px; background: rgba(0,0,0,0.1); padding: 2px 4px; border-radius: 4px; }
          .user code { background: rgba(255,255,255,0.2); }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 32px 0; }
          .math-display { margin: 16px 0; text-align: center; }
          .math-inline { display: inline; }
          .katex { font-size: 1.1em; }
          .math-display .katex { font-size: 1.2em; }
          @media print { 
            body { padding: 20px; } 
            .message { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>🤖 O2I AI Tutor Chat</h1>
        <div class="meta">
          <strong>Topic:</strong> ${topicLabel}<br>
          <strong>Date:</strong> ${date}
          ${videoContext ? `<br><strong>Lesson:</strong> ${videoContext.title}` : ''}
        </div>
        <hr>
        ${messagesHTML}
        <script>
          // Render all math expressions with KaTeX
          document.querySelectorAll('.math-display').forEach(el => {
            try {
              const math = decodeURIComponent(el.dataset.math);
              katex.render(math, el, { displayMode: true, throwOnError: false });
            } catch (e) {
              el.textContent = el.dataset.math;
            }
          });
          document.querySelectorAll('.math-inline').forEach(el => {
            try {
              const math = decodeURIComponent(el.dataset.math);
              katex.render(math, el, { displayMode: false, throwOnError: false });
            } catch (e) {
              el.textContent = el.dataset.math;
            }
          });
          // Trigger print after rendering
          setTimeout(() => window.print(), 500);
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }, [messages, selectedTopic, videoContext]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                  O2I AI Tutor
                  <Badge variant="secondary" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    All-in-One Math
                  </Badge>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your personal math assistant for courses & contests
                </p>
              </div>
            </div>
            
            {/* Topic Selector & Clear History */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">Topic:</span>
              <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                <SelectTrigger className="w-[140px] sm:w-[180px] bg-background">
                  <SelectValue placeholder="Select topic" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="general">General Math Help</SelectItem>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">High School</div>
                  {TOPIC_OPTIONS.filter(t => t.category === 'High School').map(topic => (
                    <SelectItem key={topic.value} value={topic.value}>{topic.label}</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Contest</div>
                  {TOPIC_OPTIONS.filter(t => t.category === 'Contest').map(topic => (
                    <SelectItem key={topic.value} value={topic.value}>{topic.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {messages.length > 1 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground"
                        title="Export chat"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background border shadow-lg">
                      <DropdownMenuItem onClick={exportAsMarkdown} className="cursor-pointer">
                        <FileText className="h-4 w-4 mr-2" />
                        Export as Markdown
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportAsPDF} className="cursor-pointer">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearChatHistory}
                    className="text-muted-foreground hover:text-destructive"
                    title="Clear chat history"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {/* Video Context Badge */}
          {videoContext && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-primary/5">
                📺 Studying: {videoContext.title}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-6 space-y-6">
            {isLoadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.map((message) => (
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
            {!isLoadingHistory && isLoading && messages[messages.length - 1]?.content === '' && (
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
              placeholder="Ask me any math question..."
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
