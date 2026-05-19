ALTER TABLE public.atividades_os
  ADD COLUMN IF NOT EXISTS tipo_atividade text,
  ADD COLUMN IF NOT EXISTS tipo_medicao text,
  ADD COLUMN IF NOT EXISTS unidade_medicao text;