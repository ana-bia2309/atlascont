
-- Add unique constraint on email if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- Fix the trigger to properly handle existing profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  existing_profile_id uuid;
BEGIN
  -- Check if a profile already exists with this email
  SELECT id INTO existing_profile_id
  FROM public.profiles
  WHERE email = NEW.email
  LIMIT 1;

  IF existing_profile_id IS NOT NULL THEN
    -- Link existing profile to the new auth user
    UPDATE public.profiles
    SET user_id = NEW.id, updated_at = now()
    WHERE id = existing_profile_id;
  ELSE
    -- Create new profile
    INSERT INTO public.profiles (user_id, nome, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email
    )
    RETURNING id INTO existing_profile_id;

    -- First user gets admin role, others get visualizacao
    IF (SELECT count(*) FROM public.user_roles) = 0 THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (existing_profile_id, 'administrador');
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (existing_profile_id, 'visualizacao');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
