
-- Add default operational fields to planos_manutencao to preserve legacy Preventiva form capabilities
ALTER TABLE public.planos_manutencao
  ADD COLUMN IF NOT EXISTS frequencia text NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'Média',
  ADD COLUMN IF NOT EXISTS bloco_id uuid NULL,
  ADD COLUMN IF NOT EXISTS ativo_id uuid NULL,
  ADD COLUMN IF NOT EXISTS tipo_servico text NULL,
  ADD COLUMN IF NOT EXISTS tipo_atividade text NULL,
  ADD COLUMN IF NOT EXISTS tipo_medicao text NULL,
  ADD COLUMN IF NOT EXISTS unidade_medicao text NULL,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid NULL,
  ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;
