
-- Add ativo_id column to ordens_servico
ALTER TABLE public.ordens_servico
ADD COLUMN ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_ordens_servico_ativo_id ON public.ordens_servico(ativo_id);

-- Create historico_ativos table
CREATE TABLE public.historico_ativos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.historico_ativos ENABLE ROW LEVEL SECURITY;

-- Public access policy
CREATE POLICY "Allow all on historico_ativos"
ON public.historico_ativos
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Trigger: log when ativo status changes
CREATE OR REPLACE FUNCTION public.log_ativo_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_ativos (ativo_id, acao, detalhes)
    VALUES (NEW.id, 'Alteração de status', 'Status alterado de "' || COALESCE(OLD.status, '—') || '" para "' || NEW.status || '"');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ativo_status_change
AFTER UPDATE ON public.ativos
FOR EACH ROW
EXECUTE FUNCTION public.log_ativo_status_change();

-- Trigger: log when OS is linked to an ativo
CREATE OR REPLACE FUNCTION public.log_os_ativo_vinculado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- New link
  IF NEW.ativo_id IS NOT NULL AND (OLD.ativo_id IS NULL OR OLD.ativo_id IS DISTINCT FROM NEW.ativo_id) THEN
    INSERT INTO public.historico_ativos (ativo_id, acao, detalhes)
    VALUES (NEW.ativo_id, 'O.S. vinculada', 'Ordem de Serviço "' || COALESCE(NEW.codigo_os, NEW.id::text) || '" vinculada ao ativo');
  END IF;
  -- Unlink old
  IF OLD.ativo_id IS NOT NULL AND OLD.ativo_id IS DISTINCT FROM NEW.ativo_id THEN
    INSERT INTO public.historico_ativos (ativo_id, acao, detalhes)
    VALUES (OLD.ativo_id, 'O.S. desvinculada', 'Ordem de Serviço "' || COALESCE(OLD.codigo_os, OLD.id::text) || '" removida do ativo');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_os_ativo_vinculado
AFTER UPDATE ON public.ordens_servico
FOR EACH ROW
EXECUTE FUNCTION public.log_os_ativo_vinculado();

-- Also log on insert if ativo_id is set
CREATE OR REPLACE FUNCTION public.log_os_ativo_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo_id IS NOT NULL THEN
    INSERT INTO public.historico_ativos (ativo_id, acao, detalhes)
    VALUES (NEW.ativo_id, 'O.S. vinculada', 'Ordem de Serviço "' || COALESCE(NEW.codigo_os, NEW.id::text) || '" criada e vinculada ao ativo');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_os_ativo_insert
AFTER INSERT ON public.ordens_servico
FOR EACH ROW
EXECUTE FUNCTION public.log_os_ativo_insert();

-- Log ativo creation
CREATE OR REPLACE FUNCTION public.log_ativo_criado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.historico_ativos (ativo_id, acao, detalhes)
  VALUES (NEW.id, 'Ativo cadastrado', 'Ativo "' || NEW.nome || '" foi cadastrado no sistema');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ativo_criado
AFTER INSERT ON public.ativos
FOR EACH ROW
EXECUTE FUNCTION public.log_ativo_criado();
