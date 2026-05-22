
-- Function to recalculate custo_total on ordens_servico
CREATE OR REPLACE FUNCTION public.recalc_os_custo_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_os_id uuid;
  new_total numeric;
BEGIN
  -- Determine which os_id was affected
  IF TG_OP = 'DELETE' THEN
    target_os_id := OLD.os_id;
  ELSE
    target_os_id := NEW.os_id;
  END IF;

  SELECT COALESCE(SUM(custo_total_item), 0)
    INTO new_total
    FROM materiais_os
   WHERE os_id = target_os_id;

  UPDATE ordens_servico
     SET custo_total = new_total
   WHERE id = target_os_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger after any material change
CREATE TRIGGER trg_recalc_os_custo
AFTER INSERT OR UPDATE OR DELETE ON public.materiais_os
FOR EACH ROW
EXECUTE FUNCTION public.recalc_os_custo_total();
