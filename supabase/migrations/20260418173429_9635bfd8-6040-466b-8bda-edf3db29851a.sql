-- Extend horas_atividade to support both Corretivas (OS) and Preventivas (OP)
-- Add tipo classification + nullable OP linkage fields

ALTER TABLE public.horas_atividade
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'Corretiva',
  ADD COLUMN IF NOT EXISTS ordem_preventiva_id uuid REFERENCES public.ordens_preventivas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS atividade_op_id uuid REFERENCES public.atividades_ordem_preventiva(id) ON DELETE CASCADE;

-- Make OS-related columns nullable so preventiva rows are allowed
ALTER TABLE public.horas_atividade
  ALTER COLUMN os_id DROP NOT NULL,
  ALTER COLUMN atividade_id DROP NOT NULL;

-- Validation trigger: row must reference EITHER an OS+atividade OR an OP (and tipo must match)
CREATE OR REPLACE FUNCTION public.validate_horas_atividade_origem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'Preventiva' THEN
    IF NEW.ordem_preventiva_id IS NULL THEN
      RAISE EXCEPTION 'Registro Preventiva exige ordem_preventiva_id';
    END IF;
  ELSIF NEW.tipo = 'Corretiva' THEN
    IF NEW.os_id IS NULL OR NEW.atividade_id IS NULL THEN
      RAISE EXCEPTION 'Registro Corretiva exige os_id e atividade_id';
    END IF;
  ELSE
    RAISE EXCEPTION 'tipo deve ser Preventiva ou Corretiva';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_horas_atividade_origem ON public.horas_atividade;
CREATE TRIGGER trg_validate_horas_atividade_origem
  BEFORE INSERT OR UPDATE ON public.horas_atividade
  FOR EACH ROW EXECUTE FUNCTION public.validate_horas_atividade_origem();

-- Helpful indexes for the report
CREATE INDEX IF NOT EXISTS idx_horas_atividade_tipo ON public.horas_atividade(tipo);
CREATE INDEX IF NOT EXISTS idx_horas_atividade_op ON public.horas_atividade(ordem_preventiva_id);