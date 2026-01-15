-- Create team_members table for Meet the Team feature
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Anyone can view team members
CREATE POLICY "Anyone can view team members"
ON public.team_members
FOR SELECT
USING (true);

-- Only admins can create team members
CREATE POLICY "Admins can create team members"
ON public.team_members
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update team members
CREATE POLICY "Admins can update team members"
ON public.team_members
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete team members
CREATE POLICY "Admins can delete team members"
ON public.team_members
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for team photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-photos', 'team-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for team photos
CREATE POLICY "Team photos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'team-photos');

CREATE POLICY "Admins can upload team photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update team photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete team photos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();