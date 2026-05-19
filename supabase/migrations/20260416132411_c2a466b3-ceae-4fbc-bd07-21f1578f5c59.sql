CREATE TABLE public.tipos_atividade (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_atividade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tipos_atividade"
ON public.tipos_atividade FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrador'))
WITH CHECK (has_role(auth.uid(), 'administrador'));

CREATE POLICY "Authenticated can read tipos_atividade"
ON public.tipos_atividade FOR SELECT TO authenticated
USING (true);

CREATE TRIGGER update_tipos_atividade_updated_at
BEFORE UPDATE ON public.tipos_atividade
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default values
INSERT INTO public.tipos_atividade (nome) VALUES
  ('Inspeção'), ('Medição'), ('Reaperto'), ('Limpeza'),
  ('Lubrificação'), ('Teste'), ('Substituição'), ('Outros');