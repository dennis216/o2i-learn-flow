-- Drop the existing permissive policy that allows anyone to view forum posts
DROP POLICY IF EXISTS "Anyone can view forum posts" ON public.forum_posts;

-- Create a new policy that only allows authenticated users to view forum posts
CREATE POLICY "Authenticated users can view forum posts" 
ON public.forum_posts 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Also update related tables for consistency

-- Update discussion_posts visibility
DROP POLICY IF EXISTS "Anyone can view discussion posts" ON public.discussion_posts;
CREATE POLICY "Authenticated users can view discussion posts" 
ON public.discussion_posts 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Update post_replies visibility
DROP POLICY IF EXISTS "Anyone can view replies" ON public.post_replies;
CREATE POLICY "Authenticated users can view replies" 
ON public.post_replies 
FOR SELECT 
USING (auth.uid() IS NOT NULL);