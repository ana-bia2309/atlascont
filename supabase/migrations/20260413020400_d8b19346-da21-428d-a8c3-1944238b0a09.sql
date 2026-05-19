
-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NULL,
  user_name text NULL,
  action_type text NOT NULL,
  module text NULL,
  description text NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  ip text NULL,
  device text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs
CREATE POLICY "Admins can read all activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- Any authenticated user can insert logs
CREATE POLICY "Authenticated users can insert logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can read their own logs
CREATE POLICY "Users can read own logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Index for performance
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs (user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs (action_type);
CREATE INDEX idx_activity_logs_module ON public.activity_logs (module);
