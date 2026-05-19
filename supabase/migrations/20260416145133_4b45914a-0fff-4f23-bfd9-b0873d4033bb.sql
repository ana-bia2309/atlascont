
ALTER TABLE public.manutencao_preventiva
ADD COLUMN responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
