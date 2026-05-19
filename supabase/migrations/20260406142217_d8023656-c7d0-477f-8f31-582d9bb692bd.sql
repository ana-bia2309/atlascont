ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS codigo_os text,
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_termino date,
  ADD COLUMN IF NOT EXISTS observacoes text;