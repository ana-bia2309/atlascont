-- Permite leitura pública (anon) das Ordens Preventivas
-- para que a página pública do QR Code do ativo possa listá-las.
CREATE POLICY "ordens_preventivas_public_read"
ON public.ordens_preventivas
FOR SELECT
TO anon
USING (true);