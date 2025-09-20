-- Create roadmaps table
CREATE TABLE public.roadmaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chapters table
CREATE TABLE public.chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_id UUID NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sub_chapters table
CREATE TABLE public.sub_chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_summaries table
CREATE TABLE public.ai_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  sub_chapter_id UUID REFERENCES public.sub_chapters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ai_summaries_parent_check CHECK (
    (chapter_id IS NOT NULL AND sub_chapter_id IS NULL) OR 
    (chapter_id IS NULL AND sub_chapter_id IS NOT NULL)
  )
);

-- Create video_lessons table
CREATE TABLE public.video_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  sub_chapter_id UUID REFERENCES public.sub_chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT video_lessons_parent_check CHECK (
    (chapter_id IS NOT NULL AND sub_chapter_id IS NULL) OR 
    (chapter_id IS NULL AND sub_chapter_id IS NOT NULL)
  )
);

-- Create practice_problems table
CREATE TABLE public.practice_problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  sub_chapter_id UUID REFERENCES public.sub_chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  solution TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT practice_problems_parent_check CHECK (
    (chapter_id IS NOT NULL AND sub_chapter_id IS NULL) OR 
    (chapter_id IS NULL AND sub_chapter_id IS NOT NULL)
  )
);

-- Create user_progress table
CREATE TABLE public.user_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  roadmap_id UUID REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  sub_chapter_id UUID REFERENCES public.sub_chapters(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, chapter_id, sub_chapter_id)
);

-- Enable RLS on all tables
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for roadmap videos
INSERT INTO storage.buckets (id, name, public) VALUES ('roadmap-videos', 'roadmap-videos', true);

-- RLS Policies for roadmaps
CREATE POLICY "Anyone can view roadmaps" ON public.roadmaps FOR SELECT USING (true);
CREATE POLICY "Admins can create roadmaps" ON public.roadmaps FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update roadmaps" ON public.roadmaps FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete roadmaps" ON public.roadmaps FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for chapters
CREATE POLICY "Anyone can view chapters" ON public.chapters FOR SELECT USING (true);
CREATE POLICY "Admins can create chapters" ON public.chapters FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update chapters" ON public.chapters FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete chapters" ON public.chapters FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for sub_chapters
CREATE POLICY "Anyone can view sub_chapters" ON public.sub_chapters FOR SELECT USING (true);
CREATE POLICY "Admins can create sub_chapters" ON public.sub_chapters FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update sub_chapters" ON public.sub_chapters FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete sub_chapters" ON public.sub_chapters FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for ai_summaries
CREATE POLICY "Anyone can view ai_summaries" ON public.ai_summaries FOR SELECT USING (true);
CREATE POLICY "Admins can create ai_summaries" ON public.ai_summaries FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update ai_summaries" ON public.ai_summaries FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete ai_summaries" ON public.ai_summaries FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for video_lessons
CREATE POLICY "Anyone can view video_lessons" ON public.video_lessons FOR SELECT USING (true);
CREATE POLICY "Admins can create video_lessons" ON public.video_lessons FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update video_lessons" ON public.video_lessons FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete video_lessons" ON public.video_lessons FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for practice_problems
CREATE POLICY "Anyone can view practice_problems" ON public.practice_problems FOR SELECT USING (true);
CREATE POLICY "Admins can create practice_problems" ON public.practice_problems FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update practice_problems" ON public.practice_problems FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete practice_problems" ON public.practice_problems FOR DELETE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for user_progress
CREATE POLICY "Users can view their own progress" ON public.user_progress FOR SELECT 
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own progress" ON public.user_progress FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress" ON public.user_progress FOR UPDATE 
  USING (auth.uid() = user_id);

-- Storage policies for roadmap videos
CREATE POLICY "Anyone can view roadmap videos" ON storage.objects FOR SELECT 
  USING (bucket_id = 'roadmap-videos');
CREATE POLICY "Admins can upload roadmap videos" ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'roadmap-videos' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update roadmap videos" ON storage.objects FOR UPDATE 
  USING (bucket_id = 'roadmap-videos' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete roadmap videos" ON storage.objects FOR DELETE 
  USING (bucket_id = 'roadmap-videos' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Add triggers for updated_at columns
CREATE TRIGGER update_roadmaps_updated_at BEFORE UPDATE ON public.roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sub_chapters_updated_at BEFORE UPDATE ON public.sub_chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_summaries_updated_at BEFORE UPDATE ON public.ai_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_video_lessons_updated_at BEFORE UPDATE ON public.video_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_practice_problems_updated_at BEFORE UPDATE ON public.practice_problems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();