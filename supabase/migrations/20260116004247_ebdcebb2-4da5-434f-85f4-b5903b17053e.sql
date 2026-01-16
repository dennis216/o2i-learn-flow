-- Create a table for named chat sessions
CREATE TABLE public.ai_tutor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'New Chat',
  topic TEXT DEFAULT 'general',
  video_context JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ai_tutor_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own sessions" 
ON public.ai_tutor_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions" 
ON public.ai_tutor_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" 
ON public.ai_tutor_sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" 
ON public.ai_tutor_sessions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add session_id to ai_tutor_chats table
ALTER TABLE public.ai_tutor_chats 
ADD COLUMN session_id UUID REFERENCES public.ai_tutor_sessions(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_ai_tutor_chats_session_id ON public.ai_tutor_chats(session_id);
CREATE INDEX idx_ai_tutor_sessions_user_id ON public.ai_tutor_sessions(user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_tutor_sessions_updated_at
BEFORE UPDATE ON public.ai_tutor_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();