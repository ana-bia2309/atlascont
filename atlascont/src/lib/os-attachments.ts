import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Constants & types                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_BUCKET = "anexos-os";

export type AttachmentPreviewKind = "pdf" | "image" | "unsupported";

export type AttachmentStorageRecord = Pick<
  AttachmentRecord,
  | "id"
  | "os_id"
  | "nome_arquivo"
  | "tipo_arquivo"
  | "created_at"
  | "file_path"
  | "tamanho_arquivo"
  | "bucket_name"
>;

/** Shape expected by every component that renders an attachment row */
export type AttachmentRecord = {
  id: string;
  os_id: string;
  nome_arquivo: string;
  url_arquivo: string;           // legacy – kept for backward compat
  tipo_arquivo: string | null;
  created_at: string | null;
  file_path?: string | null;     // new – real storage path
  tamanho_arquivo?: number | null;
  bucket_name?: string | null;
};

/* ------------------------------------------------------------------ */
/*  Logging helpers                                                    */
/* ------------------------------------------------------------------ */

function log(level: "info" | "error", msg: string, d: Record<string, unknown>) {
  (level === "error" ? console.error : console.info)(`[os-attachments] ${msg}`, d);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

/* ------------------------------------------------------------------ */
/*  Path resolution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Given an AttachmentRecord, resolve the *storage path* (the key inside
 * the bucket) and the *bucket name*.
 *
 * Uses only the canonical storage metadata saved in the database:
 *   - bucket_name
 *   - file_path
 */
export function resolveStoragePath(record: Pick<AttachmentRecord, "file_path" | "bucket_name">): {
  bucket: string;
  path: string;
} | null {
  const bucket = record.bucket_name || DEFAULT_BUCKET;

  if (record.file_path && record.file_path.trim()) {
    return { bucket, path: record.file_path.trim() };
  }

  return null;
}

export function serializeAttachmentDebugRecord(record: AttachmentStorageRecord) {
  return {
    id: record.id,
    os_id: record.os_id,
    file_name: record.nome_arquivo,
    file_type: record.tipo_arquivo,
    file_size: record.tamanho_arquivo,
    bucket_name: record.bucket_name || DEFAULT_BUCKET,
    file_path: record.file_path,
    created_at: record.created_at,
    storage_fields_used: ["bucket_name", "file_path"],
    legacy_url_ignored: true,
  };
}

export async function createAttachmentAccessUrl(record: AttachmentStorageRecord) {
  const resolved = resolveStoragePath(record);

  if (!resolved) {
    log("error", "Cannot generate attachment URL without canonical storage metadata", {
      record: serializeAttachmentDebugRecord(record),
    });
    throw new Error("Metadados do anexo inválidos: bucket_name/file_path ausentes.");
  }

  const { bucket, path } = resolved;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const access_url = data.publicUrl || null;

  log("info", "Attachment access URL generated", {
    bucket,
    path,
    access_strategy: "public-url",
    access_url,
  });

  if (!access_url) {
    throw new Error("Não foi possível gerar a URL do anexo.");
  }

  return {
    bucket,
    path,
    access_url,
    access_strategy: "public-url" as const,
  };
}

/* ------------------------------------------------------------------ */
/*  Blob fetch (SDK-first, signed-URL fallback)                        */
/* ------------------------------------------------------------------ */

export async function fetchAttachmentBlob(record: AttachmentStorageRecord) {
  const resolved = resolveStoragePath(record);

  if (!resolved) {
    log("error", "Cannot resolve storage path from canonical metadata", {
      record: serializeAttachmentDebugRecord(record),
    });
    throw new Error("Caminho do anexo inválido: file_path ausente.");
  }

  const { bucket, path } = resolved;
  const access = await createAttachmentAccessUrl(record);

  log("info", "Fetching attachment blob", {
    record: serializeAttachmentDebugRecord(record),
    bucket,
    path,
    access_url: access.access_url,
    access_strategy: access.access_strategy,
  });

  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (!error && data) {
    const blob = ensurePdfMime(data, record.nome_arquivo || path);
    log("info", "Attachment blob fetched successfully", {
      bucket,
      path,
      access_url: access.access_url,
      access_strategy: access.access_strategy,
      mime: blob.type,
      size: blob.size,
    });
    return { bucket, path, blob, access_url: access.access_url, access_strategy: access.access_strategy };
  }

  log("error", "Attachment blob fetch failed", {
    bucket,
    path,
    access_url: access.access_url,
    access_strategy: access.access_strategy,
    error: errMsg(error),
  });
  throw new Error(error?.message || "Não foi possível carregar o anexo.");
}

/* ------------------------------------------------------------------ */
/*  Download (triggers browser save-as)                                */
/* ------------------------------------------------------------------ */

export async function downloadAttachmentFile(
  record: AttachmentStorageRecord,
) {
  const { blob } = await fetchAttachmentBlob(record);
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = record.nome_arquivo;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ensurePdfMime(blob: Blob, fileName: string): Blob {
  if (
    getPreviewKind(blob.type, fileName) === "pdf" &&
    (!blob.type || blob.type === "application/octet-stream")
  ) {
    return new Blob([blob], { type: "application/pdf" });
  }
  return blob;
}

export function revokeObjectUrl(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function getPreviewKind(
  mime: string | null | undefined,
  fileName: string,
): AttachmentPreviewKind {
  const lower = fileName.toLowerCase();
  const m = mime?.toLowerCase() || "";

  if (m.includes("pdf") || lower.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return "image";
  return "unsupported";
}
