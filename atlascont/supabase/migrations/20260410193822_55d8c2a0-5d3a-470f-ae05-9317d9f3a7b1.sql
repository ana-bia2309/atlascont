
CREATE TABLE public.ativos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  codigo_identificacao text,
  categoria text,
  bloco_id uuid REFERENCES public.blocos(id) ON DELETE SET NULL,
  andar text,
  sala text,
  sistema text,
  marca text,
  modelo text,
  status text NOT NULL DEFAULT 'ativo',
  data_instalacao date,
  observacoes text,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on ativos" ON public.ativos
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ativos_bloco ON public.ativos(bloco_id);
CREATE INDEX idx_ativos_status ON public.ativos(status);
