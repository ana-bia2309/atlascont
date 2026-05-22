-- Adiciona campos de responsável e tipo de atividade ao template do plano
ALTER TABLE public.plano_atividades
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_atividade text,
  ADD COLUMN IF NOT EXISTS tipo_medicao text,
  ADD COLUMN IF NOT EXISTS unidade_medicao text;

-- Index para joins de responsável
CREATE INDEX IF NOT EXISTS idx_plano_atividades_responsavel ON public.plano_atividades(responsavel_id);