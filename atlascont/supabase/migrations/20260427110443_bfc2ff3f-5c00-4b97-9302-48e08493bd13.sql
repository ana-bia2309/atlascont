
-- Add tracking columns for chamados (analysis workflow)
ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS responsavel_id uuid,
  ADD COLUMN IF NOT EXISTS os_id uuid,
  ADD COLUMN IF NOT EXISTS justificativa_recusa text,
  ADD COLUMN IF NOT EXISTS analisado_em timestamptz,
  ADD COLUMN IF NOT EXISTS analisado_por uuid,
  ADD COLUMN IF NOT EXISTS analisado_por_nome text;

-- Default new chamados to "Em análise" so they show up in the analysis panel
ALTER TABLE public.chamados
  ALTER COLUMN status SET DEFAULT 'Em análise';

-- Backfill: any old "Aberto" chamados that have not been analyzed move to "Em análise"
UPDATE public.chamados
   SET status = 'Em análise'
 WHERE status = 'Aberto';

-- Index for quick filter on the panel
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados (status);
CREATE INDEX IF NOT EXISTS idx_chamados_responsavel ON public.chamados (responsavel_id);

-- Update RLS: allow users with chamados_externos.visualizar to read,
-- and chamados_externos.analisar to update (approve/refuse)
DROP POLICY IF EXISTS chamados_select ON public.chamados;
CREATE POLICY chamados_select ON public.chamados
  FOR SELECT TO authenticated
  USING (
    has_permission('chamados_os.visualizar')
    OR has_permission('chamados_externos.visualizar')
    OR has_role(auth.uid(), 'administrador'::app_role)
  );

DROP POLICY IF EXISTS chamados_update_admin ON public.chamados;
CREATE POLICY chamados_update ON public.chamados
  FOR UPDATE TO authenticated
  USING (
    has_permission('chamados_externos.analisar')
    OR has_role(auth.uid(), 'administrador'::app_role)
  )
  WITH CHECK (
    has_permission('chamados_externos.analisar')
    OR has_role(auth.uid(), 'administrador'::app_role)
  );
