-- CORREÇÃO DE SEGURANÇA: anexos_os estava com Row Level Security
-- DESABILITADO na tabela inteira -- a única entre todas as tabelas do
-- sistema nesse estado (confirmado consultando pg_class.relrowsecurity
-- de todas as tabelas públicas). Isso significa que, na prática,
-- NENHUMA policy (nem as antigas nem as novas, corretamente escopadas
-- por empresa) estava sendo aplicada -- qualquer usuário autenticado
-- podia ler/escrever anexos_os de QUALQUER empresa, não só a própria.
--
-- Confirmado: 2 empresas distintas têm dados nesta tabela (44
-- registros no momento da correção), então a exposição era real, não
-- teórica.
--
-- A tabela já tinha policies bem escopadas (anexos_os_select_company,
-- anexos_os_insert_company, anexos_os_delete_company, "Users can view
-- anexos_os from same company"), checando company_id contra o usuário
-- autenticado -- só nunca estavam sendo aplicadas porque RLS estava
-- desligado no nível da tabela. Também havia policies antigas e
-- permissivas demais ("Permitir select/insert/update/delete para
-- autenticados", qual/with_check = true, sem nenhum escopo por
-- empresa) que, se RLS fosse só reativado sem removê-las, continuariam
-- concedendo acesso irrestrito em paralelo (policies permissivas são
-- combinadas com OR, não substituem umas às outras).
--
-- Verificado antes de aplicar: o app nunca faz UPDATE em anexos_os
-- (só SELECT, INSERT e DELETE), então não sobrar uma policy de UPDATE
-- depois da limpeza não quebra nada -- só bloqueia (corretamente) uma
-- operação que o app nunca usa.
--
-- Fix: remove as policies antigas sem escopo, mantém só as corretas,
-- e reativa RLS na tabela. Já aplicado diretamente em produção
-- (projeto tayxbbpyxbomiatbiirx) via MCP do Supabase; este arquivo só
-- mantém o histórico de migrations do repositório em paridade com o
-- banco.

DROP POLICY IF EXISTS "Permitir insert para autenticados" ON public.anexos_os;
DROP POLICY IF EXISTS "Permitir select para autenticados" ON public.anexos_os;
DROP POLICY IF EXISTS "Permitir update para autenticados" ON public.anexos_os;
DROP POLICY IF EXISTS "Permitir delete para autenticados" ON public.anexos_os;

ALTER TABLE public.anexos_os ENABLE ROW LEVEL SECURITY;
