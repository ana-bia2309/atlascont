-- Sequência para códigos de chamado (C-0000)
CREATE SEQUENCE IF NOT EXISTS public.ordens_servico_codigo_chamado_seq START 1;

-- Colunas de snapshot do ativo (andar/sala/bloco_id/ativo_id já existem)
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS ativo_codigo text,
  ADD COLUMN IF NOT EXISTS ativo_area text,
  ADD COLUMN IF NOT EXISTS ativo_ambiente text;

-- Função para gerar o próximo código de chamado
CREATE OR REPLACE FUNCTION public.next_chamado_codigo()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'C-' || lpad(nextval('public.ordens_servico_codigo_chamado_seq')::text, 4, '0');
$$;