ALTER TABLE public.atividades_preventiva 
ADD COLUMN status text NOT NULL DEFAULT 'Pendente';

-- Sync existing data: if concluido = true, set status to 'Concluído'
UPDATE public.atividades_preventiva SET status = 'Concluído' WHERE concluido = true;