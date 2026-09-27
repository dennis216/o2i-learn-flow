-- Courses are drafts by default. Public visitors and ordinary users can only
-- read published courses and their attached content; admins can read all.

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Keep the two CED-aligned launch courses visible. Legacy courses remain drafts.
UPDATE public.courses
SET is_published = id IN (
  '93124428-92f4-48d2-a6dc-e5f9e010248b',
  'fccc7540-0c29-43be-8682-ae90ff2534cb'
);

DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
DROP POLICY IF EXISTS "Published courses are publicly readable" ON public.courses;

CREATE POLICY "Published courses are publicly readable"
ON public.courses
FOR SELECT
TO public
USING (
  is_published
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR instructor_id = auth.uid()
);

DROP POLICY IF EXISTS "Anyone can view course videos" ON public.course_videos;
DROP POLICY IF EXISTS "Visible course videos are publicly readable" ON public.course_videos;

CREATE POLICY "Visible course videos are publicly readable"
ON public.course_videos
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.courses
    WHERE courses.id = course_videos.course_id
  )
);

DROP POLICY IF EXISTS "Course curriculum mappings are publicly readable"
ON public.course_curriculum_units;
DROP POLICY IF EXISTS "Visible course curriculum mappings are publicly readable"
ON public.course_curriculum_units;

CREATE POLICY "Visible course curriculum mappings are publicly readable"
ON public.course_curriculum_units
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.courses
    WHERE courses.id = course_curriculum_units.course_id
  )
);

COMMENT ON COLUMN public.courses.is_published IS
  'Draft/published gate controlled by content admins. Public users only read published courses.';
