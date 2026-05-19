ALTER TABLE public.atividades_ordem_preventiva
  ADD COLUMN IF NOT EXISTS timer_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS timer_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timer_paused_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timer_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_user_id uuid;