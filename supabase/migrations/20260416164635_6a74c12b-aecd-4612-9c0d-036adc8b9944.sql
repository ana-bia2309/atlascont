
-- Planos de Manutenção (top-level)
CREATE TABLE public.planos_manutencao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planos_manutencao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage planos_manutencao"
  ON public.planos_manutencao FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'))
  WITH CHECK (has_role(auth.uid(), 'administrador'));

CREATE POLICY "Authenticated can read planos_manutencao"
  ON public.planos_manutencao FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_planos_manutencao_updated_at
  BEFORE UPDATE ON public.planos_manutencao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atividades do Plano (sub-level, unlimited)
CREATE TABLE public.plano_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos_manutencao(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  frequencia text NOT NULL DEFAULT 'mensal',
  prioridade text NOT NULL DEFAULT 'Média',
  tipo_servico text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plano_atividades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plano_atividades"
  ON public.plano_atividades FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'))
  WITH CHECK (has_role(auth.uid(), 'administrador'));

CREATE POLICY "Authenticated can read plano_atividades"
  ON public.plano_atividades FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_plano_atividades_updated_at
  BEFORE UPDATE ON public.plano_atividades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vínculo Plano ↔ Ativos
CREATE TABLE public.plano_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos_manutencao(id) ON DELETE CASCADE,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, ativo_id)
);

ALTER TABLE public.plano_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plano_ativos"
  ON public.plano_ativos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'))
  WITH CHECK (has_role(auth.uid(), 'administrador'));

CREATE POLICY "Authenticated can read plano_ativos"
  ON public.plano_ativos FOR SELECT TO authenticated
  USING (true);
