-- ============================================================
-- Unidades de Manutenção (blocos) — cadastro completo
-- Evolui a tabela existente, sem recriar nem apagar dados.
-- ============================================================

-- Colunas que já existiam na base (adicionadas via Studio, nunca
-- versionadas) — garantidas aqui de forma defensiva/idempotente.
ALTER TABLE public.blocos
  ADD COLUMN IF NOT EXISTS descricao  text,
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- ------------------------------------------------------------
-- Dados da Unidade
-- ------------------------------------------------------------
ALTER TABLE public.blocos
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'Ativo',
  ADD COLUMN IF NOT EXISTS codigo             text,
  ADD COLUMN IF NOT EXISTS situacao_imovel    text,
  ADD COLUMN IF NOT EXISTS classificacao      text,
  ADD COLUMN IF NOT EXISTS documento          text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS razao_social       text,
  ADD COLUMN IF NOT EXISTS nome_fantasia      text,
  ADD COLUMN IF NOT EXISTS cep                text,
  ADD COLUMN IF NOT EXISTS pais               text DEFAULT 'Brasil',
  ADD COLUMN IF NOT EXISTS estado             text,
  ADD COLUMN IF NOT EXISTS cidade             text,
  ADD COLUMN IF NOT EXISTS endereco           text;

-- ------------------------------------------------------------
-- Responsável pela Unidade (prefixo resp_)
-- ------------------------------------------------------------
ALTER TABLE public.blocos
  ADD COLUMN IF NOT EXISTS resp_classificacao text,
  ADD COLUMN IF NOT EXISTS resp_tipo          text,
  ADD COLUMN IF NOT EXISTS resp_razao_social  text,
  ADD COLUMN IF NOT EXISTS resp_documento     text,
  ADD COLUMN IF NOT EXISTS resp_telefone      text,
  ADD COLUMN IF NOT EXISTS resp_celular       text,
  ADD COLUMN IF NOT EXISTS resp_cep           text,
  ADD COLUMN IF NOT EXISTS resp_pais          text DEFAULT 'Brasil',
  ADD COLUMN IF NOT EXISTS resp_estado        text,
  ADD COLUMN IF NOT EXISTS resp_cidade        text,
  ADD COLUMN IF NOT EXISTS resp_endereco      text;

-- Compatibilidade com registros antigos: nenhuma unidade existente
-- fica sem status (default 'Ativo' já cobre isso). Nenhum outro
-- campo novo é obrigatório, então unidades antigas incompletas
-- continuam visíveis e editáveis normalmente.
UPDATE public.blocos SET status = 'Ativo' WHERE status IS NULL;

-- Trava simples de coerência entre classificação e status
DO $$ BEGIN
  ALTER TABLE public.blocos
    ADD CONSTRAINT blocos_status_check CHECK (status IN ('Ativo', 'Inativo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.blocos
    ADD CONSTRAINT blocos_classificacao_check
      CHECK (classificacao IS NULL OR classificacao IN ('Física', 'Jurídica'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.blocos
    ADD CONSTRAINT blocos_resp_classificacao_check
      CHECK (resp_classificacao IS NULL OR resp_classificacao IN ('Física', 'Jurídica'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Código não pode duplicar dentro da mesma empresa (permite nulo/vazio
-- para não travar unidades antigas sem código ainda preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS blocos_codigo_empresa_unique
  ON public.blocos (company_id, codigo)
  WHERE codigo IS NOT NULL AND codigo <> '';

-- ============================================================
-- Segurança: a tabela ganhou campos sensíveis (CPF/CNPJ, telefone,
-- endereço do responsável). A policy "blocos_public_read" existente
-- libera leitura anônima irrestrita (USING (true)) para as páginas
-- públicas de OS/ativo, que hoje só precisam do nome do bloco.
-- Em vez de remover o acesso público (quebraria essas páginas),
-- restringimos por coluna: o público continua enxergando só o
-- necessário para exibição, nunca os novos campos sensíveis.
-- ============================================================
REVOKE SELECT ON public.blocos FROM anon;
GRANT SELECT (id, nome, status) ON public.blocos TO anon;

-- NOTA (não resolvido nesta migration): as policies "blocos_select"
-- e demais para o papel "authenticated" usam has_permission(), que
-- não filtra por company_id — o mesmo problema de isolamento entre
-- empresas já diagnosticado em jul/2026 para outras tabelas. Com os
-- novos campos sensíveis, esse ponto fica mais importante de corrigir,
-- mas exige inspecionar a coluna profiles.company_id ao vivo (ela
-- também não está em nenhuma migration rastreada) para não quebrar
-- login/acesso de ninguém. Recomendo tratar isso numa conversa própria,
-- com acesso direto ao banco.