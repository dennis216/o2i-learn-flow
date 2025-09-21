-- Add problem_type enum
CREATE TYPE public.problem_type AS ENUM (
  'geometry',
  'algebra',
  'calculus',
  'number_theory',
  'combinatorics',
  'pre_calculus',
  'statistics',
  'other'
);

-- Add problem_type and is_public columns to solution_requests
ALTER TABLE public.solution_requests 
ADD COLUMN problem_type public.problem_type DEFAULT 'other',
ADD COLUMN is_public boolean DEFAULT false;

-- Create the discussion_posts table for forum post discussions
CREATE TABLE public.discussion_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forum_post_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on discussion_posts
ALTER TABLE public.discussion_posts ENABLE ROW LEVEL SECURITY;

-- Create policies for discussion_posts
CREATE POLICY "Anyone can view discussion posts" 
ON public.discussion_posts 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create discussion posts" 
ON public.discussion_posts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discussion posts" 
ON public.discussion_posts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discussion posts" 
ON public.discussion_posts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on discussion_posts
CREATE TRIGGER update_discussion_posts_updated_at
BEFORE UPDATE ON public.discussion_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();