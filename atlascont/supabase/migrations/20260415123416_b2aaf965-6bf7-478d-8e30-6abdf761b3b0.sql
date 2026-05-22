
CREATE TABLE public.os_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('running', 'paused', 'stopped')),
  total_seconds integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone,
  paused_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(os_id)
);

ALTER TABLE public.os_timers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_os_timers_os_id ON public.os_timers(os_id);
CREATE INDEX idx_os_timers_status ON public.os_timers(status);

-- RLS Policies
CREATE POLICY "Authenticated can read os_timers"
ON public.os_timers FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert os_timers"
ON public.os_timers FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update os_timers"
ON public.os_timers FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can manage os_timers"
ON public.os_timers FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_os_timers_updated_at
BEFORE UPDATE ON public.os_timers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
