
-- Add time tracking mode to ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS time_tracking_mode text DEFAULT NULL;

-- Add timer fields to atividades_os for per-activity timers
ALTER TABLE public.atividades_os
  ADD COLUMN IF NOT EXISTS timer_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS timer_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timer_paused_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timer_user_id uuid DEFAULT NULL;

-- Add FK for timer_user_id
ALTER TABLE public.atividades_os
  ADD CONSTRAINT atividades_os_timer_user_id_fkey
  FOREIGN KEY (timer_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
