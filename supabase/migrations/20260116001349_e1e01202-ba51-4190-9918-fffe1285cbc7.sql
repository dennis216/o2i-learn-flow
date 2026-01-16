-- Create a table to store AI tutor chat history
CREATE TABLE public.ai_tutor_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  topic TEXT DEFAULT 'general',
  video_context JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ai_tutor_chats ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (users can only see/manage their own chats)
CREATE POLICY "Users can view their own chat history" 
ON public.ai_tutor_chats 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages" 
ON public.ai_tutor_chats 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat history" 
ON public.ai_tutor_chats 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_ai_tutor_chats_user_id ON public.ai_tutor_chats(user_id);
CREATE INDEX idx_ai_tutor_chats_created_at ON public.ai_tutor_chats(created_at DESC);