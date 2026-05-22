-- Tabela de Chamados (submenu de Ordens de Serviço)
CREATE TABLE IF NOT EXISTS public.chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT public.next_chamado_codigo(),
  ativo_id uuid,
  ativo_nome text,
  ativo_codigo text,
  bloco_id uuid,
  bloco_nome text,
  andar text,
  sala text,
  area text,
  ambiente text,
  descricao_problema text NOT NULL,
  status text NOT NULL DEFAULT 'Aberto',
  solicitante_id uuid,
  solicitante_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

-- SELECT: quem pode visualizar chamados
CREATE POLICY "chamados_select"
  ON public.chamados FOR SELECT
  TO authenticated
  USING (public.has_permission('chamados_os.visualizar'));

-- INSERT: quem pode abrir chamados
CREATE POLICY "chamados_insert"
  ON public.chamados FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('chamados_os.criar'));

-- UPDATE: somente administradores
CREATE POLICY "chamados_update_admin"
  ON public.chamados FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));

-- DELETE: somente administradores
CREATE POLICY "chamados_delete_admin"
  ON public.chamados FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- Trigger para manter updated_at
CREATE TRIGGER trg_chamados_updated_at
BEFORE UPDATE ON public.chamados
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_chamados_created_at ON public.chamados (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_ativo_id ON public.chamados (ativo_id);
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados (status);