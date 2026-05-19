
CREATE TABLE public.horas_atividade (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atividade_id uuid NOT NULL REFERENCES public.atividades_os(id) ON DELETE CASCADE,
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data_registro date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio time WITHOUT TIME ZONE,
  hora_fim time WITHOUT TIME ZONE,
  total_minutos integer NOT NULL DEFAULT 0,
  descricao text,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.horas_atividade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read horas_atividade"
ON public.horas_atividade FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert horas_atividade"
ON public.horas_atividade FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update own horas_atividade"
ON public.horas_atividade FOR UPDATE TO authenticated
USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can delete own horas_atividade"
ON public.horas_atividade FOR DELETE TO authenticated
USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Admins can manage all horas_atividade"
ON public.horas_atividade FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER update_horas_atividade_updated_at
BEFORE UPDATE ON public.horas_atividade
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_horas_atividade_atividade ON public.horas_atividade(atividade_id);
CREATE INDEX idx_horas_atividade_os ON public.horas_atividade(os_id);
CREATE INDEX idx_horas_atividade_user ON public.horas_atividade(user_id);
CREATE INDEX idx_horas_atividade_data ON public.horas_atividade(data_registro);
