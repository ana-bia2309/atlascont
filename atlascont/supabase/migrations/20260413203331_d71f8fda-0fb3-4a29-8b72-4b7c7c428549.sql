
CREATE TABLE public.comentarios_os (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  texto text NOT NULL,
  autor_nome text NOT NULL,
  autor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comentarios_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read comentarios"
  ON public.comentarios_os FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert comentarios"
  ON public.comentarios_os FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can manage comentarios"
  ON public.comentarios_os FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE INDEX idx_comentarios_os_os_id ON public.comentarios_os(os_id);
