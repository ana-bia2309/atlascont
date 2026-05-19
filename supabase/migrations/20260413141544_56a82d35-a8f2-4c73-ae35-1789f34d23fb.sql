
-- Tabela de perfis de acesso customizados
CREATE TABLE public.perfis_acesso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  descricao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.perfis_acesso ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ler
CREATE POLICY "Authenticated can read perfis_acesso"
  ON public.perfis_acesso
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas admins podem gerenciar
CREATE POLICY "Admins can manage perfis_acesso"
  ON public.perfis_acesso
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Trigger de updated_at
CREATE TRIGGER update_perfis_acesso_updated_at
  BEFORE UPDATE ON public.perfis_acesso
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar FK na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN perfil_acesso_id uuid REFERENCES public.perfis_acesso(id) ON DELETE SET NULL;

-- Seed com perfis baseados nos roles atuais
INSERT INTO public.perfis_acesso (nome) VALUES
  ('Administrador'),
  ('Gestor'),
  ('Técnico'),
  ('Visualização');
