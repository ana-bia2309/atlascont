
-- Table for SLA definitions per service type + priority
CREATE TABLE public.sla_definicoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_servico text NOT NULL,
  prioridade text NOT NULL DEFAULT 'Média',
  prazo_horas numeric NOT NULL DEFAULT 24,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo_servico, prioridade)
);

ALTER TABLE public.sla_definicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sla_definicoes"
  ON public.sla_definicoes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage sla_definicoes"
  ON public.sla_definicoes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Add tipo_servico column to ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS tipo_servico text;

-- Add sla_prazo_limite (deadline timestamp) to ordens_servico  
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS sla_prazo_limite timestamptz;

-- Trigger to update updated_at
CREATE TRIGGER update_sla_definicoes_updated_at
  BEFORE UPDATE ON public.sla_definicoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default SLA definitions
INSERT INTO public.sla_definicoes (tipo_servico, prioridade, prazo_horas, descricao) VALUES
  ('Elétrica', 'Crítica', 4, 'Elétrica crítica - 4 horas'),
  ('Elétrica', 'Alta', 8, 'Elétrica alta - 8 horas'),
  ('Elétrica', 'Média', 24, 'Elétrica média - 24 horas'),
  ('Elétrica', 'Baixa', 48, 'Elétrica baixa - 48 horas'),
  ('Hidráulica', 'Crítica', 4, 'Hidráulica crítica - 4 horas'),
  ('Hidráulica', 'Alta', 12, 'Hidráulica alta - 12 horas'),
  ('Hidráulica', 'Média', 24, 'Hidráulica média - 24 horas'),
  ('Hidráulica', 'Baixa', 48, 'Hidráulica baixa - 48 horas'),
  ('Civil', 'Crítica', 8, 'Civil crítica - 8 horas'),
  ('Civil', 'Alta', 24, 'Civil alta - 24 horas'),
  ('Civil', 'Média', 48, 'Civil média - 48 horas'),
  ('Civil', 'Baixa', 72, 'Civil baixa - 72 horas'),
  ('Climatização', 'Crítica', 4, 'Climatização crítica - 4 horas'),
  ('Climatização', 'Alta', 8, 'Climatização alta - 8 horas'),
  ('Climatização', 'Média', 24, 'Climatização média - 24 horas'),
  ('Climatização', 'Baixa', 48, 'Climatização baixa - 48 horas'),
  ('Outros', 'Crítica', 8, 'Outros crítica - 8 horas'),
  ('Outros', 'Alta', 24, 'Outros alta - 24 horas'),
  ('Outros', 'Média', 48, 'Outros média - 48 horas'),
  ('Outros', 'Baixa', 72, 'Outros baixa - 72 horas');
