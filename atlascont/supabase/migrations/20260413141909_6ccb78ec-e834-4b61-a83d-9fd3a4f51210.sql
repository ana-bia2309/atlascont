
CREATE TABLE public.permissoes_perfil (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_acesso_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  permissao text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (perfil_acesso_id, permissao)
);

CREATE INDEX idx_permissoes_perfil_perfil_id ON public.permissoes_perfil(perfil_acesso_id);

ALTER TABLE public.permissoes_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read permissoes"
  ON public.permissoes_perfil
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage permissoes"
  ON public.permissoes_perfil
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));
