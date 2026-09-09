import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send, Pencil, Trash2, Check, X } from "@/lib/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

interface Comentario {
  id: string;
  texto: string;
  autor_nome: string;
  autor_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export default function ComentariosOSSection({
  osId,
  readOnly = false,
}: {
  osId: string;
  readOnly?: boolean;
}) {
  const { companyId } = useCompany();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMeuId(data.session?.user?.id || null));
  }, []);

  const fetchComentarios = useCallback(async () => {
    if (!osId) return;
    setLoading(true);
    const { data } = await supabase
      .from("comentarios_os" as any)
      .select("id, texto, autor_nome, autor_id, created_at, updated_at, deleted_at")
      .eq("os_id", osId)
      .order("created_at", { ascending: true });
    setComentarios((data as any[]) || []);
    setLoading(false);
  }, [osId]);

  useEffect(() => {
    fetchComentarios();
  }, [fetchComentarios]);

  // Rola pro final quando a conversa carrega ou uma mensagem nova chega
  useEffect(() => {
    if (!loading) {
      scrollRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [comentarios.length, loading]);

  // Tempo real -- canal proprio filtrado por essa OS especifica (mais
  // eficiente que o hook generico do sistema, que so filtra por empresa)
  useEffect(() => {
    if (!osId) return;
    const channel = supabase
      .channel(`comentarios-os-${osId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "comentarios_os", filter: `os_id=eq.${osId}` },
        () => fetchComentarios()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId, fetchComentarios]);

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
      company_id: companyId,
      texto: trimmed,
      autor_nome: autorNome,
      autor_id: session?.user?.id || null,
    });

    if (error) {
      toast({ title: "Erro ao enviar comentário", description: error.message, variant: "destructive" });
    } else {
      setTexto("");
      fetchComentarios();
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const iniciarEdicao = (c: Comentario) => {
    setEditandoId(c.id);
    setTextoEdicao(c.texto);
  };

  const salvarEdicao = async (id: string) => {
    const trimmed = textoEdicao.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("comentarios_os" as any)
      .update({ texto: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar comentário", description: error.message, variant: "destructive" });
    } else {
      setEditandoId(null);
      fetchComentarios();
    }
  };

  const excluirComentario = async (id: string) => {
    const { error } = await supabase
      .from("comentarios_os" as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir comentário", description: error.message, variant: "destructive" });
    }
    setExcluindoId(null);
    fetchComentarios();
  };

  const fmtDate = (d: string) => {
    try {
      const date = new Date(d);
      if (isToday(date)) return format(date, "'Hoje às' HH:mm");
      if (isYesterday(date)) return format(date, "'Ontem às' HH:mm");
      return format(date, "dd/MM/yyyy 'às' HH:mm");
    } catch {
      return "—";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Conversas</span>
        {comentarios.filter((c) => !c.deleted_at).length > 0 && (
          <span className="text-xs text-muted-foreground">({comentarios.filter((c) => !c.deleted_at).length})</span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : comentarios.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Nenhuma mensagem ainda" className="py-6" />
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {comentarios.map((c) => {
            const souEu = c.autor_id && c.autor_id === meuId;
            if (c.deleted_at) {
              return (
                <div key={c.id} className={cn("flex", souEu ? "justify-end" : "justify-start")}>
                  <div className="rounded-lg border border-dashed px-3 py-2 text-xs italic text-muted-foreground max-w-[80%]">
                    Mensagem removida
                  </div>
                </div>
              );
            }
            return (
              <div key={c.id} className={cn("flex", souEu ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[80%] space-y-1",
                    souEu ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs font-medium", souEu ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {souEu ? "Você" : c.autor_nome}
                    </span>
                    <span className={cn("text-[10px]", souEu ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {fmtDate(c.created_at)}{c.updated_at ? " · editado" : ""}
                    </span>
                  </div>

                  {editandoId === c.id ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={textoEdicao}
                        onChange={(e) => setTextoEdicao(e.target.value)}
                        rows={2}
                        className="text-sm bg-background text-foreground"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditandoId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => salvarEdicao(c.id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-line">{c.texto}</p>
                      {souEu && (
                        <div className="flex justify-end gap-1 pt-0.5">
                          {excluindoId === c.id ? (
                            <>
                              <span className="text-[10px] text-primary-foreground/80 self-center mr-1">Excluir?</span>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setExcluindoId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => excluirComentario(c.id)}>
                                <Check className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => iniciarEdicao(c)} className="opacity-70 hover:opacity-100" title="Editar">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => setExcluindoId(c.id)} className="opacity-70 hover:opacity-100" title="Excluir">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2 mt-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
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
    </div>
  );
}
