ALTER TABLE public.manutencao_preventiva
  ADD COLUMN andar text,
  ADD COLUMN sala text;

ALTER TABLE public.ordens_preventivas
  ADD COLUMN andar text,
  ADD COLUMN sala text;

ALTER TABLE public.planos_manutencao
  ADD COLUMN andar text,
  ADD COLUMN sala text;