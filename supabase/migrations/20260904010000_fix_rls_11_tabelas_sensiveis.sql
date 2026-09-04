-- CORREÇÃO DE SEGURANÇA (parte 2 de várias): mesmo padrão do
-- anexos_os (20260904000000), aplicado agora nas 11 tabelas mais
-- sensíveis dentre as ~40 identificadas com o mesmo problema.
--
-- Cada uma tinha apenas política(s) permissiva(s) (qual/with_check
-- literalmente "true"), sem nenhum escopo por empresa -- qualquer
-- usuário autenticado, de qualquer empresa, podia ler/escrever os
-- dados de qualquer outra empresa nessas tabelas via chamada direta
-- à API (não precisava nem passar pela tela do app).
--
-- Priorizadas por sensibilidade: sistema de permissões
-- (perfis_acesso, permissoes_perfil), dados financeiros (boletos,
-- pedidos_compra), e dados de negócio centrais (materiais, estoque,
-- ativos).
--
-- Antes de escrever cada policy, foi verificado: (1) se a tabela tem
-- company_id direto ou precisa de policy via join com a tabela-mãe
-- (estoque_anexos → estoque_movimentacoes; pedidos_compra_itens →
-- pedidos_compra; permissoes_perfil → perfis_acesso); (2) quais
-- operações (select/insert/update/delete) o app de fato usa em cada
-- uma, pra não sobrar nem faltar policy; (3) qual screen/permissão do
-- catálogo do app (PERMISSION_SCREENS) rege cada uma. boletos não tem
-- chave de permissão própria no catálogo do app -- policies ficaram
-- só com escopo de empresa, sem checagem de permissão, espelhando
-- exatamente o que o app já faz hoje (a tela não usa can() nenhum).
--
-- has_permission() já trata administrador como "sempre libera"
-- internamente e é SECURITY DEFINER (não é afetada pelas novas
-- policies de permissoes_perfil que ela mesma consulta) -- confirmado
-- antes de aplicar, pra não travar ninguém.
--
-- Restam ~30 tabelas com o mesmo problema, tratadas como projeto à
-- parte por decisão dela, dado o volume.
--
-- Já aplicado diretamente em produção (projeto tayxbbpyxbomiatbiirx)
-- via MCP do Supabase; este arquivo mantém o histórico de migrations
-- do repositório em paridade com o banco.

-- ── materiais ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "materiais_all" ON public.materiais;
CREATE POLICY "materiais_select_company" ON public.materiais FOR SELECT
  USING (company_id = get_my_company_id() AND has_permission('materiais.visualizar'));
CREATE POLICY "materiais_insert_company" ON public.materiais FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('materiais.criar'));
CREATE POLICY "materiais_update_company" ON public.materiais FOR UPDATE
  USING (company_id = get_my_company_id() AND has_permission('materiais.editar'))
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "materiais_delete_company" ON public.materiais FOR DELETE
  USING (company_id = get_my_company_id() AND has_permission('materiais.excluir'));

-- ── estoque ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_estoque" ON public.estoque;
CREATE POLICY "estoque_select_company" ON public.estoque FOR SELECT
  USING (company_id = get_my_company_id() AND has_permission('estoque.visualizar'));
CREATE POLICY "estoque_insert_company" ON public.estoque FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('estoque.criar'));
CREATE POLICY "estoque_update_company" ON public.estoque FOR UPDATE
  USING (company_id = get_my_company_id() AND has_permission('estoque.editar'))
  WITH CHECK (company_id = get_my_company_id());

-- ── estoque_movimentacoes ──────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_movimentacoes" ON public.estoque_movimentacoes;
CREATE POLICY "estoque_mov_select_company" ON public.estoque_movimentacoes FOR SELECT
  USING (company_id = get_my_company_id() AND has_permission('estoque.visualizar'));
CREATE POLICY "estoque_mov_insert_company" ON public.estoque_movimentacoes FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('estoque.criar'));

-- ── estoque_anexos (sem company_id direto -- join via movimentacao_id) ──
DROP POLICY IF EXISTS "allow_all_estoque_anexos" ON public.estoque_anexos;
CREATE POLICY "estoque_anexos_select_company" ON public.estoque_anexos FOR SELECT
  USING (movimentacao_id IN (SELECT id FROM public.estoque_movimentacoes WHERE company_id = get_my_company_id()));

-- ── ativos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ativos_all" ON public.ativos;
DROP POLICY IF EXISTS "Allow public read ativos" ON public.ativos;
CREATE POLICY "ativos_select_company" ON public.ativos FOR SELECT
  USING (company_id = get_my_company_id() AND has_permission('ativos.visualizar'));
CREATE POLICY "ativos_insert_company" ON public.ativos FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('ativos.criar'));
CREATE POLICY "ativos_update_company" ON public.ativos FOR UPDATE
  USING (company_id = get_my_company_id() AND has_permission('ativos.editar'))
  WITH CHECK (company_id = get_my_company_id());

-- ── ativo_manutencoes (nao usada pelo frontend -- so leitura escopada) ──
DROP POLICY IF EXISTS "ativo_manutencoes_all" ON public.ativo_manutencoes;
CREATE POLICY "ativo_manutencoes_select_company" ON public.ativo_manutencoes FOR SELECT
  USING (company_id = get_my_company_id());

-- ── pedidos_compra ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_pedidos_compra" ON public.pedidos_compra;
CREATE POLICY "pedidos_compra_select_company" ON public.pedidos_compra FOR SELECT
  USING (company_id = get_my_company_id() AND has_permission('pedidos_compra.visualizar'));
CREATE POLICY "pedidos_compra_insert_company" ON public.pedidos_compra FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('pedidos_compra.criar'));
CREATE POLICY "pedidos_compra_update_company" ON public.pedidos_compra FOR UPDATE
  USING (company_id = get_my_company_id() AND has_permission('pedidos_compra.editar'))
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "pedidos_compra_delete_company" ON public.pedidos_compra FOR DELETE
  USING (company_id = get_my_company_id() AND has_permission('pedidos_compra.excluir'));

-- ── pedidos_compra_itens (sem company_id direto -- join via pedido_id) ──
DROP POLICY IF EXISTS "allow_all_pedidos_compra_itens" ON public.pedidos_compra_itens;
CREATE POLICY "pedidos_compra_itens_select_company" ON public.pedidos_compra_itens FOR SELECT
  USING (pedido_id IN (SELECT id FROM public.pedidos_compra WHERE company_id = get_my_company_id()));
CREATE POLICY "pedidos_compra_itens_insert_company" ON public.pedidos_compra_itens FOR INSERT
  WITH CHECK (pedido_id IN (SELECT id FROM public.pedidos_compra WHERE company_id = get_my_company_id()));
CREATE POLICY "pedidos_compra_itens_delete_company" ON public.pedidos_compra_itens FOR DELETE
  USING (pedido_id IN (SELECT id FROM public.pedidos_compra WHERE company_id = get_my_company_id()));

-- ── boletos (sem chave de permissao propria no catalogo do app -- so escopo por empresa, igual o app ja faz) ──
DROP POLICY IF EXISTS "allow_all_boletos" ON public.boletos;
CREATE POLICY "boletos_select_company" ON public.boletos FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "boletos_insert_company" ON public.boletos FOR INSERT
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "boletos_update_company" ON public.boletos FOR UPDATE
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "boletos_delete_company" ON public.boletos FOR DELETE
  USING (company_id = get_my_company_id());

-- ── perfis_acesso (ja tinha outras policies legitimas -- essas so completam pra papeis nao-admin) ──
DROP POLICY IF EXISTS "allow_all_perfis_acesso" ON public.perfis_acesso;
DROP POLICY IF EXISTS "Authenticated can read perfis_acesso" ON public.perfis_acesso;
CREATE POLICY "perfis_acesso_select_company" ON public.perfis_acesso FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "perfis_acesso_insert_company" ON public.perfis_acesso FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND has_permission('perfis_acesso.criar'));
CREATE POLICY "perfis_acesso_update_company" ON public.perfis_acesso FOR UPDATE
  USING (company_id = get_my_company_id() AND has_permission('perfis_acesso.editar'))
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "perfis_acesso_delete_company" ON public.perfis_acesso FOR DELETE
  USING (company_id = get_my_company_id() AND has_permission('perfis_acesso.excluir'));

-- ── permissoes_perfil (sem company_id direto -- join via perfil_acesso_id) ──
DROP POLICY IF EXISTS "Allow all authenticated" ON public.permissoes_perfil;
CREATE POLICY "permissoes_perfil_select_company" ON public.permissoes_perfil FOR SELECT
  USING (perfil_acesso_id IN (SELECT id FROM public.perfis_acesso WHERE company_id = get_my_company_id()));
CREATE POLICY "permissoes_perfil_insert_company" ON public.permissoes_perfil FOR INSERT
  WITH CHECK (
    has_permission('perfis_acesso.editar')
    AND perfil_acesso_id IN (SELECT id FROM public.perfis_acesso WHERE company_id = get_my_company_id())
  );
CREATE POLICY "permissoes_perfil_delete_company" ON public.permissoes_perfil FOR DELETE
  USING (
    has_permission('perfis_acesso.editar')
    AND perfil_acesso_id IN (SELECT id FROM public.perfis_acesso WHERE company_id = get_my_company_id())
  );
