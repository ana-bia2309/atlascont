
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'Média';
