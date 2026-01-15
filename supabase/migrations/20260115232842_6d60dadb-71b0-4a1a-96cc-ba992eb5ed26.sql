-- Create playground_links table for GeoGebra interactive models
CREATE TABLE public.playground_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  geogebra_url TEXT NOT NULL,
  description TEXT,
  target_subject TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.playground_links ENABLE ROW LEVEL SECURITY;

-- Public can view all playground links (they're educational content)
CREATE POLICY "Anyone can view playground links"
ON public.playground_links
FOR SELECT
USING (true);

-- Only admins can insert playground links
CREATE POLICY "Admins can insert playground links"
ON public.playground_links
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can update playground links
CREATE POLICY "Admins can update playground links"
ON public.playground_links
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can delete playground links
CREATE POLICY "Admins can delete playground links"
ON public.playground_links
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_playground_links_updated_at
BEFORE UPDATE ON public.playground_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for efficient subject filtering
CREATE INDEX idx_playground_links_subject ON public.playground_links(target_subject);
CREATE INDEX idx_playground_links_order ON public.playground_links(order_index);