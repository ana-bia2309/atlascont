
-- Create junction table for multiple responsible users per OS
CREATE TABLE public.os_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(os_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.os_responsaveis ENABLE ROW LEVEL SECURITY;

-- RLS policies matching ordens_servico access
CREATE POLICY "os_responsaveis_select" ON public.os_responsaveis
  FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

CREATE POLICY "os_responsaveis_insert" ON public.os_responsaveis
  FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

CREATE POLICY "os_responsaveis_delete" ON public.os_responsaveis
  FOR DELETE TO authenticated
  USING (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

-- Migrate existing responsible_user_id data
INSERT INTO public.os_responsaveis (os_id, profile_id)
SELECT id, responsible_user_id FROM public.ordens_servico
WHERE responsible_user_id IS NOT NULL
ON CONFLICT DO NOTHING;
