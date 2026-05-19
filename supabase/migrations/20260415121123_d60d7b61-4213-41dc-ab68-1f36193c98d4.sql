
-- Add responsible_user_id to ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES public.profiles(id);

-- Create os_notifications table
CREATE TABLE public.os_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.os_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.os_notifications FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Users can update (mark read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.os_notifications FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Admins can manage all notifications
CREATE POLICY "Admins can manage notifications"
  ON public.os_notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

-- Authenticated users can insert notifications (when assigning OS)
CREATE POLICY "Authenticated can insert notifications"
  ON public.os_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX idx_os_notifications_user_read ON public.os_notifications(user_id, read);
