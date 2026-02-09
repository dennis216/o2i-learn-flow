-- Allow zombie posts by making user_id nullable and adding profile_id reference
-- First, let's add a profile_id column to forum_posts for zombie posts
ALTER TABLE public.forum_posts 
ADD COLUMN profile_id UUID REFERENCES public.profiles(id);

-- Also add profile_id to post_replies for zombie comments
ALTER TABLE public.post_replies
ADD COLUMN profile_id UUID REFERENCES public.profiles(id);

-- Update RLS policies to allow viewing posts from zombie users
DROP POLICY IF EXISTS "Authenticated users can view forum posts" ON public.forum_posts;
CREATE POLICY "Anyone can view forum posts" ON public.forum_posts 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can view replies" ON public.post_replies;
CREATE POLICY "Anyone can view replies" ON public.post_replies 
FOR SELECT USING (true);

-- Create index for profile_id lookups
CREATE INDEX idx_forum_posts_profile_id ON public.forum_posts(profile_id);
CREATE INDEX idx_post_replies_profile_id ON public.post_replies(profile_id);