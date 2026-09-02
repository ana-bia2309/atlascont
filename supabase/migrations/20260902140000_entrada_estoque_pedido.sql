-- Melhoria 4: "Dar Entrada no Estoque" a partir de um Pedido Recebido/Comprado.
--
-- IMPORTANTE: assim como em materiais/materiais_os (ver migration
-- 20260901120000_materiais_categoria_servico.sql), as tabelas pedidos_compra,
-- pedidos_compra_itens, estoque e estoque_movimentacoes foram criadas
-- manualmente via Supabase Studio e não existem em nenhuma migration anterior
-- rastreada. Este script é defensivo/idempotente (IF NOT EXISTS em tudo) e
-- reaproveita 100% da estrutura já existente:
--   - reaproveita a tabela `estoque` (não cria tabela nova de estoque)
--   - reaproveita a tabela `estoque_movimentacoes` (não cria tabela nova de
--     movimentação, apenas adiciona a coluna de vínculo com o pedido)
--   - reaproveita o status "recebido" já existente em pedidos_compra como o
--     status "Armazenado" pedido pela Ana — esse status já existe (card
--     "Recebidos" no dashboard de Pedidos Recebidos) e nunca era setado por
--     nenhum fluxo até agora, então não há status duplicado sendo criado.

-- 1. Vínculo da movimentação de estoque com o pedido de compra que a originou
--    (rastreabilidade — requisito 11).
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS pedido_compra_id uuid;

CREATE INDEX IF NOT EXISTS idx_estoque_mov_pedido_compra_id
  ON public.estoque_movimentacoes (pedido_compra_id);

-- 2. Proteção extra contra entrada duplicada (requisito 7), além do lock de
--    linha feito dentro da função abaixo: nenhum material pode ter mais de
--    uma movimentação de tipo 'entrada' vinculada ao mesmo pedido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_mov_entrada_pedido_material_uniq
  ON public.estoque_movimentacoes (pedido_compra_id, material_id)
  WHERE tipo = 'entrada' AND pedido_compra_id IS NOT NULL;

-- 3. Auditoria de quem/quando deu entrada (requisito 18).
ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS estoque_entrada_por uuid;

ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS estoque_entrada_em timestamptz;

-- 4. Função que executa a entrada de estoque de um pedido inteiro em uma
--    única transação (requisito 12 — tudo ou nada) e que só pode ser
--    executada quando o pedido está "comprado" (requisito 2), travando a
--    linha do pedido para impedir duplo clique/corrida (requisito 7).
--
--    SECURITY DEFINER é usado propositalmente aqui: como o projeto já tem um
--    bug conhecido de isolamento multi-tenant no RLS (has_role() não filtra
--    por company_id em algumas tabelas), a função faz a checagem de
--    tenant/permissão explicitamente por código (comparando o company_id do
--    pedido com o company_id do perfil autenticado) em vez de depender só das
--    policies de RLS das tabelas envolvidas.
CREATE OR REPLACE FUNCTION public.dar_entrada_estoque_pedido(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido record;
  v_caller_user_id uuid;
  v_caller_profile_id uuid;
  v_caller_company_id uuid;
  v_item record;
  v_itens_count int := 0;
  v_updated int;
BEGIN
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT id, company_id INTO v_caller_profile_id, v_caller_company_id
  FROM public.profiles
  WHERE user_id = v_caller_user_id;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do usuário autenticado não foi encontrado';
  END IF;

  -- Trava a linha do pedido: uma segunda chamada concorrente (duplo clique)
  -- fica bloqueada aqui até a primeira terminar, e então vê o status já
  -- alterado para 'recebido' e é rejeitada pela checagem de status abaixo.
  SELECT * INTO v_pedido
  FROM public.pedidos_compra
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_pedido.company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar este pedido';
  END IF;

  IF v_pedido.status IS DISTINCT FROM 'comprado' THEN
    RAISE EXCEPTION 'Somente pedidos com status "Comprado" podem receber entrada no estoque (status atual: %)', v_pedido.status;
  END IF;

  -- Passo de validação: se qualquer item não tiver material vinculado,
  -- aborta tudo antes de mexer no estoque (requisito 16 — não permite
  -- entrada parcial nem cria material duplicado).
  FOR v_item IN
    SELECT * FROM public.pedidos_compra_itens WHERE pedido_id = p_pedido_id
  LOOP
    IF v_item.material_id IS NULL THEN
      RAISE EXCEPTION 'Item "%" do pedido não está vinculado a um material cadastrado no Estoque. Vincule o item a um material existente antes de dar entrada.', v_item.nome_material;
    END IF;
    IF v_item.quantidade IS NULL OR v_item.quantidade <= 0 THEN
      RAISE EXCEPTION 'Item "%" do pedido tem quantidade inválida.', v_item.nome_material;
    END IF;
  END LOOP;

  -- Processa a entrada de cada item real do pedido.
  FOR v_item IN
    SELECT * FROM public.pedidos_compra_itens WHERE pedido_id = p_pedido_id
  LOOP
    UPDATE public.estoque
    SET quantidade_disponivel = quantidade_disponivel + v_item.quantidade,
        updated_at = now()
    WHERE material_id = v_item.material_id
      AND company_id = v_pedido.company_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO public.estoque (material_id, company_id, quantidade_disponivel)
      VALUES (v_item.material_id, v_pedido.company_id, v_item.quantidade);
    END IF;

    INSERT INTO public.estoque_movimentacoes (
      material_id, company_id, tipo, quantidade, data_movimentacao,
      observacoes, created_by, pedido_compra_id
    ) VALUES (
      v_item.material_id, v_pedido.company_id, 'entrada', v_item.quantidade, current_date,
      'Entrada automática — Pedido ' || COALESCE(v_pedido.numero, p_pedido_id::text),
      v_caller_user_id, p_pedido_id
    );

    v_itens_count := v_itens_count + 1;
  END LOOP;

  -- Reaproveita o status "recebido" já existente como "Armazenado".
  UPDATE public.pedidos_compra
  SET status = 'recebido',
      estoque_entrada_por = v_caller_profile_id,
      estoque_entrada_em = now(),
      updated_at = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'success', true,
    'itens_processados', v_itens_count,
    'numero', v_pedido.numero
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dar_entrada_estoque_pedido(uuid) TO authenticated;
