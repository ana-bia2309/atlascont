-- Add new metadata columns
ALTER TABLE public.anexos_os
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS tamanho_arquivo bigint,
  ADD COLUMN IF NOT EXISTS bucket_name text NOT NULL DEFAULT 'anexos-os';

-- Backfill file_path from url_arquivo for existing rows
-- Handles full public URLs and plain paths
UPDATE public.anexos_os
SET file_path = CASE
  -- Full Supabase URL: extract path after bucket name
  WHEN url_arquivo LIKE '%/storage/v1/object/public/anexos-os/%'
    THEN split_part(split_part(url_arquivo, '/storage/v1/object/public/anexos-os/', 2), '?', 1)
  WHEN url_arquivo LIKE '%/storage/v1/object/sign/anexos-os/%'
    THEN split_part(split_part(url_arquivo, '/storage/v1/object/sign/anexos-os/', 2), '?', 1)
  WHEN url_arquivo LIKE '%/storage/v1/object/authenticated/anexos-os/%'
    THEN split_part(split_part(url_arquivo, '/storage/v1/object/authenticated/anexos-os/', 2), '?', 1)
  -- Already a plain path
  ELSE url_arquivo
END
WHERE file_path IS NULL;

-- Backfill bucket_name for any rows that might have been inserted before the default
UPDATE public.anexos_os
SET bucket_name = 'anexos-os'
WHERE bucket_name IS NULL OR bucket_name = '';