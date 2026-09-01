-- Adiciona suporte à categoria "Serviço" no cadastro de materiais existente,
-- reaproveitando a mesma tabela `materiais` (sem criar tabela nova).
--
-- IMPORTANTE: partes do schema de materiais/materiais_os/estoque foram criadas
-- manualmente via Supabase Studio, fora do histórico de migrations (colunas
-- categoria, material_id, company_id de materiais_os não aparecem em nenhuma
-- migration anterior). Por isso este script é defensivo/idempotente: usa
-- IF NOT EXISTS e checagens via catálogo do Postgres antes de alterar qualquer
-- coisa, para funcionar de forma segura contra o schema real do banco, seja
-- qual for o seu estado atual.

-- 1. Garante que a coluna categoria existe em materiais (no-op se já existir)
ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'Material';

-- 2. Garante uma constraint CHECK que já inclua 'Serviço' entre os valores
--    aceitos. Remove qualquer constraint CHECK anterior na coluna categoria
--    (independente do nome) e recria incluindo o novo valor.
DO $$
DECLARE
  old_constraint text;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'materiais'
    AND con.contype = 'c'
    AND att.attname = 'categoria';

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.materiais DROP CONSTRAINT %I', old_constraint);
  END IF;
END $$;

-- Cria a nova constraint como NOT VALID primeiro (não falha por causa de
-- dados históricos fora do padrão) e tenta validar em seguida.
DO $$
BEGIN
  ALTER TABLE public.materiais
    ADD CONSTRAINT materiais_categoria_check
    CHECK (categoria IN ('Material', 'Ferramenta', 'EPI', 'Serviço')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.materiais VALIDATE CONSTRAINT materiais_categoria_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Existem materiais com categoria fora de Material/Ferramenta/EPI/Serviço — constraint criada mas não validada (NOT VALID). Revise esses registros manualmente; nada foi apagado ou bloqueado.';
END $$;

-- 3. Índice para filtragem rápida por categoria (usado para excluir "Serviço"
--    de telas de controle de estoque e empréstimo de ferramentas).
CREATE INDEX IF NOT EXISTS idx_materiais_categoria ON public.materiais(categoria);

-- Nenhuma alteração em materiais_os é necessária: o campo `fornecedor` (texto
-- livre) já existente é reaproveitado para registrar a empresa/mão de obra
-- prestadora do serviço, e o gatilho trg_recalc_os_custo já soma
-- automaticamente qualquer item (material ou serviço) no custo_total da OS.
