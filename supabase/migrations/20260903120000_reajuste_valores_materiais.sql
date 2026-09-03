-- ============================================================
-- Funcionalidade: Reajuste de Valores em lote (Cadastro de Materiais)
-- ============================================================
-- Cria a estrutura de auditoria (cabeçalho + itens) e as funções
-- SECURITY DEFINER que calculam a prévia e aplicam o reajuste.
--
-- Segue o mesmo padrão já usado em dar_entrada_estoque_pedido (ver
-- 20260902140000_entrada_estoque_pedido.sql): a checagem de empresa e
-- permissão é feita explicitamente dentro das funções, sem depender só das
-- policies de RLS, por causa do bug de isolamento multi-tenant já mapeado
-- (has_role/has_permission não filtram por company_id). O company_id do
-- usuário é sempre derivado do profile autenticado — nunca aceito como
-- parâmetro do cliente — para eliminar qualquer risco de spoofing.
--
-- Script defensivo/idempotente (IF NOT EXISTS em tudo), sem alterar nenhuma
-- tabela/coluna já existente (materiais, profiles, companies).

-- ============================================================
-- 1. Tabela de cabeçalho — uma linha por operação de reajuste
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reajustes_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),

  tipo_operacao text NOT NULL CHECK (tipo_operacao IN ('majorar', 'reduzir')),
  tipo_reajuste text NOT NULL CHECK (tipo_reajuste IN ('percentual', 'valor_fixo')),
  percentual numeric(7,2),
  valor_fixo numeric(12,2),

  criterio_selecao text NOT NULL CHECK (criterio_selecao IN ('todos', 'categoria', 'intervalo', 'especificos')),
  categorias_selecionadas text[],
  codigo_inicial text,
  codigo_final text,
  codigos_especificos text[],

  quantidade_materiais_afetados integer NOT NULL,
  valor_total_antes numeric(14,2) NOT NULL,
  valor_total_depois numeric(14,2) NOT NULL,
  justificativa text NOT NULL,

  created_by uuid REFERENCES public.profiles(id),
  created_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reajustes_materiais_company ON public.reajustes_materiais (company_id);
CREATE INDEX IF NOT EXISTS idx_reajustes_materiais_created_at ON public.reajustes_materiais (created_at);
CREATE INDEX IF NOT EXISTS idx_reajustes_materiais_created_by ON public.reajustes_materiais (created_by);

-- ============================================================
-- 2. Tabela de itens — detalhamento por material afetado
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reajustes_materiais_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reajuste_id uuid NOT NULL REFERENCES public.reajustes_materiais(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materiais(id),

  -- snapshot no momento do reajuste (o material pode ser editado/excluído depois)
  codigo text,
  descricao text,
  categoria text,

  valor_anterior numeric(12,2) NOT NULL,
  valor_novo numeric(12,2) NOT NULL,
  diferenca numeric(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reajustes_materiais_itens_reajuste_id ON public.reajustes_materiais_itens (reajuste_id);
CREATE INDEX IF NOT EXISTS idx_reajustes_materiais_itens_material_id ON public.reajustes_materiais_itens (material_id);

-- ============================================================
-- 3. RLS — somente leitura via policy; toda escrita passa pelas funções
--    SECURITY DEFINER abaixo (nenhuma policy de INSERT/UPDATE/DELETE para
--    "authenticated" é criada de propósito).
-- ============================================================
ALTER TABLE public.reajustes_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reajustes_materiais_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reajustes_materiais_select" ON public.reajustes_materiais;
CREATE POLICY "reajustes_materiais_select" ON public.reajustes_materiais FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (has_permission('materiais.visualizar') OR has_role(auth.uid(), 'administrador'::app_role))
  );

DROP POLICY IF EXISTS "reajustes_materiais_itens_select" ON public.reajustes_materiais_itens;
CREATE POLICY "reajustes_materiais_itens_select" ON public.reajustes_materiais_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reajustes_materiais r
      WHERE r.id = reajustes_materiais_itens.reajuste_id
        AND r.company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    )
    AND (has_permission('materiais.visualizar') OR has_role(auth.uid(), 'administrador'::app_role))
  );

-- ============================================================
-- 4. Função de prévia — mesma lógica de seleção/cálculo da aplicação,
--    porém somente leitura (STABLE), sem travar linhas e sem gravar nada.
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_reajuste_materiais(
  p_tipo_operacao text,
  p_tipo_reajuste text,
  p_percentual numeric,
  p_valor_fixo numeric,
  p_criterio_selecao text,
  p_categorias text[],
  p_codigo_inicial text,
  p_codigo_final text,
  p_codigos_especificos text[]
)
RETURNS TABLE (
  material_id uuid,
  codigo text,
  descricao text,
  categoria text,
  valor_atual numeric,
  valor_novo numeric,
  diferenca numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_user_id uuid;
  v_company_id uuid;
BEGIN
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE user_id = v_caller_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do usuário autenticado não foi encontrado';
  END IF;

  IF NOT (has_permission('materiais.reajustar') OR has_role(v_caller_user_id, 'administrador'::app_role)) THEN
    RAISE EXCEPTION 'Você não tem permissão para reajustar valores de materiais';
  END IF;

  IF p_tipo_operacao NOT IN ('majorar', 'reduzir') THEN
    RAISE EXCEPTION 'Tipo de operação inválido';
  END IF;
  IF p_tipo_reajuste NOT IN ('percentual', 'valor_fixo') THEN
    RAISE EXCEPTION 'Tipo de reajuste inválido';
  END IF;
  IF p_criterio_selecao NOT IN ('todos', 'categoria', 'intervalo', 'especificos') THEN
    RAISE EXCEPTION 'Critério de seleção inválido';
  END IF;
  IF p_tipo_reajuste = 'percentual' AND (p_percentual IS NULL OR p_percentual <= 0) THEN
    RAISE EXCEPTION 'Informe um percentual válido, maior que zero';
  END IF;
  IF p_tipo_reajuste = 'valor_fixo' AND (p_valor_fixo IS NULL OR p_valor_fixo <= 0) THEN
    RAISE EXCEPTION 'Informe um valor fixo válido, maior que zero';
  END IF;
  IF p_criterio_selecao = 'categoria' AND (p_categorias IS NULL OR array_length(p_categorias, 1) IS NULL) THEN
    RAISE EXCEPTION 'Selecione ao menos uma categoria';
  END IF;
  IF p_criterio_selecao = 'intervalo' AND (
       p_codigo_inicial IS NULL OR p_codigo_final IS NULL
       OR p_codigo_inicial !~ '^[0-9]+$' OR p_codigo_final !~ '^[0-9]+$'
     ) THEN
    RAISE EXCEPTION 'Informe um intervalo de códigos válido (somente números)';
  END IF;
  IF p_criterio_selecao = 'especificos' AND (p_codigos_especificos IS NULL OR array_length(p_codigos_especificos, 1) IS NULL) THEN
    RAISE EXCEPTION 'Selecione ao menos um material';
  END IF;

  RETURN QUERY
  SELECT sub.material_id, sub.codigo, sub.descricao, sub.categoria, sub.valor_atual, sub.valor_novo,
         (sub.valor_novo - sub.valor_atual) AS diferenca
  FROM (
    SELECT
      m.id AS material_id, m.codigo, m.descricao, m.categoria,
      m.valor_unitario::numeric AS valor_atual,
      ROUND((
        CASE
          WHEN p_tipo_operacao = 'majorar' AND p_tipo_reajuste = 'percentual'
            THEN m.valor_unitario::numeric + (m.valor_unitario::numeric * p_percentual / 100)
          WHEN p_tipo_operacao = 'reduzir' AND p_tipo_reajuste = 'percentual'
            THEN m.valor_unitario::numeric - (m.valor_unitario::numeric * p_percentual / 100)
          WHEN p_tipo_operacao = 'majorar' AND p_tipo_reajuste = 'valor_fixo'
            THEN m.valor_unitario::numeric + p_valor_fixo
          WHEN p_tipo_operacao = 'reduzir' AND p_tipo_reajuste = 'valor_fixo'
            THEN m.valor_unitario::numeric - p_valor_fixo
        END
      )::numeric, 2) AS valor_novo
    FROM public.materiais m
    WHERE m.company_id = v_company_id
      AND m.valor_unitario IS NOT NULL
      AND (
        p_criterio_selecao = 'todos'
        OR (p_criterio_selecao = 'categoria' AND m.categoria = ANY(p_categorias))
        OR (p_criterio_selecao = 'intervalo' AND m.codigo ~ '^[0-9]+$'
            AND m.codigo::int BETWEEN p_codigo_inicial::int AND p_codigo_final::int)
        OR (p_criterio_selecao = 'especificos' AND m.codigo = ANY(p_codigos_especificos))
      )
  ) sub
  ORDER BY sub.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_reajuste_materiais(text, text, numeric, numeric, text, text[], text, text, text[]) TO authenticated;

-- ============================================================
-- 5. Função de aplicação — transação atômica (tudo ou nada).
--    Trava (FOR UPDATE) e recalcula em cima dos dados mais recentes no
--    momento da confirmação (não reaproveita o resultado da prévia), para
--    não aplicar um cálculo desatualizado se algo mudou entre a prévia e a
--    confirmação, e para impedir duplo clique/corrida.
-- ============================================================
CREATE OR REPLACE FUNCTION public.aplicar_reajuste_materiais(
  p_tipo_operacao text,
  p_tipo_reajuste text,
  p_percentual numeric,
  p_valor_fixo numeric,
  p_criterio_selecao text,
  p_categorias text[],
  p_codigo_inicial text,
  p_codigo_final text,
  p_codigos_especificos text[],
  p_justificativa text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_user_id uuid;
  v_caller_profile_id uuid;
  v_caller_nome text;
  v_company_id uuid;
  v_count int := 0;
  v_total_antes numeric := 0;
  v_total_depois numeric := 0;
  v_negativos text;
  v_reajuste_id uuid;
BEGIN
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT id, company_id, nome INTO v_caller_profile_id, v_company_id, v_caller_nome
  FROM public.profiles WHERE user_id = v_caller_user_id;

  IF v_caller_profile_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do usuário autenticado não foi encontrado';
  END IF;

  IF NOT (has_permission('materiais.reajustar') OR has_role(v_caller_user_id, 'administrador'::app_role)) THEN
    RAISE EXCEPTION 'Você não tem permissão para reajustar valores de materiais';
  END IF;

  IF p_tipo_operacao NOT IN ('majorar', 'reduzir') THEN
    RAISE EXCEPTION 'Tipo de operação inválido';
  END IF;
  IF p_tipo_reajuste NOT IN ('percentual', 'valor_fixo') THEN
    RAISE EXCEPTION 'Tipo de reajuste inválido';
  END IF;
  IF p_criterio_selecao NOT IN ('todos', 'categoria', 'intervalo', 'especificos') THEN
    RAISE EXCEPTION 'Critério de seleção inválido';
  END IF;
  IF coalesce(btrim(p_justificativa), '') = '' THEN
    RAISE EXCEPTION 'A justificativa do reajuste é obrigatória';
  END IF;
  IF p_tipo_reajuste = 'percentual' AND (p_percentual IS NULL OR p_percentual <= 0) THEN
    RAISE EXCEPTION 'Informe um percentual válido, maior que zero';
  END IF;
  IF p_tipo_reajuste = 'valor_fixo' AND (p_valor_fixo IS NULL OR p_valor_fixo <= 0) THEN
    RAISE EXCEPTION 'Informe um valor fixo válido, maior que zero';
  END IF;
  IF p_criterio_selecao = 'categoria' AND (p_categorias IS NULL OR array_length(p_categorias, 1) IS NULL) THEN
    RAISE EXCEPTION 'Selecione ao menos uma categoria';
  END IF;
  IF p_criterio_selecao = 'intervalo' AND (
       p_codigo_inicial IS NULL OR p_codigo_final IS NULL
       OR p_codigo_inicial !~ '^[0-9]+$' OR p_codigo_final !~ '^[0-9]+$'
     ) THEN
    RAISE EXCEPTION 'Informe um intervalo de códigos válido (somente números)';
  END IF;
  IF p_criterio_selecao = 'especificos' AND (p_codigos_especificos IS NULL OR array_length(p_codigos_especificos, 1) IS NULL) THEN
    RAISE EXCEPTION 'Selecione ao menos um material';
  END IF;

  CREATE TEMP TABLE _reajuste_alvo (
    material_id uuid,
    codigo text,
    descricao text,
    categoria text,
    valor_atual numeric,
    valor_novo numeric
  ) ON COMMIT DROP;

  -- FOR UPDATE trava as linhas de materiais selecionadas: uma segunda
  -- chamada concorrente (duplo clique) fica bloqueada aqui até esta
  -- transação terminar.
  INSERT INTO _reajuste_alvo (material_id, codigo, descricao, categoria, valor_atual, valor_novo)
  SELECT
    m.id, m.codigo, m.descricao, m.categoria, m.valor_unitario::numeric,
    ROUND((
      CASE
        WHEN p_tipo_operacao = 'majorar' AND p_tipo_reajuste = 'percentual'
          THEN m.valor_unitario::numeric + (m.valor_unitario::numeric * p_percentual / 100)
        WHEN p_tipo_operacao = 'reduzir' AND p_tipo_reajuste = 'percentual'
          THEN m.valor_unitario::numeric - (m.valor_unitario::numeric * p_percentual / 100)
        WHEN p_tipo_operacao = 'majorar' AND p_tipo_reajuste = 'valor_fixo'
          THEN m.valor_unitario::numeric + p_valor_fixo
        WHEN p_tipo_operacao = 'reduzir' AND p_tipo_reajuste = 'valor_fixo'
          THEN m.valor_unitario::numeric - p_valor_fixo
      END
    )::numeric, 2)
  FROM public.materiais m
  WHERE m.company_id = v_company_id
    AND m.valor_unitario IS NOT NULL
    AND (
      p_criterio_selecao = 'todos'
      OR (p_criterio_selecao = 'categoria' AND m.categoria = ANY(p_categorias))
      OR (p_criterio_selecao = 'intervalo' AND m.codigo ~ '^[0-9]+$'
          AND m.codigo::int BETWEEN p_codigo_inicial::int AND p_codigo_final::int)
      OR (p_criterio_selecao = 'especificos' AND m.codigo = ANY(p_codigos_especificos))
    )
  FOR UPDATE OF m;

  SELECT count(*), coalesce(sum(valor_atual), 0), coalesce(sum(valor_novo), 0)
  INTO v_count, v_total_antes, v_total_depois
  FROM _reajuste_alvo;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum material encontrado para os critérios informados';
  END IF;

  -- Regra obrigatória: nenhum reajuste pode resultar em valor negativo —
  -- se qualquer material selecionado ficaria negativo, aborta TODA a
  -- operação (nada é alterado).
  SELECT string_agg(codigo, ', ' ORDER BY codigo) INTO v_negativos
  FROM _reajuste_alvo WHERE valor_novo < 0;

  IF v_negativos IS NOT NULL THEN
    RAISE EXCEPTION 'O reajuste resultaria em valor negativo para os materiais: %. Nenhuma alteração foi aplicada.', v_negativos;
  END IF;

  UPDATE public.materiais m
  SET valor_unitario = a.valor_novo
  FROM _reajuste_alvo a
  WHERE m.id = a.material_id;

  INSERT INTO public.reajustes_materiais (
    company_id, tipo_operacao, tipo_reajuste, percentual, valor_fixo,
    criterio_selecao, categorias_selecionadas, codigo_inicial, codigo_final, codigos_especificos,
    quantidade_materiais_afetados, valor_total_antes, valor_total_depois, justificativa,
    created_by, created_by_nome
  ) VALUES (
    v_company_id, p_tipo_operacao, p_tipo_reajuste, p_percentual, p_valor_fixo,
    p_criterio_selecao, p_categorias, p_codigo_inicial, p_codigo_final, p_codigos_especificos,
    v_count, v_total_antes, v_total_depois, p_justificativa,
    v_caller_profile_id, v_caller_nome
  )
  RETURNING id INTO v_reajuste_id;

  INSERT INTO public.reajustes_materiais_itens (
    reajuste_id, material_id, codigo, descricao, categoria, valor_anterior, valor_novo, diferenca
  )
  SELECT v_reajuste_id, material_id, codigo, descricao, categoria, valor_atual, valor_novo, (valor_novo - valor_atual)
  FROM _reajuste_alvo;

  RETURN jsonb_build_object(
    'success', true,
    'reajuste_id', v_reajuste_id,
    'materiais_afetados', v_count,
    'valor_total_antes', v_total_antes,
    'valor_total_depois', v_total_depois
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_reajuste_materiais(text, text, numeric, numeric, text, text[], text, text, text[], text) TO authenticated;
