
-- Create tipos_gasto table
CREATE TABLE public.tipos_gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tipos_gasto" ON public.tipos_gasto
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tipos_gasto" ON public.tipos_gasto
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER update_tipos_gasto_updated_at
  BEFORE UPDATE ON public.tipos_gasto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing types
INSERT INTO public.tipos_gasto (nome) VALUES
  ('Material'), ('Frete'), ('Mão de obra'), ('Equipamento'), ('Outros');

-- Add tipo_gasto_id to gastos
ALTER TABLE public.gastos ADD COLUMN tipo_gasto_id uuid REFERENCES public.tipos_gasto(id);

-- Backfill existing gastos
UPDATE public.gastos g
SET tipo_gasto_id = t.id
FROM public.tipos_gasto t
WHERE g.tipo_gasto = t.nome AND g.tipo_gasto IS NOT NULL;
