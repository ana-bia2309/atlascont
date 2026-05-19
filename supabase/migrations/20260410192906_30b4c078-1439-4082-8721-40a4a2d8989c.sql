
ALTER TABLE public.ordens_servico
ADD COLUMN cronograma_id uuid REFERENCES public.cronogramas(id) ON DELETE SET NULL;

CREATE INDEX idx_os_cronograma ON public.ordens_servico(cronograma_id);
