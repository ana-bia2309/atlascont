-- Corrige "structure of query does not match function result type" na
-- prévia do Reajuste de Valores em lote.
--
-- Causa raiz confirmada via information_schema (consulta direta ao banco
-- de produção): materiais.codigo é character varying(50) (criado
-- manualmente no Supabase Studio), não text como a função havia assumido
-- no RETURNS TABLE. O RETURN QUERY do PL/pgSQL exige que a estrutura da
-- query bata exatamente com o tipo declarado, então o mismatch
-- varchar(50) -> text estourava esse erro assim que a prévia rodava.
--
-- aplicar_reajuste_materiais não tinha esse problema porque usa uma
-- tabela temporária com a coluna já declarada como "text" e um INSERT
-- normal (que aceita cast de atribuição varchar -> text); só a função de
-- prévia, que usa RETURN QUERY, era afetada.
--
-- Fix: cast explícito de cada coluna retornada para o tipo exatamente
-- declarado no RETURNS TABLE, blindando contra qualquer diferença de tipo
-- na origem — mesmo raciocínio defensivo já usado no resto do projeto por
-- causa do schema criado manualmente fora do histórico de migrations.
--
-- Já aplicada diretamente em produção (projeto tayxbbpyxbomiatbiirx) via
-- MCP do Supabase; este arquivo só mantém o histórico de migrations do
-- repositório em paridade com o banco. CREATE OR REPLACE é idempotente,
-- então rodar de novo aqui não tem efeito colateral.

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
  SELECT
    sub.material_id::uuid,
    sub.codigo::text,
    sub.descricao::text,
    sub.categoria::text,
    sub.valor_atual::numeric,
    sub.valor_novo::numeric,
    (sub.valor_novo - sub.valor_atual)::numeric AS diferenca
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
