-- Add DELETE policy for courses table (admin only)
CREATE POLICY "Admins can delete courses" 
ON public.courses 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add video_id column to practice_problems to link problems to videos
ALTER TABLE public.practice_problems 
ADD COLUMN IF NOT EXISTS video_id uuid REFERENCES public.course_videos(id) ON DELETE CASCADE;

-- Add image_url column for practice problem custom images
ALTER TABLE public.practice_problems 
ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for practice problem images
INSERT INTO storage.buckets (id, name, public)
VALUES ('practice-images', 'practice-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to practice images
CREATE POLICY "Practice images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'practice-images');

-- Allow admins to upload practice images
CREATE POLICY "Admins can upload practice images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'practice-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update practice images
CREATE POLICY "Admins can update practice images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'practice-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to delete practice images
CREATE POLICY "Admins can delete practice images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'practice-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);