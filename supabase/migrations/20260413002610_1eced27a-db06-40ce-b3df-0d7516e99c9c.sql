
-- Enum for user roles/profiles
CREATE TYPE public.app_role AS ENUM ('administrador', 'gestor', 'tecnico', 'visualizacao');

-- Enum for user status
CREATE TYPE public.app_user_status AS ENUM ('ativo', 'inativo');

-- Profiles table (user metadata)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  status public.app_user_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'visualizacao',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_user_roles_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.user_id = _user_id
      AND ur.role = _role
  )
$$;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

-- RLS policies for profiles
CREATE POLICY "Admins can do everything on profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'))
WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow anonymous read for now (no auth yet)
CREATE POLICY "Public read profiles (temp)"
ON public.profiles FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public write profiles (temp)"
ON public.profiles FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- RLS policies for user_roles
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'))
WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Users can view their own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid())
);

-- Allow anonymous read/write for now (no auth yet)
CREATE POLICY "Public read roles (temp)"
ON public.user_roles FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public write roles (temp)"
ON public.user_roles FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Trigger to update updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  RETURNING id INTO profile_id;

  -- First user gets admin role, others get visualizacao
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (profile_id, 'administrador');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (profile_id, 'visualizacao');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
