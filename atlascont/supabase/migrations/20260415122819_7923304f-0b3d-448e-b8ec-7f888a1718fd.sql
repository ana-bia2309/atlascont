
-- Create os_photos table
CREATE TABLE public.os_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.os_photos ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX idx_os_photos_os_id ON public.os_photos(os_id);

-- Trigger to enforce max 2 photos per OS
CREATE OR REPLACE FUNCTION public.check_os_photos_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.os_photos WHERE os_id = NEW.os_id) >= 2 THEN
    RAISE EXCEPTION 'Limite de 2 fotos por OS atingido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_os_photos_limit
BEFORE INSERT ON public.os_photos
FOR EACH ROW
EXECUTE FUNCTION public.check_os_photos_limit();

-- RLS Policies
CREATE POLICY "Authenticated can read os_photos"
ON public.os_photos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert os_photos"
ON public.os_photos FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can delete own photos"
ON public.os_photos FOR DELETE TO authenticated
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Admins can manage os_photos"
ON public.os_photos FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));
