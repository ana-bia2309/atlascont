
CREATE TABLE public.atividades_os (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_termino date NOT NULL,
  status text NOT NULL DEFAULT 'Não iniciado',
  responsavel text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_atividades_os_os_id ON public.atividades_os(os_id);

ALTER TABLE public.atividades_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on atividades_os"
  ON public.atividades_os
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_atividades_os_updated_at
  BEFORE UPDATE ON public.atividades_os
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
