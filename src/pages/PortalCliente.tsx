import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, MessagesSquare, Clock, CheckCircle2, AlertTriangle, LogOut, Wrench, MapPin, Calendar, Search, X } from "@/lib/icons";

// ─── Types ───────────────────────────────────────────────────────────────────

type Chamado = {
  id: string;
  codigo: string;
  status: string;
  descricao_problema: string;
  created_at: string;
  ativo_id: string | null;
  ativo_nome: string | null;
  ativo_codigo: string | null;
  bloco_id: string | null;
  bloco_nome: string | null;
  andar: string | null;
  sala: string | null;
  os_id: string | null;
  justificativa_recusa: string | null;
  analisado_em: string | null;
  analisado_por_nome: string | null;
};

type Ativo = { id: string; nome: string; codigo_identificacao?: string | null };
type Bloco = { id: string; nome: string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getResultado(c: Chamado): "Aprovado" | "Recusado" | null {
  if (c.status !== "Encerrado") return null;
  return c.os_id ? "Aprovado" : "Recusado";
}

// ─── Status Dashboard Card ────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: number;
  accent: string; // tailwind color token e.g. "blue"
  active: boolean;
  onClick: () => void;
};

function StatCard({ label, value, accent, active, onClick }: StatCardProps) {
  const accentMap: Record<string, { border: string; label: string; ring: string }> = {
    sky: { border: "hover:border-sky-400", label: "text-sky-600", ring: "ring-sky-400" },
    amber: { border: "hover:border-amber-400", label: "text-amber-600", ring: "ring-amber-400" },
    emerald: { border: "hover:border-emerald-400", label: "text-emerald-600", ring: "ring-emerald-400" },
    rose: { border: "hover:border-rose-400", label: "text-rose-600", ring: "ring-rose-400" },
    violet: { border: "hover:border-violet-400", label: "text-violet-600", ring: "ring-violet-400" },
  };
  const a = accentMap[accent] ?? accentMap["sky"];

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden bg-white border rounded-2xl p-5 text-left transition-all duration-200",
        "shadow-sm hover:shadow-md hover:-translate-y-0.5",
        a.border,
        active && `ring-2 ${a.ring} border-transparent`
      )}
    >
      <p className={cn("text-[10px] font-black uppercase tracking-widest mb-2", a.label)}>{label}</p>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      <div className="absolute bottom-0 right-0 p-3 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
        <div className={cn("w-12 h-12 rounded-full border-4", `border-current ${a.label}`)} />
      </div>
    </button>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-5 py-2 rounded-lg text-sm font-semibold transition-all",
        active
          ? "bg-white text-indigo-700 shadow-sm font-bold"
          : "text-slate-500 hover:text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

// ─── Ticket Card ─────────────────────────────────────────────────────────────

function TicketCard({ c, onClick }: { c: Chamado; onClick: () => void }) {
  const resultado = getResultado(c);

  const statusStyle = {
    "Em análise": "bg-sky-50 text-sky-700 border-sky-200",
    Encerrado: "bg-zinc-100 text-zinc-600 border-zinc-300",
  };

  const resultadoStyle = {
    Aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Recusado: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                 hover:shadow-lg hover:shadow-slate-200/60 hover:border-indigo-200
                 transition-all duration-200 flex flex-col justify-between"
    >
      {/* Top row */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200 font-mono">
            {c.codigo}
          </span>
          <div className="flex flex-wrap gap-1.5 justify-end">
            <Badge
              variant="outline"
              className={cn("text-[10px] border h-5 px-1.5", statusStyle[c.status as keyof typeof statusStyle] ?? statusStyle["Em análise"])}
            >
              {c.status}
            </Badge>
            {resultado && (
              <Badge
                variant="outline"
                className={cn("text-[10px] border h-5 px-1.5", resultadoStyle[resultado])}
              >
                {resultado}
              </Badge>
            )}
          </div>
        </div>

        <h4 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-indigo-600 transition-colors truncate">
          {c.ativo_nome || "Equipamento"}
        </h4>
        {c.descricao_problema && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
            {c.descricao_problema}
          </p>
        )}
      </div>

      {/* Bottom row */}
      <div className="space-y-1.5 pt-3 border-t border-slate-100 mt-2">
        {(c.bloco_nome || c.andar || c.sala) && (
          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
            <MapPin className="h-3 w-3 shrink-0" />
            {[c.bloco_nome, c.andar, c.sala].filter(Boolean).join(" · ")}
          </p>
        )}
        {c.created_at && (
          <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
            <Calendar className="h-3 w-3 shrink-0" />
            {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortalCliente() {
  const { session } = useAuth();
  const { companyId } = useCompany();

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [profileNome, setProfileNome] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Chamado | null>(null);
  const [novoChamadoOpen, setNovoChamadoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Form state
  const [formAtivoId, setFormAtivoId] = useState("");
  const [formBlocoId, setFormBlocoId] = useState("");
  const [formAndar, setFormAndar] = useState("");
  const [formSala, setFormSala] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formRamal, setFormRamal] = useState("");
  const [formTelefone, setFormTelefone] = useState("");

  // Filter / tab state
  const [activeTab, setActiveTab] = useState<"ativos" | "historico" | "todos">("ativos");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recente" | "antigo">("recente");

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!companyId || !session?.user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [profileRes, chamadosRes, ativosRes, blocosRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, nome").eq("user_id", session.user.id).maybeSingle(),
        (supabase as any).from("chamados")
          .select("id, codigo, status, descricao_problema, created_at, ativo_id, ativo_nome, ativo_codigo, bloco_id, bloco_nome, andar, sala, os_id, justificativa_recusa, solicitante_id, analisado_em, analisado_por_nome")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any).from("ativos").select("id, nome, codigo_identificacao").eq("company_id", companyId).order("nome"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
      ]);

      const profile = profileRes?.data;
      setProfileId(profile?.id || null);
      setProfileNome(profile?.nome || session.user.email || "");

      const allChamados: Chamado[] = chamadosRes?.data || [];
      const meusChamados = profile?.id
        ? allChamados.filter((c: any) => c.solicitante_id === profile.id)
        : allChamados;

      setChamados(meusChamados);
      setAtivos(ativosRes?.data || []);
      setBlocos(blocosRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar chamados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, session?.user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Form ──────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormAtivoId(""); setFormBlocoId(""); setFormAndar("");
    setFormSala(""); setFormDescricao("");
    setFormNome(""); setFormRamal(""); setFormTelefone("");
  };

  const handleNovoChamado = async () => {
    if (!formAtivoId) { toast({ title: "Selecione o equipamento", variant: "destructive" }); return; }
    if (!formNome.trim()) { toast({ title: "Informe seu nome", variant: "destructive" }); return; }
    if (!formBlocoId) { toast({ title: "Selecione o bloco/unidade", variant: "destructive" }); return; }
    if (!formAndar.trim()) { toast({ title: "Informe o andar", variant: "destructive" }); return; }
    if (!formSala.trim()) { toast({ title: "Informe a sala/ambiente", variant: "destructive" }); return; }
    if (!formRamal.trim()) { toast({ title: "Informe o ramal", variant: "destructive" }); return; }
    if (!formDescricao.trim()) { toast({ title: "Descreva o problema", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const ativo = ativos.find(a => a.id === formAtivoId);
      const bloco = blocos.find(b => b.id === formBlocoId);
      const { error } = await (supabase as any).from("chamados").insert({
        company_id: companyId,
        status: "Em análise",
        ativo_id: formAtivoId || null,
        ativo_nome: ativo?.nome || null,
        ativo_codigo: ativo?.codigo_identificacao || null,
        bloco_id: formBlocoId || null,
        bloco_nome: bloco?.nome || null,
        andar: formAndar.trim() || null,
        sala: formSala.trim() || null,
        descricao_problema: formDescricao.trim(),
        solicitante_id: profileId,
        solicitante_nome: formNome.trim(),
        ramal: formRamal.trim(),
        telefone: formTelefone.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Chamado aberto!", description: "Nossa equipe irá analisar em breve." });
      setNovoChamadoOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao abrir chamado", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  // ── Computed stats ────────────────────────────────────────────────────────

  const emAnalise = chamados.filter(c => c.status === "Em análise").length;
  const aprovados = chamados.filter(c => c.status === "Encerrado" && c.os_id).length;
  const recusados = chamados.filter(c => c.status === "Encerrado" && c.justificativa_recusa && !c.os_id).length;
  const encerrados = chamados.filter(c => c.status === "Encerrado").length;

  const statCards = [
    { key: "Em análise", label: "Em análise", value: emAnalise, accent: "sky" },
    { key: "Aprovado", label: "Aprovados", value: aprovados, accent: "emerald" },
    { key: "Recusado", label: "Recusados", value: recusados, accent: "rose" },
    { key: "Encerrado", label: "Encerrados", value: encerrados, accent: "violet" },
    { key: "todos", label: "Total", value: chamados.length, accent: "amber" },
  ];

  // ── Filtered list ─────────────────────────────────────────────────────────

  const displayedChamados = useMemo(() => {
    let list = [...chamados];

    // Tab filter — ignorado se um card de status está ativo
    // (evita que a aba bloqueie chamados que o card quer mostrar)
    if (!statusFilter) {
      if (activeTab === "ativos") {
        list = list.filter(c => c.status !== "Encerrado");
      } else if (activeTab === "historico") {
        list = list.filter(c => c.status === "Encerrado");
      }
    }

    // Status card filter
    if (statusFilter && statusFilter !== "todos") {
      if (statusFilter === "Aprovado") {
        list = list.filter(c => c.status === "Encerrado" && c.os_id);
      } else if (statusFilter === "Recusado") {
        list = list.filter(c => c.status === "Encerrado" && !c.os_id);
      } else {
        list = list.filter(c => c.status === statusFilter);
      }
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.codigo?.toLowerCase().includes(q) ||
        c.ativo_nome?.toLowerCase().includes(q) ||
        c.descricao_problema?.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sort === "recente" ? db - da : da - db;
    });

    return list;
  }, [chamados, activeTab, statusFilter, search, sort]);

  const toggleStatusFilter = (key: string) => {
    const next = statusFilter === key ? null : key;
    setStatusFilter(next);
    // Se filtrou por Aprovado/Recusado/Encerrado, muda aba para "todos"
    // pois esses são chamados encerrados, invisíveis na aba "Ativos"
    if (next && ["Aprovado", "Recusado", "Encerrado"].includes(next)) {
      setActiveTab("todos");
    }
  };

  const clearFilters = () => {
    setStatusFilter(null);
    setSearch("");
    setSort("recente");
  };

  const hasFilters = statusFilter !== null || search.trim() !== "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          {/* Left: brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-md shadow-indigo-200">
              P
            </div>
            <div className="hidden sm:block">
              <p className="text-base font-extrabold tracking-tight leading-tight">Portal de Chamados</p>
              <p className="text-xs text-slate-500 italic leading-tight">Olá, {profileNome.split(" ")[0]}</p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 gap-1.5 font-bold"
              onClick={() => { setFormNome(profileNome); setNovoChamadoOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Chamado</span>
              <span className="sm:hidden">Abrir</span>
            </Button>
            <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center text-[11px] font-bold text-slate-600 select-none">
              {profileNome ? getInitials(profileNome) : "?"}
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair" className="text-slate-400 hover:text-slate-700">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-screen-xl mx-auto px-4 sm:px-8 py-8 space-y-8">

        {/* Dashboard section */}
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Minhas Solicitações</h2>
              <p className="text-sm text-slate-500">Acompanhe e gerencie seus chamados em tempo real.</p>
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-indigo-600 text-xs font-bold hover:underline flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {statCards.map(s => (
              <StatCard
                key={s.key}
                label={s.label}
                value={s.value}
                accent={s.accent}
                active={statusFilter === s.key}
                onClick={() => toggleStatusFilter(s.key)}
              />
            ))}
          </div>
        </section>

        {/* List section */}
        <section className="space-y-5">
          {/* Tabs + Search row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
            {/* Tabs */}
            <nav className="flex gap-1 bg-slate-200/50 p-1 rounded-xl w-fit">
              <TabBtn active={activeTab === "ativos"} onClick={() => setActiveTab("ativos")}>    Ativos    </TabBtn>
              <TabBtn active={activeTab === "historico"} onClick={() => setActiveTab("historico")}> Histórico </TabBtn>
              <TabBtn active={activeTab === "todos"} onClick={() => setActiveTab("todos")}>     Ver Todos </TabBtn>
            </nav>

            {/* Search + sort */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px]">
                <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por código ou equipamento..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as "recente" | "antigo")}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium
                           focus:outline-none cursor-pointer"
              >
                <option value="recente">Mais Recentes</option>
                <option value="antigo">Mais Antigos</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-12">Carregando...</p>
          ) : displayedChamados.length === 0 ? (
            <div className="py-24 text-center">
              <div className="text-5xl mb-4">📂</div>
              <h3 className="text-base font-bold text-slate-800">Nenhum chamado nesta categoria</h3>
              <p className="text-sm text-slate-500 mt-1">Altere os filtros ou abra um novo chamado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {displayedChamados.map(c => (
                <TicketCard key={c.id} c={c} onClick={() => setViewing(c)} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── Dialog: Ver Chamado ── */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm">{viewing?.codigo}</span>
              {viewing && (
                <Badge variant="outline" className={cn("text-xs border",
                  viewing.status === "Em análise"
                    ? "bg-sky-50 text-sky-700 border-sky-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-300"
                )}>
                  {viewing.status}
                </Badge>
              )}
              {viewing?.status === "Encerrado" && (
                <Badge variant="outline" className={cn("text-xs border",
                  viewing.os_id
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                )}>
                  {viewing.os_id ? "Aprovado" : "Recusado"}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>Detalhes do chamado</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              {viewing.ativo_nome && (
                <div className="flex items-start gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{viewing.ativo_nome}</p>
                    {viewing.ativo_codigo && <p className="text-xs text-muted-foreground font-mono">{viewing.ativo_codigo}</p>}
                  </div>
                </div>
              )}
              {(viewing.bloco_nome || viewing.andar || viewing.sala) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p>{[viewing.bloco_nome, viewing.andar, viewing.sala].filter(Boolean).join(" · ")}</p>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                <p className="whitespace-pre-line">{viewing.descricao_problema}</p>
              </div>
              {viewing.justificativa_recusa && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Motivo da recusa</p>
                  <p className="text-red-800 whitespace-pre-line">{viewing.justificativa_recusa}</p>
                </div>
              )}
              {viewing.created_at && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Andamento</p>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-info mt-1.5 shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium text-foreground">Aberto</p>
                        <p className="text-muted-foreground">{format(new Date(viewing.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                      </div>
                    </div>
                    {viewing.analisado_em && (
                      <div className="flex items-start gap-2.5">
                        <span className="h-2 w-2 rounded-full bg-info mt-1.5 shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium text-foreground">Analisado</p>
                          <p className="text-muted-foreground">
                            {format(new Date(viewing.analisado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            {viewing.analisado_por_nome && ` · ${viewing.analisado_por_nome}`}
                          </p>
                        </div>
                      </div>
                    )}
                    {viewing.status === "Encerrado" && viewing.analisado_em && (
                      <div className="flex items-start gap-2.5">
                        <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", viewing.os_id ? "bg-success" : "bg-destructive")} />
                        <div className="text-xs">
                          <p className="font-medium text-foreground">{viewing.os_id ? "Aprovado — O.S. gerada" : "Recusado"}</p>
                          <p className="text-muted-foreground">{format(new Date(viewing.analisado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Novo Chamado ── */}
      <Dialog open={novoChamadoOpen} onOpenChange={(o) => { if (!o) { setNovoChamadoOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir Novo Chamado</DialogTitle>
            <DialogDescription>Descreva o problema e nossa equipe irá atender em breve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Seu nome *</label>
              <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Equipamento *</label>
              <Select value={formAtivoId} onValueChange={setFormAtivoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
                <SelectContent>
                  {ativos.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Localização *</label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={formBlocoId} onValueChange={setFormBlocoId}>
                  <SelectTrigger><SelectValue placeholder="Bloco/Unidade" /></SelectTrigger>
                  <SelectContent>
                    {blocos.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.nome || b.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={formAndar} onChange={e => setFormAndar(e.target.value)} placeholder="Andar" />
              </div>
              <Input className="mt-2" value={formSala} onChange={e => setFormSala(e.target.value)} placeholder="Sala / Ambiente" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Ramal *</label>
                <Input value={formRamal} onChange={e => setFormRamal(e.target.value)} placeholder="Ex: 1234" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Telefone <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <Input value={formTelefone} onChange={e => setFormTelefone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descrição do problema *</label>
              <Textarea
                value={formDescricao}
                onChange={e => setFormDescricao(e.target.value)}
                placeholder="Descreva o que está acontecendo com o máximo de detalhes possível..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNovoChamadoOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleNovoChamado} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? "Abrindo..." : "Abrir Chamado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}