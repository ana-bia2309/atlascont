-- ============================================================
-- Correção: ordens_servico não verificava company_id no RLS
-- ============================================================
-- As políticas de ordens_servico (a tabela mais central do sistema)
-- só checavam permissão ('painel_os.visualizar' etc.), nunca se a
-- O.S. pertencia à empresa do usuário. Qualquer tela que esquecesse
-- de filtrar company_id no client (como aconteceu em avaliações)
-- ficava exposta a mostrar O.S. de outras empresas.
--
-- Confirmado antes de aplicar: nenhuma linha de ordens_servico está
-- com company_id nulo (SELECT count(*) ... WHERE company_id IS NULL = 0).
--
-- Mesmo padrão de subquery já usado em "ativos_select".

DROP POLICY IF EXISTS "os_select" ON public.ordens_servico;
CREATE POLICY "os_select" ON public.ordens_servico FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'))
  );

DROP POLICY IF EXISTS "os_insert" ON public.ordens_servico;
CREATE POLICY "os_insert" ON public.ordens_servico FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND has_permission('painel_os.criar')
  );

DROP POLICY IF EXISTS "os_update" ON public.ordens_servico;
CREATE POLICY "os_update" ON public.ordens_servico FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'))
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "os_delete" ON public.ordens_servico;
CREATE POLICY "os_delete" ON public.ordens_servico FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND has_permission('painel_os.excluir')
  );
