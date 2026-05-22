
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS work_start time,
  ADD COLUMN IF NOT EXISTS work_end time,
  ADD COLUMN IF NOT EXISTS work_days text[] DEFAULT '{}';
