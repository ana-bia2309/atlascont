-- Sequência global para código AP-0001
CREATE SEQUENCE IF NOT EXISTS public.ordens_preventivas_codigo_seq START 1;

-- Tabela principal: ordens_preventivas
CREATE TABLE IF NOT EXISTS public.ordens_preventivas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_op text NOT NULL UNIQUE DEFAULT ('AP-' || lpad(nextval('public.ordens_preventivas_codigo_seq')::text, 4, '0')),
  preventiva_id uuid REFERENCES public.manutencao_preventiva(id) ON DELETE SET NULL,
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  bloco_id uuid REFERENCES public.blocos(id) ON DELETE SET NULL,
  cronograma_id uuid REFERENCES public.cronogramas(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  titulo text,
  status text NOT NULL DEFAULT 'Não Iniciada',
  prioridade text NOT NULL DEFAULT 'Média',
  tipo_servico text,
  equipamentos text,
  observacoes text,
  data_inicio date,
  data_termino date,
  prazo date,
  finalizado_em timestamptz,
  finalizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  editado_em timestamptz,
  editado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordens_preventivas_preventiva ON public.ordens_preventivas(preventiva_id);
CREATE INDEX IF NOT EXISTS idx_ordens_preventivas_ativo ON public.ordens_preventivas(ativo_id);
CREATE INDEX IF NOT EXISTS idx_ordens_preventivas_status ON public.ordens_preventivas(status);

ALTER TABLE public.ordens_preventivas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ordens_preventivas"
  ON public.ordens_preventivas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Authenticated can read ordens_preventivas"
  ON public.ordens_preventivas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert ordens_preventivas"
  ON public.ordens_preventivas FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update ordens_preventivas"
  ON public.ordens_preventivas FOR UPDATE TO authenticated
  USING (true);

CREATE TRIGGER update_ordens_preventivas_updated_at
  BEFORE UPDATE ON public.ordens_preventivas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de atividades herdadas
CREATE TABLE IF NOT EXISTS public.atividades_ordem_preventiva (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_preventiva_id uuid NOT NULL REFERENCES public.ordens_preventivas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'Não iniciado',
  data_inicio date,
  data_termino date,
  ordem integer NOT NULL DEFAULT 0,
  responsavel text,
  tipo_atividade text,
  tipo_medicao text,
  unidade_medicao text,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  concluido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atividades_op_ordem ON public.atividades_ordem_preventiva(ordem_preventiva_id);

ALTER TABLE public.atividades_ordem_preventiva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage atividades_op"
  ON public.atividades_ordem_preventiva FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Authenticated can read atividades_op"
  ON public.atividades_ordem_preventiva FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert atividades_op"
  ON public.atividades_ordem_preventiva FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update atividades_op"
  ON public.atividades_ordem_preventiva FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete atividades_op"
  ON public.atividades_ordem_preventiva FOR DELETE TO authenticated
  USING (true);

CREATE TRIGGER update_atividades_op_updated_at
  BEFORE UPDATE ON public.atividades_ordem_preventiva
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atualiza historico_preventiva para apontar também para ordens_preventivas
ALTER TABLE public.historico_preventiva
  ADD COLUMN IF NOT EXISTS ordem_preventiva_id uuid REFERENCES public.ordens_preventivas(id) ON DELETE SET NULL;