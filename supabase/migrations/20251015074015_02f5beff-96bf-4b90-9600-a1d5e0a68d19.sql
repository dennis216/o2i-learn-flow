-- Add tags field to forum_posts table
ALTER TABLE forum_posts 
ADD COLUMN IF NOT EXISTS tags text[];