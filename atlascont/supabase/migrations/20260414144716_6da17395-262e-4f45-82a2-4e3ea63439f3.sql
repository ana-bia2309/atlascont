
-- Drop function with cascade to remove dependent triggers
DROP FUNCTION IF EXISTS public.atualizar_estoque_epi() CASCADE;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.historico_estoque_epi CASCADE;
DROP TABLE IF EXISTS public.entregas_epi CASCADE;
DROP TABLE IF EXISTS public.epis CASCADE;
