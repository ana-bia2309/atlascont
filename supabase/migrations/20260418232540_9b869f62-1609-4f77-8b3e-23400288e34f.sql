-- Adiciona configuração "QR Code obrigatório" para Planos de Manutenção
-- e propaga até as Ordens Preventivas geradas.

ALTER TABLE public.planos_manutencao
  ADD COLUMN IF NOT EXISTS qr_code_obrigatorio boolean NOT NULL DEFAULT true;

ALTER TABLE public.manutencao_preventiva
  ADD COLUMN IF NOT EXISTS qr_code_obrigatorio boolean NOT NULL DEFAULT true;

ALTER TABLE public.ordens_preventivas
  ADD COLUMN IF NOT EXISTS qr_code_obrigatorio boolean NOT NULL DEFAULT true;