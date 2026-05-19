
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_schedule_type text NOT NULL DEFAULT 'administrativo',
  ADD COLUMN IF NOT EXISTS scale_start_date date,
  ADD COLUMN IF NOT EXISTS scale_starts_working boolean DEFAULT true;
