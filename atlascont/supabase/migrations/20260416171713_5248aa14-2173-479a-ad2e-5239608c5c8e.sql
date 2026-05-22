
CREATE TABLE public.atividades_preventiva (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preventiva_id uuid NOT NULL REFERENCES public.manutencao_preventiva(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  frequencia text NOT NULL DEFAULT 'mensal',
  prioridade text NOT NULL DEFAULT 'Média',
  tipo_servico text,
  ordem integer NOT NULL DEFAULT 0,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  concluido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atividades_preventiva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage atividades_preventiva"
  ON public.atividades_preventiva
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Authenticated can read atividades_preventiva"
  ON public.atividades_preventiva
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_atividades_preventiva_updated_at
  BEFORE UPDATE ON public.atividades_preventiva
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
