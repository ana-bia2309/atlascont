-- Preventive maintenance plans
CREATE TABLE public.manutencao_preventiva (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  frequencia text NOT NULL DEFAULT 'mensal',
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  bloco_id uuid REFERENCES public.blocos(id) ON DELETE SET NULL,
  tipo_servico text,
  prioridade text NOT NULL DEFAULT 'Média',
  proxima_execucao date NOT NULL,
  ultima_execucao date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manutencao_preventiva ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated can read preventivas"
  ON public.manutencao_preventiva FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage preventivas"
  ON public.manutencao_preventiva FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_manutencao_preventiva_updated_at
  BEFORE UPDATE ON public.manutencao_preventiva
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- History of generated OS from preventives
CREATE TABLE public.historico_preventiva (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preventiva_id uuid NOT NULL REFERENCES public.manutencao_preventiva(id) ON DELETE CASCADE,
  os_id uuid REFERENCES public.ordens_servico(id) ON DELETE SET NULL,
  data_geracao timestamptz NOT NULL DEFAULT now(),
  observacao text
);

ALTER TABLE public.historico_preventiva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read historico_preventiva"
  ON public.historico_preventiva FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage historico_preventiva"
  ON public.historico_preventiva FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));