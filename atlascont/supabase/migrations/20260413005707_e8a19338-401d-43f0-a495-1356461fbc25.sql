-- Add audit columns to ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN criado_por uuid REFERENCES public.profiles(id),
  ADD COLUMN editado_por uuid REFERENCES public.profiles(id),
  ADD COLUMN finalizado_por uuid REFERENCES public.profiles(id),
  ADD COLUMN editado_em timestamptz,
  ADD COLUMN finalizado_em timestamptz;

-- Add user tracking to historico_os
ALTER TABLE public.historico_os
  ADD COLUMN usuario_id uuid REFERENCES public.profiles(id),
  ADD COLUMN usuario_nome text;

-- Index for faster history queries
CREATE INDEX IF NOT EXISTS idx_historico_os_ordem ON public.historico_os(ordem_servico_id, created_at DESC);