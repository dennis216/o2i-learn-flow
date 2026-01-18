-- Create subjects table for dynamic subject management
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'High School',
  icon_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Anyone can view subjects
CREATE POLICY "Anyone can view subjects" 
ON public.subjects 
FOR SELECT 
USING (true);

-- Only admins can manage subjects
CREATE POLICY "Admins can create subjects" 
ON public.subjects 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update subjects" 
ON public.subjects 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete subjects" 
ON public.subjects 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_subjects_updated_at
BEFORE UPDATE ON public.subjects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert existing subjects from courses
INSERT INTO public.subjects (name, category, order_index)
SELECT DISTINCT subject, category, ROW_NUMBER() OVER (ORDER BY category, subject) - 1
FROM public.courses
WHERE subject IS NOT NULL AND subject != ''
ON CONFLICT (name) DO NOTHING;