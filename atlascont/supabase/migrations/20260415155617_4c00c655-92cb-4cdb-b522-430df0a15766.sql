
-- 1. Create security definer function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admins always pass
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE p.user_id = auth.uid() AND ur.role = 'administrador'
    )
    OR
    -- Check specific permission
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.permissoes_perfil pp ON pp.perfil_acesso_id = p.perfil_acesso_id
      WHERE p.user_id = auth.uid()
        AND pp.permissao = _permission
    )
$$;

-- ============================================================
-- 2. ordens_servico
-- ============================================================
DROP POLICY IF EXISTS "Allow all on ordens_servico" ON public.ordens_servico;

CREATE POLICY "os_select" ON public.ordens_servico FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

CREATE POLICY "os_insert" ON public.ordens_servico FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.criar'));

CREATE POLICY "os_update" ON public.ordens_servico FOR UPDATE TO authenticated
  USING (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

CREATE POLICY "os_delete" ON public.ordens_servico FOR DELETE TO authenticated
  USING (has_permission('painel_os.excluir'));

-- ============================================================
-- 3. blocos
-- ============================================================
DROP POLICY IF EXISTS "Allow all on blocos" ON public.blocos;

CREATE POLICY "blocos_select" ON public.blocos FOR SELECT TO authenticated
  USING (has_permission('blocos.visualizar'));

CREATE POLICY "blocos_insert" ON public.blocos FOR INSERT TO authenticated
  WITH CHECK (has_permission('blocos.criar'));

CREATE POLICY "blocos_update" ON public.blocos FOR UPDATE TO authenticated
  USING (has_permission('blocos.editar'));

CREATE POLICY "blocos_delete" ON public.blocos FOR DELETE TO authenticated
  USING (has_permission('blocos.excluir'));

-- Allow anon/public read for blocos used in public OS page
CREATE POLICY "blocos_public_read" ON public.blocos FOR SELECT TO anon USING (true);

-- ============================================================
-- 4. cronogramas
-- ============================================================
DROP POLICY IF EXISTS "Allow all on cronogramas" ON public.cronogramas;

CREATE POLICY "cronogramas_select" ON public.cronogramas FOR SELECT TO authenticated
  USING (has_permission('cronogramas.visualizar'));

CREATE POLICY "cronogramas_insert" ON public.cronogramas FOR INSERT TO authenticated
  WITH CHECK (has_permission('cronogramas.criar'));

CREATE POLICY "cronogramas_update" ON public.cronogramas FOR UPDATE TO authenticated
  USING (has_permission('cronogramas.editar'));

CREATE POLICY "cronogramas_delete" ON public.cronogramas FOR DELETE TO authenticated
  USING (has_permission('cronogramas.excluir'));

-- ============================================================
-- 5. gastos
-- ============================================================
DROP POLICY IF EXISTS "Allow all on gastos" ON public.gastos;

CREATE POLICY "gastos_select" ON public.gastos FOR SELECT TO authenticated
  USING (has_permission('gastos.visualizar'));

CREATE POLICY "gastos_insert" ON public.gastos FOR INSERT TO authenticated
  WITH CHECK (has_permission('gastos.criar'));

CREATE POLICY "gastos_update" ON public.gastos FOR UPDATE TO authenticated
  USING (has_permission('gastos.editar'));

CREATE POLICY "gastos_delete" ON public.gastos FOR DELETE TO authenticated
  USING (has_permission('gastos.excluir'));

-- ============================================================
-- 6. ativos
-- ============================================================
DROP POLICY IF EXISTS "Allow all on ativos" ON public.ativos;

CREATE POLICY "ativos_select" ON public.ativos FOR SELECT TO authenticated
USING (
  has_permission('ativos.visualizar')
  AND company_id = (
    SELECT company_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY "ativos_insert" ON public.ativos FOR INSERT TO authenticated
  WITH CHECK (has_permission('ativos.criar'));

CREATE POLICY "ativos_update" ON public.ativos FOR UPDATE TO authenticated
  USING (has_permission('ativos.editar'));

CREATE POLICY "ativos_delete" ON public.ativos FOR DELETE TO authenticated
  USING (has_permission('ativos.excluir'));

-- Allow anon read for public asset page
CREATE POLICY "ativos_public_read" ON public.ativos FOR SELECT TO anon USING (true);

-- ============================================================
-- 7. materiais_os
-- ============================================================
DROP POLICY IF EXISTS "Allow all on materiais_os" ON public.materiais_os;

CREATE POLICY "materiais_select" ON public.materiais_os FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

CREATE POLICY "materiais_insert" ON public.materiais_os FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

CREATE POLICY "materiais_update" ON public.materiais_os FOR UPDATE TO authenticated
  USING (has_permission('painel_os.editar') OR has_permission('minhas_os.editar'));

CREATE POLICY "materiais_delete" ON public.materiais_os FOR DELETE TO authenticated
  USING (has_permission('painel_os.excluir'));

-- ============================================================
-- 8. anexos_os
-- ============================================================
DROP POLICY IF EXISTS "Allow all on anexos_os" ON public.anexos_os;

CREATE POLICY "anexos_select" ON public.anexos_os FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

CREATE POLICY "anexos_insert" ON public.anexos_os FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.anexar') OR has_permission('minhas_os.anexar'));

CREATE POLICY "anexos_delete" ON public.anexos_os FOR DELETE TO authenticated
  USING (has_permission('painel_os.excluir'));

-- Allow anon read for public OS page
CREATE POLICY "anexos_public_read" ON public.anexos_os FOR SELECT TO anon USING (true);

-- ============================================================
-- 9. historico_os
-- ============================================================
DROP POLICY IF EXISTS "Allow all on historico_os" ON public.historico_os;

CREATE POLICY "historico_os_select" ON public.historico_os FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar_historico') OR has_permission('minhas_os.visualizar_historico'));

CREATE POLICY "historico_os_insert" ON public.historico_os FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.visualizar') OR has_permission('minhas_os.visualizar'));

-- Allow anon read for public OS page
CREATE POLICY "historico_os_public_read" ON public.historico_os FOR SELECT TO anon USING (true);

-- ============================================================
-- 10. atividades_os
-- ============================================================
DROP POLICY IF EXISTS "Allow all on atividades_os" ON public.atividades_os;

CREATE POLICY "atividades_select" ON public.atividades_os FOR SELECT TO authenticated
  USING (has_permission('painel_os.visualizar_atividades') OR has_permission('minhas_os.visualizar_atividades'));

CREATE POLICY "atividades_insert" ON public.atividades_os FOR INSERT TO authenticated
  WITH CHECK (has_permission('painel_os.editar_atividades') OR has_permission('minhas_os.editar_atividades'));

CREATE POLICY "atividades_update" ON public.atividades_os FOR UPDATE TO authenticated
  USING (has_permission('painel_os.editar_atividades') OR has_permission('minhas_os.editar_atividades'));

CREATE POLICY "atividades_delete" ON public.atividades_os FOR DELETE TO authenticated
  USING (has_permission('painel_os.excluir'));

-- ============================================================
-- 11. historico_ativos
-- ============================================================
DROP POLICY IF EXISTS "Allow all on historico_ativos" ON public.historico_ativos;

CREATE POLICY "hist_ativos_select" ON public.historico_ativos FOR SELECT TO authenticated
  USING (has_permission('ativos.visualizar'));

CREATE POLICY "hist_ativos_insert" ON public.historico_ativos FOR INSERT TO authenticated
  WITH CHECK (has_permission('ativos.editar') OR has_permission('ativos.criar'));

-- Allow anon read for public asset page
CREATE POLICY "hist_ativos_public_read" ON public.historico_ativos FOR SELECT TO anon USING (true);
