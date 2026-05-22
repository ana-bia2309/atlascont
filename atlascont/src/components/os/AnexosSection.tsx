import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { Loader2, Trash2, Upload, FileText } from "@/lib/icons";

import AttachmentFileRow from "@/components/os/AttachmentFileRow";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { resolveStoragePath, DEFAULT_BUCKET, serializeAttachmentDebugRecord, type AttachmentRecord } from "@/lib/os-attachments";

type Anexo = AttachmentRecord;

type LocalAttachment = {
  _localId: string;
  file: File;
  nome_arquivo: string;
  tipo_arquivo: string | null;
  tamanho_arquivo: number;
};

export interface AnexosSectionHandle {
  getLocalFiles: () => LocalAttachment[];
  flushTo: (osId: string) => Promise<void>;
  clearLocal: () => void;
}

interface AnexosSectionProps {
  osId: string | null;
  readOnly?: boolean;
  /** Permission check — if provided, upload requires can("screen.anexar") */
  canAttach?: boolean;
  /** Permission check — controls download button visibility */
  canDownload?: boolean;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
let local_id_counter = 0;
const next_local_id = () => `local-${++local_id_counter}`;

const sanitize_file_name = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");

const normalize_type = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : file.type || null;

const AnexosSection = forwardRef<AnexosSectionHandle, AnexosSectionProps>(
  ({ osId, readOnly = false, canAttach = true, canDownload = true }, ref) => {
    const [anexos, setAnexos] = useState<Anexo[]>([]);
    const [local, setLocal] = useState<LocalAttachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    useImperativeHandle(ref, () => ({
      getLocalFiles: () => local,
      clearLocal: () => setLocal([]),
      flushTo: async (newOsId: string) => {
        if (local.length === 0) return;
        for (const item of local) {
          const file_path = `${newOsId}/${Date.now()}_${sanitize_file_name(item.nome_arquivo)}`;
          const { error: up_err } = await supabase.storage
            .from(DEFAULT_BUCKET)
            .upload(file_path, item.file, { contentType: item.tipo_arquivo || undefined });
          if (up_err) {
            toast({ title: `Falha no upload de ${item.nome_arquivo}`, description: up_err.message, variant: "destructive" });
            continue;
          }
          const { error: ins_err } = await supabase
            .from("anexos_os")
            .insert({
              os_id: newOsId,
              nome_arquivo: item.nome_arquivo,
              url_arquivo: file_path,
              tipo_arquivo: item.tipo_arquivo,
              file_path,
              tamanho_arquivo: item.tamanho_arquivo,
              bucket_name: DEFAULT_BUCKET,
            } as any);
          if (ins_err) {
            toast({ title: `Falha ao registrar ${item.nome_arquivo}`, description: ins_err.message, variant: "destructive" });
            await supabase.storage.from(DEFAULT_BUCKET).remove([file_path]);
          }
        }
        setLocal([]);
      },
    }));

    const fetchAnexos = useCallback(async () => {
      if (!osId) {
        setAnexos([]);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("anexos_os")
        .select("id, os_id, nome_arquivo, url_arquivo, tipo_arquivo, file_path, tamanho_arquivo, bucket_name, created_at")
        .eq("os_id", osId)
        .order("created_at");

      if (error) {
        toast({ title: "Erro ao carregar anexos", description: error.message, variant: "destructive" });
      } else {
        const rows = (data || []) as AttachmentRecord[];
        console.info("[os-attachments] Attachments loaded from database", {
          os_id: osId,
          count: rows.length,
          attachments: rows.map((row) => serializeAttachmentDebugRecord(row)),
        });
        setAnexos(rows);
      }

      setLoading(false);
    }, [osId]);

    useEffect(() => {
      fetchAnexos();
    }, [fetchAnexos]);

    const handlePickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      const file = event.target.files[0];
      const tipo = normalize_type(file);

      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Arquivo muito grande (máx. 20MB)", variant: "destructive" });
        event.target.value = "";
        return;
      }

      // Buffer mode: O.S. ainda não existe — guarda em memória
      if (!osId) {
        setLocal((prev) => [
          ...prev,
          {
            _localId: next_local_id(),
            file,
            nome_arquivo: file.name,
            tipo_arquivo: tipo,
            tamanho_arquivo: file.size,
          },
        ]);
        event.target.value = "";
        return;
      }

      setUploading(true);
      const file_path = `${osId}/${Date.now()}_${sanitize_file_name(file.name)}`;
      const { error: upload_error } = await supabase.storage
        .from(DEFAULT_BUCKET)
        .upload(file_path, file, { contentType: tipo || undefined });
      if (upload_error) {
        toast({ title: "Erro no upload", description: upload_error.message, variant: "destructive" });
        setUploading(false);
        event.target.value = "";
        return;
      }
      const { data: saved_attachment, error: insert_error } = await supabase
        .from("anexos_os")
        .insert({
          os_id: osId,
          nome_arquivo: file.name,
          url_arquivo: file_path,
          tipo_arquivo: tipo,
          file_path,
          tamanho_arquivo: file.size,
          bucket_name: DEFAULT_BUCKET,
        } as any)
        .select("id, os_id, nome_arquivo, tipo_arquivo, file_path, tamanho_arquivo, bucket_name, created_at")
        .single();
      if (insert_error) {
        toast({ title: "Erro ao salvar anexo", description: insert_error.message, variant: "destructive" });
      } else {
        console.info("[os-attachments] Attachment metadata saved", {
          attachment: serializeAttachmentDebugRecord(saved_attachment as AttachmentRecord),
        });
        toast({ title: "Anexo enviado com sucesso" });
        fetchAnexos();
      }
      setUploading(false);
      event.target.value = "";
    };

    const handleDelete = async (anexo: Anexo) => {
      const resolved = resolveStoragePath(anexo);
      if (resolved) {
        await supabase.storage.from(resolved.bucket).remove([resolved.path]);
      }
      const { error } = await supabase.from("anexos_os").delete().eq("id", anexo.id);
      if (error) {
        toast({ title: "Erro ao excluir anexo", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Anexo excluído" });
        fetchAnexos();
      }
    };

    const removeLocal = (id: string) => {
      setLocal((prev) => prev.filter((m) => m._localId !== id));
    };

    const showUploadButton = !readOnly && canAttach;
    const totalCount = anexos.length + local.length;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Anexos</h3>
            <p className="text-xs text-muted-foreground">
              {osId
                ? "Visualize no sistema ou baixe com URL temporária segura."
                : "Os arquivos selecionados aqui serão enviados ao salvar a O.S."}
            </p>
          </div>

          {showUploadButton ? (
            <label>
              <input type="file" className="hidden" onChange={handlePickFile} disabled={uploading} />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Enviando...</>
                  ) : (
                    <><Upload className="mr-1 h-3 w-3" /> Anexar arquivo</>
                  )}
                </span>
              </Button>
            </label>
          ) : null}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : totalCount === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
        ) : (
          <div className="space-y-2">
            {anexos.map((anexo) => (
              <AttachmentFileRow
                key={anexo.id}
                attachment={anexo}
                onDelete={readOnly ? undefined : () => handleDelete(anexo)}
                canDownload={canDownload}
              />
            ))}
            {local.map((item) => (
              <div key={item._localId} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{item.nome_arquivo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Pendente · será enviado ao salvar
                  </p>
                </div>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLocal(item._localId)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

AnexosSection.displayName = "AnexosSection";
export default AnexosSection;
