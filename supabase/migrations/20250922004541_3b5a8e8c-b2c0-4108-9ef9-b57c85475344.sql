-- Add foreign key constraint to discussion_posts
ALTER TABLE public.discussion_posts 
ADD CONSTRAINT discussion_posts_forum_post_id_fkey 
FOREIGN KEY (forum_post_id) REFERENCES public.forum_posts(id) ON DELETE CASCADE;

ALTER TABLE public.discussion_posts 
ADD CONSTRAINT discussion_posts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;