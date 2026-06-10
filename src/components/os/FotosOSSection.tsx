import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { Camera, Loader2, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const MAX_PHOTOS = Infinity;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type OsPhoto = {
  id: string;
  os_id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
};

type LocalPhoto = {
  _localId: string;
  file: File;
  preview_url: string;
};

export interface FotosOSSectionHandle {
  getLocalPhotos: () => LocalPhoto[];
  flushTo: (osId: string) => Promise<void>;
  clearLocal: () => void;
}

interface FotosOSSectionProps {
  osId: string | null;
  readOnly?: boolean;
}

let local_id_counter = 0;
const next_local_id = () => `local-${++local_id_counter}`;

const FotosOSSection = forwardRef<FotosOSSectionHandle, FotosOSSectionProps>(
  ({ osId, readOnly = false }, ref) => {
    const [photos, setPhotos] = useState<OsPhoto[]>([]);
    const [local, setLocal] = useState<LocalPhoto[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    useImperativeHandle(ref, () => ({
      getLocalPhotos: () => local,
      clearLocal: () => {
        local.forEach((p) => URL.revokeObjectURL(p.preview_url));
        setLocal([]);
      },
      flushTo: async (newOsId: string) => {
        if (local.length === 0) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!profile?.id) return;

        for (const item of local) {
          const filePath = `${newOsId}/photos/${Date.now()}_${item.file.name}`;
          const { error: upErr } = await supabase.storage
            .from("anexos-os")
            .upload(filePath, item.file, { contentType: item.file.type });
          if (upErr) {
            toast({ title: `Falha no upload da foto`, description: upErr.message, variant: "destructive" });
            continue;
          }
          const { error: insErr } = await supabase
            .from("os_photos")
            .insert({
              os_id: newOsId,
              user_id: profile.id,
              photo_url: filePath,
            } as any);
          if (insErr) {
            await supabase.storage.from("anexos-os").remove([filePath]);
            toast({ title: "Falha ao registrar foto", description: insErr.message, variant: "destructive" });
          }
        }
        local.forEach((p) => URL.revokeObjectURL(p.preview_url));
        setLocal([]);
      },
    }));

    const fetchPhotos = useCallback(async () => {
      if (!osId) { setPhotos([]); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from("os_photos")
        .select("*")
        .eq("os_id", osId)
        .order("created_at");
      if (error) {
        toast({ title: "Erro ao carregar fotos", description: error.message, variant: "destructive" });
      } else {
        const rows = (data || []) as OsPhoto[];
        setPhotos(rows);
        const urls: Record<string, string> = {};
        for (const p of rows) {
          const { data: urlData } = await supabase.storage
            .from("anexos-os")
            .createSignedUrl(p.photo_url, 3600);
          if (urlData?.signedUrl) urls[p.id] = urlData.signedUrl;
        }
        setSignedUrls(urls);
      }
      setLoading(false);
    }, [osId]);

    useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

    // Cleanup blob URLs on unmount
    useEffect(() => {
      return () => {
        local.forEach((p) => URL.revokeObjectURL(p.preview_url));
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalCount = photos.length + local.length;

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      const file = e.target.files[0];

      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ title: "Formato inválido", description: "Use JPG, PNG ou WEBP.", variant: "destructive" });
        e.target.value = "";
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Arquivo muito grande (máx. 10MB)", variant: "destructive" });
        e.target.value = "";
        return;
      }

      // Buffer mode: O.S. ainda não existe
      if (!osId) {
        setLocal((prev) => [
          ...prev,
          { _localId: next_local_id(), file, preview_url: URL.createObjectURL(file) },
        ]);
        e.target.value = "";
        return;
      }

      setUploading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({ title: "Usuário não autenticado", variant: "destructive" });
        setUploading(false);
        e.target.value = "";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!profile?.id) {
        toast({ title: "Perfil não encontrado", variant: "destructive" });
        setUploading(false);
        e.target.value = "";
        return;
      }
      const filePath = `${osId}/photos/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("anexos-os")
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) {
        toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
        setUploading(false);
        e.target.value = "";
        return;
      }
      const { error: insertError } = await supabase
        .from("os_photos")
        .insert({
          os_id: osId,
          user_id: profile.id,
          photo_url: filePath,
        } as any);
      if (insertError) {
        toast({ title: "Erro ao salvar foto", description: insertError.message, variant: "destructive" });
        await supabase.storage.from("anexos-os").remove([filePath]);
      } else {
        toast({ title: "Foto adicionada" });
        fetchPhotos();
      }
      setUploading(false);
      e.target.value = "";
    };

    const handleDelete = async (photo: OsPhoto) => {
      await supabase.storage.from("anexos-os").remove([photo.photo_url]);
      const { error } = await supabase.from("os_photos").delete().eq("id", photo.id);
      if (error) {
        toast({ title: "Erro ao excluir foto", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Foto excluída" });
        fetchPhotos();
      }
    };

    const removeLocal = (id: string) => {
      setLocal((prev) => {
        const target = prev.find((p) => p._localId === id);
        if (target) URL.revokeObjectURL(target.preview_url);
        return prev.filter((p) => p._localId !== id);
      });
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Fotos</h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} foto{totalCount !== 1 ? "s" : ""}{!osId ? " · serão enviadas ao salvar" : ""}
            </p>
          </div>
          {!readOnly && (
            <label>
              <input
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handlePick}
                disabled={uploading}
              />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Enviando...</>
                  ) : (
                    <><Camera className="mr-1 h-3 w-3" /> Adicionar Foto</>
                  )}
                </span>
              </Button>
            </label>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : totalCount === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma foto.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                {signedUrls[photo.id] ? (
                  <img
                    src={signedUrls[photo.id]}
                    alt="Foto da OS"
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!readOnly && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(photo)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground p-1 truncate">
                  {new Date(photo.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            ))}
            {local.map((item) => (
              <div key={item._localId} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                <img src={item.preview_url} alt="Pré-visualização" className="w-full h-32 object-cover" />
                {!readOnly && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeLocal(item._localId)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground p-1 truncate">
                  Pendente · será enviada ao salvar
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

FotosOSSection.displayName = "FotosOSSection";
export default FotosOSSection;
