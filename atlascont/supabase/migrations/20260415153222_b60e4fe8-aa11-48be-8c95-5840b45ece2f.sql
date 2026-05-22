
CREATE TABLE public.permissoes_menu_perfil (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_acesso_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  menu_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (perfil_acesso_id, menu_key)
);

ALTER TABLE public.permissoes_menu_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissoes_menu"
  ON public.permissoes_menu_perfil
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Authenticated can read permissoes_menu"
  ON public.permissoes_menu_perfil
  FOR SELECT
  TO authenticated
  USING (true);
