
-- Add origem column
ALTER TABLE public.ordens_servico
ADD COLUMN origem text NOT NULL DEFAULT 'Corretiva';

-- Backfill existing preventiva-generated OS
UPDATE public.ordens_servico
SET origem = 'Preventiva'
WHERE codigo_os LIKE 'PREV-%';
