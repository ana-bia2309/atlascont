ALTER TABLE public.profiles ADD COLUMN cpf text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_cpf_unique UNIQUE (cpf);