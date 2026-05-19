
-- 1. Add custo_total to ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS custo_total numeric DEFAULT 0;

-- 2. Create materiais_os table
CREATE TABLE public.materiais_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  nome_material text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  unidade text DEFAULT 'un',
  custo_unitario numeric NOT NULL DEFAULT 0,
  custo_total_item numeric GENERATED ALWAYS AS (quantidade * custo_unitario) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.materiais_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on materiais_os" ON public.materiais_os
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_materiais_os_os_id ON public.materiais_os(os_id);

-- 3. Create anexos_os table
CREATE TABLE public.anexos_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  url_arquivo text NOT NULL,
  tipo_arquivo text DEFAULT 'application/pdf',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.anexos_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on anexos_os" ON public.anexos_os
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_anexos_os_os_id ON public.anexos_os(os_id);

-- 4. Trigger to auto-update updated_at on materiais_os
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_materiais_os_updated_at
  BEFORE UPDATE ON public.materiais_os
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Storage bucket for OS attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('anexos-os', 'anexos-os', true);

CREATE POLICY "Anyone can read anexos-os" ON storage.objects
  FOR SELECT USING (bucket_id = 'anexos-os');

CREATE POLICY "Anyone can upload to anexos-os" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'anexos-os');

CREATE POLICY "Anyone can delete from anexos-os" ON storage.objects
  FOR DELETE USING (bucket_id = 'anexos-os');
