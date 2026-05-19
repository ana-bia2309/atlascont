import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "@/lib/icons";
import { toast } from "@/hooks/use-toast";
import AttachmentFileRow from "@/components/os/AttachmentFileRow";
import { resolveStoragePath, DEFAULT_BUCKET, type AttachmentRecord } from "@/lib/os-attachments";


interface AnexosModalProps {
  osId: string | null;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function AnexosModal({ osId, open, onClose, readOnly = false }: AnexosModalProps) {
  const { companyId } = useCompany();
  const [anexos, setAnexos] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchAnexos = useCallback(async () => {
    if (!osId) return;
    setLoading(true);
    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  setLoading(false);
  return;
}

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) {
  setLoading(false);
  return;
}

const companyId = profile.company_id;
    const { data } =
  await (supabase as any)
      .from("anexos_os")
      .select("id, os_id, nome_arquivo, url_arquivo, tipo_arquivo, file_path, tamanho_arquivo, bucket_name, created_at")
      .eq("os_id", osId)
      .eq("company_id", companyId)
      .order("created_at");
    setAnexos((data || []) as AttachmentRecord[]);
    setLoading(false);
  }, [osId]);

  useEffect(() => {
    if (open && osId) fetchAnexos();
  }, [open, osId, fetchAnexos]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!osId || !event.target.files?.length) return;
    const file = event.target.files[0];
    const normalized_file_type = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.type || null;

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Arquivo muito grande (máx. 20MB)", variant: "destructive" });
      event.target.value = "";
      return;
    }

    setUploading(true);
    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  setUploading(false);
  return;
}

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) {
  setUploading(false);
  return;
}

const companyId = profile.company_id;
    const safeFileName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const file_path = `${osId}/${Date.now()}_${safeFileName}`;

    const { error: upload_error } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(file_path, file, { contentType: normalized_file_type || undefined });

    if (upload_error) {
      toast({ title: "Erro no upload", description: upload_error.message, variant: "destructive" });
      setUploading(false);
      event.target.value = "";
      return;
    }

  const { error: insert_error } = await (supabase as any)
  .from("anexos_os")
  .insert({
    os_id: osId,
    nome_arquivo: file.name,
    url_arquivo: file_path,
    tipo_arquivo: normalized_file_type,
    file_path,
    tamanho_arquivo: file.size,
    bucket_name: DEFAULT_BUCKET,
    company_id: companyId,
  });

    if (insert_error) {
      toast({ title: "Erro ao salvar anexo", description: insert_error.message, variant: "destructive" });
    } else {
      toast({ title: "Anexo enviado com sucesso" });
      fetchAnexos();
    }

    setUploading(false);
    event.target.value = "";
  };

  const handleDelete = async (anexo: AttachmentRecord) => {
    const resolved = resolveStoragePath(anexo);
    if (resolved) {
      await supabase.storage.from(resolved.bucket).remove([resolved.path]);
    }
    const { error } = await (supabase as any)
  .from("anexos_os")
  .delete()
  .eq("id", anexo.id)
  .eq("company_id", companyId);
    if (error) {
      toast({ title: "Erro ao excluir anexo", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Anexo excluído" });
      fetchAnexos();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anexos da O.S.</DialogTitle>
        </DialogHeader>

        {!readOnly && (
          <label>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
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
        )}

        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Carregando...</p>
        ) : anexos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Nenhum anexo.</p>
        ) : (
          <div className="space-y-2 py-2">
            {anexos.map((a) => (
              <AttachmentFileRow key={a.id} attachment={a} onDelete={readOnly ? undefined : () => handleDelete(a)} />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
