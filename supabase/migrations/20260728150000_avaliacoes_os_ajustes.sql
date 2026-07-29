-- ============================================================
-- Ajustes no módulo de Avaliação de Ordens de Serviço
-- ============================================================
-- 1. Substitui o mini-questionário antigo por 4 perguntas por estrela
-- 2. Nota Geral passa a ser calculada automaticamente (coluna gerada)
-- 3. Vínculo com o(s) fiscal(is) já designado(s) para a OS (tabela
--    os_fiscais, a mesma usada na aprovação de orçamento) — como a
--    checagem é feita em tempo real, se o fiscal for trocado em
--    os_fiscais antes da conclusão da OS, a responsabilidade pela
--    avaliação já passa automaticamente para o novo.
--
-- Mantém: comentários, sugestões de melhoria e a seção de aprovação
-- do serviço (aprovado / aprovado com ressalvas / reprovado).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Remove colunas do mini-questionário antigo
-- ------------------------------------------------------------
ALTER TABLE public.avaliacoes_os
  DROP COLUMN IF EXISTS resp_conforme_solicitado,
  DROP COLUMN IF EXISTS resp_qualidade_execucao,
  DROP COLUMN IF EXISTS resp_acabamento,
  DROP COLUMN IF EXISTS resp_limpeza_organizacao,
  DROP COLUMN IF EXISTS resp_prazo_atendido;

-- Nota geral deixa de ser um valor manual e passa a ser calculada
ALTER TABLE public.avaliacoes_os DROP COLUMN IF EXISTS nota_geral;

-- ------------------------------------------------------------
-- 2) Novas perguntas por estrela (1 a 5) + nota geral automática
-- ------------------------------------------------------------
ALTER TABLE public.avaliacoes_os
  ADD COLUMN IF NOT EXISTS nota_qualidade_execucao smallint CHECK (nota_qualidade_execucao BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS nota_cumprimento_prazo smallint CHECK (nota_cumprimento_prazo BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS nota_organizacao_limpeza smallint CHECK (nota_organizacao_limpeza BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS nota_atendimento_expectativas smallint CHECK (nota_atendimento_expectativas BETWEEN 1 AND 5);

ALTER TABLE public.avaliacoes_os
  ADD COLUMN IF NOT EXISTS nota_geral numeric(3,2) GENERATED ALWAYS AS (
    CASE
      WHEN nota_qualidade_execucao IS NOT NULL
        AND nota_cumprimento_prazo IS NOT NULL
        AND nota_organizacao_limpeza IS NOT NULL
        AND nota_atendimento_expectativas IS NOT NULL
      THEN ROUND(
        (nota_qualidade_execucao + nota_cumprimento_prazo + nota_organizacao_limpeza + nota_atendimento_expectativas)::numeric / 4,
        2
      )
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.avaliacoes_os.nota_geral IS 'Calculada automaticamente: média das 4 notas por estrela. Não editável pelo usuário.';

-- ------------------------------------------------------------
-- 3) Vínculo com o(s) fiscal(is) da OS (tabela os_fiscais já existente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_fiscal_da_os(_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.os_fiscais f
    JOIN public.profiles p ON p.id = f.profile_id
    WHERE f.os_id = _os_id AND p.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- 4) RLS: fiscal designado (via os_fiscais) ou avaliacoes.avaliar_qualquer
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "avaliacoes_os_select" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_select" ON public.avaliacoes_os FOR SELECT TO authenticated
  USING (
    has_permission('avaliacoes.visualizar')
    OR has_role(auth.uid(), 'administrador'::app_role)
    OR public.is_fiscal_da_os(os_id)
  );

DROP POLICY IF EXISTS "avaliacoes_os_insert" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_insert" ON public.avaliacoes_os FOR INSERT TO authenticated
  WITH CHECK (
    has_permission('avaliacoes.avaliar_qualquer')
    OR has_role(auth.uid(), 'administrador'::app_role)
    OR (has_permission('avaliacoes.avaliar') AND public.is_fiscal_da_os(os_id))
  );

DROP POLICY IF EXISTS "avaliacoes_os_update" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_update" ON public.avaliacoes_os FOR UPDATE TO authenticated
  USING (
    has_permission('avaliacoes.avaliar_qualquer')
    OR has_permission('avaliacoes.reabrir')
    OR has_role(auth.uid(), 'administrador'::app_role)
    OR (has_permission('avaliacoes.avaliar') AND status = 'pendente' AND public.is_fiscal_da_os(os_id))
  )
  WITH CHECK (
    has_permission('avaliacoes.avaliar_qualquer')
    OR has_permission('avaliacoes.reabrir')
    OR has_role(auth.uid(), 'administrador'::app_role)
    OR (has_permission('avaliacoes.avaliar') AND public.is_fiscal_da_os(os_id))
  );
