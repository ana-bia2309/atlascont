
-- Templates de checklist por tipo de serviço
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico text NOT NULL,
  titulo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read checklist_templates" ON public.checklist_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage checklist_templates" ON public.checklist_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Itens do template
CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read checklist_template_items" ON public.checklist_template_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage checklist_template_items" ON public.checklist_template_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Itens de checklist vinculados a uma OS
CREATE TABLE public.checklist_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  concluido_por uuid REFERENCES public.profiles(id),
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read checklist_os" ON public.checklist_os
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert checklist_os" ON public.checklist_os
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update checklist_os" ON public.checklist_os
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete checklist_os" ON public.checklist_os
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));
