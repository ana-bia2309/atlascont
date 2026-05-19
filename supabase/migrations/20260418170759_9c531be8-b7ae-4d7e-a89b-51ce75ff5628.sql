ALTER TABLE public.ordens_preventivas REPLICA IDENTITY FULL;
ALTER TABLE public.atividades_ordem_preventiva REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_preventivas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_ordem_preventiva;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;