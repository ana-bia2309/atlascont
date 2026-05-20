import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Search, CalendarClock, X, Pencil, Paperclip, FileText, FileSpreadsheet, BarChart3, TableIcon, Calendar as CalendarIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { format, isToday, isBefore, startOfDay, isAfter, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import AnexosModal from "@/components/os/AnexosModal";
import { usePermissions } from "@/hooks/use-permissions";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/use-company";
import ActivityTimerControls from "@/components/os/ActivityTimerControls";
import CronogramaGantt from "@/components/cronogramas/CronogramaGantt";
import { exportCronogramaPDF, exportCronogramaXLSX } from "@/lib/cronograma-export";

type AtividadeGlobal = {
  id: string;
  os_id: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
  codigo_os: string | null;
  timer_status: string;
  timer_total_seconds: number;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_user_id: string | null;
  time_tracking_mode: string | null;
};

const STATUS_FILTER = ["Todos", "Não iniciado", "Em andamento", "Concluído"];
const STATUS_OPTIONS = ["Não iniciado", "Em andamento", "Concluído"];

const MONTHS = [
  { value: "all", label: "Todos os meses" },
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" }, { value: "04", label: "Abril" },
  { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
  { value: "07", label: "Julho" }, { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" }, { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

function normalizeName(value: string | null | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function getYearOptions(atividades: AtividadeGlobal[]) {
  const years = new Set<string>();
  atividades.forEach((a) => {
    if (a.data_inicio) years.add(a.data_inicio.substring(0, 4));
    if (a.data_termino) years.add(a.data_termino.substring(0, 4));
  });
  const sorted = Array.from(years).sort().reverse();
  return [{ value: "all", label: "Todos os anos" }, ...sorted.map((y) => ({ value: y, label: y }))];
}

export default function Cronogramas() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { session } = useAuth();
  const { companyId } = useCompany();
  const [atividades, setAtividades] = useState<AtividadeGlobal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [periodFilter, setPeriodFilter] = useState("Todos");
  const [responsavelFilter, setResponsavelFilter] = useState("Todos");

  // Advanced filters
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // View mode
  const [viewMode, setViewMode] = useState<"tabela" | "gantt">("tabela");

  // Current user
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentProfileName, setCurrentProfileName] = useState<string | null>(null);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<AtividadeGlobal | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDataInicio, setEditDataInicio] = useState("");
  const [editDataTermino, setEditDataTermino] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editResponsavel, setEditResponsavel] = useState("");
  const [saving, setSaving] = useState(false);

  // Profiles for responsável dropdown
  const [profiles, setProfiles] = useState<{ id: string; nome: string }[]>([]);

  // Anexos
  const [anexosCounts, setAnexosCounts] = useState<Record<string, number>>({});
  const [anexosModalOsId, setAnexosModalOsId] = useState<string | null>(null);

  // Resolve current user profile
  useEffect(() => {
    if (!session?.user) { setCurrentProfileId(null); setCurrentProfileName(null); return; }
    supabase.from("profiles").select("id, nome").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => {
        setCurrentProfileId(data?.id || null);
        setCurrentProfileName(data?.nome || null);
      });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from("profiles")
      .select("id, nome")
      .eq("company_id", companyId)
      .eq("status", "ativo")
      .order("nome")
      .then(({ data }: any) => {
        setProfiles(data || []);
      });
  }, [companyId]);

  const fetchAll = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const companyId = profile.company_id;

  const { data, error } = await (supabase as any)
    .from("atividades_os")
    .select(
      "id, os_id, nome, data_inicio, data_termino, status, responsavel, timer_status, timer_total_seconds, timer_started_at, timer_paused_at, timer_user_id, ordens_servico(codigo_os, time_tracking_mode, company_id)"
    )
    .eq("ordens_servico.company_id", companyId)
    .order("data_inicio", { ascending: true });

  if (!error && data) {
    const mapped: AtividadeGlobal[] = (data as any[]).map((d) => ({
      id: d.id,
      os_id: d.os_id,
      nome: d.nome,
      data_inicio: d.data_inicio,
      data_termino: d.data_termino,
      status: d.status,
      responsavel: d.responsavel,
      codigo_os: d.ordens_servico?.codigo_os || null,
      timer_status: d.timer_status || "none",
      timer_total_seconds: d.timer_total_seconds || 0,
      timer_started_at: d.timer_started_at || null,
      timer_paused_at: d.timer_paused_at || null,
      timer_user_id: d.timer_user_id || null,
      time_tracking_mode: d.ordens_servico?.time_tracking_mode || null,
    }));

    setAtividades(mapped);

    const osIds = [...new Set(mapped.map((a) => a.os_id))];

    if (osIds.length > 0) {
     const { data: anexosData } = await (supabase as any)
  .from("anexos_os")
  .select("os_id, ordens_servico!inner(company_id)")
  .eq("ordens_servico.company_id", companyId)
  .in("os_id", osIds);
      const counts: Record<string, number> = {};

      (anexosData || []).forEach((a: any) => {
        counts[a.os_id] = (counts[a.os_id] || 0) + 1;
      });

      setAnexosCounts(counts);
    }
  }

  setLoading(false);
}, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);


  useEffect(() => {
    const channel = supabase
      .channel("atividades_os_global")
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades_os" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const today = startOfDay(new Date());

  const categorize = (a: AtividadeGlobal) => {
    const inicio = new Date(a.data_inicio + "T00:00:00");
    const termino = new Date(a.data_termino + "T00:00:00");
    if (a.status === "Concluído") return 3;
    if (isBefore(termino, today) && a.status !== "Concluído") return 0;
    if (isToday(inicio) || isToday(termino)) return 1;
    return 2;
  };

  const isOverdue = (a: AtividadeGlobal) => {
    const termino = new Date(a.data_termino + "T00:00:00");
    return isBefore(termino, today) && a.status !== "Concluído";
  };

  const isTodayActivity = (a: AtividadeGlobal) => {
    const inicio = new Date(a.data_inicio + "T00:00:00");
    const termino = new Date(a.data_termino + "T00:00:00");
    return isToday(inicio) || isToday(termino);
  };

  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    atividades.forEach((a) => { if (a.responsavel) set.add(a.responsavel); });
    return Array.from(set).sort();
  }, [atividades]);

  const yearOptions = useMemo(() => getYearOptions(atividades), [atividades]);

  const [activeTab, setActiveTab] = useState("ativas");

  const filtered = useMemo(() => {
    let list = atividades;

    if (activeTab === "ativas") {
      list = list.filter((a) => a.status !== "Concluído");
    } else {
      list = list.filter((a) => a.status === "Concluído");
    }

    if (statusFilter !== "Todos") list = list.filter((a) => a.status === statusFilter);
    if (periodFilter === "Hoje") list = list.filter((a) => isTodayActivity(a) && !isOverdue(a));
    else if (periodFilter === "Atrasadas") list = list.filter(isOverdue);
    else if (periodFilter === "Próximas") list = list.filter((a) => !isOverdue(a) && !isTodayActivity(a) && a.status !== "Concluído");
    if (responsavelFilter !== "Todos") list = list.filter((a) => a.responsavel === responsavelFilter);

    // Month filter
    if (monthFilter !== "all") {
      list = list.filter((a) => {
        const m1 = a.data_inicio?.substring(5, 7);
        const m2 = a.data_termino?.substring(5, 7);
        return m1 === monthFilter || m2 === monthFilter;
      });
    }

    // Year filter
    if (yearFilter !== "all") {
      list = list.filter((a) => {
        const y1 = a.data_inicio?.substring(0, 4);
        const y2 = a.data_termino?.substring(0, 4);
        return y1 === yearFilter || y2 === yearFilter;
      });
    }

    // Date range filter
    if (dateStart) {
      const ds = new Date(dateStart + "T00:00:00");
      list = list.filter((a) => {
        const e = new Date(a.data_termino + "T00:00:00");
        return !isBefore(e, ds);
      });
    }
    if (dateEnd) {
      const de = new Date(dateEnd + "T00:00:00");
      list = list.filter((a) => {
        const s = new Date(a.data_inicio + "T00:00:00");
        return !isAfter(s, de);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.nome.toLowerCase().includes(q) ||
          (a.responsavel && a.responsavel.toLowerCase().includes(q)) ||
          (a.codigo_os && a.codigo_os.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const ca = categorize(a);
      const cb = categorize(b);
      if (ca !== cb) return ca - cb;
      return a.data_inicio.localeCompare(b.data_inicio);
    });
  }, [atividades, statusFilter, search, periodFilter, responsavelFilter, activeTab, monthFilter, yearFilter, dateStart, dateEnd]);

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
  };

  const statusColor = (s: string) => {
    if (s === "Concluído") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "Em andamento") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-zinc-100 text-zinc-600 border-zinc-200";
  };

  const counts = useMemo(() => {
    let hoje = 0, futuras = 0, atrasadas = 0, concluidas = 0;
    atividades.forEach((a) => {
      if (a.status === "Concluído") { concluidas++; return; }
      if (isOverdue(a)) atrasadas++;
      else if (isTodayActivity(a)) hoje++;
      else futuras++;
    });
    return { hoje, futuras, atrasadas, concluidas, total: atividades.length };
  }, [atividades]);

  const canControlTimer = (a: AtividadeGlobal) => {
    const activityResponsible = normalizeName(a.responsavel);
    const userName = normalizeName(currentProfileName);
    if (activityResponsible && userName) {
      return activityResponsible === userName;
    }
    return false;
  };

  const openEdit = (a: AtividadeGlobal) => {
    setEditData(a);
    setEditNome(a.nome);
    setEditDataInicio(a.data_inicio);
    setEditDataTermino(a.data_termino);
    setEditStatus(a.status);
    setEditResponsavel(a.responsavel || "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editData) return;
    if (!can("cronogramas.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    if (!editNome.trim() || !editDataInicio || !editDataTermino) {
      toast({ title: "Preencha nome, data de início e data de término.", variant: "destructive" });
      return;
    }
   
    setSaving(true);
   const result = await (supabase as any)
  .from("atividades_os")
  .update({
    nome: editNome.trim(),
    data_inicio: editDataInicio,
    data_termino: editDataTermino,
    status: editStatus,
    responsavel:
      editResponsavel.trim() || null,
  })
  .eq("id", editData.id)
  .eq("company_id", companyId);
    if (result.error) {
      toast({ title: "Erro ao atualizar atividade", variant: "destructive" });
      return;
    }
    toast({ title: "Atividade atualizada com sucesso" });
    setEditOpen(false);
    setAtividades((prev) =>
      prev.map((a) =>
        a.id === editData.id
          ? { ...a, nome: editNome.trim(), data_inicio: editDataInicio, data_termino: editDataTermino, status: editStatus, responsavel: editResponsavel.trim() || null }
          : a
      )
    );
  };

  const hasActiveFilters = periodFilter !== "Todos" || statusFilter !== "Todos" || responsavelFilter !== "Todos" || search || monthFilter !== "all" || yearFilter !== "all" || dateStart || dateEnd;

  const clearAllFilters = () => {
    setPeriodFilter("Todos");
    setStatusFilter("Todos");
    setResponsavelFilter("Todos");
    setSearch("");
    setMonthFilter("all");
    setYearFilter("all");
    setDateStart("");
    setDateEnd("");
  };

  const renderStatusButtons = () => (
    <div className="flex flex-wrap gap-2">
      {[
        { label: "Em andamento", filter: "Em andamento", count: counts.hoje + counts.futuras, color: "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200" },
        { label: "Concluídas", filter: "Concluído", count: counts.concluidas, color: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" },
        { label: "Atrasadas", filter: "Atrasadas", count: counts.atrasadas, color: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200" },
      ].map((btn) => (
        <button
          key={btn.label}
          onClick={() => {
            if (btn.filter === "Atrasadas") {
              setPeriodFilter(periodFilter === "Atrasadas" ? "Todos" : "Atrasadas");
              setStatusFilter("Todos");
              setActiveTab("ativas");
            } else if (btn.filter === "Concluído") {
              setActiveTab(activeTab === "concluidas" ? "ativas" : "concluidas");
              setPeriodFilter("Todos");
              setStatusFilter("Todos");
            } else {
              setStatusFilter(statusFilter === btn.filter ? "Todos" : btn.filter);
              setPeriodFilter("Todos");
              setActiveTab("ativas");
            }
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
            btn.color,
            ((btn.filter === "Atrasadas" && periodFilter === "Atrasadas") ||
             (btn.filter === "Concluído" && activeTab === "concluidas") ||
             (btn.filter !== "Atrasadas" && btn.filter !== "Concluído" && statusFilter === btn.filter))
              && "ring-2 ring-offset-1 ring-primary/50"
          )}
        >
          {btn.label}
          <span className="bg-white/60 rounded-full px-1.5 py-0.5 text-[10px]">{btn.count}</span>
        </button>
      ))}
    </div>
  );

  const renderFilters = () => (
    <div className="space-y-3">
      {/* Status quick buttons */}
      {renderStatusButtons()}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar atividade, responsável ou OS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Ano" /></SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={responsavelFilter} onValueChange={setResponsavelFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos os responsáveis</SelectItem>
            {responsaveis.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Date range row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Período:</span>
          <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="w-[140px] h-9 text-sm" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="w-[140px] h-9 text-sm" />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="mr-1 h-3 w-3" /> Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );

  const renderTableView = (items: AtividadeGlobal[], showTimer = true) => {
    if (loading) return <p className="text-muted-foreground">Carregando...</p>;
    if (items.length === 0) return <p className="text-muted-foreground">Nenhuma atividade encontrada.</p>;

    return (
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>OS Vinculada</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Término</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              {showTimer && <TableHead>Tempo</TableHead>}
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => {
              const overdue = isOverdue(a);
              const todayItem = isTodayActivity(a) && !overdue;
              const future = !overdue && !todayItem && a.status !== "Concluído";
              return (
                <TableRow
                  key={a.id}
                  className={cn(
                    "transition-colors hover:bg-muted/50",
                    overdue && "bg-red-500/5",
                    todayItem && "bg-yellow-500/5",
                  )}
                >
                  <TableCell className="w-8 text-center">
                    {overdue && <span className="text-base" title="Atrasada">🔴</span>}
                    {todayItem && <span className="text-base" title="Hoje">🟡</span>}
                    {future && <span className="text-base" title="Futura">🔵</span>}
                    {a.status === "Concluído" && <span className="text-base" title="Concluída">🟢</span>}
                  </TableCell>
                  <TableCell
                    className="font-medium cursor-pointer"
                    onClick={() => navigate(`/os/${a.os_id}`)}
                  >
                    {a.nome}
                    {todayItem && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-yellow-600 bg-yellow-50 rounded px-1.5 py-0.5">
                        HOJE
                      </span>
                    )}
                    {overdue && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                        ATRASADA
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => navigate(`/os/${a.os_id}`)}
                    >
                      {a.codigo_os || "—"}
                    </span>
                    {(anexosCounts[a.os_id] || 0) > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAnexosModalOsId(a.os_id); }}
                        className="ml-1.5 text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
                        title="Anexos"
                      >
                        <Paperclip className="h-3 w-3" /> {anexosCounts[a.os_id]}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>{fmtDate(a.data_inicio)}</TableCell>
                  <TableCell className={cn(overdue && "text-red-600 font-semibold")}>
                    {fmtDate(a.data_termino)}
                  </TableCell>
                  <TableCell>{a.responsavel || "—"}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", statusColor(a.status))}>
                      {a.status}
                    </span>
                  </TableCell>
                  {showTimer && (
                    <TableCell className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
                      <ActivityTimerControls
                        atividadeId={a.id}
                        osId={a.os_id}
                        timerState={{
                          status: a.timer_status || "none",
                          total_seconds: a.timer_total_seconds || 0,
                          started_at: a.timer_started_at,
                          paused_at: a.timer_paused_at,
                          user_id: a.timer_user_id,
                        }}
                        currentProfileId={currentProfileId}
                        isResponsible={canControlTimer(a)}
                        disabled={false}
                        onUpdate={fetchAll}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    {can("cronogramas.editar") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                        title="Editar atividade"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-primary" />
          Cronogramas — Visão Global
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border bg-card p-0.5">
            <Button
              variant={viewMode === "tabela" ? "default" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setViewMode("tabela")}
            >
              <TableIcon className="h-4 w-4" /> Tabela
            </Button>
            <Button
              variant={viewMode === "gantt" ? "default" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setViewMode("gantt")}
            >
              <BarChart3 className="h-4 w-4" /> Gantt
            </Button>
          </div>

          {/* Export buttons */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportCronogramaPDF(filtered)}
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportCronogramaXLSX(filtered)}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{counts.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-primary">{counts.hoje}</p>
          <p className="text-xs text-muted-foreground">Hoje</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-sky-600">{counts.futuras}</p>
          <p className="text-xs text-muted-foreground">Futuras</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{counts.atrasadas}</p>
          <p className="text-xs text-muted-foreground">Atrasadas</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{counts.concluidas}</p>
          <p className="text-xs text-muted-foreground">Concluídas</p>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Active filters feedback */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Exibindo</span>
          <span className="font-semibold text-primary">{filtered.length}</span>
          <span className="text-muted-foreground">de {atividades.length} atividades</span>
        </div>
      )}

      {/* Content */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setStatusFilter("Todos"); setPeriodFilter("Todos"); }} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ativas">Em andamento ({counts.hoje + counts.futuras + counts.atrasadas})</TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas ({counts.concluidas})</TabsTrigger>
        </TabsList>

        <TabsContent value="ativas" className="space-y-4">
          {renderTableView(filtered, true)}
          {viewMode === "gantt" && (
            <div className="mt-6">
              <CronogramaGantt atividades={filtered} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="concluidas" className="space-y-4">
          {renderTableView(filtered, false)}
          {viewMode === "gantt" && (
            <div className="mt-6">
              <CronogramaGantt atividades={filtered} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Atividade</DialogTitle>
            {editData?.codigo_os && (
              <p className="text-xs text-muted-foreground">OS vinculada: {editData.codigo_os}</p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Nome da atividade *</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Data início *</label>
                <Input type="date" value={editDataInicio} onChange={(e) => setEditDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Data término *</label>
                <Input type="date" value={editDataTermino} onChange={(e) => setEditDataTermino(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Status</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Responsável</label>
                <Select value={editResponsavel || "__none__"} onValueChange={(v) => setEditResponsavel(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnexosModal
        osId={anexosModalOsId}
        open={!!anexosModalOsId}
        onClose={() => setAnexosModalOsId(null)}
      />
    </div>
  );
}
