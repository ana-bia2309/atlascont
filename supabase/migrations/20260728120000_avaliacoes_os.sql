-- ============================================================
-- Módulo: Avaliação de Ordens de Serviço (Avaliações)
-- ============================================================
-- Cria a tabela avaliacoes_os, índices e políticas de RLS.
-- Segue o mesmo padrão de has_permission() já usado no restante do banco.

CREATE TABLE IF NOT EXISTS public.avaliacoes_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),

  status text NOT NULL DEFAULT 'pendente', -- pendente | avaliada

  -- Nota geral (estrelas)
  nota_geral smallint CHECK (nota_geral BETWEEN 1 AND 5),

  -- Mini questionário
  resp_conforme_solicitado text,   -- Sim | Parcialmente | Não
  resp_qualidade_execucao text,    -- Excelente | Bom | Regular | Ruim | Péssimo
  resp_acabamento text,            -- Excelente | Bom | Regular | Ruim | Péssimo
  resp_limpeza_organizacao text,   -- Sim | Parcialmente | Não
  resp_prazo_atendido text,        -- Sim | Parcialmente | Não

  -- Texto livre
  comentarios_fiscal text,
  sugestoes_melhoria text,

  -- Decisão final
  decisao text,                    -- aprovado | aprovado_com_ressalvas | reprovado
  justificativa_reprovacao text,

  rascunho boolean NOT NULL DEFAULT true,

  avaliado_por uuid REFERENCES public.profiles(id),
  avaliado_por_nome text,
  avaliado_em timestamptz,

  reaberto_por uuid REFERENCES public.profiles(id),
  reaberto_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT avaliacoes_os_os_id_unique UNIQUE (os_id)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_os_status ON public.avaliacoes_os (status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_os_company ON public.avaliacoes_os (company_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_os_os_id ON public.avaliacoes_os (os_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_avaliacoes_os_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_avaliacoes_os_updated_at ON public.avaliacoes_os;
CREATE TRIGGER trg_avaliacoes_os_updated_at
  BEFORE UPDATE ON public.avaliacoes_os
  FOR EACH ROW
  EXECUTE FUNCTION public.set_avaliacoes_os_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.avaliacoes_os ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_os_select" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_select" ON public.avaliacoes_os FOR SELECT TO authenticated
  USING (has_permission('avaliacoes.visualizar'));

DROP POLICY IF EXISTS "avaliacoes_os_insert" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_insert" ON public.avaliacoes_os FOR INSERT TO authenticated
  WITH CHECK (has_permission('avaliacoes.avaliar'));

DROP POLICY IF EXISTS "avaliacoes_os_update" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_update" ON public.avaliacoes_os FOR UPDATE TO authenticated
  USING (
    has_permission('avaliacoes.avaliar')
    OR has_permission('avaliacoes.reabrir')
    OR has_role(auth.uid(), 'administrador'::app_role)
  )
  WITH CHECK (
    has_permission('avaliacoes.avaliar')
    OR has_permission('avaliacoes.reabrir')
    OR has_role(auth.uid(), 'administrador'::app_role)
  );

-- Apenas administradores podem excluir (uso raro; reabertura é feita via update)
DROP POLICY IF EXISTS "avaliacoes_os_delete" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_delete" ON public.avaliacoes_os FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));

-- Leitura pública (para a OS pública, opcional — mostra resumo da avaliação)
DROP POLICY IF EXISTS "avaliacoes_os_public_read" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_public_read" ON public.avaliacoes_os FOR SELECT TO anon
  USING (status = 'avaliada');
