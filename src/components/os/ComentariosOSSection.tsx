import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send } from "@/lib/icons";
import { format } from "date-fns";

interface Comentario {
  id: string;
  texto: string;
  autor_nome: string;
  created_at: string;
}

export default function ComentariosOSSection({
  osId,
  readOnly = false,
}: {
  osId: string;
  readOnly?: boolean;
}) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);

  const fetch = useCallback(async () => {
    if (!osId) return;
    setLoading(true);
    const { data } = await supabase
      .from("comentarios_os" as any)
      .select("id, texto, autor_nome, created_at")
      .eq("os_id", osId)
      .order("created_at", { ascending: false });
    setComentarios((data as any[]) || []);
    setLoading(false);
  }, [osId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleSend = async () => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast({ title: "Comentário muito longo (máx. 2000 caracteres)", variant: "destructive" });
      return;
    }

    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    let autorNome = session?.user?.email || "Usuário";
    if (session?.user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if ((profile as any)?.nome) autorNome = (profile as any).nome;
    }

    const { error } = await supabase.from("comentarios_os" as any).insert({
      os_id: osId,
      texto: trimmed,
      autor_nome: autorNome,
      autor_id: session?.user?.id || null,
    });

    if (error) {
      toast({ title: "Erro ao enviar comentário", description: error.message, variant: "destructive" });
    } else {
      setTexto("");
      fetch();
    }
    setSending(false);
  };

  const fmtDate = (d: string) => {
    try {
      return format(new Date(d), "dd/MM/yyyy HH:mm");
    } catch {
      return "—";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Comentários</span>
        {comentarios.length > 0 && (
          <span className="text-xs text-muted-foreground">({comentarios.length})</span>
        )}
      </div>

      {!readOnly && (
        <div className="flex gap-2 mb-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva um comentário..."
            rows={2}
            className="flex-1 text-sm"
            maxLength={2000}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sending || !texto.trim()}
            title="Enviar"
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum comentário.</p>
      ) : (
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {comentarios.map((c) => (
            <div key={c.id} className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.autor_nome}</span>
                <span className="text-muted-foreground">{fmtDate(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-line text-sm">{c.texto}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
