
ALTER TABLE public.plano_atividades
  ADD COLUMN concluido boolean NOT NULL DEFAULT false,
  ADD COLUMN concluido_em timestamptz,
  ADD COLUMN concluido_por uuid REFERENCES public.profiles(id);
