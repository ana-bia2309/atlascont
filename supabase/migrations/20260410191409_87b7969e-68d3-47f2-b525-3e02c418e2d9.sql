
CREATE TABLE public.cronogramas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  descricao text,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'planejado',
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cronogramas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on cronogramas" ON public.cronogramas
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);
