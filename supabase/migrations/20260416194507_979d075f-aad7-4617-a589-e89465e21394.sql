-- Substitui policies permissivas em ordens_preventivas
DROP POLICY IF EXISTS "Authenticated can insert ordens_preventivas" ON public.ordens_preventivas;
DROP POLICY IF EXISTS "Authenticated can update ordens_preventivas" ON public.ordens_preventivas;

CREATE POLICY "Insert ordens_preventivas with permission"
  ON public.ordens_preventivas FOR INSERT TO authenticated
  WITH CHECK (has_permission('preventivas.criar') OR has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Update ordens_preventivas with permission"
  ON public.ordens_preventivas FOR UPDATE TO authenticated
  USING (has_permission('preventivas.editar') OR has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Delete ordens_preventivas with permission"
  ON public.ordens_preventivas FOR DELETE TO authenticated
  USING (has_permission('preventivas.excluir') OR has_role(auth.uid(), 'administrador'::app_role));

-- Substitui policies permissivas em atividades_ordem_preventiva
DROP POLICY IF EXISTS "Authenticated can insert atividades_op" ON public.atividades_ordem_preventiva;
DROP POLICY IF EXISTS "Authenticated can update atividades_op" ON public.atividades_ordem_preventiva;
DROP POLICY IF EXISTS "Authenticated can delete atividades_op" ON public.atividades_ordem_preventiva;

CREATE POLICY "Insert atividades_op with permission"
  ON public.atividades_ordem_preventiva FOR INSERT TO authenticated
  WITH CHECK (has_permission('preventivas.criar') OR has_permission('preventivas.editar') OR has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Update atividades_op with permission"
  ON public.atividades_ordem_preventiva FOR UPDATE TO authenticated
  USING (has_permission('preventivas.editar') OR has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Delete atividades_op with permission"
  ON public.atividades_ordem_preventiva FOR DELETE TO authenticated
  USING (has_permission('preventivas.excluir') OR has_role(auth.uid(), 'administrador'::app_role));