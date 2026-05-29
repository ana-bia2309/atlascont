import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, RefreshCw, ChevronLeft, LayoutGrid, Calendar, User } from "@/lib/icons";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Projeto = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  created_at: string;
};

type Coluna = {
  id: string;
  projeto_id: string;
  nome: string;
  ordem: number;
  cor: string;
};

type Card = {
  id: string;
  coluna_id: string;
  projeto_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  responsavel: string | null;
  prazo: string | null;
  ordem: number;
  concluido: boolean;
};

const PRIORIDADE_COLORS: Record<string, string> = {
  "Baixa": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Média": "bg-blue-50 text-blue-700 border-blue-200",
  "Alta": "bg-amber-50 text-amber-700 border-amber-200",
  "Crítica": "bg-red-50 text-red-700 border-red-200",
};

const COR_OPTIONS = [
  "#6366F1", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6",
];

const DEFAULT_COLUNAS = ["A Fazer", "Em Progresso", "Em Revisão", "Concluído"];

export default function Kanban() {
  const { companyId } = useCompany();
  const [userId, setUserId] = useState<string | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoAtivo, setProjetoAtivo] = useState<Projeto | null>(null);
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  // Drag
  const [dragging, setDragging] = useState<Card | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Dialogs
  const [projetoDialog, setProjetoDialog] = useState(false);
  const [editingProjeto, setEditingProjeto] = useState<Projeto | null>(null);
  const [projetoNome, setProjetoNome] = useState("");
  const [projetoDesc, setProjetoDesc] = useState("");
  const [projetoCor, setProjetoCor] = useState("#6366F1");

  const [cardDialog, setCardDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [cardColunaId, setCardColunaId] = useState("");
  const [cardTitulo, setCardTitulo] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [cardPrioridade, setCardPrioridade] = useState("Média");
  const [cardResponsavel, setCardResponsavel] = useState("");
  const [cardPrazo, setCardPrazo] = useState("");
  const [saving, setSaving] = useState(false);

  const [colunaDialog, setColunaDialog] = useState(false);
  const [colunaNome, setColunaNome] = useState("");
  const [colunaCor, setColunaCor] = useState("#6B7280");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const fetchProjetos = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from("kanban_projetos").select("*").eq("company_id", companyId).order("created_at");
    setProjetos(data || []);
    setLoading(false);
  }, [companyId]);

  const fetchBoard = useCallback(async (projetoId: string) => {
    const [colRes, cardRes] = await Promise.all([
      (supabase as any).from("kanban_colunas").select("*").eq("projeto_id", projetoId).order("ordem"),
      (supabase as any).from("kanban_cards").select("*").eq("projeto_id", projetoId).order("ordem"),
    ]);
    setColunas(colRes.data || []);
    setCards(cardRes.data || []);
  }, []);

  useEffect(() => { fetchProjetos(); }, [fetchProjetos]);
  useEffect(() => { if (projetoAtivo) fetchBoard(projetoAtivo.id); }, [projetoAtivo, fetchBoard]);

  // Projeto CRUD
  const openProjeto = (p?: Projeto) => {
    setEditingProjeto(p || null);
    setProjetoNome(p?.nome || "");
    setProjetoDesc(p?.descricao || "");
    setProjetoCor(p?.cor || "#6366F1");
    setProjetoDialog(true);
  };

  const saveProjeto = async () => {
    if (!projetoNome.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editingProjeto) {
        await (supabase as any).from("kanban_projetos").update({
          nome: projetoNome, descricao: projetoDesc || null, cor: projetoCor
        }).eq("id", editingProjeto.id);
        toast({ title: "Projeto atualizado!" });
      } else {
        const { data: novo } = await (supabase as any).from("kanban_projetos").insert({
          nome: projetoNome, descricao: projetoDesc || null, cor: projetoCor,
          company_id: companyId, user_id: userId,
        }).select().single();

        // Cria colunas padrão
        if (novo) {
          const cols = DEFAULT_COLUNAS.map((nome, ordem) => ({
            projeto_id: novo.id, nome, ordem, cor: "#6B7280"
          }));
          await (supabase as any).from("kanban_colunas").insert(cols);
        }
        toast({ title: "Projeto criado!" });
      }
      setProjetoDialog(false);
      fetchProjetos();
    } finally { setSaving(false); }
  };

  const deleteProjeto = async (id: string) => {
    await (supabase as any).from("kanban_projetos").delete().eq("id", id);
    toast({ title: "Projeto excluído" });
    if (projetoAtivo?.id === id) setProjetoAtivo(null);
    fetchProjetos();
  };

  // Card CRUD
  const openCard = (colunaId: string, card?: Card) => {
    setEditingCard(card || null);
    setCardColunaId(colunaId);
    setCardTitulo(card?.titulo || "");
    setCardDesc(card?.descricao || "");
    setCardPrioridade(card?.prioridade || "Média");
    setCardResponsavel(card?.responsavel || "");
    setCardPrazo(card?.prazo || "");
    setCardDialog(true);
  };

  const saveCard = async () => {
    if (!cardTitulo.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        titulo: cardTitulo.trim(),
        descricao: cardDesc.trim() || null,
        prioridade: cardPrioridade,
        responsavel: cardResponsavel.trim() || null,
        prazo: cardPrazo || null,
        coluna_id: cardColunaId,
        projeto_id: projetoAtivo?.id,
        updated_at: new Date().toISOString(),
      };
      if (editingCard) {
        await (supabase as any).from("kanban_cards").update(payload).eq("id", editingCard.id);
      } else {
        const cardsNaColuna = cards.filter(c => c.coluna_id === cardColunaId).length;
        await (supabase as any).from("kanban_cards").insert({ ...payload, ordem: cardsNaColuna, concluido: false });
      }
      setCardDialog(false);
      if (projetoAtivo) fetchBoard(projetoAtivo.id);
    } finally { setSaving(false); }
  };

  const deleteCard = async (id: string) => {
    await (supabase as any).from("kanban_cards").delete().eq("id", id);
    if (projetoAtivo) fetchBoard(projetoAtivo.id);
  };

  const toggleCard = async (card: Card) => {
    await (supabase as any).from("kanban_cards").update({ concluido: !card.concluido }).eq("id", card.id);
    if (projetoAtivo) fetchBoard(projetoAtivo.id);
  };

  // Coluna
  const addColuna = async () => {
    if (!colunaNome.trim() || !projetoAtivo) return;
    await (supabase as any).from("kanban_colunas").insert({
      projeto_id: projetoAtivo.id, nome: colunaNome.trim(), ordem: colunas.length, cor: colunaCor,
    });
    setColunaNome(""); setColunaDialog(false);
    fetchBoard(projetoAtivo.id);
  };

  const deleteColuna = async (id: string) => {
    await (supabase as any).from("kanban_colunas").delete().eq("id", id);
    if (projetoAtivo) fetchBoard(projetoAtivo.id);
  };

  // Drag and drop
  const handleDrop = async (colunaId: string) => {
    if (!dragging || dragging.coluna_id === colunaId) { setDragging(null); setDragOver(null); return; }
    await (supabase as any).from("kanban_cards").update({ coluna_id: colunaId }).eq("id", dragging.id);
    setDragging(null); setDragOver(null);
    if (projetoAtivo) fetchBoard(projetoAtivo.id);
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  // ── Lista de Projetos ──
  if (!projetoAtivo) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Kanban de Projetos</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus projetos com quadros visuais</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchProjetos}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => openProjeto()}><Plus className="h-4 w-4 mr-2" /> Novo Projeto</Button>
        </div>
      </div>

      {projetos.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
          <LayoutGrid className="h-12 w-12 mb-3 opacity-20" />
          <p>Nenhum projeto criado.</p>
          <Button variant="outline" className="mt-4" onClick={() => openProjeto()}>
            <Plus className="h-4 w-4 mr-2" /> Criar primeiro projeto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projetos.map(p => {
            const total = cards.length;
            return (
              <div key={p.id}
                className="rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer group overflow-hidden"
                onClick={() => setProjetoAtivo(p)}
                style={{ borderTopColor: p.cor, borderTopWidth: 4 }}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base">{p.nome}</h3>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => openProjeto(p)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteProjeto(p.id)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {p.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
                  <p className="text-xs text-muted-foreground mt-3">
                    Criado em {format(parseISO(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Projeto */}
      <Dialog open={projetoDialog} onOpenChange={o => { if (!o) setProjetoDialog(false); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingProjeto ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input value={projetoNome} onChange={e => setProjetoNome(e.target.value)} placeholder="Nome do projeto..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={projetoDesc} onChange={e => setProjetoDesc(e.target.value)} placeholder="Descreva o projeto..." rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cor</label>
              <div className="flex gap-2">
                {COR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setProjetoCor(c)}
                    className={cn("w-7 h-7 rounded-full border-2 transition-all", projetoCor === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjetoDialog(false)}>Cancelar</Button>
            <Button onClick={saveProjeto} disabled={saving}>{saving ? "Salvando..." : editingProjeto ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Board Kanban ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setProjetoAtivo(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: projetoAtivo.cor }} />
          <div>
            <h1 className="text-xl font-bold">{projetoAtivo.nome}</h1>
            {projetoAtivo.descricao && <p className="text-xs text-muted-foreground">{projetoAtivo.descricao}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setColunaDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Coluna
          </Button>
          <Button size="sm" onClick={() => openCard(colunas[0]?.id || "")}>
            <Plus className="h-4 w-4 mr-1" /> Card
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {colunas.map(coluna => {
          const cardsColuna = cards.filter(c => c.coluna_id === coluna.id).sort((a, b) => a.ordem - b.ordem);
          const isDragOver = dragOver === coluna.id;
          return (
            <div key={coluna.id}
              className={cn("flex-shrink-0 w-72 rounded-xl border bg-muted/30 flex flex-col", isDragOver && "border-primary/50 bg-primary/5")}
              onDragOver={e => { e.preventDefault(); setDragOver(coluna.id); }}
              onDrop={() => handleDrop(coluna.id)}
              onDragLeave={() => setDragOver(null)}>
              {/* Header coluna */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: coluna.cor }} />
                  <span className="font-semibold text-sm">{coluna.nome}</span>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{cardsColuna.length}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openCard(coluna.id)}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteColuna(coluna.id)}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                {cardsColuna.map(card => (
                  <div key={card.id}
                    draggable
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    className={cn(
                      "group rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all",
                      card.concluido && "opacity-60",
                      dragging?.id === card.id && "opacity-40 scale-95"
                    )}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-medium flex-1", card.concluido && "line-through")}>{card.titulo}</p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openCard(coluna.id, card)}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => deleteCard(card.id)}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                    {card.descricao && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PRIORIDADE_COLORS[card.prioridade])}>
                        {card.prioridade}
                      </Badge>
                      {card.prazo && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {format(parseISO(card.prazo), "dd/MM", { locale: ptBR })}
                        </span>
                      )}
                      {card.responsavel && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <User className="h-2.5 w-2.5" />
                          {card.responsavel}
                        </span>
                      )}
                    </div>
                    <button onClick={() => toggleCard(card)}
                      className={cn("mt-2 text-[10px] font-medium flex items-center gap-1",
                        card.concluido ? "text-emerald-600" : "text-muted-foreground hover:text-emerald-600")}>
                      <div className={cn("w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center",
                        card.concluido ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground")}>
                        {card.concluido && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      {card.concluido ? "Concluído" : "Marcar como concluído"}
                    </button>
                  </div>
                ))}
                <button onClick={() => openCard(coluna.id)}
                  className="w-full text-xs text-muted-foreground hover:text-primary py-2 text-center rounded-lg hover:bg-accent/50 transition-colors">
                  + Adicionar card
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog Card */}
      <Dialog open={cardDialog} onOpenChange={o => { if (!o) setCardDialog(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingCard ? "Editar Card" : "Novo Card"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input value={cardTitulo} onChange={e => setCardTitulo(e.target.value)} placeholder="Título do card..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Coluna</label>
              <Select value={cardColunaId} onValueChange={setCardColunaId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {colunas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Prioridade</label>
                <Select value={cardPrioridade} onValueChange={setCardPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Baixa", "Média", "Alta", "Crítica"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Prazo</label>
                <Input type="date" value={cardPrazo} onChange={e => setCardPrazo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input value={cardResponsavel} onChange={e => setCardResponsavel(e.target.value)} placeholder="Nome do responsável..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={cardDesc} onChange={e => setCardDesc(e.target.value)} placeholder="Detalhes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardDialog(false)}>Cancelar</Button>
            <Button onClick={saveCard} disabled={saving}>{saving ? "Salvando..." : editingCard ? "Salvar" : "Criar Card"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Coluna */}
      <Dialog open={colunaDialog} onOpenChange={o => { if (!o) setColunaDialog(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Nova Coluna</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input value={colunaNome} onChange={e => setColunaNome(e.target.value)} placeholder="Ex: Em Revisão" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cor</label>
              <div className="flex gap-2">
                {COR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setColunaCor(c)}
                    className={cn("w-7 h-7 rounded-full border-2 transition-all", colunaCor === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColunaDialog(false)}>Cancelar</Button>
            <Button onClick={addColuna} disabled={!colunaNome.trim()}>Criar Coluna</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}