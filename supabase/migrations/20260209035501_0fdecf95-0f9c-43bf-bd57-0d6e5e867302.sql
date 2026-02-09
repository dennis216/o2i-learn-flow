-- Create zombie_topics table for storing post content
CREATE TABLE public.zombie_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create zombie_comments table for storing comment content
CREATE TABLE public.zombie_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  sentiment TEXT DEFAULT 'positive', -- positive, neutral, question
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pending_zombie_comments table to track scheduled comments
CREATE TABLE public.pending_zombie_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  zombie_user_id UUID NOT NULL,
  comment_content TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  executed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zombie_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zombie_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_zombie_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies - only service role can access these tables
CREATE POLICY "Service role only for zombie_topics" ON public.zombie_topics FOR ALL USING (false);
CREATE POLICY "Service role only for zombie_comments" ON public.zombie_comments FOR ALL USING (false);
CREATE POLICY "Service role only for pending_zombie_comments" ON public.pending_zombie_comments FOR ALL USING (false);

-- Insert initial zombie topics (math discussion topics)
INSERT INTO public.zombie_topics (title, content, category, tags) VALUES
('How to approach limit problems?', 'I''ve been struggling with limit problems, especially when dealing with indeterminate forms. What strategies do you recommend for beginners?', 'general', ARRAY['calculus', 'limits', 'help']),
('Best resources for AP Calculus prep?', 'Taking the AP Calc exam next month. What resources helped you the most? Looking for practice problems and review materials.', 'general', ARRAY['ap-calculus', 'exam-prep', 'resources']),
('Understanding the Chain Rule', 'Can someone explain the chain rule in simple terms? I understand the formula but struggle with when to apply it.', 'general', ARRAY['calculus', 'derivatives', 'chain-rule']),
('Geometric vs Arithmetic Sequences', 'What''s the easiest way to identify whether a sequence is geometric or arithmetic? Sometimes I get confused.', 'general', ARRAY['sequences', 'pre-calculus', 'basics']),
('Integration by Parts Tips', 'Does anyone have good tips for knowing when to use integration by parts vs substitution? I always pick the wrong method.', 'general', ARRAY['calculus', 'integration', 'techniques']),
('Trigonometric Identities Study Group', 'Anyone interested in forming a study group for trig identities? They''re so hard to memorize!', 'general', ARRAY['trigonometry', 'study-group', 'identities']),
('Real-world applications of derivatives?', 'My teacher keeps saying calculus is useful in real life. Can anyone share actual examples of how derivatives are used?', 'general', ARRAY['calculus', 'applications', 'real-world']),
('Struggling with word problems', 'I can solve equations fine but word problems always trip me up. How do you translate them into math?', 'general', ARRAY['problem-solving', 'word-problems', 'help']);

-- Insert initial zombie comments (generic math discussion responses)
INSERT INTO public.zombie_comments (content, sentiment) VALUES
('I have the same question! Following this thread.', 'neutral'),
('Check out lesson 3 in the course, it explains this really well.', 'positive'),
('This makes so much more sense now, thanks for sharing!', 'positive'),
('Have you tried watching the video on this topic? It helped me a lot.', 'positive'),
('Great question! I was confused about this too.', 'neutral'),
('The practice problems in Unit 2 really helped me understand this concept.', 'positive'),
('I found that drawing diagrams helps with these types of problems.', 'positive'),
('Thanks for explaining! Can you elaborate a bit more?', 'question'),
('This is exactly what I needed to hear. Much appreciated!', 'positive'),
('I recommend reviewing the fundamentals first before tackling this.', 'positive'),
('Anyone else find this topic challenging? We should study together!', 'neutral'),
('The AI Tutor feature really helped me with similar questions.', 'positive');