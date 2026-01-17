import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Bot, User, Loader2, Sparkles, BookOpen, Trash2, Download, FileText, FileDown, Plus, MessageSquare, Pencil, Check, X } from 'lucide-react';
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
  DropdownMenuSeparator,
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

interface ChatSession {
  id: string;
  name: string;
  topic: string;
  video_context: VideoContext | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Chat memory constants
const MAX_HISTORY_MESSAGES = 10; // Only send last 10 messages to save tokens
const MAX_SESSION_MESSAGES = 50; // Hard limit before prompting to clear

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
    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      onError('Please sign in to use the AI Tutor');
      return;
    }

    // Prepare conversation history (exclude greeting, last 10 messages)
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

  // Session management state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  // Load all sessions for the user
  const loadSessions = useCallback(async () => {
    if (!user) {
      setIsLoadingSessions(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ai_tutor_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const loadedSessions: ChatSession[] = (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        topic: s.topic || 'general',
        video_context: s.video_context as unknown as VideoContext | null,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));

      setSessions(loadedSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [user]);

  // Create a new session
  const createNewSession = useCallback(async (name?: string, topic?: string, videoCtx?: VideoContext | null) => {
    if (!user) return null;

    const sessionName = name || 'New Chat';
    const sessionTopic = topic || selectedTopic;

    try {
      const { data, error } = await supabase
        .from('ai_tutor_sessions')
        .insert({
          user_id: user.id,
          name: sessionName,
          topic: sessionTopic,
          video_context: videoCtx ? { title: videoCtx.title, subject: videoCtx.subject } : null,
        })
        .select()
        .single();

      if (error) throw error;

      const newSession: ChatSession = {
        id: data.id,
        name: data.name,
        topic: data.topic || 'general',
        video_context: data.video_context as unknown as VideoContext | null,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([getGreetingMessage(videoCtx?.title)]);
      
      return newSession;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  }, [user, selectedTopic, getGreetingMessage]);

  // Rename a session
  const renameSession = useCallback(async (sessionId: string, newName: string) => {
    if (!user || !newName.trim()) return;

    try {
      const { error } = await supabase
        .from('ai_tutor_sessions')
        .update({ name: newName.trim() })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, name: newName.trim() } : s
      ));
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  }, [user]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('ai_tutor_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // If we deleted the current session, switch to another or create new
      if (currentSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          switchToSession(remaining[0].id);
        } else {
          createNewSession();
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [user, currentSessionId, sessions]);

  // Switch to a different session
  const switchToSession = useCallback(async (sessionId: string) => {
    if (!user || sessionId === currentSessionId) return;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    setCurrentSessionId(sessionId);
    setSelectedTopic(session.topic);
    setVideoContext(session.video_context);
    setIsLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('ai_tutor_chats')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

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
        setMessages([getGreetingMessage(session.video_context?.title)]);
      }
    } catch (error) {
      console.error('Failed to load session messages:', error);
      setMessages([getGreetingMessage(session.video_context?.title)]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, currentSessionId, sessions, getGreetingMessage]);

  // Save message to database
  const saveMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!user || !currentSessionId) return;
    
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
        session_id: currentSessionId,
      });

      // Update session's updated_at
      await supabase
        .from('ai_tutor_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      // Move session to top of list
      setSessions(prev => {
        const session = prev.find(s => s.id === currentSessionId);
        if (!session) return prev;
        return [{ ...session, updated_at: new Date().toISOString() }, ...prev.filter(s => s.id !== currentSessionId)];
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }, [user, selectedTopic, videoContext, currentSessionId]);

  // Load chat history for current session or create initial session
  const initializeSession = useCallback(async () => {
    if (!user) {
      setIsLoadingHistory(false);
      setIsLoadingSessions(false);
      return;
    }

    const state = location.state as { 
      videoTitle?: string;
      videoSubject?: string;
      videoTranscript?: string;
    } | null;

    const videoCtx = state?.videoTitle && state?.videoSubject ? {
      title: state.videoTitle,
      subject: state.videoSubject,
      transcript: state.videoTranscript,
    } : null;

    // Load existing sessions
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('ai_tutor_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      const loadedSessions: ChatSession[] = (sessionsData || []).map((s) => ({
        id: s.id,
        name: s.name,
        topic: s.topic || 'general',
        video_context: s.video_context as unknown as VideoContext | null,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));

      setSessions(loadedSessions);
      setIsLoadingSessions(false);

      // Check for legacy messages without session_id and migrate them
      const { data: legacyMessages } = await supabase
        .from('ai_tutor_chats')
        .select('*')
        .eq('user_id', user.id)
        .is('session_id', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (legacyMessages && legacyMessages.length > 0) {
        // Create a session for legacy messages
        const { data: legacySession } = await supabase
          .from('ai_tutor_sessions')
          .insert({
            user_id: user.id,
            name: 'Previous Conversations',
            topic: legacyMessages[0].topic || 'general',
            video_context: legacyMessages[0].video_context,
          })
          .select()
          .single();

        if (legacySession) {
          // Update legacy messages with the new session_id
          await supabase
            .from('ai_tutor_chats')
            .update({ session_id: legacySession.id })
            .eq('user_id', user.id)
            .is('session_id', null);

          const newSession: ChatSession = {
            id: legacySession.id,
            name: legacySession.name,
            topic: legacySession.topic || 'general',
            video_context: legacySession.video_context as unknown as VideoContext | null,
            created_at: legacySession.created_at,
            updated_at: legacySession.updated_at,
          };

          loadedSessions.unshift(newSession);
          setSessions(loadedSessions);
        }
      }

      // If we have video context from navigation, create a new session for it
      if (videoCtx) {
        setVideoContext(videoCtx);
        const matchedTopic = TOPIC_OPTIONS.find(
          opt => opt.label.toLowerCase().includes(videoCtx.subject.toLowerCase())
        );
        if (matchedTopic) {
          setSelectedTopic(matchedTopic.value);
        }

        const newSession = await createNewSession(
          `${videoCtx.title} Discussion`,
          matchedTopic?.value || 'general',
          videoCtx
        );
        if (newSession) {
          setIsLoadingHistory(false);
          return;
        }
      }

      // Otherwise, use the most recent session or create a new one
      if (loadedSessions.length > 0) {
        const latestSession = loadedSessions[0];
        setCurrentSessionId(latestSession.id);
        setSelectedTopic(latestSession.topic);
        setVideoContext(latestSession.video_context);

        // Load messages for this session
        const { data: msgData, error: msgError } = await supabase
          .from('ai_tutor_chats')
          .select('*')
          .eq('session_id', latestSession.id)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        if (msgData && msgData.length > 0) {
          const loadedMessages: ChatMessage[] = msgData.map((msg) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at),
          }));
          setMessages(loadedMessages);
        } else {
          setMessages([getGreetingMessage(latestSession.video_context?.title)]);
        }
      } else {
        // No sessions exist, create a new one
        await createNewSession();
      }
    } catch (error) {
      console.error('Failed to initialize sessions:', error);
      setMessages([getGreetingMessage()]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, location.state, getGreetingMessage, createNewSession]);

  // Clear current session's chat history
  const clearChatHistory = useCallback(async () => {
    if (!user || !currentSessionId) return;

    try {
      await supabase
        .from('ai_tutor_chats')
        .delete()
        .eq('session_id', currentSessionId);

      const session = sessions.find(s => s.id === currentSessionId);
      setMessages([getGreetingMessage(session?.video_context?.title)]);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
    }
  }, [user, currentSessionId, sessions, getGreetingMessage]);

  // Initialize on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    initializeSession();
  }, [initializeSession]);

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

    // Check if session has too many messages (hard limit of 50)
    const nonGreetingMessages = messages.filter(m => m.id !== 'greeting');
    if (nonGreetingMessages.length >= MAX_SESSION_MESSAGES) {
      // Show warning instead of sending
      const warningMessage: ChatMessage = {
        id: 'limit-warning-' + Date.now(),
        role: 'assistant',
        content: `⚠️ **Chat session limit reached!**\n\nThis conversation has ${nonGreetingMessages.length} messages. To maintain performance and save tokens, please clear the chat history or start a new session before continuing.\n\nClick the **Clear Chat** button (trash icon) above, or create a **New Chat** from the sidebar.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, warningMessage]);
      return;
    }

    // Ensure we have a session
    if (!currentSessionId) {
      const newSession = await createNewSession();
      if (!newSession) return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    // Get current messages for history (before adding new ones)
    const currentMessages = [...messages, userMessage];

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
      currentMessages, // Pass conversation history
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

  const handleStartEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditingName(session.name);
  };

  const handleSaveEdit = () => {
    if (editingSessionId && editingName.trim()) {
      renameSession(editingSessionId, editingName);
    }
    setEditingSessionId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditingName('');
  };

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
            
            {/* Session Selector & Actions */}
            <div className="flex items-center gap-2">
              {/* Session Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="max-w-[160px] sm:max-w-[200px]">
                    <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">
                      {isLoadingSessions ? 'Loading...' : (
                        sessions.find(s => s.id === currentSessionId)?.name || 'Select Chat'
                      )}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-background border shadow-lg max-h-80 overflow-y-auto">
                  <DropdownMenuItem 
                    onClick={() => createNewSession()}
                    className="cursor-pointer text-primary font-medium"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Chat
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {sessions.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      No saved chats yet
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div key={session.id} className="flex items-center group">
                        {editingSessionId === session.id ? (
                          <div className="flex items-center gap-1 px-2 py-1.5 w-full">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-7 text-sm flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveEdit}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancelEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <DropdownMenuItem 
                              onClick={() => switchToSession(session.id)}
                              className={`cursor-pointer flex-1 ${session.id === currentSessionId ? 'bg-primary/10' : ''}`}
                            >
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate font-medium">{session.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(session.updated_at).toLocaleDateString()}
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditing(session);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSession(session.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Topic Selector */}
              <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                <SelectTrigger className="w-[120px] sm:w-[160px] bg-background">
                  <SelectValue placeholder="Topic" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="general">General Math</SelectItem>
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
