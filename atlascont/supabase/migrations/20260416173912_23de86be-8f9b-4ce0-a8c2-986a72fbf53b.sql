ALTER TABLE public.atividades_preventiva
  ADD COLUMN IF NOT EXISTS bloco_id uuid,
  ADD COLUMN IF NOT EXISTS ativo_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_atividade text,
  ADD COLUMN IF NOT EXISTS tipo_medicao text,
  ADD COLUMN IF NOT EXISTS unidade_medicao text,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid,
  ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;