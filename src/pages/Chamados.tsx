import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Eye, Search, RefreshCw, MessagesSquare, Ban, Plus, Trash2, CalendarIcon, X, Filter, FileText } from "@/lib/icons";

type Chamado = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  prioridade: string;
  titulo: string | null;
  descricao: string | null;
  observacoes: string | null;
  created_at: string | null;
  responsible_user_id: string | null;
  criado_por: string | null;
  ativo_id: string | null;
  ativo_codigo: string | null;
  ativo_area: string | null;
  ativo_ambiente: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
};

const STATUS_CHAMADO = ["Aberto", "Em andamento", "Concluído"];
const STATUS_ENCERRADO = "Encerrado";

const statusColor = (s: string | null) => {
  switch (s) {
    case "Concluído": return "bg-success/15 text-success border-success/30";
    case "Em andamento": return "bg-warning/15 text-warning border-warning/30";
    case "Aberto": return "bg-info/15 text-info border-info/30";
    case "Encerrado": return "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

const IGNORADO_MARKER = "[CHAMADO IGNORADO]";
const OS_VINCULADA_MARKER = "[OS_VINCULADA:";
const isIgnorado = (c: { status: string | null; observacoes: string | null }) =>
  c.status === STATUS_ENCERRADO && (c.observacoes || "").includes(IGNORADO_MARKER);
const getOsVinculada = (obs: string | null): string | null => {
  if (!obs) return null;
  const idx = obs.indexOf(OS_VINCULADA_MARKER);
  if (idx === -1) return null;
  const start = idx + OS_VINCULADA_MARKER.length;
  const end = obs.indexOf("]", start);
  if (end === -1) return null;
  return obs.substring(start, end).trim();
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function Chamados() {
  const { session } = useAuth();
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nome: string }[]>([]);
  const [ativos, setAtivos] = useState<{ id: string; nome: string }[]>([]);
  const [blocos, setBlocos] = useState<{ id: string; nome: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterCodigo, setFilterCodigo] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [filterMonth, setFilterMonth] = useState("__all__");
  const [filterYear, setFilterYear] = useState("__all__");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<"bulk" | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail / Ignore
  const [viewing, setViewing] = useState<Chamado | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<Chamado | null>(null);
  const [ignoring, setIgnoring] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setProfileId(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("id").eq("user_id", uid).maybeSingle();
      if (!cancelled) setProfileId((data as any)?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const fetchData = useCallback(async () => {

  if (!companyId) {
    setLoading(false);
    return;
  }

  setLoading(true);

  const [osRes, profilesRes, ativosRes, blocosRes] = await Promise.all([
    (supabase.from("ordens_servico") as any)
      .select(
        "id, codigo_os, status, prioridade, titulo, descricao, observacoes, created_at, responsible_user_id, criado_por, ativo_id, ativo_codigo, ativo_area, ativo_ambiente, bloco_id, andar, sala"
      )
      .eq("company_id", companyId)
      .eq("origem", "Chamado")
      .order("created_at", { ascending: false }),

    (supabase.from("profiles") as any)
      .select("id, nome")
      .eq("company_id", companyId)
      .order("nome"),

    (supabase.from("ativos" as any) as any)
      .select("id, nome")
      .eq("company_id", companyId)
      .order("nome"),

    (supabase.from("blocos") as any)
      .select("id, nome")
      .eq("company_id", companyId)
      .order("nome"),
  ]);

  setChamados(((osRes.data as unknown) as Chamado[]) || []);
  setProfiles((profilesRes.data as any[]) || []);
  setAtivos((ativosRes.data as any[]) || []);
  setBlocos((blocosRes.data as any[]) || []);

  setSelectedIds(new Set());

  setLoading(false);
}, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);
 useRealtime(
  ["ordens_servico" as any],
  fetchData,
  companyId
);

  const profilesMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.nome])), [profiles]);
  const ativosMap = useMemo(() => Object.fromEntries(ativos.map(a => [a.id, a.nome])), [ativos]);
  const blocosMap = useMemo(() => Object.fromEntries(blocos.map(b => [b.id, b.nome || "—"])), [blocos]);

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    chamados.forEach(c => {
      if (c.created_at) years.add(new Date(c.created_at).getFullYear().toString());
    });
    return Array.from(years).sort().reverse();
  }, [chamados]);

  const filtered = useMemo(() => {
    return chamados.filter(c => {
      if (filterStatus !== "__all__" && c.status !== filterStatus) return false;
      if (filterCodigo.trim() && !(c.codigo_os || "").toLowerCase().includes(filterCodigo.trim().toLowerCase())) return false;
      if (onlyMine && profileId && c.responsible_user_id !== profileId) return false;

      if (c.created_at) {
        const dt = parseISO(c.created_at);

        // Month filter
        if (filterMonth !== "__all__") {
          const m = parseInt(filterMonth, 10);
          if (dt.getMonth() !== m) return false;
        }

        // Year filter
        if (filterYear !== "__all__") {
          if (dt.getFullYear().toString() !== filterYear) return false;
        }

        // Date range filter
        if (dateFrom && dt < dateFrom) return false;
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (dt > endOfDay) return false;
        }
      } else {
        // If no created_at, exclude when date filters are active
        if (filterMonth !== "__all__" || filterYear !== "__all__" || dateFrom || dateTo) return false;
      }

      return true;
    });
  }, [chamados, filterStatus, filterCodigo, onlyMine, profileId, filterMonth, filterYear, dateFrom, dateTo]);

  const hasActiveFilters = filterStatus !== "__all__" || filterCodigo.trim() || onlyMine || filterMonth !== "__all__" || filterYear !== "__all__" || dateFrom || dateTo;

  const clearAllFilters = () => {
    setFilterStatus("__all__");
    setFilterCodigo("");
    setOnlyMine(false);
    setFilterMonth("__all__");
    setFilterYear("__all__");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const { error } = await (supabase as any)
  .from("ordens_servico")
  .delete()
  .in("id", ids)
  .eq("company_id", companyId);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir chamados", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamados excluídos", description: `${ids.length} chamado(s) excluído(s) com sucesso.` });
    setDeleteTarget(null);
    setSelectedIds(new Set());
    fetchData();
  };

  const handleAbrirOS = (chamado: Chamado) => {
    const prefill = {
      chamado_id: chamado.id,
      ativo_id: chamado.ativo_id || "",
      bloco_id: chamado.bloco_id || "",
      andar: chamado.andar || "",
      sala: chamado.sala || "",
      descricao: chamado.descricao || chamado.observacoes || "",
      titulo: chamado.titulo || "",
      prioridade: chamado.prioridade || "Média",
    };
    sessionStorage.setItem("chamado_prefill", JSON.stringify(prefill));
    setViewing(null);
    navigate("/ordens-servico?criar=true");
  };

  const handleIgnorar = async () => {
    if (!ignoreTarget) return;
    if (!justificativa.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Preencha o motivo para ignorar o chamado.", variant: "destructive" });
      return;
    }
    setIgnoring(true);
    const obsAtual = (ignoreTarget.observacoes || "").trim();
    const justificativaText = `${IGNORADO_MARKER}\nMotivo: ${justificativa.trim()}`;
    const novaObs = obsAtual ? `${obsAtual}\n\n${justificativaText}` : justificativaText;
  const { error } = await (supabase as any)
  .from("ordens_servico")
  .update({
    status: STATUS_ENCERRADO,
    observacoes: novaObs
  })
  .eq("id", ignoreTarget.id)
  .eq("company_id", companyId);
    setIgnoring(false);
    if (error) {
      toast({ title: "Erro ao ignorar chamado", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamado ignorado", description: `${ignoreTarget.codigo_os || ""} foi encerrado.` });
    const closedId = ignoreTarget.id;
    setIgnoreTarget(null);
    setJustificativa("");
    fetchData();
    if (viewing?.id === closedId) {
      setViewing(v => v ? { ...v, status: STATUS_ENCERRADO, observacoes: novaObs } : v);
    }
  };

  const canEditStatus = (c: Chamado) => {
    if (can("painel_os.editar")) return true;
    if (profileId && c.responsible_user_id === profileId && can("minhas_os.editar")) return true;
    return false;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            Chamados
          </h1>
          <p className="text-xs text-muted-foreground">Chamados abertos a partir das atividades de Ordens Preventivas.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && can("painel_os.excluir") && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteTarget("bulk")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={clearAllFilters}>
              <X className="h-3 w-3" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search by code */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filterCodigo}
              onChange={(e) => setFilterCodigo(e.target.value)}
              placeholder="Buscar código (C-0001…)"
              className="pl-7 h-9 w-52"
            />
          </div>

          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {[...STATUS_CHAMADO, STATUS_ENCERRADO].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Month */}
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os meses</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Year */}
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="h-9 w-28"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Date from */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} />
            </PopoverContent>
          </Popover>

          {/* Only mine */}
          {profileId && (
            <Button
              variant={onlyMine ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setOnlyMine(v => !v)}
            >
              {onlyMine ? "Mostrando só meus" : "Apenas meus chamados"}
            </Button>
          )}
        </div>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <div className="text-xs text-muted-foreground">
            Exibindo <strong>{filtered.length}</strong> de <strong>{chamados.length}</strong> chamados
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              {can("painel_os.excluir") && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
              )}
              <TableHead className="w-[110px]">Código</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="hidden md:table-cell">Localização</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="hidden md:table-cell">Aberto em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-[90px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={can("painel_os.excluir") ? 8 : 7} className="py-3">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={can("painel_os.excluir") ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">Nenhum chamado encontrado.</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id} className={cn("hover:bg-muted/40", selectedIds.has(c.id) && "bg-primary/5")}>
                {can("painel_os.excluir") && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      aria-label={`Selecionar ${c.codigo_os}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs font-semibold">{c.codigo_os || "—"}</TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium truncate max-w-[200px]">
                    {c.ativo_id ? ativosMap[c.ativo_id] || "—" : "—"}
                  </div>
                  {c.ativo_codigo && (
                    <div className="text-[11px] text-muted-foreground font-mono">{c.ativo_codigo}</div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {[c.bloco_id ? blocosMap[c.bloco_id] : null, [c.andar, c.sala].filter(Boolean).join(" / ") || null]
                    .filter(Boolean).join(" • ") || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {c.responsible_user_id ? profilesMap[c.responsible_user_id] || "—" : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy HH:mm") : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline" className={cn("text-xs border w-fit", statusColor(c.status))}>
                      {c.status || "—"}
                    </Badge>
                    {isIgnorado(c) && (
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Ban className="h-2.5 w-2.5" /> Chamado ignorado
                      </span>
                    )}
                    {getOsVinculada(c.observacoes) && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                        <FileText className="h-2.5 w-2.5" /> O.S. {getOsVinculada(c.observacoes)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(c)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{viewing?.codigo_os}</span>
              {viewing && (
                <Badge variant="outline" className={cn("text-xs border", statusColor(viewing.status))}>
                  {viewing.status || "—"}
                </Badge>
              )}
              {viewing && isIgnorado(viewing) && (
                <Badge variant="outline" className="text-xs border bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 gap-1">
                  <Ban className="h-3 w-3" /> Chamado ignorado
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{viewing?.titulo || "Chamado"}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dados do Ativo</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex flex-col"><span className="text-muted-foreground">Equipamento</span><span className="font-medium">{viewing.ativo_id ? ativosMap[viewing.ativo_id] || "—" : "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted-foreground">Código</span><span className="font-medium font-mono">{viewing.ativo_codigo || "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted-foreground">Localização</span><span className="font-medium">{[viewing.andar, viewing.sala].filter(Boolean).join(" / ") || "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted-foreground">Unidade</span><span className="font-medium">{viewing.bloco_id ? blocosMap[viewing.bloco_id] : "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted-foreground">Área</span><span className="font-medium">{viewing.ativo_area || "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted-foreground">Ambiente</span><span className="font-medium">{viewing.ativo_ambiente || "—"}</span></div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Descrição do problema</p>
                <p className="text-sm whitespace-pre-line rounded-md bg-muted/40 p-3">
                  {viewing.descricao || viewing.observacoes || "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">Responsável: </span><strong>{viewing.responsible_user_id ? profilesMap[viewing.responsible_user_id] : "—"}</strong></div>
                <div><span className="text-muted-foreground">Aberto por: </span><strong>{viewing.criado_por ? profilesMap[viewing.criado_por] || "—" : "—"}</strong></div>
                <div className="col-span-2"><span className="text-muted-foreground">Data de abertura: </span><strong>{viewing.created_at ? format(new Date(viewing.created_at), "dd/MM/yyyy HH:mm") : "—"}</strong></div>
              </div>

              {getOsVinculada(viewing.observacoes) && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    O.S. vinculada: <span className="font-mono font-bold">{getOsVinculada(viewing.observacoes)}</span>
                  </span>
                </div>
              )}

              {canEditStatus(viewing) && viewing.status !== STATUS_ENCERRADO && (
                <div className="flex items-center gap-2 pt-2 flex-wrap border-t">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleAbrirOS(viewing)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Abrir O.S
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => { setIgnoreTarget(viewing); }}
                  >
                    <Ban className="h-3.5 w-3.5" /> Ignorar Chamado
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ignore Confirmation */}
      <AlertDialog open={!!ignoreTarget} onOpenChange={(o) => { if (!o && !ignoring) { setIgnoreTarget(null); setJustificativa(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja ignorar este chamado?</AlertDialogTitle>
            <AlertDialogDescription>
              O chamado <strong className="font-mono">{ignoreTarget?.codigo_os}</strong> será marcado como
              <strong> Encerrado</strong> e identificado como <strong>"Chamado ignorado"</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Justificativa <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="Informe o motivo para ignorar este chamado..."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ignoring} onClick={() => setJustificativa("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleIgnorar(); }}
              disabled={ignoring || !justificativa.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {ignoring ? "Processando..." : "Sim, ignorar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={deleteTarget === "bulk"} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chamados selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você selecionou <strong>{selectedIds.size}</strong> chamado(s). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
