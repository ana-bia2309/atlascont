
-- Add old_value and new_value jsonb columns to historico_os for field-level change tracking
ALTER TABLE public.historico_os
  ADD COLUMN IF NOT EXISTS old_value jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_value jsonb DEFAULT NULL;
