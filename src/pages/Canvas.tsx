import { useEffect, useCallback, useState, useRef } from "react";
import { Tldraw, useEditor, getSnapshot, loadSnapshot } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw, ChevronLeft, PenLine } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Board = {
  id: string;
  nome: string;
  snapshot: any;
  created_at: string;
  updated_at: string;
};

// AutoSave — salva a cada 3s sem re-renderizar o editor
function AutoSave({ boardId, onSave }: { boardId: string; onSave: (snapshot: any) => void }) {
  const editor = useEditor();
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const interval = setInterval(() => {
      const snapshot = getSnapshot(editor.store);
      onSaveRef.current(snapshot);
    }, 3000);
    return () => clearInterval(interval);
  }, [editor]); // só depende de editor, não de onSave

  return null;
}

// SnapshotLoader — carrega o snapshot APENAS UMA VEZ ao montar
function SnapshotLoader({ snapshot }: { snapshot: any }) {
  const editor = useEditor();
  const loaded = useRef(false);

  useEffect(() => {
    if (!snapshot || loaded.current) return;
    loaded.current = true;
    try {
      loadSnapshot(editor.store, snapshot);
    } catch (e) {
      console.warn("Erro ao carregar snapshot:", e);
    }
  }, [editor]); // sem snapshot nas deps — só carrega uma vez

  return null;
}

export default function Canvas() {
  const { companyId } = useCompany();
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardAtivo, setBoardAtivo] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardDialog, setBoardDialog] = useState(false);
  const [boardNome, setBoardNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Ref para o snapshot inicial — evita re-renderizações
  const snapshotRef = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const fetchBoards = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("canvas_boards")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    setBoards(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const createBoard = async () => {
    if (!boardNome.trim()) return;
    const { data } = await (supabase as any).from("canvas_boards").insert({
      nome: boardNome.trim(),
      company_id: companyId,
      user_id: userId,
      snapshot: null,
    }).select().single();
    setBoardDialog(false);
    setBoardNome("");
    fetchBoards();
    if (data) {
      snapshotRef.current = null;
      setBoardAtivo(data);
    }
    toast({ title: "Canvas criado!" });
  };

  const deleteBoard = async (id: string) => {
    if (!confirm("Deseja excluir este canvas?")) return;
    await (supabase as any).from("canvas_boards").delete().eq("id", id);
    if (boardAtivo?.id === id) {
      snapshotRef.current = null;
      setBoardAtivo(null);
    }
    fetchBoards();
    toast({ title: "Canvas excluído" });
  };

  const saveSnapshot = useCallback(async (snapshot: any) => {
    if (!boardAtivo) return;
    setSaving(true);
    try {
      await (supabase as any).from("canvas_boards").update({
        snapshot: JSON.stringify(snapshot),
        updated_at: new Date().toISOString(),
      }).eq("id", boardAtivo.id);
      setLastSaved(new Date());
    } catch (e) {
      console.error("Erro ao salvar canvas:", e);
    } finally {
      setSaving(false);
    }
  }, [boardAtivo]);

  const abrirBoard = (b: Board) => {
    // Prepara o snapshot antes de abrir o editor
    if (b.snapshot) {
      snapshotRef.current = typeof b.snapshot === "string"
        ? JSON.parse(b.snapshot)
        : b.snapshot;
    } else {
      snapshotRef.current = null;
    }
    setBoardAtivo(b);
    setLastSaved(null);
  };

  if (!boardAtivo) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = "/planejamento"}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Canvas / Whiteboard</h1>
            <p className="text-sm text-muted-foreground">Quadros visuais para brainstorm e fluxogramas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchBoards}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setBoardDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Canvas
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
          <PenLine className="h-12 w-12 mb-3 opacity-20" />
          <p>Nenhum canvas criado.</p>
          <Button variant="outline" className="mt-4" onClick={() => setBoardDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Criar primeiro canvas
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(b => (
            <div key={b.id}
              className="group rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer overflow-hidden"
              onClick={() => abrirBoard(b)}>
              <div className="h-32 bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center border-b">
                <PenLine className="h-10 w-10 text-primary/30" />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{b.nome}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Atualizado {format(new Date(b.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteBoard(b.id); }}
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={boardDialog} onOpenChange={o => { if (!o) setBoardDialog(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Novo Canvas</DialogTitle></DialogHeader>
          <Input
            value={boardNome}
            onChange={e => setBoardNome(e.target.value)}
            placeholder="Nome do canvas..."
            onKeyDown={e => e.key === "Enter" && createBoard()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoardDialog(false)}>Cancelar</Button>
            <Button onClick={createBoard} disabled={!boardNome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => { setBoardAtivo(null); fetchBoards(); }}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <span className="font-semibold">{boardAtivo.nome}</span>
          <span className="text-xs text-muted-foreground ml-3">
            {saving ? "Salvando..." : lastSaved ? `Salvo às ${format(lastSaved, "HH:mm:ss")}` : "Salvamento automático a cada 3s"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full hidden sm:block">
          💡 Ctrl+Z desfaz · Ctrl+C/V copia · Delete exclui · Scroll = zoom
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tldraw>
          {snapshotRef.current && <SnapshotLoader snapshot={snapshotRef.current} />}
          <AutoSave boardId={boardAtivo.id} onSave={saveSnapshot} />
        </Tldraw>
      </div>
    </div>
  );
}