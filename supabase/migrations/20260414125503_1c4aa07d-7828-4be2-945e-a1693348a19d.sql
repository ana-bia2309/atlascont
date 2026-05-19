
ALTER TABLE public.gastos
  ADD COLUMN os_id uuid REFERENCES public.ordens_servico(id) ON DELETE SET NULL;

CREATE INDEX idx_gastos_os_id ON public.gastos(os_id);
