
-- Table for OS collaborators
CREATE TABLE public.os_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(os_id, profile_id)
);

-- RLS
ALTER TABLE public.os_colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "os_colaboradores_select" ON public.os_colaboradores
  FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

CREATE POLICY "os_colaboradores_insert" ON public.os_colaboradores
  FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

CREATE POLICY "os_colaboradores_delete" ON public.os_colaboradores
  FOR DELETE TO authenticated
  USING (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

-- Index for fast lookups
CREATE INDEX idx_os_colaboradores_os_id ON public.os_colaboradores(os_id);
CREATE INDEX idx_os_colaboradores_profile_id ON public.os_colaboradores(profile_id);
