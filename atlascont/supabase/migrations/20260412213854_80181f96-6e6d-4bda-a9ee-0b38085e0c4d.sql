
-- Add new columns to ativos table
ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS numero_serie text,
  ADD COLUMN IF NOT EXISTS patrimonio text,
  ADD COLUMN IF NOT EXISTS grupo_equipamentos text,
  ADD COLUMN IF NOT EXISTS corrente numeric,
  ADD COLUMN IF NOT EXISTS capacidade_btu numeric,
  ADD COLUMN IF NOT EXISTS tensao numeric,
  ADD COLUMN IF NOT EXISTS potencia numeric,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico text,
  ADD COLUMN IF NOT EXISTS grupo_areas text,
  ADD COLUMN IF NOT EXISTS area_pavimento text,
  ADD COLUMN IF NOT EXISTS identificacao_ambiente text,
  ADD COLUMN IF NOT EXISTS tipo_atividade text,
  ADD COLUMN IF NOT EXISTS area_climatizada numeric,
  ADD COLUMN IF NOT EXISTS ocupantes_fixos integer,
  ADD COLUMN IF NOT EXISTS ocupantes_flutuantes integer,
  ADD COLUMN IF NOT EXISTS carga_termica numeric;
