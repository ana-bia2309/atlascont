-- ============================================================
-- Correção: avaliacoes_os_select não verificava company_id
-- ============================================================
-- Antes: qualquer usuário com has_permission('avaliacoes.visualizar')
-- OU role 'administrador' conseguia ler avaliações de QUALQUER empresa
-- cadastrada no sistema, não só da própria. Esta migration acrescenta
-- a checagem de company_id, no mesmo padrão já usado em outras tabelas
-- (ver policy "ativos_select").

DROP POLICY IF EXISTS "avaliacoes_os_select" ON public.avaliacoes_os;
CREATE POLICY "avaliacoes_os_select" ON public.avaliacoes_os FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT company_id
      FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      has_permission('avaliacoes.visualizar')
      OR has_role(auth.uid(), 'administrador'::app_role)
      OR public.is_fiscal_da_os(os_id)
    )
  );
