-- Update RLS policies to hide private solution requests from other users
DROP POLICY IF EXISTS "Users can view all solution requests" ON solution_requests;

-- New policy: Users can only see public requests or their own requests
CREATE POLICY "Users can view public requests or their own" 
ON public.solution_requests 
FOR SELECT 
USING (
  is_public = true 
  OR auth.uid() = user_id
);