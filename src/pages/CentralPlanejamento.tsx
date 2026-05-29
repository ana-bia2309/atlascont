import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Star, StarOff, Pencil, Trash2, Lightbulb, BookOpen, RefreshCw, X, Calendar, LayoutGrid } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Nota = {
  id: string;
  titulo: string;
  conteudo: string | null;
  categoria: string;
  favorita: boolean;
  created_at: string;
  updated_at: string;
};

type Ideia = {
  id: string;
  titulo: string;
  descricao: string | null;
  tema: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const NOTA_CATEGORIAS = ["Geral", "Reunião", "Manutenção", "Financeiro", "Pessoal", "Projeto", "Outro"];
const IDEIA_TEMAS = ["Geral", "Sistema", "Processo", "Infraestrutura", "Equipe", "Cliente", "Financeiro", "Outro"];
const IDEIA_STATUS = ["Ideia", "Em análise", "Em desenvolvimento", "Implementada"];

const STATUS_COLORS: Record<string, string> = {
  "Ideia": "bg-zinc-100 text-zinc-700 border-zinc-200",
  "Em análise": "bg-blue-50 text-blue-700 border-blue-200",
  "Em desenvolvimento": "bg-amber-50 text-amber-700 border-amber-200",
  "Implementada": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_ICONS: Record<string, string> = {
  "Ideia": "💡",
  "Em análise": "🔍",
  "Em desenvolvimento": "⚙️",
  "Implementada": "✅",
};

export default function CentralPlanejamento() {
  const { companyId } = useCompany();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"notas" | "ideias" | "agenda" | "kanban">("notas");

  // Notas
  const [notas, setNotas] = useState<Nota[]>([]);
  const [notasLoading, setNotasLoading] = useState(true);
  const [notaSearch, setNotaSearch] = useState("");
  const [notaCategoria, setNotaCategoria] = useState("__all__");
  const [notaFavoritas, setNotaFavoritas] = useState(false);
  const [notaDialog, setNotaDialog] = useState(false);
  const [editingNota, setEditingNota] = useState<Nota | null>(null);
  const [notaTitulo, setNotaTitulo] = useState("");
  const [notaConteudo, setNotaConteudo] = useState("");
  const [notaCat, setNotaCat] = useState("Geral");
  const [notaSaving, setNotaSaving] = useState(false);

  // Ideias
  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [ideiasLoading, setIdeiasLoading] = useState(true);
  const [ideiaSearch, setIdeiaSearch] = useState("");
  const [ideiaTema, setIdeiaTema] = useState("__all__");
  const [ideiaStatus, setIdeiaStatus] = useState("__all__");
  const [ideiaDialog, setIdeiaDialog] = useState(false);
  const [editingIdeia, setEditingIdeia] = useState<Ideia | null>(null);
  const [ideiaTitulo, setIdeiaTitulo] = useState("");
  const [ideiaDesc, setIdeiaDesc] = useState("");
  const [ideiaT, setIdeiaT] = useState("Geral");
  const [ideiaS, setIdeiaS] = useState("Ideia");
  const [ideiaSaving, setIdeiaSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Fetch Notas
  const fetchNotas = useCallback(async () => {
    if (!companyId) return;
    setNotasLoading(true);
    const { data } = await (supabase as any)
      .from("notas")
      .select("*")
      .eq("company_id", companyId)
      .order("favorita", { ascending: false })
      .order("updated_at", { ascending: false });
    setNotas(data || []);
    setNotasLoading(false);
  }, [companyId]);

  // Fetch Ideias
  const fetchIdeias = useCallback(async () => {
    if (!companyId) return;
    setIdeiasLoading(true);
    const { data } = await (supabase as any)
      .from("ideias")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    setIdeias(data || []);
    setIdeiasLoading(false);
  }, [companyId]);

  useEffect(() => { fetchNotas(); fetchIdeias(); }, [fetchNotas, fetchIdeias]);

  // Notas filtradas
  const notasFiltradas = useMemo(() => {
    return notas.filter(n => {
      if (notaFavoritas && !n.favorita) return false;
      if (notaCategoria !== "__all__" && n.categoria !== notaCategoria) return false;
      if (notaSearch.trim()) {
        const q = notaSearch.toLowerCase();
        if (!n.titulo.toLowerCase().includes(q) && !(n.conteudo || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [notas, notaSearch, notaCategoria, notaFavoritas]);

  // Ideias filtradas
  const ideiasFiltradas = useMemo(() => {
    return ideias.filter(i => {
      if (ideiaStatus !== "__all__" && i.status !== ideiaStatus) return false;
      if (ideiaTema !== "__all__" && i.tema !== ideiaTema) return false;
      if (ideiaSearch.trim()) {
        const q = ideiaSearch.toLowerCase();
        if (!i.titulo.toLowerCase().includes(q) && !(i.descricao || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [ideias, ideiaSearch, ideiaTema, ideiaStatus]);

  // CRUD Notas
  const openNota = (nota?: Nota) => {
    setEditingNota(nota || null);
    setNotaTitulo(nota?.titulo || "");
    setNotaConteudo(nota?.conteudo || "");
    setNotaCat(nota?.categoria || "Geral");
    setNotaDialog(true);
  };

  const saveNota = async () => {
    if (!notaTitulo.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    setNotaSaving(true);
    try {
      const payload = { titulo: notaTitulo.trim(), conteudo: notaConteudo.trim() || null, categoria: notaCat, company_id: companyId, user_id: userId, updated_at: new Date().toISOString() };
      if (editingNota) {
        await (supabase as any).from("notas").update(payload).eq("id", editingNota.id);
        toast({ title: "Nota atualizada!" });
      } else {
        await (supabase as any).from("notas").insert({ ...payload, favorita: false });
        toast({ title: "Nota criada!" });
      }
      setNotaDialog(false);
      fetchNotas();
    } finally { setNotaSaving(false); }
  };

  const toggleFavorita = async (nota: Nota) => {
    await (supabase as any).from("notas").update({ favorita: !nota.favorita }).eq("id", nota.id);
    fetchNotas();
  };

  const deleteNota = async (id: string) => {
    await (supabase as any).from("notas").delete().eq("id", id);
    toast({ title: "Nota excluída" });
    fetchNotas();
  };

  // CRUD Ideias
  const openIdeia = (ideia?: Ideia) => {
    setEditingIdeia(ideia || null);
    setIdeiaTitulo(ideia?.titulo || "");
    setIdeiaDesc(ideia?.descricao || "");
    setIdeiaT(ideia?.tema || "Geral");
    setIdeiaS(ideia?.status || "Ideia");
    setIdeiaDialog(true);
  };

  const saveIdeia = async () => {
    if (!ideiaTitulo.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    setIdeiaSaving(true);
    try {
      const payload = { titulo: ideiaTitulo.trim(), descricao: ideiaDesc.trim() || null, tema: ideiaT, status: ideiaS, company_id: companyId, user_id: userId, updated_at: new Date().toISOString() };
      if (editingIdeia) {
        await (supabase as any).from("ideias").update(payload).eq("id", editingIdeia.id);
        toast({ title: "Ideia atualizada!" });
      } else {
        await (supabase as any).from("ideias").insert(payload);
        toast({ title: "Ideia registrada!" });
      }
      setIdeiaDialog(false);
      fetchIdeias();
    } finally { setIdeiaSaving(false); }
  };

  const deleteIdeia = async (id: string) => {
    await (supabase as any).from("ideias").delete().eq("id", id);
    toast({ title: "Ideia excluída" });
    fetchIdeias();
  };

  const updateIdeiaStatus = async (ideia: Ideia, novoStatus: string) => {
    await (supabase as any).from("ideias").update({ status: novoStatus, updated_at: new Date().toISOString() }).eq("id", ideia.id);
    fetchIdeias();
  };

  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Central de Planejamento
          </h1>
          <p className="text-sm text-muted-foreground">Notas, ideias e muito mais</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchNotas(); fetchIdeias(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => tab === "notas" ? openNota() : tab === "ideias" ? openIdeia() : tab === "kanban" ? window.location.href = "/kanban" : window.location.href = "/agenda"}>
            <Plus className="h-4 w-4 mr-2" />
            {tab === "notas" ? "Nova Nota" : tab === "ideias" ? "Nova Ideia" : "Novo Evento"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button onClick={() => setTab("notas")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "notas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <BookOpen className="h-4 w-4" /> Bloco de Notas
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{notas.length}</span>
        </button>
        <button onClick={() => setTab("ideias")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "ideias" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Lightbulb className="h-4 w-4" /> Banco de Ideias
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{ideias.length}</span>
        </button>
        <button onClick={() => setTab("kanban")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "kanban" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <LayoutGrid className="h-4 w-4" /> Kanban
        </button>
        <button onClick={() => setTab("agenda")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "agenda" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Calendar className="h-4 w-4" /> Agenda
        </button>
      </div>

      {/* ── NOTAS ── */}
      {tab === "notas" && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={notaSearch} onChange={e => setNotaSearch(e.target.value)}
                placeholder="Buscar notas..." className="pl-9 h-9" />
            </div>
            <Select value={notaCategoria} onValueChange={setNotaCategoria}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas categorias</SelectItem>
                {NOTA_CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={notaFavoritas ? "default" : "outline"} size="sm" className="h-9 gap-1.5"
              onClick={() => setNotaFavoritas(f => !f)}>
              <Star className="h-3.5 w-3.5" /> Favoritas
            </Button>
            <span className="text-xs text-muted-foreground self-center ml-auto">{notasFiltradas.length} notas</span>
          </div>

          {/* Grid de notas */}
          {notasLoading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : notasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <BookOpen className="h-12 w-12 mb-3 opacity-20" />
              <p>Nenhuma nota encontrada.</p>
              <Button variant="outline" className="mt-4" onClick={() => openNota()}>
                <Plus className="h-4 w-4 mr-2" /> Criar primeira nota
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {notasFiltradas.map(nota => (
                <Card key={nota.id} className={cn(
                  "group hover:shadow-md transition-all cursor-pointer border",
                  nota.favorita && "border-amber-200 bg-amber-50/20"
                )} onClick={() => openNota(nota)}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold line-clamp-2 flex-1">{nota.titulo}</CardTitle>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleFavorita(nota)}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
                          {nota.favorita
                            ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                        <button onClick={() => deleteNota(nota.id)}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <Badge variant="outline" className="w-fit text-xs">{nota.categoria}</Badge>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {nota.conteudo && (
                      <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap mb-3">
                        {nota.conteudo}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{fmtDate(nota.updated_at)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── IDEIAS ── */}
      {tab === "ideias" && (
        <>
          {/* Cards de status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {IDEIA_STATUS.map(s => (
              <Card key={s} className={cn("cursor-pointer hover:shadow-sm transition-all",
                ideiaStatus === s && "ring-2 ring-primary")}
                onClick={() => setIdeiaStatus(prev => prev === s ? "__all__" : s)}>
                <CardContent className="pt-4 pb-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{STATUS_ICONS[s]}</span>
                    <span className="text-xs font-medium text-muted-foreground">{s}</span>
                  </div>
                  <span className="text-2xl font-bold">{ideias.filter(i => i.status === s).length}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={ideiaSearch} onChange={e => setIdeiaSearch(e.target.value)}
                placeholder="Buscar ideias..." className="pl-9 h-9" />
            </div>
            <Select value={ideiaTema} onValueChange={setIdeiaTema}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os temas</SelectItem>
                {IDEIA_TEMAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ideiaStatus} onValueChange={setIdeiaStatus}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {IDEIA_STATUS.map(s => <SelectItem key={s} value={s}>{STATUS_ICONS[s]} {s}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground self-center ml-auto">{ideiasFiltradas.length} ideias</span>
          </div>

          {/* Lista de ideias */}
          {ideiasLoading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : ideiasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Lightbulb className="h-12 w-12 mb-3 opacity-20" />
              <p>Nenhuma ideia encontrada.</p>
              <Button variant="outline" className="mt-4" onClick={() => openIdeia()}>
                <Plus className="h-4 w-4 mr-2" /> Registrar primeira ideia
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {ideiasFiltradas.map(ideia => (
                <Card key={ideia.id} className="group hover:shadow-sm transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0 mt-0.5">{STATUS_ICONS[ideia.status]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{ideia.titulo}</h3>
                          <div className="flex items-center gap-2 shrink-0">
                            <Select value={ideia.status} onValueChange={v => updateIdeiaStatus(ideia, v)}>
                              <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {IDEIA_STATUS.map(s => (
                                  <SelectItem key={s} value={s}>{STATUS_ICONS[s]} {s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openIdeia(ideia)}
                                className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteIdeia(ideia.id)}
                                className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[ideia.status])}>
                            {ideia.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{ideia.tema}</Badge>
                          <span className="text-[10px] text-muted-foreground">{fmtDate(ideia.updated_at)}</span>
                        </div>
                        {ideia.descricao && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{ideia.descricao}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

{/* ── KANBAN ── */}
      {tab === "kanban" && (
        <div className="flex flex-col items-center py-16 gap-4">
          <LayoutGrid className="h-16 w-16 text-primary opacity-80" />
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Kanban de Projetos</h2>
            <p className="text-muted-foreground mb-4">Gerencie projetos com quadros visuais e drag & drop</p>
            <Button onClick={() => window.location.href = "/kanban"}>
              <LayoutGrid className="h-4 w-4 mr-2" /> Abrir Kanban
            </Button>
          </div>
        </div>
      )}

{/* ── AGENDA ── */}
      {tab === "agenda" && (
        <div className="flex flex-col items-center py-16 gap-4">
          <Calendar className="h-16 w-16 text-primary opacity-80" />
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Agenda</h2>
            <p className="text-muted-foreground mb-4">Gerencie seus eventos, lembretes e tarefas</p>
            <Button onClick={() => window.location.href = "/agenda"}>
              <Calendar className="h-4 w-4 mr-2" /> Abrir Agenda Completa
            </Button>
          </div>
        </div>
      )}

      {/* Dialog Nota */}
      <Dialog open={notaDialog} onOpenChange={o => { if (!o) setNotaDialog(false); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {editingNota ? "Editar Nota" : "Nova Nota"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input value={notaTitulo} onChange={e => setNotaTitulo(e.target.value)} placeholder="Título da nota..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Categoria</label>
              <Select value={notaCat} onValueChange={setNotaCat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTA_CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Conteúdo</label>
              <Textarea value={notaConteudo} onChange={e => setNotaConteudo(e.target.value)}
                placeholder="Escreva sua nota aqui..." rows={8} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotaDialog(false)}>Cancelar</Button>
            <Button onClick={saveNota} disabled={notaSaving}>
              {notaSaving ? "Salvando..." : editingNota ? "Salvar" : "Criar Nota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ideia */}
      <Dialog open={ideiaDialog} onOpenChange={o => { if (!o) setIdeiaDialog(false); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              {editingIdeia ? "Editar Ideia" : "Nova Ideia"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input value={ideiaTitulo} onChange={e => setIdeiaTitulo(e.target.value)} placeholder="Descreva sua ideia..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Tema</label>
                <Select value={ideiaT} onValueChange={setIdeiaT}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IDEIA_TEMAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={ideiaS} onValueChange={setIdeiaS}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IDEIA_STATUS.map(s => <SelectItem key={s} value={s}>{STATUS_ICONS[s]} {s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={ideiaDesc} onChange={e => setIdeiaDesc(e.target.value)}
                placeholder="Detalhe sua ideia..." rows={6} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIdeiaDialog(false)}>Cancelar</Button>
            <Button onClick={saveIdeia} disabled={ideiaSaving}>
              {ideiaSaving ? "Salvando..." : editingIdeia ? "Salvar" : "Registrar Ideia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}